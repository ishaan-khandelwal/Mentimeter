/**
 * Main Socket.io connection handler
 *
 * Wires up all events per socket connection:
 * - join_session: room join, presence, tally hydration
 * - submit_vote: delegate to vote handler
 * - submit_question / upvote_question: Q&A
 * - Presenter events: next/prev/goto slide, lock, end (auth-gated)
 * - disconnect: presence decrement, presenter grace period
 */

import { Server as IOServer, Socket } from 'socket.io';
import { prisma } from '@pollwave/shared';
import { verifyPresenterToken } from '../../middlewares/auth';
import { handleVote, hashToken } from './vote';
import {
  handleNextSlide,
  handlePrevSlide,
  handleGoToSlide,
  handleLockVoting,
  handleEndSession,
} from './presenter';
import {
  incrementPresence,
  decrementPresence,
  setPresenterOnline,
} from '../rooms/presence';
import {
  hydrateSessionTally,
  getLocalTally,
  submitQuestion,
  upvoteQuestion,
  getLocalQA,
} from '../tally/tallyManager';
import { registerSession } from '../persistence/flushWorker';
import { config } from '../../config';
import type {
  JoinSessionPayload,
  SubmitVotePayload,
  SubmitQuestionPayload,
  UpvoteQuestionPayload,
  ChangeSlidePayload,
  LockVotingPayload,
  EndSessionPayload,
  StartSessionPayload,
  SessionStartedEvent,
  QAQuestion,
} from '@pollwave/shared';
import { v4 as uuidv4 } from 'uuid';

// Per-socket state (not on the socket object to keep it clean)
const socketSessions = new Map<
  string,
  { sessionId: string; presentationId: string; participantToken: string; isPresenter: boolean }
>();

// Presenter disconnect grace timers
const presenterGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerSocketHandlers(io: IOServer): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ── Attendee: Join Session ─────────────────────────────────────────────
    socket.on('join_session', async (payload: JoinSessionPayload) => {
      try {
        const { joinCode, participantToken } = payload;

        // Resolve join code → presentation → active session
        const presentation = await prisma.presentation.findFirst({
          where: {
            joinCode: joinCode.toUpperCase(),
            status: 'live',
          },
        });

        if (!presentation) {
          socket.emit('error', { code: 'SESSION_NOT_FOUND', message: 'No active session found for this code' });
          return;
        }

        const session = await prisma.session.findFirst({
          where: {
            presentationId: presentation.id,
            status: 'active',
          },
        });

        if (!session) {
          socket.emit('error', { code: 'SESSION_NOT_ACTIVE', message: 'Session is not active' });
          return;
        }

        const sessionId = session.id;
        const presentationId = presentation.id;

        // Get all slides for this presentation
        const slides = await prisma.slide.findMany({
          where: { presentationId: presentation.id },
          orderBy: { order: 'asc' },
        });

        const slideIds = slides.map((s) => s.id);

        // Hydrate local tally from Redis (handles server restarts)
        await hydrateSessionTally(sessionId, slideIds);
        registerSession(sessionId, presentationId, slideIds);

        // Join Socket.io room
        await socket.join(`session:${sessionId}`);

        // Track socket state
        socketSessions.set(socket.id, {
          sessionId,
          presentationId,
          participantToken,
          isPresenter: false,
        });

        // Update presence
        await incrementPresence(io, sessionId);

        // Send current session state to new attendee
        socket.emit('session_joined', {
          sessionId,
          currentSlideId: session.currentSlideId ?? null,
          votingLocked: session.votingLocked,
          slides: slides.map((s) => ({
            _id: s.id,
            type: s.type,
            question: s.question,
            options: Array.isArray(s.options) ? (s.options as string[]) : [],
            order: s.order,
          })),
          tally: session.currentSlideId
            ? getLocalTally(sessionId, session.currentSlideId)
            : {},
        });

        console.log(`[Socket] ${socket.id} joined session ${sessionId}`);
      } catch (err) {
        console.error('[Socket] join_session error:', err);
        socket.emit('error', { code: 'INTERNAL', message: 'Failed to join session' });
      }
    });

    // ── Presenter: Join Session (authenticated) ────────────────────────────
    socket.on('presenter_join', async (payload: { token: string; sessionId: string }) => {
      const presenter = verifyPresenterToken(payload.token);
      if (!presenter) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Invalid presenter token' });
        return;
      }

      const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
      });
      if (!session) {
        socket.emit('error', { code: 'SESSION_NOT_FOUND', message: 'Session not found' });
        return;
      }

      const sessionId = payload.sessionId;
      const presentationId = session.presentationId;

      await socket.join(`session:${sessionId}`);
      await socket.join(`presenter:${sessionId}`); // exclusive room for presenter events

      socketSessions.set(socket.id, {
        sessionId,
        presentationId,
        participantToken: '',
        isPresenter: true,
      });

      // Cancel any pending grace timer
      const timer = presenterGraceTimers.get(sessionId);
      if (timer) {
        clearTimeout(timer);
        presenterGraceTimers.delete(sessionId);
      }

      await setPresenterOnline(io, sessionId, true);

      socket.emit('presenter_joined', {
        sessionId,
        currentSlideId: session.currentSlideId ?? null,
        votingLocked: session.votingLocked,
      });
    });

    // ── Presenter: Start Session ───────────────────────────────────────────
    socket.on('start_session', async (payload: StartSessionPayload) => {
      const data = socketSessions.get(socket.id);
      if (!data?.isPresenter) {
        // Fallback: verify if token is provided in payload
        const token = (payload as any).token;
        if (token) {
          const presenter = verifyPresenterToken(token);
          if (!presenter) {
            socket.emit('error', { code: 'UNAUTHORIZED', message: 'Presenter only' });
            return;
          }
        } else {
          socket.emit('error', { code: 'UNAUTHORIZED', message: 'Presenter only' });
          return;
        }
      }

      const { presentationId } = payload;
      const slides = await prisma.slide.findMany({
        where: { presentationId },
        orderBy: { order: 'asc' },
      });

      if (slides.length === 0) {
        socket.emit('error', { code: 'NO_SLIDES', message: 'Add slides before starting' });
        return;
      }

      const firstSlide = slides[0];
      const session = await prisma.session.create({
        data: {
          presentationId,
          currentSlideId: firstSlide.id,
          status: 'active',
          votingLocked: false,
        },
      });

      await prisma.presentation.update({
        where: { id: presentationId },
        data: { status: 'live' },
      });

      const sessionId = session.id;
      const slideIds = slides.map((s) => s.id);
      registerSession(sessionId, presentationId, slideIds);

      // Update socket state with the new sessionId
      socketSessions.set(socket.id, {
        sessionId,
        presentationId,
        participantToken: '',
        isPresenter: true,
      });

      await socket.join(`session:${sessionId}`);
      await socket.join(`presenter:${sessionId}`);

      const event: SessionStartedEvent = {
        sessionId,
        currentSlideId: firstSlide.id,
        votingLocked: false,
      };
      socket.emit('session_started', event);

      console.log(`[Socket] Session started: ${sessionId}`);
    });

    // ── Attendee: Submit Vote ─────────────────────────────────────────────
    socket.on('submit_vote', async (payload: SubmitVotePayload) => {
      const data = socketSessions.get(socket.id);
      if (!data) {
        socket.emit('error', { code: 'NOT_JOINED', message: 'Join a session first' });
        return;
      }
      await handleVote(io, socket, payload, data);
    });

    // ── Attendee: Submit Q&A Question ────────────────────────────────────
    socket.on('submit_question', async (payload: SubmitQuestionPayload) => {
      const data = socketSessions.get(socket.id);
      if (!data) return;

      const hashedToken = hashToken(payload.participantToken);
      const question: QAQuestion = {
        id: uuidv4(),
        slideId: payload.slideId,
        sessionId: data.sessionId,
        text: payload.text.trim().slice(0, 300),
        upvotes: 0,
        participantToken: hashedToken,
        createdAt: Date.now(),
      };

      await submitQuestion(question);

      const questions = getLocalQA(payload.slideId);
      io.to(`session:${data.sessionId}`).emit('question_update', { questions });
    });

    // ── Attendee: Upvote Q&A Question ─────────────────────────────────────
    socket.on('upvote_question', async (payload: UpvoteQuestionPayload) => {
      const data = socketSessions.get(socket.id);
      if (!data) return;

      const hashedToken = hashToken(payload.participantToken);
      await upvoteQuestion(payload.questionId.split(':')[0], payload.questionId, hashedToken);
    });

    // ── Presenter: Slide Navigation ───────────────────────────────────────
    socket.on('next_slide', async (payload: ChangeSlidePayload) => {
      if (!socketSessions.get(socket.id)?.isPresenter) return;
      await handleNextSlide(io, socket, payload);
    });

    socket.on('prev_slide', async (payload: ChangeSlidePayload) => {
      if (!socketSessions.get(socket.id)?.isPresenter) return;
      await handlePrevSlide(io, socket, payload);
    });

    socket.on('go_to_slide', async (payload: ChangeSlidePayload) => {
      if (!socketSessions.get(socket.id)?.isPresenter) return;
      await handleGoToSlide(io, socket, payload);
    });

    socket.on('lock_voting', async (payload: LockVotingPayload) => {
      if (!socketSessions.get(socket.id)?.isPresenter) return;
      await handleLockVoting(io, socket, payload);
    });

    socket.on('end_session', async (payload: EndSessionPayload) => {
      if (!socketSessions.get(socket.id)?.isPresenter) return;
      await handleEndSession(io, socket, payload);
    });

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const data = socketSessions.get(socket.id);
      socketSessions.delete(socket.id);

      if (!data) return;

      const { sessionId, isPresenter } = data;

      if (isPresenter) {
        // Set presenter offline
        await setPresenterOnline(io, sessionId, false);

        // Start grace period timer
        const timer = setTimeout(async () => {
          presenterGraceTimers.delete(sessionId);
          // Notify attendees presenter is gone
          io.to(`session:${sessionId}`).emit('presenter_disconnected', {
            message: 'Presenter disconnected. Session paused.',
          });
          console.log(`[Socket] Presenter grace period expired for session ${sessionId}`);
        }, config.presenterGracePeriodMs);

        presenterGraceTimers.set(sessionId, timer);
        console.log(`[Socket] Presenter disconnected from session ${sessionId}, grace timer started`);
      } else {
        // Decrement attendee presence
        await decrementPresence(io, sessionId);
      }

      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });
}
