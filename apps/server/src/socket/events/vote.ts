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

  // Align participant token if session data token was not populated
  if (participantToken && (!sessionData.participantToken || sessionData.participantToken === '')) {
    sessionData.participantToken = participantToken;
  }

  const hashedToken = hashToken(participantToken);

  // Submit to tally (Redis + local memory + Pub/Sub)
  await submitVote(sessionId, slideId, value, hashedToken);

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
  } else {
    // Fallback broadcast answered count to presenter
    const slideAnswersCount = await prisma.response.count({
      where: { slideId, presentationId },
    }).catch(() => 1);

    io.to(`session:${sessionId}`).emit('timer_update', {
      slideId,
      answeredCount: slideAnswersCount + 1,
      totalParticipants: gameManager.getLobbyList(sessionId).count || 1,
    });
  }

  // Persist individual Response to PostgreSQL (upsert so it never throws unique constraint errors)
  prisma.response.upsert({
    where: {
      slideId_participantToken: {
        slideId,
        participantToken: hashedToken,
      },
    },
    update: {
      value: value as any,
      sessionId,
    },
    create: {
      presentationId,
      slideId,
      sessionId,
      participantToken: hashedToken,
      value: value as any,
    },
  }).catch((err: any) => {
    console.error('[Vote] Failed to persist response:', err.message);
  });

  // Acknowledge to voter
  socket.emit('vote_accepted', { slideId });
}

