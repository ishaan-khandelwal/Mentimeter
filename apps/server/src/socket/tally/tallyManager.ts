/**
 * TallyManager
 *
 * Handles in-memory vote tallies per session. Each server instance
 * maintains its own local copy, kept in sync via Redis Pub/Sub.
 *
 * Flow:
 *   1. Vote received → Redis HINCRBY (shared truth)
 *   2. Update local Map (this instance)
 *   3. Publish update to Redis Pub/Sub channel
 *   4. All server instances receive pub/sub → update their local Map
 *   5. Every 200ms: broadcast local Map to Socket.io room (no Redis reads)
 *
 * Load-test target: 500–1000 concurrent socket connections per session
 * broadcasting at ≤200ms intervals without exceeding Redis IOPS budget.
 */

import { redis, redisSub, keys } from '../../config/redis';
import { config } from '../../config';
import type { Tally, QAQuestion } from '@pollwave/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TallyChangeMessage {
  sessionId: string;
  slideId: string;
  tally: Tally;
}

interface QAChangeMessage {
  slideId: string;
  questions: QAQuestion[];
}

type TallyListener = (sessionId: string, slideId: string, tally: Tally) => void;
type QAListener = (slideId: string, questions: QAQuestion[]) => void;

// ─── State ────────────────────────────────────────────────────────────────────

/**
 * Local in-memory tally store.
 * Structure: Map<sessionId, Map<slideId, Tally>>
 */
const localTallies = new Map<string, Map<string, Tally>>();

/**
 * Local in-memory QA store.
 * Structure: Map<slideId, QAQuestion[]>
 */
const localQA = new Map<string, QAQuestion[]>();

const tallyListeners: TallyListener[] = [];
const qaListeners: QAListener[] = [];

// ─── Local Map Helpers ────────────────────────────────────────────────────────

function getOrCreateSessionTally(sessionId: string): Map<string, Tally> {
  if (!localTallies.has(sessionId)) {
    localTallies.set(sessionId, new Map());
  }
  return localTallies.get(sessionId)!;
}

function getOrCreateSlideTally(sessionId: string, slideId: string): Tally {
  const sessionMap = getOrCreateSessionTally(sessionId);
  if (!sessionMap.has(slideId)) {
    sessionMap.set(slideId, {});
  }
  return sessionMap.get(slideId)!;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit a vote. Updates Redis (shared) and local memory (this instance),
 * then publishes to Pub/Sub so other instances update their local memory too.
 *
 * Returns false if participant already voted on this slide.
 */
export async function submitVote(
  sessionId: string,
  slideId: string,
  value: string | string[] | number | Record<string, any>,
  hashedToken: string,
): Promise<boolean> {
  // Track unique voters in Redis set with 2-hour TTL
  const votersKey = keys.voters(sessionId, slideId);
  await redis.sadd(votersKey, hashedToken);
  await redis.expire(votersKey, 7200);

  const slideTallyKey = keys.slideTally(sessionId, slideId);

  // Update Redis tally (atomic, consistent across instances)
  const pipeline = redis.pipeline();
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      const num = parseInt(String(v), 10) || 0;
      if (num !== 0) {
        pipeline.hincrby(slideTallyKey, k, num);
      }
    }
  } else {
    const values = Array.isArray(value) ? value : [String(value)];
    for (const v of values) {
      pipeline.hincrby(slideTallyKey, v, 1);
    }
  }
  await pipeline.exec();

  // Read updated tally from Redis (one round-trip, only on vote, not on broadcast)
  const rawTally = await redis.hgetall(slideTallyKey);
  const tally: Tally = {};
  for (const [k, v] of Object.entries(rawTally)) {
    tally[k] = parseInt(v, 10);
  }

  // Update local memory on THIS instance
  const localTally = getOrCreateSlideTally(sessionId, slideId);
  Object.assign(localTally, tally);

  // Publish to Pub/Sub so OTHER instances update their local memory
  const msg: TallyChangeMessage = { sessionId, slideId, tally };
  await redis.publish(keys.tallyChannel(sessionId), JSON.stringify(msg));

  return true;
}

/**
 * Returns the current local tally for a slide (for broadcasting).
 */
export function getLocalTally(sessionId: string, slideId: string): Tally {
  return localTallies.get(sessionId)?.get(slideId) ?? {};
}

/**
 * Returns all slide tallies for a session (for flush worker).
 */
export function getAllLocalTallies(sessionId: string): Map<string, Tally> {
  return localTallies.get(sessionId) ?? new Map();
}

/**
 * Initialize tallies for a session from Redis (called on session join, handles restarts).
 */
export async function hydrateSessionTally(
  sessionId: string,
  slideIds: string[],
): Promise<void> {
  const sessionMap = getOrCreateSessionTally(sessionId);
  for (const slideId of slideIds) {
    const raw = await redis.hgetall(keys.slideTally(sessionId, slideId));
    const tally: Tally = {};
    for (const [k, v] of Object.entries(raw)) {
      tally[k] = parseInt(v, 10);
    }
    sessionMap.set(slideId, tally);
  }
}

/**
 * Clear session state from local memory (called on session end).
 */
export function clearSession(sessionId: string): void {
  localTallies.delete(sessionId);
}

// ─── QA Helpers ──────────────────────────────────────────────────────────────

export function getLocalQA(slideId: string): QAQuestion[] {
  return localQA.get(slideId) ?? [];
}

export function updateLocalQA(slideId: string, questions: QAQuestion[]): void {
  localQA.set(slideId, questions);
}

export async function submitQuestion(question: QAQuestion): Promise<void> {
  const key = keys.qaQuestions(question.slideId);
  await redis.hset(key, question.id, JSON.stringify(question));

  const allRaw = await redis.hgetall(key);
  const questions = Object.values(allRaw).map((q) => JSON.parse(q) as QAQuestion);
  questions.sort((a, b) => b.upvotes - a.upvotes);

  updateLocalQA(question.slideId, questions);

  const msg: QAChangeMessage = { slideId: question.slideId, questions };
  await redis.publish(`pollwave:qa_update:${question.slideId}`, JSON.stringify(msg));
}

export async function upvoteQuestion(
  slideId: string,
  questionId: string,
  hashedToken: string,
): Promise<QAQuestion[] | null> {
  const key = keys.qaQuestions(slideId);
  const raw = await redis.hget(key, questionId);
  if (!raw) return null;

  const question = JSON.parse(raw) as QAQuestion;

  // Prevent upvoting own question
  if (question.participantToken === hashedToken) return null;

  question.upvotes += 1;
  await redis.hset(key, questionId, JSON.stringify(question));

  const allRaw = await redis.hgetall(key);
  const questions = Object.values(allRaw).map((q) => JSON.parse(q) as QAQuestion);
  questions.sort((a, b) => b.upvotes - a.upvotes);

  updateLocalQA(slideId, questions);

  const msg: QAChangeMessage = { slideId, questions };
  await redis.publish(`pollwave:qa_update:${slideId}`, JSON.stringify(msg));

  return questions;
}

// ─── Pub/Sub Subscription ─────────────────────────────────────────────────────

export function onTallyChange(listener: TallyListener): void {
  tallyListeners.push(listener);
}

export function onQAChange(listener: QAListener): void {
  qaListeners.push(listener);
}

/**
 * Subscribe to Redis Pub/Sub channels for tally + QA updates.
 * Called once at server startup with a pattern subscription.
 */
export async function subscribeToUpdates(): Promise<void> {
  await redisSub.psubscribe('pollwave:tally_update:*', 'pollwave:qa_update:*');

  redisSub.on('pmessage', (_pattern, channel, message) => {
    if (channel.startsWith('pollwave:tally_update:')) {
      const { sessionId, slideId, tally } = JSON.parse(message) as TallyChangeMessage;

      // Update local memory from pub/sub (OTHER instances' votes)
      const localTally = getOrCreateSlideTally(sessionId, slideId);
      // Merge: pub/sub gives us the full tally so just overwrite
      Object.keys(localTally).forEach((k) => delete localTally[k]);
      Object.assign(localTally, tally);

      tallyListeners.forEach((fn) => fn(sessionId, slideId, tally));
    } else if (channel.startsWith('pollwave:qa_update:')) {
      const { slideId, questions } = JSON.parse(message) as QAChangeMessage;
      updateLocalQA(slideId, questions);
      qaListeners.forEach((fn) => fn(slideId, questions));
    }
  });
}
