import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
  jwtSecret: required('JWT_SECRET'),
  serverSecret: required('SERVER_SECRET'),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Flush tally to MongoDB every N ms (default 3s) */
  flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS || '3000', 10),
  /** Broadcast tally to clients every N ms (default 200ms) */
  broadcastIntervalMs: parseInt(process.env.BROADCAST_INTERVAL_MS || '200', 10),
  /** Presenter reconnect grace period before session is paused (default 60s) */
  presenterGracePeriodMs: parseInt(process.env.PRESENTER_GRACE_PERIOD_MS || '60000', 10),
};
