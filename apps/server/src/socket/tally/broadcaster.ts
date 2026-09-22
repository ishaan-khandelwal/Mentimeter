/**
 * Throttled Broadcast
 *
 * Every 200ms, reads local memory (NOT Redis) and emits tally_update
 * to the appropriate Socket.io session room.
 *
 * Each server instance only broadcasts to its own connected clients —
 * the Redis adapter handles propagation for events emitted to rooms.
 */

import { Server as IOServer } from 'socket.io';
import { getLocalTally } from './tallyManager';
import { config } from '../../config';
import type { TallyUpdateEvent } from '@pollwave/shared';

interface PendingBroadcast {
  sessionId: string;
  slideId: string;
}

// Queue of dirty (sessionId, slideId) pairs that need broadcasting
const pending = new Set<string>(); // key: `${sessionId}:${slideId}`

let broadcastInterval: ReturnType<typeof setInterval> | null = null;
let io: IOServer | null = null;

export function initBroadcaster(ioServer: IOServer): void {
  io = ioServer;

  broadcastInterval = setInterval(() => {
    if (!io || pending.size === 0) return;

    for (const key of pending) {
      const [sessionId, slideId] = key.split(':');
      const tally = getLocalTally(sessionId, slideId);
      const event: TallyUpdateEvent = { slideId, tally };
      io.to(`session:${sessionId}`).emit('tally_update', event);
    }
    pending.clear();
  }, config.broadcastIntervalMs);

  console.log(`[Broadcaster] Throttled broadcast every ${config.broadcastIntervalMs}ms`);
}

/**
 * Mark a (sessionId, slideId) pair as dirty — will be broadcast on next tick.
 */
export function markDirty(sessionId: string, slideId: string): void {
  pending.add(`${sessionId}:${slideId}`);
}

export function stopBroadcaster(): void {
  if (broadcastInterval) {
    clearInterval(broadcastInterval);
    broadcastInterval = null;
  }
}
