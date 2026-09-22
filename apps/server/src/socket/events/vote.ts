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

  // Rate-limit: one vote per slide per token
  const limitKey = keys.voteLimit(hashedToken, slideId);
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
