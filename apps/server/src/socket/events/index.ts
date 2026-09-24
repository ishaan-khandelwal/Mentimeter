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
import { gameManager } from '../game/gameManager';
import { publishLiveState, clearLiveState } from '../game/liveState';
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
  JoinLobbyPayload,
  AdvanceQuizPayload,
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
            status: { not: 'ended' },
          },
        });

        if (!presentation) {
          socket.emit('error', { code: 'SESSION_NOT_FOUND', message: 'No active session found for this code' });
          return;
        }

        let session = await prisma.session.findFirst({
          where: {
            presentationId: presentation.id,
            status: 'active',
          },
          orderBy: { startedAt: 'desc' },
        });

        if (!session) {
          session = await prisma.session.findFirst({
            where: { presentationId: presentation.id },
            orderBy: { startedAt: 'desc' },
          });

          if (!session) {
            session = await prisma.session.create({
              data: {
                presentationId: presentation.id,
                status: 'active',
              },
            });
          }
        }

        const sessionId = session.id;
        const presentationId = presentation.id;

        // Get all slides for this presentation
        const slides = await prisma.slide.findMany({
          where: { presentationId: presentation.id },
          orderBy: { order: 'asc' },
        });

        const slideIds = slides.map((s: any) => s.id);

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

        const currentGameState = gameManager.getSession(sessionId);

        // Auto-register attendee into gameManager lobby if nickname is provided
        let lobbyData = gameManager.getLobbyList(sessionId);
        if ((payload as any).nickname) {
          lobbyData = gameManager.joinLobby(sessionId, presentationId, {
            token: participantToken,
            nickname: (payload as any).nickname,
            avatar: (payload as any).avatar || '🦊',
          });
          io.to(`session:${sessionId}`).emit('lobby_update', lobbyData);
        }

        // Send current session state to new attendee
        socket.emit('session_joined', {
          sessionId,
          currentSlideId: session.currentSlideId ?? null,
          votingLocked: session.votingLocked,
          gameState: currentGameState?.state || 'LOBBY',
          lobby: lobbyData,
          slides: slides.map((s: any) => ({
            _id: s.id,
            type: s.type,
            question: s.question,
            options: Array.isArray(s.options) ? (s.options as string[]) : [],
            config: s.config,
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

      const currentGameState = gameManager.getSession(sessionId);
      const lobbyData = gameManager.getLobbyList(sessionId);

      socket.emit('presenter_joined', {
        sessionId,
        currentSlideId: session.currentSlideId ?? null,
        votingLocked: session.votingLocked,
        gameState: currentGameState?.state || 'LOBBY',
        lobby: lobbyData,
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

      // Reuse existing active session if one is already open, or create new
      let session = await prisma.session.findFirst({
        where: { presentationId, status: 'active' },
        orderBy: { startedAt: 'desc' },
      });

      if (!session) {
        session = await prisma.session.create({
          data: {
            presentationId,
            currentSlideId: firstSlide.id,
            status: 'active',
            votingLocked: false,
          },
        });
      } else {
        // Ensure any older duplicate sessions are ended
        await prisma.session.updateMany({
          where: { presentationId, status: 'active', id: { not: session.id } },
          data: { status: 'ended', endedAt: new Date() },
        });
      }

      await prisma.presentation.update({
        where: { id: presentationId },
        data: { status: 'live' },
      });

      const sessionId = session.id;
      const slideIds = slides.map((s: any) => s.id);
      registerSession(sessionId, presentationId, slideIds);

      // Update socket state with the sessionId
      socketSessions.set(socket.id, {
        sessionId,
        presentationId,
        participantToken: '',
        isPresenter: true,
      });

      await socket.join(`session:${sessionId}`);
      await socket.join(`presenter:${sessionId}`);

      const currentGameState = gameManager.getSession(sessionId);
      const lobbyData = gameManager.getLobbyList(sessionId);

      socket.emit('session_started', {
        sessionId,
        currentSlideId: session.currentSlideId || firstSlide.id,
        votingLocked: session.votingLocked,
        gameState: currentGameState?.state || 'LOBBY',
        lobby: lobbyData,
      });

      console.log(`[Socket] Session ready (reused or created): ${sessionId}`);
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

    socket.on('push_announcement', (payload: { sessionId: string; message: string }) => {
      const data = socketSessions.get(socket.id);
      if (!data?.isPresenter) return;
      if (!payload?.sessionId || !payload?.message) return;
      io.to(`session:${payload.sessionId}`).emit('announcement', {
        message: payload.message,
        timestamp: Date.now(),
      });
    });

    // ── Attendee: Join Waiting Lobby ──────────────────────────────────────
    socket.on('join_lobby', async (payload: JoinLobbyPayload) => {
      try {
        const { joinCode, participantToken, nickname, avatar } = payload;
        const presentation = await prisma.presentation.findFirst({
          where: { joinCode: joinCode.toUpperCase(), status: { not: 'ended' } },
        });
        if (!presentation) {
          socket.emit('error', { code: 'SESSION_NOT_FOUND', message: 'No active session found for this code' });
          return;
        }

        let session = await prisma.session.findFirst({
          where: { presentationId: presentation.id, status: 'active' },
          orderBy: { startedAt: 'desc' },
        });
        if (!session) {
          session = await prisma.session.findFirst({
            where: { presentationId: presentation.id },
            orderBy: { startedAt: 'desc' },
          });
          if (!session) {
            session = await prisma.session.create({
              data: {
                presentationId: presentation.id,
                status: 'active',
              },
            });
          }
        }

        const sessionId = session.id;
        await socket.join(`session:${sessionId}`);

        socketSessions.set(socket.id, {
          sessionId,
          presentationId: presentation.id,
          participantToken,
          isPresenter: false,
        });

        const lobbyData = gameManager.joinLobby(sessionId, presentation.id, {
          token: participantToken,
          nickname,
          avatar,
        });

        // Broadcast to presenter & everyone in room
        io.to(`session:${sessionId}`).emit('lobby_update', lobbyData);

        const currentGameState = gameManager.getSession(sessionId);
        socket.emit('lobby_joined', {
          sessionId,
          state: currentGameState?.state || 'LOBBY',
          participants: lobbyData.participants,
          count: lobbyData.count,
        });
      } catch (err) {
        console.error('[Socket] join_lobby error:', err);
        socket.emit('error', { code: 'INTERNAL', message: 'Failed to join lobby' });
      }
    });

    // ── Presenter: Advance Quiz (Kahoot Game Loop) ─────────────────────────
    socket.on('advance_quiz', async (payload: AdvanceQuizPayload) => {
      const data = socketSessions.get(socket.id);
      if (!data?.isPresenter) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Presenter only' });
        return;
      }

      const { sessionId, targetState, nextSlideId } = payload;
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          presentation: {
            include: {
              slides: { orderBy: { order: 'asc' } },
            },
          },
        },
      });

      if (!session) return;
      const slides = session.presentation.slides;
      if (slides.length === 0) return;

      let targetSlide = slides[0];
      if (nextSlideId) {
        const found = slides.find((s: any) => s.id === nextSlideId);
        if (found) targetSlide = found;
      } else if (session.currentSlideId) {
        const currentIndex = slides.findIndex((s: any) => s.id === session.currentSlideId);
        if (currentIndex >= 0) {
          targetSlide = slides[currentIndex];
        }
      }

      const parseConfig = (cfg: any): Record<string, any> => {
        if (typeof cfg === 'string') {
          try { return JSON.parse(cfg); } catch { return {}; }
        }
        return cfg && typeof cfg === 'object' ? cfg : {};
      };
      const slideConfig = parseConfig(targetSlide.config);
      const slideOptions = Array.isArray(targetSlide.options) ? (targetSlide.options as string[]) : [];
      const durationSeconds = Number(slideConfig.durationSeconds) || 20;
      const correctAnswer = slideConfig.correctAnswer ?? null;
      const presentationId = session.presentationId;

      if (targetState === 'COUNTDOWN') {
        publishLiveState(sessionId, {
          gameState: 'COUNTDOWN',
          currentSlideId: targetSlide.id,
          votingLocked: true,
        });

        gameManager.startCountdown(
          sessionId,
          presentationId,
          targetSlide.id,
          durationSeconds,
          correctAnswer,
          (countdown) => {
            io.to(`session:${sessionId}`).emit('game_state_changed', {
              state: 'COUNTDOWN',
              countdown,
              slideId: targetSlide.id,
            });
          },
          () => {
            // Automatically transitions to QUESTION_ACTIVE
            prisma.session.update({
              where: { id: sessionId },
              data: { currentSlideId: targetSlide.id, votingLocked: false },
            }).catch(console.error);

            io.to(`session:${sessionId}`).emit('slide_changed', {
              currentSlideId: targetSlide.id,
              votingLocked: false,
            });

            const timerState = gameManager.startQuestion(
              sessionId,
              presentationId,
              targetSlide.id,
              durationSeconds,
              correctAnswer,
              () => {
                // On question timer expire -> lock question
                prisma.session.update({
                  where: { id: sessionId },
                  data: { votingLocked: true },
                }).catch(console.error);

                publishLiveState(sessionId, {
                  gameState: 'QUESTION_LOCKED',
                  currentSlideId: targetSlide.id,
                  votingLocked: true,
                });

                io.to(`session:${sessionId}`).emit('voting_locked', { locked: true });
                io.to(`session:${sessionId}`).emit('game_state_changed', {
                  state: 'QUESTION_LOCKED',
                  slideId: targetSlide.id,
                });
              },
              slideOptions
            );

            publishLiveState(sessionId, {
              gameState: 'QUESTION_ACTIVE',
              currentSlideId: targetSlide.id,
              votingLocked: false,
              questionStartedAt: timerState?.questionStartedAt,
              durationSeconds: timerState?.durationSeconds ?? durationSeconds,
            });

            io.to(`session:${sessionId}`).emit('game_state_changed', {
              state: 'QUESTION_ACTIVE',
              slideId: targetSlide.id,
              timer: timerState,
            });
          },
          slideOptions
        );
      } else if (targetState === 'QUESTION_ACTIVE') {
        await prisma.session.update({
          where: { id: sessionId },
          data: { currentSlideId: targetSlide.id, votingLocked: false },
        }).catch(console.error);

        io.to(`session:${sessionId}`).emit('slide_changed', {
          currentSlideId: targetSlide.id,
          votingLocked: false,
        });

        const timerState = gameManager.startQuestion(
          sessionId,
          presentationId,
          targetSlide.id,
          durationSeconds,
          correctAnswer,
          () => {
            prisma.session.update({
              where: { id: sessionId },
              data: { votingLocked: true },
            }).catch(console.error);

            publishLiveState(sessionId, {
              gameState: 'QUESTION_LOCKED',
              currentSlideId: targetSlide.id,
              votingLocked: true,
            });

            io.to(`session:${sessionId}`).emit('voting_locked', { locked: true });
            io.to(`session:${sessionId}`).emit('game_state_changed', {
              state: 'QUESTION_LOCKED',
              slideId: targetSlide.id,
            });
          },
          slideOptions
        );

        publishLiveState(sessionId, {
          gameState: 'QUESTION_ACTIVE',
          currentSlideId: targetSlide.id,
          votingLocked: false,
          questionStartedAt: timerState?.questionStartedAt,
          durationSeconds: timerState?.durationSeconds ?? durationSeconds,
        });

        io.to(`session:${sessionId}`).emit('game_state_changed', {
          state: 'QUESTION_ACTIVE',
          slideId: targetSlide.id,
          timer: timerState,
        });
      } else if (targetState === 'QUESTION_LOCKED') {
        gameManager.lockQuestion(sessionId);
        await prisma.session.update({
          where: { id: sessionId },
          data: { votingLocked: true },
        });

        publishLiveState(sessionId, {
          gameState: 'QUESTION_LOCKED',
          currentSlideId: targetSlide.id,
          votingLocked: true,
        });

        io.to(`session:${sessionId}`).emit('voting_locked', { locked: true });
        io.to(`session:${sessionId}`).emit('game_state_changed', {
          state: 'QUESTION_LOCKED',
          slideId: targetSlide.id,
        });
      } else if (targetState === 'REVEAL') {
        gameManager.setState(sessionId, 'REVEAL');
        const revealTally = getLocalTally(sessionId, targetSlide.id);

        publishLiveState(sessionId, {
          gameState: 'REVEAL',
          currentSlideId: targetSlide.id,
          votingLocked: true,
          correctAnswer: slideConfig.correctAnswer ?? null,
        });

        io.to(`session:${sessionId}`).emit('game_state_changed', {
          state: 'REVEAL',
          slideId: targetSlide.id,
          correctAnswer: slideConfig.correctAnswer,
          revealTally,
        });
      } else if (targetState === 'LEADERBOARD') {
        gameManager.setState(sessionId, 'LEADERBOARD');
        const leaderboard = gameManager.getLeaderboard(sessionId);

        publishLiveState(sessionId, {
          gameState: 'LEADERBOARD',
          currentSlideId: targetSlide.id,
          votingLocked: true,
        });

        io.to(`session:${sessionId}`).emit('leaderboard_update', leaderboard);
        io.to(`session:${sessionId}`).emit('game_state_changed', {
          state: 'LEADERBOARD',
          slideId: targetSlide.id,
        });
      } else if (targetState === 'FINAL_RESULTS') {
        gameManager.setState(sessionId, 'FINAL_RESULTS');
        const results = gameManager.getFinalResults(sessionId);

        publishLiveState(sessionId, {
          gameState: 'FINAL_RESULTS',
          currentSlideId: null,
          votingLocked: true,
        });

        io.to(`session:${sessionId}`).emit('final_results', results);
        io.to(`session:${sessionId}`).emit('game_state_changed', {
          state: 'FINAL_RESULTS',
        });
      }
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
