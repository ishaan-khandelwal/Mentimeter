import { NextResponse } from 'next/server';
import { prisma } from '@pollwave/shared';
import crypto from 'crypto';
import { readLiveState } from '@/lib/liveState';

interface RouteParams {
  params: { id: string };
}

// In-memory fast lobby and game state cache for serverless instance sharing
interface LobbyState {
  participants: Map<string, { token: string; nickname: string; avatar: string; timestamp: number }>;
  gameState?: string;
  currentSlideId?: string;
}

const memoryLobby = new Map<string, LobbyState>();

function getLobbyKey(presIdOrCode: string): string {
  return presIdOrCode.toUpperCase();
}

function getOrCreateLobby(key: string): LobbyState {
  let lobby = memoryLobby.get(key);
  if (!lobby) {
    lobby = { participants: new Map(), gameState: 'LOBBY' };
    memoryLobby.set(key, lobby);
  }
  return lobby;
}

// GET /api/v1/presentations/:id/lobby — Get joined lobby participants, game state, and slides
export async function GET(_req: Request, { params }: RouteParams) {
  const query = params.id;

  // Resolve presentation by ID or joinCode
  const presentation = await prisma.presentation.findFirst({
    where: {
      OR: [
        { id: query },
        { joinCode: query.toUpperCase() },
      ],
      status: { not: 'ended' },
    },
    include: {
      slides: { orderBy: { order: 'asc' } },
      sessions: { where: { status: 'active' }, orderBy: { startedAt: 'desc' }, take: 1 },
    },
  });

  if (!presentation) {
    return NextResponse.json({ error: 'Presentation not found' }, { status: 404 });
  }

  const activeSession = presentation.sessions[0];
  const firstSlide = presentation.slides[0];

  // 1. Merge participants from in-memory lobby
  const lobbyState = getOrCreateLobby(getLobbyKey(presentation.id));
  const codeKey = getLobbyKey(presentation.joinCode);
  const codeLobby = memoryLobby.get(codeKey);

  const merged = new Map<string, { token: string; nickname: string; avatar: string }>();
  lobbyState.participants.forEach((p) => merged.set(p.token, { token: p.token, nickname: p.nickname, avatar: p.avatar }));
  if (codeLobby && codeLobby !== lobbyState) {
    codeLobby.participants.forEach((p) => merged.set(p.token, { token: p.token, nickname: p.nickname, avatar: p.avatar }));
  }

  const participants = Array.from(merged.values());

  const formattedSlides = presentation.slides.map((s: any) => ({
    _id: s.id,
    type: s.type,
    question: s.question,
    options: (s.options as string[]) || [],
    config: (s.config as Record<string, any>) || {},
    order: s.order,
  }));

  // The socket server mirrors every game-state transition (COUNTDOWN,
  // QUESTION_LOCKED, REVEAL, LEADERBOARD, FINAL_RESULTS, ...) into Redis.
  // Prefer that live snapshot over this route's own in-memory lobby state,
  // which only ever learns about the very first QUESTION_ACTIVE transition
  // and would otherwise get stuck there for the rest of the quiz.
  const liveState = activeSession ? await readLiveState(activeSession.id) : null;

  const resolvedSlideId =
    liveState?.currentSlideId ?? lobbyState.currentSlideId ?? activeSession?.currentSlideId ?? firstSlide?.id ?? null;
  const resolvedGameState =
    liveState?.gameState ?? lobbyState.gameState ?? (activeSession?.currentSlideId ? 'QUESTION_ACTIVE' : 'LOBBY');
  const resolvedVotingLocked = liveState?.votingLocked ?? activeSession?.votingLocked ?? false;

  return NextResponse.json({
    presentationId: presentation.id,
    joinCode: presentation.joinCode,
    sessionId: activeSession?.id || null,
    participants,
    count: participants.length,
    votingLocked: resolvedVotingLocked,
    currentSlideId: resolvedSlideId,
    gameState: resolvedGameState,
    questionStartedAt: liveState?.questionStartedAt ?? null,
    durationSeconds: liveState?.durationSeconds ?? null,
    correctAnswer: liveState?.correctAnswer ?? null,
    slides: formattedSlides,
  });
}

// POST /api/v1/presentations/:id/lobby — Attendee registers into waiting lobby or presenter starts quiz
export async function POST(req: Request, { params }: RouteParams) {
  const query = params.id;

  const presentation = await prisma.presentation.findFirst({
    where: {
      OR: [
        { id: query },
        { joinCode: query.toUpperCase() },
      ],
      status: { not: 'ended' },
    },
    include: {
      slides: { orderBy: { order: 'asc' } },
      sessions: { where: { status: 'active' }, orderBy: { startedAt: 'desc' }, take: 1 },
    },
  });

  if (!presentation) {
    return NextResponse.json({ error: 'Presentation not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const presKey = getLobbyKey(presentation.id);
  const lobbyState = getOrCreateLobby(presKey);

  // Handle START_QUIZ action
  if (body.action === 'START_QUIZ') {
    const nextSlideId = body.currentSlideId || presentation.slides[0]?.id;
    lobbyState.gameState = 'QUESTION_ACTIVE';
    if (nextSlideId) lobbyState.currentSlideId = nextSlideId;

    if (presentation.sessions[0]) {
      await prisma.session.update({
        where: { id: presentation.sessions[0].id },
        data: { currentSlideId: nextSlideId, votingLocked: false },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      gameState: lobbyState.gameState,
      currentSlideId: lobbyState.currentSlideId,
    });
  }

  const { participantToken, nickname, avatar } = body as {
    participantToken?: string;
    nickname?: string;
    avatar?: string;
  };

  if (!participantToken) {
    return NextResponse.json({ error: 'Missing participantToken' }, { status: 400 });
  }

  const cleanNick = (nickname || 'Swift Fox').trim().slice(0, 20);
  const cleanAvatar = avatar || '🦊';
  const hashedToken = crypto.createHash('sha256').update(participantToken).digest('hex');

  // Update in-memory lobby
  lobbyState.participants.set(hashedToken, {
    token: hashedToken,
    nickname: cleanNick,
    avatar: cleanAvatar,
    timestamp: Date.now(),
  });

  // Also index by joinCode for fast lookup
  const codeKey = getLobbyKey(presentation.joinCode);
  if (codeKey !== presKey) {
    memoryLobby.set(codeKey, lobbyState);
  }

  // Ensure active session exists
  let session = presentation.sessions[0];
  if (!session) {
    session = await prisma.session.create({
      data: {
        presentationId: presentation.id,
        status: 'active',
      },
    });
  }


  const allInPres = Array.from(lobbyState.participants.values());

  return NextResponse.json({
    success: true,
    participant: { token: hashedToken, nickname: cleanNick, avatar: cleanAvatar },
    count: allInPres.length,
    gameState: lobbyState.gameState || 'LOBBY',
  });
}
