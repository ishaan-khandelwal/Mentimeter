import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config';

const isTls = config.redisUrl.startsWith('rediss://');

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  connectTimeout: 10000,
  ...(isTls
    ? {
        tls: {
          rejectUnauthorized: false,
        },
      }
    : {}),
  retryStrategy(times) {
    if (times > 5) return null;
    return Math.min(times * 300, 2000);
  },
};

// Primary client used by the Redis adapter and general operations
export const redis = new Redis(config.redisUrl, redisOptions);

// Dedicated subscriber client required by ioredis Pub/Sub
// (a subscribed client cannot run regular commands)
export const redisSub = new Redis(config.redisUrl, redisOptions);

// Second pub client for the @socket.io/redis-adapter
export const redisPub = new Redis(config.redisUrl, redisOptions);

redis.on('error', (err) => console.error('[Redis] Error:', err.message));
redisSub.on('error', (err) => console.error('[Redis Sub] Error:', err.message));
redisPub.on('error', (err) => console.error('[Redis Pub] Error:', err.message));

export async function connectRedis(): Promise<void> {
  const masked = config.redisUrl.replace(/:([^:@]+)@/, ':****@');
  console.log(`[Redis] Connecting to ${masked}...`);
  await Promise.all([redis.connect(), redisSub.connect(), redisPub.connect()]);
  console.log('[Redis] Connected successfully');
}

// ─── Key helpers ─────────────────────────────────────────────────────────────

export const keys = {
  /** Session tally hash: HSET pollwave:tally:{sessionId} {slideId} {optionKey} count */
  tally: (sessionId: string) => `pollwave:tally:${sessionId}`,

  /** Per-slide tally hash: HSET pollwave:slide_tally:{sessionId}:{slideId} option count */
  slideTally: (sessionId: string, slideId: string) => `pollwave:slide_tally:${sessionId}:${slideId}`,

  /** Set of hashed participant tokens that have voted on a slide in a session */
  voters: (sessionId: string, slideId: string) => `pollwave:voters:${sessionId}:${slideId}`,

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

  /** Per-token vote rate limit for a session */
  voteLimit: (sessionId: string, token: string, slideId: string) => `pollwave:vote_limit:${sessionId}:${token}:${slideId}`,
};
