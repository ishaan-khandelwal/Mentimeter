import Redis from 'ioredis';
import { config } from '../config';

// Primary client used by the Redis adapter and general operations
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

// Dedicated subscriber client required by ioredis Pub/Sub
// (a subscribed client cannot run regular commands)
export const redisSub = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

// Second pub client for the @socket.io/redis-adapter
export const redisPub = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('error', (err) => console.error('[Redis] Error:', err.message));
redisSub.on('error', (err) => console.error('[Redis Sub] Error:', err.message));
redisPub.on('error', (err) => console.error('[Redis Pub] Error:', err.message));

export async function connectRedis(): Promise<void> {
  await Promise.all([redis.connect(), redisSub.connect(), redisPub.connect()]);
  console.log('[Redis] Connected');
}

// ─── Key helpers ─────────────────────────────────────────────────────────────

export const keys = {
  /** Session tally hash: HSET pollwave:tally:{sessionId} {slideId} {optionKey} count */
  tally: (sessionId: string) => `pollwave:tally:${sessionId}`,

  /** Per-slide tally hash: HSET pollwave:slide_tally:{slideId} option count */
  slideTally: (slideId: string) => `pollwave:slide_tally:${slideId}`,

  /** Set of hashed participant tokens that have voted on a slide */
  voters: (slideId: string) => `pollwave:voters:${slideId}`,

  /** Pub/Sub channel for tally updates */
  tallyChannel: (sessionId: string) => `pollwave:tally_update:${sessionId}`,

  /** Redis lock for flush worker leader election */
  flushLock: () => `pollwave:flush:lock`,

  /** Presence count for a session */
  presence: (sessionId: string) => `pollwave:presence:${sessionId}`,

  /** Presenter online flag */
  presenterOnline: (sessionId: string) => `pollwave:presenter:${sessionId}`,

  /** QA questions hash for a slide */
  qaQuestions: (slideId: string) => `pollwave:qa:${slideId}`,

  /** Per-token vote rate limit */
  voteLimit: (token: string, slideId: string) => `pollwave:vote_limit:${token}:${slideId}`,
};
