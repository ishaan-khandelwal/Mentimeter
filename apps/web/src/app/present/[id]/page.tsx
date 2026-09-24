'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import Link from 'next/link';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import QuizRaceLeaderboard from '@/components/QuizRaceLeaderboard';
import type {
  GameState,
  LeaderboardEntry,
  QuestionTimerState,
  FinalResultsEvent,
  GameStateChangedEvent,
} from '@pollwave/shared';

type SlideType =
  | 'multiple_choice'
  | 'word_cloud'
  | 'open_text'
  | 'rating_scale'
  | 'ranking'
  | 'qa'
  | 'scales'
  | 'hundred_points'
  | 'number'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'video'
  | 'bullets';

interface Slide {
  _id: string;
  type: SlideType;
  question: string;
  options?: string[];
  order: number;
  config?: Record<string, any>;
  hideResults?: boolean;
  timerSeconds?: number | null;
  maxVotes?: number;
}

interface Presentation {
  _id: string;
  title: string;
  joinCode: string;
  status: string;
  theme?: any;
  isAsyncForm?: boolean;
}

interface QAQuestion {
  id: string;
  slideId: string;
  text: string;
  upvotes: number;
  createdAt: number;
}

interface AiSummaryResult {
  summary: string;
  themes: string[];
  sentiment?: string;
}

export default function PresenterLivePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [votingLocked, setVotingLocked] = useState(false);
  const [presenceCount, setPresenceCount] = useState<number>(0);
  const [tallies, setTallies] = useState<Record<string, Record<string, number>>>({});
  const [qaList, setQaList] = useState<QAQuestion[]>([]);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);

  // Competition Game Loop State
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [lobbyParticipants, setLobbyParticipants] = useState<
    Array<{ token: string; nickname: string; avatar: string }>
  >([]);
  const [countdownNumber, setCountdownNumber] = useState<number>(3);
  const [timerState, setTimerState] = useState<QuestionTimerState | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(20);
  const [revealData, setRevealData] = useState<{
    correctAnswer?: string | string[];
    revealTally?: Record<string, number>;
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalResults, setFinalResults] = useState<FinalResultsEvent | null>(null);

  // AI Summary states
  const [aiSummary, setAiSummary] = useState<AiSummaryResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiSummaryModal, setShowAiSummaryModal] = useState(false);

  const [resultsRevealed, setResultsRevealed] = useState<Record<string, boolean>>({});
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementSent, setAnnouncementSent] = useState(false);

  const handlePushAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementText.trim() || !sessionId) return;
    const socket = getSocket();
    socket.emit('push_announcement', { sessionId, message: announcementText.trim() });
    setAnnouncementSent(true);
    setTimeout(() => {
      setAnnouncementSent(false);
      setShowAnnouncementModal(false);
      setAnnouncementText('');
    }, 1500);
  };

  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load presentation and slides
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`/api/v1/presentations/${id}`);
        if (!res.ok) {
          if (res.status === 401) {
            setAuthError('UNAUTHORIZED');
          } else {
            setAuthError('NOT_FOUND');
          }
          return;
        }
        const data = await res.json();
        setPresentation(data.presentation);
        setSlides(data.slides || []);

        if ((data.slides || []).length > 0) {
          setCurrentSlideId(data.slides[0]._id);
        }

        if (data.presentation?.joinCode) {
          let hostOrigin = window.location.origin;
          if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            try {
              const netRes = await fetch('/api/v1/network-info');
              if (netRes.ok) {
                const { localIp } = await netRes.json();
                if (localIp && localIp !== 'localhost') {
                  hostOrigin = `http://${localIp}:${window.location.port || '3000'}`;
                }
              }
            } catch {
              // fallback to window.location.origin
            }
          }
          const joinUrl = `${hostOrigin}/join/${data.presentation.joinCode}`;
          const qr = await QRCode.toDataURL(joinUrl, { margin: 2, width: 300 });
          setQrCodeUrl(qr);
        }
      } catch (err) {
        console.error('Failed to init presenter:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id, router]);

  // Connect to Socket.io as presenter
  useEffect(() => {
    if (!presentation) return;

    let socket = getSocket();
    if (!socket.connected) {
      socket.connect();
    }

    async function authPresenter() {
      try {
        const tokenRes = await fetch('/api/v1/auth/socket-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presentationId: id }),
        });

        if (!tokenRes.ok) {
          console.error('Failed to get presenter socket token');
          return;
        }

        const { token } = await tokenRes.json();
        const emitStart = () => {
          socket.emit('start_session', { presentationId: id, token });
        };

        if (socket.connected) {
          emitStart();
        } else {
          socket.once('connect', emitStart);
        }
      } catch (err) {
        console.error('Presenter auth error:', err);
      }
    }

    authPresenter();

    const onSessionStarted = (data: any) => {
      setSessionId(data.sessionId);
      setCurrentSlideId(data.currentSlideId);
      setVotingLocked(data.votingLocked);
      if (data.gameState) setGameState(data.gameState);
      if (data.lobby?.participants) setLobbyParticipants(data.lobby.participants);
    };

    const onPresenterJoined = (data: any) => {
      setSessionId(data.sessionId);
      if (data.currentSlideId) setCurrentSlideId(data.currentSlideId);
      setVotingLocked(data.votingLocked);
      if (data.gameState) setGameState(data.gameState);
      if (data.lobby?.participants) setLobbyParticipants(data.lobby.participants);
    };

    const onSlideChanged = (data: { currentSlideId: string; votingLocked: boolean }) => {
      setCurrentSlideId(data.currentSlideId);
      setVotingLocked(data.votingLocked);
      setAiSummary(null);
    };

    const onVotingLocked = (data: { locked: boolean }) => {
      setVotingLocked(data.locked);
    };

    const onTallyUpdate = (data: { slideId: string; tally: Record<string, number> }) => {
      setTallies((prev) => ({
        ...prev,
        [data.slideId]: data.tally,
      }));
    };

    const onPresenceUpdate = (data: { count: number }) => {
      setPresenceCount(data.count);
    };

    const onQuestionUpdate = (data: { questions: QAQuestion[] }) => {
      setQaList(data.questions || []);
    };

    // Quiz Game Loop Events
    const onGameStateChanged = (data: GameStateChangedEvent) => {
      setGameState(data.state);
      if (data.countdown !== undefined) setCountdownNumber(data.countdown);
      if (data.slideId) setCurrentSlideId(data.slideId);
      if (data.timer) {
        setTimerState(data.timer);
        setRemainingTime(data.timer.durationSeconds);
      }
      if (data.state === 'REVEAL') {
        setRevealData({
          correctAnswer: data.correctAnswer,
          revealTally: data.revealTally,
        });
      }
    };

    const onLobbyUpdate = (data: {
      participants: Array<{ token: string; nickname: string; avatar: string }>;
      count: number;
    }) => {
      setLobbyParticipants(data.participants || []);
      setPresenceCount(data.count || 0);
    };

    const onTimerUpdate = (data: { slideId: string; answeredCount: number; totalParticipants: number }) => {
      setTimerState((prev) => ({
        slideId: data.slideId,
        questionStartedAt: prev?.questionStartedAt || Date.now(),
        durationSeconds: prev?.durationSeconds || 20,
        answeredCount: data.answeredCount,
        // Trust the server's online-filtered count directly — inflating it
        // against the locally-cached lobby list let stale/offline entries
        // push the denominator above the real number of connected players.
        totalParticipants: Math.max(data.totalParticipants, 1),
      }));
    };

    const onLeaderboardUpdate = (data: { entries: LeaderboardEntry[]; totalParticipants: number }) => {
      setLeaderboard(data.entries || []);
    };

    const onFinalResults = (data: FinalResultsEvent) => {
      setFinalResults(data);
    };

    socket.on('session_started', onSessionStarted);
    socket.on('presenter_joined', onPresenterJoined);
    socket.on('slide_changed', onSlideChanged);
    socket.on('voting_locked', onVotingLocked);
    socket.on('tally_update', onTallyUpdate);
    socket.on('presence_update', onPresenceUpdate);
    socket.on('question_update', onQuestionUpdate);
    socket.on('game_state_changed', onGameStateChanged);
    socket.on('lobby_update', onLobbyUpdate);
    socket.on('timer_update', onTimerUpdate);
    socket.on('leaderboard_update', onLeaderboardUpdate);
    socket.on('final_results', onFinalResults);

    return () => {
      socket.off('session_started', onSessionStarted);
      socket.off('presenter_joined', onPresenterJoined);
      socket.off('slide_changed', onSlideChanged);
      socket.off('voting_locked', onVotingLocked);
      socket.off('tally_update', onTallyUpdate);
      socket.off('presence_update', onPresenceUpdate);
      socket.off('question_update', onQuestionUpdate);
      socket.off('game_state_changed', onGameStateChanged);
      socket.off('lobby_update', onLobbyUpdate);
      socket.off('timer_update', onTimerUpdate);
      socket.off('leaderboard_update', onLeaderboardUpdate);
      socket.off('final_results', onFinalResults);
    };
  }, [presentation, id]);

  // REST Polling Fallback for Lobby Participants (backup if WebSocket is not receiving)
  useEffect(() => {
    if (gameState !== 'LOBBY' || !id) return;

    let isMounted = true;
    const pollLobby = async () => {
      // If socket is connected and participants exist, socket events already handle real-time lobby updates
      const socket = getSocket();
      if (socket?.connected && lobbyParticipants.length > 0) return;
      try {
        const res = await fetch(`/api/v1/presentations/${id}/lobby`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.participants && Array.isArray(data.participants)) {
            // Replace, don't merge — this route now reflects the real,
            // currently-connected roster (mirrored from the socket server's
            // online-filtered list), so a stale local entry that's no longer
            // in the server's response means that participant actually left.
            setLobbyParticipants(data.participants);
            setPresenceCount(data.count ?? data.participants.length);
          }
        }
      } catch {}
    };

    pollLobby();
    const interval = setInterval(pollLobby, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [gameState, id, lobbyParticipants.length]);

  const currentIndex = slides.findIndex((s) => s._id === currentSlideId);
  const activeSlide = slides[currentIndex] || slides[0] || null;

  // Live REST tallies & answered counts sync (backup to WebSockets)
  useEffect(() => {
    if (!id || (gameState !== 'QUESTION_ACTIVE' && gameState !== 'QUESTION_LOCKED' && gameState !== 'REVEAL')) return;

    let isMounted = true;
    const syncVotes = async () => {
      // If socket is connected and working, socket events already handle real-time tallies & timer updates
      const socket = getSocket();
      if (socket?.connected) return;
      try {
        const res = await fetch(`/api/v1/presentations/${id}/vote`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.tallies) {
            setTallies((prev) => ({ ...prev, ...data.tallies }));
          }
          if (activeSlide && data.tallies && data.tallies[activeSlide._id]) {
            const count = Object.values(data.tallies[activeSlide._id]).reduce((a: number, b: any) => a + Number(b), 0);
            setTimerState((prev) => ({
              slideId: activeSlide._id,
              questionStartedAt: prev?.questionStartedAt || Date.now(),
              durationSeconds: prev?.durationSeconds || 20,
              answeredCount: count,
              totalParticipants: Math.max(lobbyParticipants.length, 1),
            }));
          }
        }
      } catch {}
    };

    syncVotes();
    const interval = setInterval(syncVotes, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [id, gameState, activeSlide, lobbyParticipants.length]);

  // Question active timer countdown effect
  useEffect(() => {
    if (gameState !== 'QUESTION_ACTIVE' || !timerState) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - timerState.questionStartedAt) / 1000;
      const left = Math.max(0, timerState.durationSeconds - elapsed);
      setRemainingTime(Math.ceil(left));
    }, 200);

    return () => clearInterval(interval);
  }, [gameState, timerState]);

  // Final Results Confetti
  useEffect(() => {
    if (gameState === 'FINAL_RESULTS') {
      confetti({
        particleCount: 160,
        spread: 90,
        origin: { y: 0.6 },
      });

      const interval = setInterval(() => {
        confetti({
          particleCount: 80,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 80,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 1600);

      return () => clearInterval(interval);
    }
  }, [gameState]);

  // Slide controls
  const handleNextSlide = () => {
    if (!sessionId) return;
    const socket = getSocket();
    socket.emit('next_slide', { sessionId });
  };

  const handlePrevSlide = () => {
    if (!sessionId) return;
    const socket = getSocket();
    socket.emit('prev_slide', { sessionId });
  };

  const handleGoToSlide = (slideId: string) => {
    if (!sessionId) return;
    const socket = getSocket();
    socket.emit('go_to_slide', { sessionId, slideId });
  };

  const handleToggleLock = () => {
    if (!sessionId) return;
    const socket = getSocket();
    socket.emit('lock_voting', { sessionId, locked: !votingLocked });
    setVotingLocked(!votingLocked);
  };

  const handleEndSession = () => {
    if (!sessionId || !confirm('Are you sure you want to end this live presentation session?')) return;
    const socket = getSocket();
    socket.emit('end_session', { sessionId });
    router.push('/dashboard');
  };

  // Game Loop Controls
  const handleStartQuiz = () => {
    if (slides.length === 0) return;
    const socket = getSocket();
    if (sessionId) {
      socket.emit('advance_quiz', {
        sessionId,
        targetState: 'COUNTDOWN',
        nextSlideId: slides[0]._id,
      });
    }

    // Also trigger via REST so serverless/Vercel attendees transition immediately
    fetch(`/api/v1/presentations/${id}/lobby`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'START_QUIZ', currentSlideId: slides[0]._id }),
    }).catch(() => {});

    // Ensure presenter screen transitions into countdown without waiting
    setGameState('COUNTDOWN');
    setCountdownNumber(3);
    if (slides[0]?._id) {
      setCurrentSlideId(slides[0]._id);
    }
  };

  const handleToggleVoting = () => {
    if (!sessionId) return;
    const socket = getSocket();
    const nextLocked = !votingLocked;
    socket.emit('lock_voting', { sessionId, locked: nextLocked });
    setVotingLocked(nextLocked);
  };

  const handleLockQuestion = () => {
    setVotingLocked(true);
    setGameState('QUESTION_LOCKED');
    if (sessionId) {
      const socket = getSocket();
      socket.emit('advance_quiz', {
        sessionId,
        targetState: 'QUESTION_LOCKED',
      });
    }
  };

  const handleRevealAnswer = () => {
    setGameState('REVEAL');
    if (sessionId) {
      const socket = getSocket();
      socket.emit('advance_quiz', {
        sessionId,
        targetState: 'REVEAL',
      });
    }
  };

  const handleShowLeaderboard = () => {
    setGameState('LEADERBOARD');
    if (sessionId) {
      const socket = getSocket();
      socket.emit('advance_quiz', {
        sessionId,
        targetState: 'LEADERBOARD',
      });
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex < slides.length - 1) {
      const nextSlide = slides[currentIndex + 1];
      setCurrentSlideId(nextSlide._id);
      setGameState('COUNTDOWN');
      setCountdownNumber(3);
      if (sessionId) {
        const socket = getSocket();
        socket.emit('advance_quiz', {
          sessionId,
          targetState: 'COUNTDOWN',
          nextSlideId: nextSlide._id,
        });
      }
    } else {
      setGameState('FINAL_RESULTS');
      if (sessionId) {
        const socket = getSocket();
        socket.emit('advance_quiz', {
          sessionId,
          targetState: 'FINAL_RESULTS',
        });
      }
    }
  };

  const handleShowFinalResults = () => {
    setGameState('FINAL_RESULTS');
    if (sessionId) {
      const socket = getSocket();
      socket.emit('advance_quiz', {
        sessionId,
        targetState: 'FINAL_RESULTS',
      });
    }
  };

  // Generate Claude AI summary of audience responses
  const handleGenerateAiSummary = async () => {
    if (!activeSlide || !currentSlideId) return;
    setAiLoading(true);
    setShowAiSummaryModal(true);

    try {
      const currentTally = tallies[currentSlideId] || {};
      const res = await fetch('/api/v1/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: activeSlide.question,
          type: activeSlide.type,
          responses: currentTally,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate summary');
      const data = await res.json();
      setAiSummary(data);
    } catch (err) {
      console.error('AI summary error:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const currentTally = useMemo(() => {
    if (!currentSlideId) return {};
    return tallies[currentSlideId] || {};
  }, [currentSlideId, tallies]);

  const totalVotes = useMemo(() => {
    return Object.values(currentTally).reduce((sum, val) => sum + val, 0);
  }, [currentTally]);

  if (authError === 'UNAUTHORIZED') {
    return (
      <div className="container" style={{ padding: '80px 24px', textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '8px' }}>Presenter Sign In Required</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
          You must be signed in as the owner of this presentation to host and present it live.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Link href={`/login?callbackUrl=/present/${id}`} className="btn btn--primary">
            Sign In to Present
          </Link>
          <Link href="/join" className="btn btn--ghost">
            Are you an attendee? Join here with code
          </Link>
        </div>
      </div>
    );
  }

  if (authError === 'NOT_FOUND') {
    return (
      <div className="container" style={{ padding: '80px 24px', textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔍</div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '8px' }}>Presentation Not Found</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
          This presentation does not exist or has been removed.
        </p>
        <Link href="/dashboard" className="btn btn--primary">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="nav-skeleton" style={{ width: '260px', height: '40px', margin: '0 auto 20px' }} />
        <p style={{ color: 'var(--color-text-muted)' }}>Launching presenter view...</p>
      </div>
    );
  }

  // Option background colors (Kahoot / Mentimeter theme: Red, Saffron, Yellow, Green)
  const optionColors = [
    { bg: '#ef4444', text: '#fffaf3', symbol: '▲' },
    { bg: '#d1912c', text: '#fffaf3', symbol: '◆' },
    { bg: '#f59e0b', text: '#fffaf3', symbol: '●' },
    { bg: '#2f8f6b', text: '#fffaf3', symbol: '■' },
    { bg: '#b65f78', text: '#fffaf3', symbol: '★' },
    { bg: '#ec4899', text: '#fffaf3', symbol: '✦' },
  ];

  // Dynamic presentation theme
  const theme = presentation?.theme || { colorScheme: 'default', fontStyle: 'modern', background: 'gradient' };
  const themeBgMap: Record<string, string> = {
    saffron: 'radial-gradient(ellipse at top, #6b3448 0%, #5b3047 60%, #4a2b40 100%)',
    forest: 'radial-gradient(ellipse at top, #2d6d56 0%, #285f4c 60%, #244c40 100%)',
    sunset: 'radial-gradient(ellipse at top, #8f3449 0%, #6b2f40 60%, #4d2935 100%)',
    plum: 'radial-gradient(ellipse at top, #6b3448 0%, #efe5dc 60%, #3f2940 100%)',
    rose: 'radial-gradient(ellipse at top, #93405d 0%, #5c3649 60%, #4a2b3b 100%)',
    amber: 'radial-gradient(ellipse at top, #80552b 0%, #5c473a 60%, #45372f 100%)',
    clay: 'radial-gradient(ellipse at top, #f1e7dc 0%, #efe5dc 60%, #e8ddd3 100%)',
    default: 'radial-gradient(ellipse at top, #6b3448 0%, #efe5dc 60%, #f7efe7 100%)',
  };
  const themeFontMap: Record<string, string> = {
    classic: 'Georgia, serif',
    playful: 'Comic Sans MS, cursive, sans-serif',
    minimal: 'monospace, sans-serif',
    modern: 'inherit',
  };

  const getCharacterClass = (index: number) =>
    ['coral', 'saffron', 'emerald', 'plum', 'rose', 'clay'][index % 6];

  const finalLeaderboardEntries = finalResults?.fullLeaderboard?.length
    ? finalResults.fullLeaderboard
    : leaderboard;

  return (
    <div
      className="presenter-layout"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: themeBgMap[theme.colorScheme] || themeBgMap.default,
        fontFamily: themeFontMap[theme.fontStyle] || 'inherit',
      }}
    >
      {/* Top Presenter Toolbar */}
      <div className="presenter-toolbar" style={{ justifyContent: 'space-between', height: '68px', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/dashboard" className="btn btn--ghost btn--sm">
            ✕ Exit
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{presentation?.title}</span>
            <span className="badge badge--live">● LIVE</span>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'rgba(217, 87, 69, 0.2)',
                color: '#b65f78',
                border: '1px solid rgba(217, 87, 69, 0.3)',
              }}
            >
              {gameState}
            </span>
          </div>
        </div>

        {/* Join instructions for audience */}
        <div
          style={{
            background: 'rgba(92, 54, 73, 0.07)',
            border: '1px solid var(--color-border)',
            borderRadius: '100px',
            padding: '6px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Join at <strong>{typeof window !== 'undefined' ? window.location.host : 'pollwave.io'}/join</strong>
          </span>
          <span
            style={{
              background: 'var(--gradient-brand)',
              color: 'var(--color-bg)',
              fontWeight: 800,
              padding: '2px 10px',
              borderRadius: '20px',
              letterSpacing: '0.08em',
            }}
          >
            {presentation?.joinCode}
          </span>
          <button
            onClick={() => setShowQrModal(true)}
            className="btn btn--ghost btn--sm"
            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
          >
            QR
          </button>
        </div>

        {/* Presence & Session Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
            <span style={{ color: '#3f9a73', fontSize: '1.2rem' }}>●</span>
            <span style={{ fontWeight: 700 }}>{Math.max(presenceCount, lobbyParticipants.length)}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>players</span>
          </div>

          <button
            onClick={handleGenerateAiSummary}
            className="btn btn--secondary btn--sm"
          >
            ✨ AI Insights
          </button>

          <button onClick={handleEndSession} className="btn btn--danger btn--sm">
            End Session
          </button>
        </div>
      </div>

      {/* ─── 1. LOBBY STATE (Waiting Room Hero) ─────────────────────────────── */}
      {gameState === 'LOBBY' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '36px 24px 120px',
            background: 'radial-gradient(ellipse at center, rgba(217, 87, 69, 0.12) 0%, rgba(251, 247, 240, 1) 70%)',
            overflowY: 'auto',
          }}
        >
          <div style={{ maxWidth: '850px', width: '100%', textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 18px',
                borderRadius: '100px',
                background: 'rgba(217, 87, 69, 0.2)',
                border: '1px solid rgba(217, 87, 69, 0.4)',
                color: '#9c4f73',
                fontWeight: 700,
                fontSize: '0.95rem',
                marginBottom: '20px',
              }}
            >
              🎮 WAITING ROOM
            </div>

            <h1 style={{ fontSize: 'clamp(2.4rem, 5vw, 4rem)', fontWeight: 900, marginBottom: '16px' }}>
              Join the Quiz Challenge
            </h1>

            {/* Huge Join Code Callout */}
            <div
              style={{
                background: 'rgba(92, 54, 73, 0.06)',
                border: '2px solid rgba(217, 87, 69, 0.4)',
                borderRadius: '24px',
                padding: '28px 40px',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 12px 40px rgba(63, 41, 64, 0.4)',
                marginBottom: '36px',
              }}
            >
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '1.2rem' }}>
                Go to <strong style={{ color: 'var(--color-text-primary)' }}>{typeof window !== 'undefined' ? window.location.host : 'pollwave.io'}/join</strong>
              </div>
              <div
                style={{
                  fontSize: 'clamp(3rem, 6vw, 4.8rem)',
                  fontWeight: 900,
                  letterSpacing: '0.15em',
                  background: 'var(--gradient-brand)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  lineHeight: 1,
                }}
              >
                {presentation?.joinCode}
              </div>
              {qrCodeUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  style={{ width: '160px', height: '160px', borderRadius: '12px', background: '#fffaf3', padding: '6px' }}
                />
              )}
            </div>

            {/* Players Joined Counter */}
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2f8f6b' }}>
                👥 {lobbyParticipants.length} {lobbyParticipants.length === 1 ? 'Player' : 'Players'} Joined
              </span>
            </div>

            {/* Participant Avatar Grid */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '12px',
                maxHeight: '220px',
                overflowY: 'auto',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.75)',
                borderRadius: '18px',
                border: '1px solid rgba(92, 54, 73, 0.12)',
                boxShadow: 'inset 0 2px 8px rgba(63, 41, 64, 0.04)',
                marginBottom: '36px',
              }}
            >
              {lobbyParticipants.length === 0 ? (
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '1.05rem', padding: '20px', fontWeight: 500 }}>
                  Waiting for players to join with QR code or PIN...
                </div>
              ) : (
                lobbyParticipants.map((p) => (
                  <div
                    key={p.token || p.nickname}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 18px',
                      borderRadius: '100px',
                      background: 'rgba(255, 255, 255, 0.95)',
                      border: '1.5px solid rgba(92, 54, 73, 0.15)',
                      boxShadow: '0 4px 14px rgba(63, 41, 64, 0.08)',
                      animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    }}
                  >
                    <span style={{ fontSize: '1.5rem' }}>{p.avatar}</span>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#3f2940' }}>{p.nickname}</span>
                  </div>
                ))
              )}
            </div>

            {/* Start Quiz CTA - Centered and fully unobstructed */}
            <div style={{ marginTop: '28px', marginBottom: '32px', display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={handleStartQuiz}
                className="btn btn--primary"
                style={{
                  fontSize: '1.45rem',
                  padding: '18px 56px',
                  borderRadius: '100px',
                  fontWeight: 900,
                  boxShadow: '0 10px 32px rgba(217, 87, 69, 0.55)',
                  cursor: 'pointer',
                  zIndex: 20,
                  position: 'relative',
                  letterSpacing: '-0.01em',
                }}
              >
                🚀 Start Quiz ({slides.length} Questions)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. COUNTDOWN STATE (3... 2... 1...) ────────────────────────────── */}
      {gameState === 'COUNTDOWN' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at center, rgba(236, 72, 153, 0.15) 0%, rgba(251, 247, 240, 1) 70%)',
            textAlign: 'center',
            padding: '40px',
          }}
        >
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '1.3rem', fontWeight: 700, marginBottom: '16px' }}>
            QUESTION {currentIndex + 1} OF {slides.length}
          </div>
          <div
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #ec4899 0%, #d95745 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '6.5rem',
              fontWeight: 900,
              color: '#fffaf3',
              boxShadow: '0 0 60px rgba(236, 72, 153, 0.6)',
              marginBottom: '32px',
              animation: 'pulse 1s infinite',
            }}
          >
            {countdownNumber}
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '12px' }}>Get Ready!</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '1.2rem', maxWidth: '600px' }}>
            {activeSlide?.question}
          </p>
        </div>
      )}

      {/* ─── 3. QUESTION_ACTIVE / QUESTION_LOCKED / REVEAL ────────────────── */}
      {(gameState === 'QUESTION_ACTIVE' || gameState === 'QUESTION_LOCKED' || gameState === 'REVEAL') && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '30px 48px', overflowY: 'auto' }}>
          {activeSlide ? (
            <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1 }}>
              {/* Question Header & Live Timer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '28px',
                  background: 'rgba(92, 54, 73, 0.05)',
                  padding: '16px 28px',
                  borderRadius: '16px',
                  border: '1px solid rgba(92, 54, 73, 0.08)',
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--color-primary-light)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    Question {currentIndex + 1} of {slides.length}
                  </span>
                  <div style={{ fontSize: '1.15rem', color: '#3f2940', fontWeight: 700, marginTop: '2px' }}>
                    👥 {Math.max(timerState?.answeredCount || 0, totalVotes)} / {Math.max(lobbyParticipants.length, timerState?.totalParticipants || 1)} Answered
                  </div>
                </div>

                {/* Animated Shrinking Timer Badge */}
                {gameState === 'QUESTION_ACTIVE' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '74px',
                        height: '74px',
                        borderRadius: '50%',
                        border: `4px solid ${remainingTime <= 5 ? '#ef4444' : '#d95745'}`,
                        background: remainingTime <= 5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(217, 87, 69, 0.15)',
                        fontSize: '1.8rem',
                        fontWeight: 900,
                        color: remainingTime <= 5 ? '#ef4444' : '#fffaf3',
                        boxShadow: remainingTime <= 5 ? '0 0 24px rgba(239, 68, 68, 0.5)' : '0 0 20px rgba(217, 87, 69, 0.3)',
                      }}
                    >
                      {remainingTime}s
                    </div>
                    <button onClick={handleLockQuestion} className="btn btn--secondary btn--sm">
                      ⏹ Lock
                    </button>
                  </div>
                )}

                {gameState === 'QUESTION_LOCKED' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span
                      style={{
                        padding: '6px 14px',
                        borderRadius: '100px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        color: '#f87171',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                      }}
                    >
                      🔒 TIME&apos;S UP
                    </span>
                    <button onClick={handleRevealAnswer} className="btn btn--primary btn--sm" style={{ padding: '8px 20px' }}>
                      ✨ Reveal Answer
                    </button>
                  </div>
                )}

                {gameState === 'REVEAL' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span
                      style={{
                        padding: '6px 14px',
                        borderRadius: '100px',
                        background: 'rgba(34, 197, 94, 0.2)',
                        color: '#2f8f6b',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        border: '1px solid rgba(34, 197, 94, 0.4)',
                      }}
                    >
                      ✓ REVEALED
                    </span>
                    <button onClick={handleShowLeaderboard} className="btn btn--primary btn--sm" style={{ padding: '8px 20px' }}>
                      🏆 Show Leaderboard
                    </button>
                  </div>
                )}
              </div>

              {/* Big Question Prompt */}
              <h1
                style={{
                  fontSize: 'clamp(2rem, 3.5vw, 3rem)',
                  fontWeight: 900,
                  textAlign: 'center',
                  marginBottom: '36px',
                  lineHeight: 1.25,
                }}
              >
                {activeSlide.question}
              </h1>

              {/* Options Grid (Kahoot / Mentimeter style) */}
              {activeSlide.type === 'multiple_choice' ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                    gap: '20px',
                    marginBottom: '24px',
                  }}
                >
                  {(activeSlide.options || []).map((opt, i) => {
                    const votes = currentTally[opt] || 0;
                    const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                    const colorScheme = optionColors[i % optionColors.length];

                    const isCorrectAnswer =
                      gameState === 'REVEAL' &&
                      (activeSlide.config?.correctAnswer === opt ||
                        (Array.isArray(activeSlide.config?.correctAnswer) && activeSlide.config.correctAnswer.includes(opt)) ||
                        revealData?.correctAnswer === opt ||
                        (Array.isArray(revealData?.correctAnswer) && revealData.correctAnswer.includes(opt)));

                    const isDimmed = gameState === 'REVEAL' && !isCorrectAnswer;

                    return (
                      <div
                        key={opt}
                        style={{
                          borderRadius: '20px',
                          background: isCorrectAnswer
                            ? 'rgba(34, 197, 94, 0.18)'
                            : 'rgba(255, 255, 255, 0.95)',
                          border: isCorrectAnswer
                            ? '3px solid #3f9a73'
                            : '2px solid rgba(92, 54, 73, 0.12)',
                          boxShadow: isCorrectAnswer
                            ? '0 0 30px rgba(34, 197, 94, 0.35)'
                            : '0 4px 18px rgba(63, 41, 64, 0.06)',
                          padding: '24px',
                          position: 'relative',
                          overflow: 'hidden',
                          opacity: isDimmed ? 0.45 : 1,
                          transition: 'all 0.3s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: '140px',
                        }}
                      >
                        {/* Fill percentage bar when revealed */}
                        {gameState === 'REVEAL' && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: `${percent}%`,
                              background: isCorrectAnswer ? 'rgba(34, 197, 94, 0.25)' : `${colorScheme.bg}22`,
                              borderRight: isCorrectAnswer ? '3px solid #3f9a73' : `3px solid ${colorScheme.bg}`,
                              zIndex: 0,
                              transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                            }}
                          />
                        )}

                        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <span
                            style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '12px',
                              background: colorScheme.bg,
                              color: colorScheme.text,
                              fontWeight: 900,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.4rem',
                              boxShadow: '0 4px 12px rgba(63,41,64,0.2)',
                            }}
                          >
                            {colorScheme.symbol}
                          </span>
                          <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#3f2940', flex: 1 }}>
                            {opt}
                          </span>
                          {isCorrectAnswer && (
                            <span
                              style={{
                                background: '#3f9a73',
                                color: '#fbf7f0',
                                fontWeight: 900,
                                fontSize: '0.85rem',
                                padding: '4px 12px',
                                borderRadius: '100px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              ✓ Correct
                            </span>
                          )}
                        </div>

                        {/* Votes breakdown */}
                        {gameState === 'REVEAL' && (
                          <div
                            style={{
                              position: 'relative',
                              zIndex: 1,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-end',
                              marginTop: '16px',
                            }}
                          >
                            <span style={{ fontSize: '1.05rem', color: '#8d7a87', fontWeight: 700 }}>
                              {votes} {votes === 1 ? 'vote' : 'votes'}
                            </span>
                            <span style={{ fontSize: '1.8rem', fontWeight: 900, color: isCorrectAnswer ? '#2f8f6b' : '#3f2940' }}>
                              {percent}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Fallback for other slide types: Word Cloud, Q&A, etc. */
                <div style={{ padding: '20px 0' }}>
                  {activeSlide.type === 'word_cloud' && (
                    <div className="card" style={{ padding: '48px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
                      {Object.keys(currentTally).length === 0 ? (
                        <p style={{ color: 'var(--color-text-muted)' }}>Waiting for audience words...</p>
                      ) : (
                        Object.entries(currentTally).map(([w, c]) => (
                          <span key={w} style={{ fontSize: `${1.2 + c * 0.5}rem`, fontWeight: 800, color: '#b65f78' }}>
                            {w}
                          </span>
                        ))
                      )}
                    </div>
                  )}

                  {activeSlide.type === 'open_text' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
                      {Object.keys(currentTally).map((t, idx) => (
                        <div key={idx} className="card" style={{ padding: '16px' }}>
                          &ldquo;{t}&rdquo;
                        </div>
                      ))}
                    </div>
                  )}

                  {activeSlide.type === 'rating_scale' && (
                    <div className="card" style={{ padding: '36px', textAlign: 'center' }}>
                      <div style={{ fontSize: '4rem', fontWeight: 900, color: '#d95745' }}>
                        {totalVotes > 0
                          ? (
                              Object.entries(currentTally).reduce((a, [v, c]) => a + Number(v) * c, 0) / totalVotes
                            ).toFixed(1)
                          : '0.0'}
                      </div>
                      <p style={{ color: 'var(--color-text-muted)' }}>Average Rating ({totalVotes} votes)</p>
                    </div>
                  )}

                  {activeSlide.type === 'qa' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {qaList.map((q) => (
                        <div key={q.id} className="card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{q.text}</span>
                          <span className="badge badge--primary">▲ {q.upvotes}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Scales / Likert Matrix */}
                  {activeSlide.type === 'scales' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {(activeSlide.options || []).map((statement) => {
                        const score = currentTally[statement] || 0;
                        return (
                          <div key={statement} className="card" style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '1.2rem', fontWeight: 700 }}>
                              <span>{statement}</span>
                              <span style={{ color: '#2f8f6b' }}>{score} pts</span>
                            </div>
                            <div style={{ height: '14px', background: 'rgba(92, 54, 73, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, Math.max(10, score * 8))}%`, height: '100%', background: 'linear-gradient(90deg, #2d6d56, #2f8f6b)', borderRadius: '8px' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 100 Points Budget Allocation */}
                  {activeSlide.type === 'hundred_points' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {(activeSlide.options || []).map((opt) => {
                        const pts = currentTally[opt] || 0;
                        return (
                          <div key={opt} className="card" style={{ padding: '20px 24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '1.2rem', fontWeight: 700 }}>
                              <span>{opt}</span>
                              <span style={{ color: '#b65f78' }}>{pts} Points</span>
                            </div>
                            <div style={{ height: '16px', background: 'rgba(92, 54, 73, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, pts)}%`, height: '100%', background: 'linear-gradient(90deg, #d95745, #b65f78)', borderRadius: '8px' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Number Estimation Slide */}
                  {activeSlide.type === 'number' && (() => {
                    const nums = Object.entries(currentTally).map(([v, c]) => Array(c).fill(Number(v))).flat().filter((n) => !isNaN(n));
                    const avg = nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : '—';
                    return (
                      <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <div style={{ fontSize: '5rem', fontWeight: 900, background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>
                          {avg}
                        </div>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.2rem', marginTop: '16px' }}>
                          Average Guess ({nums.length} votes)
                        </p>
                        {activeSlide.config?.correctNumber !== undefined && (
                          <div style={{ marginTop: '20px' }}>
                            <span className="badge badge--success" style={{ fontSize: '1.1rem', padding: '6px 18px' }}>
                              🎯 Target Answer: {activeSlide.config.correctNumber}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Heading Slide */}
                  {activeSlide.type === 'heading' && (
                    <div className="card" style={{ padding: '64px 36px', textAlign: 'center' }}>
                      <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 900, marginBottom: '20px', lineHeight: 1.2 }}>
                        {activeSlide.question}
                      </h1>
                      {activeSlide.config?.subtitle && (
                        <p style={{ fontSize: '1.5rem', color: 'var(--color-text-secondary)', maxWidth: '750px', margin: '0 auto' }}>
                          {activeSlide.config.subtitle}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Paragraph / Rich Text */}
                  {activeSlide.type === 'paragraph' && (
                    <div className="card" style={{ padding: '48px 40px' }}>
                      <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '20px' }}>{activeSlide.question}</h2>
                      <div style={{ fontSize: '1.2rem', lineHeight: 1.8, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                        {activeSlide.config?.body || 'No content added yet.'}
                      </div>
                    </div>
                  )}

                  {/* Image Slide */}
                  {activeSlide.type === 'image' && (
                    <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
                      <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '20px' }}>{activeSlide.question}</h2>
                      {activeSlide.config?.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={activeSlide.config.imageUrl}
                          alt={activeSlide.question}
                          style={{ maxWidth: '100%', maxHeight: '55vh', borderRadius: '16px', objectFit: 'contain', margin: '0 auto', boxShadow: '0 12px 30px rgba(63,41,64,0.5)' }}
                        />
                      )}
                      {activeSlide.config?.caption && (
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '1rem', marginTop: '16px' }}>{activeSlide.config.caption}</p>
                      )}
                    </div>
                  )}

                  {/* Video Slide */}
                  {activeSlide.type === 'video' && (
                    <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
                      <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '20px' }}>{activeSlide.question}</h2>
                      {activeSlide.config?.videoUrl ? (
                        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '16px' }}>
                          <iframe
                            src={activeSlide.config.videoUrl.replace('watch?v=', 'embed/')}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <p style={{ color: 'var(--color-text-muted)' }}>No video URL provided.</p>
                      )}
                    </div>
                  )}

                  {/* Bullets Slide */}
                  {activeSlide.type === 'bullets' && (
                    <div className="card" style={{ padding: '48px 40px' }}>
                      <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '32px' }}>{activeSlide.question}</h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {(activeSlide.options || []).map((b, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', fontSize: '1.3rem' }}>
                            <span style={{ color: '#b65f78', fontWeight: 900 }}>✦</span>
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ─── 4. LEADERBOARD STATE (Animated Stadium Quiz Race Track) ──────── */}
      {gameState === 'LEADERBOARD' && (
        <QuizRaceLeaderboard
          leaderboard={leaderboard}
          lobbyParticipants={lobbyParticipants}
          joinCode={presentation?.joinCode}
          currentQuestionIndex={currentIndex + 1}
          totalQuestions={slides.length}
          onNextQuestion={handleNextQuestion}
          onShowFinalResults={handleShowFinalResults}
          isLastQuestion={currentIndex >= slides.length - 1}
        />
      )}

      {/* ─── 5. FINAL_RESULTS STATE (Olympic Podium & Confetti) ───────────── */}
      {gameState === 'FINAL_RESULTS' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '40px 24px',
            background: 'radial-gradient(ellipse at center, rgba(245, 158, 11, 0.2) 0%, rgba(251, 247, 240, 1) 70%)',
            overflowY: 'auto',
          }}
        >
          <div style={{ maxWidth: '900px', width: '100%', textAlign: 'center' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 800,
                color: '#f59e0b',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
              }}
            >
              🎉 TOURNAMENT FINALE
            </span>
            <h1 style={{ fontSize: '3.5rem', fontWeight: 900, marginTop: '8px', marginBottom: '48px' }}>
              Champions Podium
            </h1>

            {/* 3-Tier Olympic Podium */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: '20px',
                height: '380px',
                marginBottom: '48px',
              }}
            >
              {/* 2nd Place (Silver - Left) */}
              <div
                style={{
                  flex: 1,
                  maxWidth: '220px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {finalResults?.podium[1] ? (
                  <>
                    <span style={{ fontSize: '3rem', marginBottom: '6px' }}>{finalResults.podium[1].avatar}</span>
                    <div style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '4px' }}>
                      {finalResults.podium[1].nickname}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#806c76', marginBottom: '12px' }}>
                      {finalResults.podium[1].score.toLocaleString()} pts
                    </div>
                  </>
                ) : (
                  <div style={{ height: '80px' }} />
                )}
                <div
                  style={{
                    width: '100%',
                    height: '180px',
                    borderRadius: '16px 16px 0 0',
                    background: 'linear-gradient(180deg, #b9a8ad 0%, #806c76 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fffaf3',
                    fontWeight: 900,
                    fontSize: '2rem',
                    boxShadow: '0 8px 30px rgba(63,41,64,0.5)',
                  }}
                >
                  🥈 2nd
                </div>
              </div>

              {/* 1st Place (Gold - Center, Tallest) */}
              <div
                style={{
                  flex: 1.1,
                  maxWidth: '260px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {finalResults?.podium[0] ? (
                  <>
                    <div style={{ fontSize: '2.5rem', marginBottom: '-8px' }}>👑</div>
                    <span style={{ fontSize: '4rem', marginBottom: '6px' }}>{finalResults.podium[0].avatar}</span>
                    <div style={{ fontWeight: 900, fontSize: '1.5rem', color: '#fbbf24', marginBottom: '4px' }}>
                      {finalResults.podium[0].nickname}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fffaf3', marginBottom: '14px' }}>
                      {finalResults.podium[0].score.toLocaleString()} pts
                    </div>
                  </>
                ) : (
                  <div style={{ height: '110px' }} />
                )}
                <div
                  style={{
                    width: '100%',
                    height: '250px',
                    borderRadius: '20px 20px 0 0',
                    background: 'linear-gradient(180deg, #fbbf24 0%, #b45309 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fbf7f0',
                    fontWeight: 900,
                    fontSize: '2.4rem',
                    boxShadow: '0 0 50px rgba(251, 191, 36, 0.5)',
                  }}
                >
                  🥇 1st
                </div>
              </div>

              {/* 3rd Place (Bronze - Right) */}
              <div
                style={{
                  flex: 1,
                  maxWidth: '220px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {finalResults?.podium[2] ? (
                  <>
                    <span style={{ fontSize: '3rem', marginBottom: '6px' }}>{finalResults.podium[2].avatar}</span>
                    <div style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '4px' }}>
                      {finalResults.podium[2].nickname}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#d97706', marginBottom: '12px' }}>
                      {finalResults.podium[2].score.toLocaleString()} pts
                    </div>
                  </>
                ) : (
                  <div style={{ height: '80px' }} />
                )}
                <div
                  style={{
                    width: '100%',
                    height: '130px',
                    borderRadius: '16px 16px 0 0',
                    background: 'linear-gradient(180deg, #d97706 0%, #78350f 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fffaf3',
                    fontWeight: 900,
                    fontSize: '1.8rem',
                    boxShadow: '0 8px 30px rgba(63,41,64,0.5)',
                  }}
                >
                  🥉 3rd
                </div>
              </div>
            </div>

            {/* Exit / Return to Dashboard */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '36px' }}>
              <button onClick={handleEndSession} className="btn btn--primary" style={{ padding: '14px 40px', fontSize: '1.1rem' }}>
                End & Save Presentation
              </button>
              <Link href="/dashboard" className="btn btn--secondary" style={{ padding: '14px 28px', fontSize: '1.1rem' }}>
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(63,41,64,0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="card"
            style={{ padding: '36px', textAlign: 'center', maxWidth: '380px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Scan to Join</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Attendees can point their camera here or enter code <strong>{presentation?.joinCode}</strong>
            </p>
            {qrCodeUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrCodeUrl}
                alt="QR Code"
                style={{ borderRadius: '12px', margin: '0 auto 20px', width: '240px', height: '240px' }}
              />
            )}
            <button onClick={() => setShowQrModal(false)} className="btn btn--primary btn--full">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Claude AI Summary Drawer / Modal */}
      {showAiSummaryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(63,41,64,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setShowAiSummaryModal(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '560px', padding: '32px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '1.6rem' }}>✨</span>
              <h2 style={{ fontSize: '1.4rem' }}>AI Audience Synthesis</h2>
            </div>

            {aiLoading ? (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <div className="nav-skeleton" style={{ width: '200px', height: '24px', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--color-text-secondary)' }}>Analyzing responses with Claude...</p>
              </div>
            ) : aiSummary ? (
              <div>
                <div style={{ marginBottom: '20px' }}>
                  <span className="form-label" style={{ display: 'block', marginBottom: '6px' }}>
                    Executive Summary
                  </span>
                  <p style={{ color: 'var(--color-text-primary)', fontSize: '1.05rem', lineHeight: 1.6 }}>
                    {aiSummary.summary}
                  </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <span className="form-label" style={{ display: 'block', marginBottom: '8px' }}>
                    Key Themes
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {aiSummary.themes.map((theme, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--color-primary-light)' }}>•</span>
                        <span>{theme}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {aiSummary.sentiment && (
                  <div style={{ marginBottom: '24px' }}>
                    <span className="form-label" style={{ display: 'block', marginBottom: '6px' }}>
                      Overall Sentiment
                    </span>
                    <span className="badge badge--primary" style={{ fontSize: '0.85rem' }}>
                      {aiSummary.sentiment}
                    </span>
                  </div>
                )}

                <button
                  onClick={() => setShowAiSummaryModal(false)}
                  className="btn btn--primary btn--full"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <p style={{ color: 'var(--color-text-secondary)' }}>No summary generated yet.</p>
                <button
                  onClick={() => setShowAiSummaryModal(false)}
                  className="btn btn--ghost btn--full"
                  style={{ marginTop: '16px' }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Presenter Toolbar (Hidden during LOBBY to keep Start Quiz prominent) */}
      {gameState !== 'LOBBY' && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(241, 231, 220, 0.88)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(92, 54, 73, 0.14)',
            borderRadius: '100px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 900,
            boxShadow: '0 12px 32px rgba(63, 41, 64, 0.5)',
          }}
        >
        <button
          onClick={handlePrevSlide}
          disabled={currentIndex <= 0}
          className="btn btn--ghost btn--sm"
          title="Previous Slide (←)"
          style={{ borderRadius: '50%', width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ←
        </button>

        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)', padding: '0 4px' }}>
          {currentIndex + 1} / {slides.length}
        </span>

        <button
          onClick={handleNextSlide}
          disabled={currentIndex >= slides.length - 1}
          className="btn btn--ghost btn--sm"
          title="Next Slide (→)"
          style={{ borderRadius: '50%', width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          →
        </button>

        <div style={{ width: 1, height: 20, background: 'rgba(92, 54, 73, 0.14)' }} />

        <button
          onClick={handleToggleVoting}
          className={`btn btn--sm ${votingLocked ? 'btn--primary' : 'btn--ghost'}`}
          title="Toggle Voting Lock"
          style={{ fontSize: '0.82rem' }}
        >
          {votingLocked ? '🔒 Locked' : '🔓 Unlocked'}
        </button>

        {activeSlide && (
          <button
            onClick={() => {
              setResultsRevealed((prev) => ({
                ...prev,
                [activeSlide._id]: !prev[activeSlide._id],
              }));
            }}
            className="btn btn--ghost btn--sm"
            title="Toggle Results Visibility for Audience"
            style={{ fontSize: '0.82rem' }}
          >
            {resultsRevealed[activeSlide._id] ? '👁 Hide Results' : '✨ Show Results'}
          </button>
        )}

        <button
          onClick={() => setShowAnnouncementModal(true)}
          className="btn btn--ghost btn--sm"
          title="Broadcast Announcement to Attendees"
          style={{ fontSize: '0.82rem' }}
        >
          📢 Announcement
        </button>

        <button
          onClick={() => setShowQrModal(true)}
          className="btn btn--ghost btn--sm"
          title="Show Join QR Code"
          style={{ borderRadius: '50%', width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          📱
        </button>

        <button
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {});
            } else {
              document.exitFullscreen().catch(() => {});
            }
          }}
          className="btn btn--ghost btn--sm"
          title="Fullscreen Toggle (F)"
          style={{ borderRadius: '50%', width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ⛶
        </button>
      </div>
      )}

      {/* Push Announcement Modal */}
      {showAnnouncementModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(63,41,64,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setShowAnnouncementModal(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '460px', padding: '32px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '1.6rem' }}>📢</span>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Push Announcement</h2>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', marginBottom: '20px' }}>
              Send an instant banner notification to all connected audience screens.
            </p>

            <form onSubmit={handlePushAnnouncement}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <textarea
                  rows={3}
                  placeholder="e.g. Please submit your answers in the next 30 seconds!"
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  className="form-textarea"
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAnnouncementModal(false)}
                  className="btn btn--ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!announcementText.trim() || announcementSent}
                  className="btn btn--primary"
                >
                  {announcementSent ? '✓ Sent to Audience!' : '🚀 Push to Everyone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
