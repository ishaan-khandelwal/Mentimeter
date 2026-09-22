/**
 * Presence Manager
 *
 * Tracks:
 * - Participant count per session (Redis INCR/DECR)
 * - Presenter online status per session (Redis string)
 * - Peak concurrent users (Redis MAX)
 */

import { redis, keys } from '../../config/redis';
import type { PresenceUpdateEvent } from '@pollwave/shared';
import { Server as IOServer } from 'socket.io';

export async function incrementPresence(
  io: IOServer,
  sessionId: string,
): Promise<number> {
  const count = await redis.incr(keys.presence(sessionId));
  // Track peak
  const peak = await redis.get(`pollwave:peak:${sessionId}`);
  if (!peak || count > parseInt(peak, 10)) {
    await redis.set(`pollwave:peak:${sessionId}`, count);
  }
  await broadcastPresence(io, sessionId);
  return count;
}

export async function decrementPresence(
  io: IOServer,
  sessionId: string,
): Promise<number> {
  const count = await redis.decr(keys.presence(sessionId));
  const safeCount = Math.max(0, count);
  if (safeCount !== count) await redis.set(keys.presence(sessionId), 0);
  await broadcastPresence(io, sessionId);
  return safeCount;
}

export async function setPresenterOnline(
  io: IOServer,
  sessionId: string,
  online: boolean,
): Promise<void> {
  await redis.set(keys.presenterOnline(sessionId), online ? '1' : '0', 'EX', 3600);
  await broadcastPresence(io, sessionId);
}

export async function isPresenterOnline(sessionId: string): Promise<boolean> {
  const val = await redis.get(keys.presenterOnline(sessionId));
  return val === '1';
}

export async function getPresenceCount(sessionId: string): Promise<number> {
  const val = await redis.get(keys.presence(sessionId));
  return parseInt(val ?? '0', 10);
}

export async function getPeakPresence(sessionId: string): Promise<number> {
  const val = await redis.get(`pollwave:peak:${sessionId}`);
  return parseInt(val ?? '0', 10);
}

export async function broadcastPresence(
  io: IOServer,
  sessionId: string,
): Promise<void> {
  const count = await getPresenceCount(sessionId);
  const presenterOnline = await isPresenterOnline(sessionId);
  const event: PresenceUpdateEvent = { count, presenterOnline };
  io.to(`session:${sessionId}`).emit('presence_update', event);
}

export async function clearPresence(sessionId: string): Promise<void> {
  await redis.del(
    keys.presence(sessionId),
    keys.presenterOnline(sessionId),
    `pollwave:peak:${sessionId}`,
  );
}
