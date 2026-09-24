/**
 * Live State Reader
 *
 * The socket server (apps/server) runs the Kahoot-style game loop entirely
 * in its own process memory and mirrors every state transition into Redis
 * (see apps/server/src/socket/game/liveState.ts). This module reads that
 * snapshot from the Next.js side, so the REST `/lobby` fallback route (used
 * when a client's WebSocket can't connect) reflects the real, current game
 * state instead of only ever seeing the very first QUESTION_ACTIVE snapshot.
 *
 * Soft-optional by design: if REDIS_URL isn't configured for this app (e.g.
 * local dev where only the socket server talks to Redis), every call here
 * just resolves to null and callers fall back to their existing behavior.
 */

import Redis from 'ioredis';

export interface LiveStateSnapshot {
  gameState: string;
  currentSlideId: string | null;
  votingLocked: boolean;
  questionStartedAt?: number;
  durationSeconds?: number;
  correctAnswer?: string | string[] | null;
  updatedAt: number;
}

let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return client;
  }

  const isTls = url.startsWith('rediss://');
  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 3000,
    ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
    retryStrategy: () => null, // never auto-reconnect loop inside a serverless-style request
  });
  client.on('error', (err) => console.error('[LiveState] Redis error:', err.message));
  return client;
}

const liveStateKey = (sessionId: string) => `pollwave:live_state:${sessionId}`;
const lobbyStateKey = (sessionId: string) => `pollwave:lobby_state:${sessionId}`;

export async function readLiveState(sessionId: string): Promise<LiveStateSnapshot | null> {
  const redis = getClient();
  if (!redis) return null;

  try {
    const raw = await redis.get(liveStateKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as LiveStateSnapshot;
  } catch (err: any) {
    console.error('[LiveState] Failed to read snapshot:', err.message);
    return null;
  }
}

export interface LobbyStateSnapshot {
  participants: Array<{ token: string; nickname: string; avatar: string }>;
  count: number;
  updatedAt: number;
}

/**
 * Reads the online-filtered lobby roster the socket server mirrors into
 * Redis (apps/server/src/socket/game/liveState.ts). This is the real,
 * currently-connected headcount — unlike this route's own in-memory join
 * log, which never removes anyone who leaves/disconnects.
 */
export async function readLobbyState(sessionId: string): Promise<LobbyStateSnapshot | null> {
  const redis = getClient();
  if (!redis) return null;

  try {
    const raw = await redis.get(lobbyStateKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as LobbyStateSnapshot;
  } catch (err: any) {
    console.error('[LiveState] Failed to read lobby snapshot:', err.message);
    return null;
  }
}
