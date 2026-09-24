/**
 * Live State Publisher
 *
 * The Kahoot-style game loop (gameManager) lives entirely in this process's
 * memory. The Next.js web app's REST `/lobby` fallback route (used when a
 * client's WebSocket can't connect — flaky networks, serverless, etc.) runs
 * in a completely separate process and has no visibility into it.
 *
 * This mirrors every game-state transition into Redis so that fallback route
 * can reconstruct the current state instead of getting stuck on whatever the
 * first QUESTION_ACTIVE snapshot happened to be.
 */

import { redis, keys } from '../../config/redis';
import type { GameState } from '@pollwave/shared';

export interface LiveStateSnapshot {
  gameState: GameState;
  currentSlideId: string | null;
  votingLocked: boolean;
  questionStartedAt?: number;
  durationSeconds?: number;
  correctAnswer?: string | string[] | null;
  updatedAt: number;
}

const LIVE_STATE_TTL_SECONDS = 6 * 60 * 60; // 6 hours — well beyond any realistic session length

export async function publishLiveState(
  sessionId: string,
  snapshot: Omit<LiveStateSnapshot, 'updatedAt'>,
): Promise<void> {
  const payload: LiveStateSnapshot = { ...snapshot, updatedAt: Date.now() };
  try {
    await redis.set(keys.liveState(sessionId), JSON.stringify(payload), 'EX', LIVE_STATE_TTL_SECONDS);
  } catch (err: any) {
    console.error('[LiveState] Failed to publish snapshot:', err.message);
  }
}

export async function clearLiveState(sessionId: string): Promise<void> {
  try {
    await redis.del(keys.liveState(sessionId));
  } catch (err: any) {
    console.error('[LiveState] Failed to clear snapshot:', err.message);
  }
}

export interface LobbyStateSnapshot {
  participants: Array<{ token: string; nickname: string; avatar: string }>;
  count: number;
  updatedAt: number;
}

/**
 * Mirrors gameManager's online-filtered participant roster into Redis so the
 * Next.js REST fallback shows the real, currently-connected headcount instead
 * of its own never-cleaned in-memory join log (which only ever grows).
 */
export async function publishLobbyState(
  sessionId: string,
  snapshot: Omit<LobbyStateSnapshot, 'updatedAt'>,
): Promise<void> {
  const payload: LobbyStateSnapshot = { ...snapshot, updatedAt: Date.now() };
  try {
    await redis.set(keys.lobbyState(sessionId), JSON.stringify(payload), 'EX', LIVE_STATE_TTL_SECONDS);
  } catch (err: any) {
    console.error('[LiveState] Failed to publish lobby snapshot:', err.message);
  }
}
