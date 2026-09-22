/**
 * PollWave Express + Socket.io Server
 *
 * Architecture:
 * - Express HTTP for REST API (sessions, health)
 * - Socket.io with Redis adapter for real-time events
 * - Redis Pub/Sub for cross-instance tally sync
 * - Background flush worker with leader election
 *
 * Load-test target: 500–1000 concurrent socket connections per session
 * Run: artillery run load-test.yml (see README for setup)
 */

import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server as IOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { config } from './config';
import { connectRedis, redis, redisPub, redisSub } from './config/redis';
import { prisma } from '@pollwave/shared';
import { registerSocketHandlers } from './socket/events';
import { subscribeToUpdates, onTallyChange } from './socket/tally/tallyManager';
import { initBroadcaster, markDirty } from './socket/tally/broadcaster';
import { startFlushWorker } from './socket/persistence/flushWorker';

import healthRouter from './routes/health';
import sessionsRouter from './routes/sessions';

async function main() {
  // ── Connect infrastructure ────────────────────────────────────────────────
  await connectRedis();
  try {
    await prisma.$connect();
    console.log('[PostgreSQL] Connected via Prisma');
  } catch (err: any) {
    console.warn('[PostgreSQL] Database connection notice:', err?.message || err);
  }

  // ── Express app ───────────────────────────────────────────────────────────
  const app = express();

  app.use(helmet());
  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return true;
    const cleanOrigin = origin.replace(/\/$/, '');
    const cleanClient = config.clientUrl.replace(/\/$/, '');
    if (cleanOrigin === cleanClient || cleanOrigin === 'http://localhost:3000') return true;
    if (cleanOrigin.endsWith('.vercel.app')) return true;
    return false;
  };

  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  }));
  app.use(express.json({ limit: '1mb' }));

  // Global rate limiter
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        sendCommand: (...args: string[]) => redis.call(...args as [string, ...string[]]) as any,
      }),
    }),
  );

  app.use('/api/v1', healthRouter);
  app.use('/api/v1', sessionsRouter);

  // 404 handler
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server] Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  // ── HTTP + Socket.io ──────────────────────────────────────────────────────
  const httpServer = http.createServer(app);

  const io = new IOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isAllowedOrigin(origin));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    // Increase ping timeout for high-load sessions
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  // Attach Redis adapter (enables multi-instance Socket.io)
  io.adapter(createAdapter(redisPub, redisSub));
  console.log('[Socket.io] Redis adapter attached');

  // ── Tally Pub/Sub subscription ────────────────────────────────────────────
  await subscribeToUpdates();

  // When tally changes (from any instance via pub/sub), mark dirty for broadcast
  onTallyChange((sessionId, slideId) => {
    markDirty(sessionId, slideId);
  });

  // ── Broadcaster (200ms throttled) ─────────────────────────────────────────
  initBroadcaster(io);

  // ── Flush Worker ──────────────────────────────────────────────────────────
  startFlushWorker();

  // ── Socket handlers ───────────────────────────────────────────────────────
  registerSocketHandlers(io);

  // ── Start listening ───────────────────────────────────────────────────────
  httpServer.listen(config.port, () => {
    console.log(`[Server] PollWave server running on port ${config.port}`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Server] ${signal} received, shutting down gracefully...`);
    httpServer.close();
    redis.disconnect();
    redisPub.disconnect();
    redisSub.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
