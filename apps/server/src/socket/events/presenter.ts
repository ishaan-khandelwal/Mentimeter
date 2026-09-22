/**
 * Presenter Control Events
 *
 * All presenter events require a valid socket auth token.
 * Events: next_slide, prev_slide, go_to_slide, lock_voting, unlock_voting,
 *         start_session, end_session
 */

import { Socket, Server as IOServer } from 'socket.io';
import { prisma } from '@pollwave/shared';
import { flushOnSessionEnd } from '../persistence/flushWorker';
import { clearSession } from '../tally/tallyManager';
import { clearPresence, broadcastPresence, setPresenterOnline } from '../rooms/presence';
import { getPeakPresence, getPresenceCount } from '../rooms/presence';
import { gameManager } from '../game/gameManager';
import type {
  ChangeSlidePayload,
  LockVotingPayload,
  EndSessionPayload,
  SlideChangedEvent,
  SessionEndedEvent,
} from '@pollwave/shared';

export async function handleNextSlide(
  io: IOServer,
  socket: Socket,
  payload: ChangeSlidePayload,
): Promise<void> {
  const { sessionId } = payload;
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== 'active') {
    socket.emit('error', { code: 'SESSION_NOT_ACTIVE', message: 'Session not active' });
    return;
  }

  // Get all slides for this presentation in order
  const slides = await prisma.slide.findMany({
    where: { presentationId: session.presentationId },
    orderBy: { order: 'asc' },
  });

  if (slides.length === 0) return;

  const currentIndex = slides.findIndex(
    (s: any) => s.id === session.currentSlideId,
  );
  const nextSlide = slides[Math.min(currentIndex + 1, slides.length - 1)];

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      currentSlideId: nextSlide.id,
      votingLocked: false,
    },
  });

  const event: SlideChangedEvent = {
    currentSlideId: nextSlide.id,
    votingLocked: false,
  };
  io.to(`session:${sessionId}`).emit('slide_changed', event);
}

export async function handlePrevSlide(
  io: IOServer,
  socket: Socket,
  payload: ChangeSlidePayload,
): Promise<void> {
  const { sessionId } = payload;
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== 'active') return;

  const slides = await prisma.slide.findMany({
    where: { presentationId: session.presentationId },
    orderBy: { order: 'asc' },
  });

  if (slides.length === 0) return;

  const currentIndex = slides.findIndex(
    (s: any) => s.id === session.currentSlideId,
  );
  const prevSlide = slides[Math.max(currentIndex - 1, 0)];

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      currentSlideId: prevSlide.id,
      votingLocked: false,
    },
  });

  const event: SlideChangedEvent = {
    currentSlideId: prevSlide.id,
    votingLocked: false,
  };
  io.to(`session:${sessionId}`).emit('slide_changed', event);
}

export async function handleGoToSlide(
  io: IOServer,
  socket: Socket,
  payload: ChangeSlidePayload,
): Promise<void> {
  const { sessionId, slideId } = payload;
  if (!slideId) {
    socket.emit('error', { code: 'MISSING_SLIDE_ID', message: 'slideId required' });
    return;
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== 'active') return;

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      currentSlideId: slideId,
      votingLocked: false,
    },
  });

  const event: SlideChangedEvent = { currentSlideId: slideId, votingLocked: false };
  io.to(`session:${sessionId}`).emit('slide_changed', event);
}

export async function handleLockVoting(
  io: IOServer,
  _socket: Socket,
  payload: LockVotingPayload,
): Promise<void> {
  const { sessionId, locked } = payload;
  await prisma.session.update({
    where: { id: sessionId },
    data: { votingLocked: locked },
  });
  io.to(`session:${sessionId}`).emit('voting_locked', { locked });
}

export async function handleEndSession(
  io: IOServer,
  socket: Socket,
  payload: EndSessionPayload,
): Promise<void> {
  const { sessionId } = payload;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    socket.emit('error', { code: 'SESSION_NOT_FOUND', message: 'Session not found' });
    return;
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'ended', endedAt: new Date() },
  });

  // Update presentation status
  await prisma.presentation.update({
    where: { id: session.presentationId },
    data: { status: 'ended' },
  });

  // Final flush to PostgreSQL
  await flushOnSessionEnd(sessionId);

  // Write analytics
  const totalParticipants = await getPresenceCount(sessionId);
  const peak = await getPeakPresence(sessionId);
  await prisma.analytics.create({
    data: {
      presentationId: session.presentationId,
      sessionId,
      totalParticipants,
      peakConcurrentUsers: peak,
      avgResponseTime: 0,
      completionRate: 0,
      dropOffRate: 0,
    },
  }).catch(console.error);

  // Clean up
  gameManager.endSession(sessionId);
  clearSession(sessionId);
  await clearPresence(sessionId);
  await setPresenterOnline(io, sessionId, false);

  const event: SessionEndedEvent = { sessionId };
  io.to(`session:${sessionId}`).emit('session_ended', event);
}
