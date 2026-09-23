/**
 * Vote Event Handler
 *
 * Handles submit_vote events from attendees.
 * - Validates participant token + rate limit
 * - Delegates to tallyManager (Redis HINCRBY + local memory + Pub/Sub)
 * - Writes individual Response to MongoDB for dedup and analytics
 * - Marks tally as dirty for next broadcast tick
 */

import { Socket, Server as IOServer } from 'socket.io';
import crypto from 'crypto';
import { redis, keys } from '../../config/redis';
import { submitVote } from '../tally/tallyManager';
import { markDirty } from '../tally/broadcaster';
import { prisma } from '@pollwave/shared';
import type { SubmitVotePayload } from '@pollwave/shared';
import { gameManager } from '../game/gameManager';

// Per-token, per-slide: max 1 vote. Redis key TTL prevents abuse long-term.
const VOTE_RATE_LIMIT_TTL = 86400; // 24 hours

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

interface SocketSessionData {
  sessionId: string;
  presentationId: string;
  participantToken: string;
}

export async function handleVote(
  io: IOServer,
  socket: Socket,
  payload: SubmitVotePayload,
  sessionData: SocketSessionData,
): Promise<void> {
  const { slideId, value, participantToken } = payload;
  const { sessionId, presentationId } = sessionData;

  // Validate token matches session token
  if (participantToken !== sessionData.participantToken) {
    socket.emit('error', { code: 'INVALID_TOKEN', message: 'Token mismatch' });
    return;
  }

  const hashedToken = hashToken(participantToken);

  // Rate-limit: one vote per slide per token per session
  const limitKey = keys.voteLimit(sessionId, hashedToken, slideId);
  const alreadyVoted = await redis.get(limitKey);
  if (alreadyVoted) {
    socket.emit('error', {
      code: 'ALREADY_VOTED',
      message: 'You have already voted on this slide',
    });
    return;
  }

  // Set rate limit flag
  await redis.set(limitKey, '1', 'EX', VOTE_RATE_LIMIT_TTL);

  // Submit to tally (Redis + local memory + Pub/Sub)
  const accepted = await submitVote(sessionId, slideId, value, hashedToken);
  if (!accepted) {
    socket.emit('error', {
      code: 'ALREADY_VOTED',
      message: 'Duplicate vote rejected',
    });
    return;
  }

  // Mark for next broadcast tick (200ms throttled)
  markDirty(sessionId, slideId);

  // Record in Competition Game Manager (speed scoring & streak bonus)
  const scoreResult = gameManager.recordAnswer(sessionId, slideId, participantToken, value);
  if (scoreResult) {
    socket.emit('participant_score', {
      pointsEarned: scoreResult.pointsEarned,
      isCorrect: scoreResult.isCorrect,
      streak: scoreResult.streak,
      totalScore: scoreResult.totalScore,
      rank: scoreResult.rank,
      timeTaken: scoreResult.timeTaken,
    });

    // Broadcast live participant answered count to presenter & session
    io.to(`session:${sessionId}`).emit('timer_update', {
      slideId,
      answeredCount: scoreResult.answeredCount,
      totalParticipants: scoreResult.totalParticipants,
    });

    // If all participants have voted, trigger early lock!
    if (scoreResult.shouldLockEarly) {
      io.to(`session:${sessionId}`).emit('voting_locked', { locked: true });
      io.to(`session:${sessionId}`).emit('game_state_changed', {
        state: 'QUESTION_LOCKED',
        slideId,
      });
    }
  }

  // Persist individual Response to PostgreSQL (async, non-blocking)
  prisma.response.create({
    data: {
      presentationId,
      slideId,
      sessionId,
      participantToken: hashedToken,
      value: value as any,
    },
  }).catch((err: any) => {
    // P2002 = Unique constraint violation on [slideId, participantToken]
    if (err.code === 'P2002') return;
    console.error('[Vote] Failed to persist response:', err.message);
  });

  // Acknowledge to voter
  socket.emit('vote_accepted', { slideId });
}

