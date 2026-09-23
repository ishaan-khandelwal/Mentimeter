'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { getParticipantToken } from '@/lib/participant';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import { CHARACTERS, resolveCharacter } from '@/lib/characters';
import type {
  GameState,
  QuestionTimerState,
  GameStateChangedEvent,
  ParticipantScoreEvent,
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
}

interface QAItem {
  id: string;
  slideId: string;
  text: string;
  upvotes: number;
  createdAt: number;
}

const AVATAR_OPTIONS = ['🦊', '🚀', '🦁', '⚡', '🦄', '🐼', '🎮', '🦉', '🐯', '🐙', '🌟', '🔥'];

const RANDOM_NICKNAMES = [
  'Swift Fox',
  'Cosmic Owl',
  'Neon Tiger',
  'Pixel Panda',
  'Turbo Lion',
  'Hyper Falcon',
  'Quantum Lynx',
  'Star Voyager',
];

export default function AttendeeVotingPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'ended'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(null);
  const [votingLocked, setVotingLocked] = useState(false);
  const [votedSlides, setVotedSlides] = useState<Record<string, boolean>>({});

  // Nickname & Avatar Setup State
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState('🦊');
  const [hasJoinedLobby, setHasJoinedLobby] = useState(false);

  // Competition Game Loop State
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [countdownNumber, setCountdownNumber] = useState<number>(3);
  const [timerState, setTimerState] = useState<QuestionTimerState | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(20);
  const [participantScore, setParticipantScore] = useState<ParticipantScoreEvent | null>(null);
  const [revealData, setRevealData] = useState<{
    correctAnswer?: string | string[];
    revealTally?: Record<string, number>;
  } | null>(null);
  const [mySubmittedAnswer, setMySubmittedAnswer] = useState<string | null>(null);

  // Slide specific form states
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [wordInput, setWordInput] = useState('');
  const [submittedWords, setSubmittedWords] = useState<string[]>([]);
  const [openTextInput, setOpenTextInput] = useState('');
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [rankingList, setRankingList] = useState<string[]>([]);
  const [qaQuestions, setQaQuestions] = useState<QAItem[]>([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [upvotedQuestions, setUpvotedQuestions] = useState<Record<string, boolean>>({});
  const [scalesInput, setScalesInput] = useState<Record<string, number>>({});
  const [hundredPointsInput, setHundredPointsInput] = useState<Record<string, number>>({});
  const [numberInput, setNumberInput] = useState<string>('');
  const [announcementNotification, setAnnouncementNotification] = useState<string | null>(null);

  const participantToken = useMemo(() => {
    return typeof window !== 'undefined' ? getParticipantToken() : '';
  }, []);

  // Ref to always have the latest currentSlideId inside socket callbacks
  // (avoids adding currentSlideId to the socket useEffect deps which would
  // re-register all handlers on every slide change)
  const currentSlideIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentSlideIdRef.current = currentSlideId;
  }, [currentSlideId]);

  // Initialize nickname and avatar from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedNick = localStorage.getItem('pollwave_nickname');
    const savedAvatar = localStorage.getItem('pollwave_avatar');

    if (savedNick) {
      setNickname(savedNick);
      setHasJoinedLobby(true);
    } else {
      const randomNick = RANDOM_NICKNAMES[Math.floor(Math.random() * RANDOM_NICKNAMES.length)];
      setNickname(randomNick);
    }

    if (savedAvatar) {
      setAvatar(savedAvatar);
    } else {
      const randomAvatar = AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)];
      setAvatar(randomAvatar);
    }
  }, []);

  const activeSlide = slides.find((s) => s._id === currentSlideId) || null;

  // Initialize ranking options when active slide changes
  useEffect(() => {
    if (activeSlide?.type === 'ranking' && activeSlide.options) {
      setRankingList([...activeSlide.options]);
    }
    setSelectedOptions([]);
    setWordInput('');
    setOpenTextInput('');
    setRatingValue(null);
  }, [currentSlideId, activeSlide]);

  // Connect to Socket.io
  useEffect(() => {
    if (!code || !participantToken) return;

    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      const activeNick = localStorage.getItem('pollwave_nickname') || nickname || 'Swift Fox';
      const activeAvatar = localStorage.getItem('pollwave_avatar') || avatar || '🦊';

      socket.emit('join_session', {
        joinCode: code,
        participantToken,
        nickname: activeNick,
        avatar: activeAvatar,
      });

      // Register immediately in lobby so attendee is visible right away to presenter
      socket.emit('join_lobby', {
        joinCode: code,
        participantToken,
        nickname: activeNick,
        avatar: activeAvatar,
      });

      // Also persist to lobby via REST API for serverless/Vercel environments
      fetch(`/api/v1/presentations/${code}/lobby`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantToken,
          nickname: activeNick,
          avatar: activeAvatar,
        }),
      }).catch(() => {});
    };

    const onSessionJoined = (data: {
      sessionId: string;
      currentSlideId: string | null;
      votingLocked: boolean;
      gameState?: GameState;
      slides: Slide[];
    }) => {
      setStatus('connected');
      setSlides(data.slides);
      setCurrentSlideId(data.currentSlideId);
      setVotingLocked(data.votingLocked);
      if (data.gameState) setGameState(data.gameState);
    };

    const onLobbyJoined = (data: { state: GameState }) => {
      setHasJoinedLobby(true);
      if (data.state) setGameState(data.state);
    };

    const onSlideChanged = (data: { currentSlideId: string; votingLocked: boolean }) => {
      setCurrentSlideId(data.currentSlideId);
      setVotingLocked(data.votingLocked);
      setMySubmittedAnswer(null);
      if (data.currentSlideId) {
        setVotedSlides((prev) => {
          const next = { ...prev };
          delete next[data.currentSlideId];
          return next;
        });
      }
    };

    const onVotingLocked = (data: { locked: boolean }) => {
      setVotingLocked(data.locked);
    };

    const onSessionEnded = () => {
      setStatus('ended');
    };

    const onQuestionUpdate = (data: { questions: QAItem[] }) => {
      setQaQuestions(data.questions || []);
    };

    // Quiz Game Loop Events
    const onGameStateChanged = (data: GameStateChangedEvent) => {
      setGameState(data.state);
      if (data.countdown !== undefined) setCountdownNumber(data.countdown);
      if (data.slideId) {
        setCurrentSlideId(data.slideId);
        setVotedSlides((prev) => {
          const next = { ...prev };
          delete next[data.slideId!];
          return next;
        });
      }
      if (data.timer) {
        setTimerState(data.timer);
        setRemainingTime(data.timer.durationSeconds);
      }
      if (data.state === 'COUNTDOWN' || data.state === 'QUESTION_ACTIVE') {
        setMySubmittedAnswer(null);
      }
      if (data.state === 'REVEAL') {
        setRevealData({
          correctAnswer: data.correctAnswer,
          revealTally: data.revealTally,
        });
      }
    };

    const onParticipantScore = (data: ParticipantScoreEvent) => {
      setParticipantScore(data);
    };

    const onError = (data: { code: string; message: string }) => {
      if (data.code === 'ALREADY_VOTED') {
        const slideId = currentSlideIdRef.current;
        if (slideId) {
          setVotedSlides((prev) => ({ ...prev, [slideId]: true }));
        }
        return;
      }
      if (data.code === 'SESSION_NOT_FOUND' || data.code === 'SESSION_NOT_ACTIVE') {
        setStatus('error');
        setErrorMessage(data.message || 'The session code is invalid or the presentation has ended.');
        return;
      }
      console.warn('[Socket Error]', data);
    };

    socket.on('connect', onConnect);
    socket.on('session_joined', onSessionJoined);
    socket.on('lobby_joined', onLobbyJoined);
    const onAnnouncement = (data: { message: string }) => {
      setAnnouncementNotification(data.message);
      setTimeout(() => setAnnouncementNotification(null), 8000);
    };

    socket.on('slide_changed', onSlideChanged);
    socket.on('voting_locked', onVotingLocked);
    socket.on('session_ended', onSessionEnded);
    socket.on('question_update', onQuestionUpdate);
    socket.on('game_state_changed', onGameStateChanged);
    socket.on('participant_score', onParticipantScore);
    socket.on('announcement', onAnnouncement);
    socket.on('error', onError);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('session_joined', onSessionJoined);
      socket.off('lobby_joined', onLobbyJoined);
      socket.off('slide_changed', onSlideChanged);
      socket.off('voting_locked', onVotingLocked);
      socket.off('session_ended', onSessionEnded);
      socket.off('question_update', onQuestionUpdate);
      socket.off('game_state_changed', onGameStateChanged);
      socket.off('participant_score', onParticipantScore);
      socket.off('announcement', onAnnouncement);
      socket.off('error', onError);
    };
  }, [code, participantToken, nickname, avatar]);

  // Fallback REST polling for lobby & session state to sync seamlessly on Vercel/serverless
  useEffect(() => {
    if (!code || !participantToken) return;

    let isMounted = true;

    // Immediate fetch to guarantee connection without getting stuck on "Joining Session..."
    const syncLobby = async () => {
      try {
        const activeNick = localStorage.getItem('pollwave_nickname') || nickname || 'Swift Fox';
        const activeAvatar = localStorage.getItem('pollwave_avatar') || avatar || '🦊';

        // 1. Register attendee into lobby via REST
        await fetch(`/api/v1/presentations/${code}/lobby`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantToken,
            nickname: activeNick,
            avatar: activeAvatar,
          }),
        }).catch(() => {});

        // 2. Fetch lobby & slide details
        const res = await fetch(`/api/v1/presentations/${code}/lobby`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (Array.isArray(data.slides) && data.slides.length > 0) {
            setSlides(data.slides);
          }
          if (data.currentSlideId) {
            setCurrentSlideId(data.currentSlideId);
          }
          if (data.votingLocked !== undefined) {
            setVotingLocked(data.votingLocked);
          }
          if (data.gameState && data.gameState !== 'LOBBY') {
            setGameState(data.gameState);
          }
          // Mark as connected so attendee can immediately interact
          setStatus('connected');
        }
      } catch (err) {
        console.warn('[Lobby Sync Fallback]', err);
      }
    };

    syncLobby();

    // Poll periodically while in LOBBY to catch when presenter starts the quiz
    const pollInterval = setInterval(async () => {
      if (!isMounted) return;
      try {
        const res = await fetch(`/api/v1/presentations/${code}/lobby`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.gameState && data.gameState !== gameState) {
            setGameState(data.gameState);
          }
          if (data.currentSlideId && currentSlideIdRef.current !== data.currentSlideId) {
            setCurrentSlideId(data.currentSlideId);
          }
          if (Array.isArray(data.slides) && (!slides || slides.length === 0)) {
            setSlides(data.slides);
          }
        }
      } catch {}
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [code, participantToken, nickname, avatar, gameState]);

  // Question timer countdown effect
  useEffect(() => {
    if (gameState !== 'QUESTION_ACTIVE' || !timerState) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - timerState.questionStartedAt) / 1000;
      const left = Math.max(0, timerState.durationSeconds - elapsed);
      setRemainingTime(Math.ceil(left));
    }, 200);

    return () => clearInterval(interval);
  }, [gameState, timerState]);

  // Final Results Confetti on Attendee Phone
  useEffect(() => {
    if (gameState === 'FINAL_RESULTS') {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });
    }
  }, [gameState]);

  // Attendee confirms Nickname & Avatar
  const handleJoinLobby = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;

    const cleanNick = nickname.trim().slice(0, 20);
    localStorage.setItem('pollwave_nickname', cleanNick);
    localStorage.setItem('pollwave_avatar', avatar);

    const socket = getSocket();
    socket.emit('join_lobby', {
      joinCode: code,
      participantToken,
      nickname: cleanNick,
      avatar,
    });

    // Update lobby via REST API for serverless/Vercel environments
    fetch(`/api/v1/presentations/${code}/lobby`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantToken,
        nickname: cleanNick,
        avatar,
      }),
    }).catch(() => {});

    setHasJoinedLobby(true);
  };

  // Submit generic vote
  const submitVote = useCallback(
    (value: any) => {
      if (!currentSlideId || votingLocked || votedSlides[currentSlideId]) return;
      const socket = getSocket();
      socket.emit('submit_vote', {
        slideId: currentSlideId,
        value,
        participantToken,
      });

      setMySubmittedAnswer(String(value));
      setVotedSlides((prev) => ({ ...prev, [currentSlideId]: true }));
    },
    [currentSlideId, votingLocked, votedSlides, participantToken]
  );

  // Submit Word Cloud word
  const handleWordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wordInput.trim()) return;

    const maxEntries = activeSlide?.config?.maxEntries || 3;
    if (submittedWords.length >= maxEntries) return;

    const clean = wordInput.trim().slice(0, 30);
    submitVote(clean);
    setSubmittedWords((prev) => [...prev, clean]);
    setWordInput('');
  };

  // Submit Open Text
  const handleOpenTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openTextInput.trim()) return;
    submitVote(openTextInput.trim().slice(0, 250));
    setOpenTextInput('');
  };

  // Submit Rating Scale
  const handleRatingSubmit = (score: number) => {
    setRatingValue(score);
    submitVote(score);
  };

  // Move Ranking Item
  const moveRankItem = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= rankingList.length) return;
    const copy = [...rankingList];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setRankingList(copy);
  };

  const handleRankingSubmit = () => {
    submitVote(rankingList);
  };

  // Submit Q&A
  const handleQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim() || !currentSlideId) return;
    const socket = getSocket();
    socket.emit('submit_question', {
      slideId: currentSlideId,
      text: newQuestionText.trim(),
      participantToken,
    });
    setNewQuestionText('');
  };

  // Upvote Q&A
  const handleUpvoteQuestion = (questionId: string) => {
    if (upvotedQuestions[questionId]) return;
    const socket = getSocket();
    socket.emit('upvote_question', {
      questionId,
      participantToken,
    });
    setUpvotedQuestions((prev) => ({ ...prev, [questionId]: true }));
    setQaQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, upvotes: q.upvotes + 1 } : q))
    );
  };

  // Option colors for Kahoot / Mentimeter mobile buttons
  const optionColors = [
    { bg: '#ef4444', text: '#fffaf3', symbol: '▲' },
    { bg: '#d1912c', text: '#fffaf3', symbol: '◆' },
    { bg: '#f59e0b', text: '#fffaf3', symbol: '●' },
    { bg: '#2f8f6b', text: '#fffaf3', symbol: '■' },
    { bg: '#b65f78', text: '#fffaf3', symbol: '★' },
    { bg: '#ec4899', text: '#fffaf3', symbol: '✦' },
  ];

  if (status === 'connecting') {
    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="card" style={{ padding: '40px', textAlign: 'center', maxWidth: '400px' }}>
          <div className="brand-icon" style={{ fontSize: '2.5rem', marginBottom: '16px' }}>
            ⚡
          </div>
          <h2>Joining Session...</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px' }}>
            Connecting with code <strong>{code}</strong>
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="card" style={{ padding: '40px', textAlign: 'center', maxWidth: '440px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>❌</div>
          <h2>Session Unavailable</h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: '12px 0 24px' }}>
            {errorMessage || 'The session code is invalid or the presentation has ended.'}
          </p>
          <Link href="/join" className="btn btn--primary">
            Try Another Code
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="card" style={{ padding: '48px', textAlign: 'center', maxWidth: '460px' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🎉</div>
          <h2>Session Completed!</h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: '12px 0 24px' }}>
            Thank you for participating! The presenter has concluded this live session.
          </p>
          <Link href="/" className="btn btn--ghost">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // ─── STEP 1: Nickname & Avatar Selection Screen ─────────────────────────
  if (!hasJoinedLobby) {
    const activeChar = resolveCharacter(avatar);

    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '32px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              background: activeChar.trackGradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '3rem',
              margin: '0 auto 12px',
              boxShadow: `0 0 28px ${activeChar.primaryColor}88`,
              border: '3px solid #ffffff',
            }}
          >
            {avatar}
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '4px' }}>Choose Your Racing Hero</h2>
          <span style={{ fontSize: '0.85rem', color: activeChar.primaryColor, fontWeight: 700, display: 'block', marginBottom: '18px' }}>
            ⚡ {activeChar.name} — {activeChar.title}
          </span>

          {/* Character selection cards grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '10px',
              marginBottom: '24px',
              maxHeight: '210px',
              overflowY: 'auto',
              padding: '6px',
            }}
          >
            {CHARACTERS.map((char) => {
              const isSelected = avatar === char.emoji;
              return (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => {
                    setAvatar(char.emoji);
                    if (!nickname || CHARACTERS.some((c) => c.name === nickname)) {
                      setNickname(char.name);
                    }
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '10px 6px',
                    borderRadius: '14px',
                    border: isSelected ? `2.5px solid ${char.primaryColor}` : '1px solid rgba(255, 255, 255, 0.1)',
                    background: isSelected ? char.badgeBg : 'rgba(255, 255, 255, 0.03)',
                    boxShadow: isSelected ? `0 0 16px ${char.primaryColor}55` : 'none',
                    cursor: 'pointer',
                    transform: isSelected ? 'scale(1.06)' : 'scale(1)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: '1.8rem' }}>{char.emoji}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: isSelected ? '#ffffff' : 'var(--color-text-secondary)' }}>
                    {char.name}
                  </span>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleJoinLobby}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ textAlign: 'left' }}>Your Racer Nickname</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter player nickname"
                maxLength={20}
                required
                className="form-input"
                style={{ fontSize: '1.1rem', fontWeight: 700, textAlign: 'center' }}
              />
            </div>

            <button type="submit" className="btn btn--primary btn--full" style={{ padding: '14px', fontSize: '1.1rem', fontWeight: 800 }}>
              Join Quiz Sprint ➔
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── STEP 2: Waiting Room Lobby Screen ──────────────────────────────────
  if (gameState === 'LOBBY') {
    const activeChar = resolveCharacter(avatar);

    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '36px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              background: activeChar.trackGradient,
              border: `3px solid ${activeChar.primaryColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '3.6rem',
              margin: '0 auto 20px',
              boxShadow: `0 0 35px ${activeChar.primaryColor}88`,
            }}
          >
            {avatar}
          </div>

          <h2 style={{ fontSize: '1.7rem', fontWeight: 800, marginBottom: '4px' }}>{nickname}</h2>
          <div style={{ color: activeChar.primaryColor, fontWeight: 700, fontSize: '0.9rem', marginBottom: '14px' }}>
            ⚡ {activeChar.name} — {activeChar.title}
          </div>

          <div
            style={{
              display: 'inline-block',
              padding: '4px 16px',
              borderRadius: '100px',
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#4ade80',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              fontWeight: 800,
              fontSize: '0.85rem',
              marginBottom: '20px',
            }}
          >
            🏁 READY AT THE STARTING LINE
          </div>

          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '24px' }}>
            Look up at the presenter&apos;s stadium screen! The race will begin as soon as the quiz is launched.
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              color: 'var(--color-text-muted)',
              fontSize: '0.85rem',
            }}
          >
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#3f9a73' }} />
            Ready for Question 1
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 3: Countdown Screen (3... 2... 1...) ──────────────────────────
  if (gameState === 'COUNTDOWN') {
    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '140px',
              height: '140px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #ec4899 0%, #d95745 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '5rem',
              fontWeight: 900,
              color: '#fffaf3',
              boxShadow: '0 0 50px rgba(236, 72, 153, 0.5)',
              margin: '0 auto 24px',
            }}
          >
            {countdownNumber}
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px' }}>Get Ready!</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.05rem' }}>
            Answer quickly for bonus speed points!
          </p>
        </div>
      </div>
    );
  }

  // ─── STEP 4: Reveal Screen ──────────────────────────────────────────────
  if (gameState === 'REVEAL') {
    const isCorrect = participantScore?.isCorrect ?? false;

    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div
          className="card"
          style={{
            maxWidth: '440px',
            width: '100%',
            padding: '36px',
            textAlign: 'center',
            border: isCorrect ? '2px solid #3f9a73' : '2px solid #ef4444',
            background: isCorrect ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          }}
        >
          <div style={{ fontSize: '4rem', marginBottom: '12px' }}>
            {isCorrect ? '🎉' : '❌'}
          </div>

          <h2 style={{ fontSize: '2rem', fontWeight: 900, color: isCorrect ? '#2f8f6b' : '#f87171', marginBottom: '6px' }}>
            {isCorrect ? 'CORRECT!' : 'NOT QUITE!'}
          </h2>

          {isCorrect ? (
            <div style={{ margin: '16px 0 24px' }}>
              <div
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 900,
                  color: '#fffaf3',
                }}
              >
                +{participantScore?.pointsEarned || 0} pts
              </div>

              {participantScore?.timeTaken !== undefined && participantScore.timeTaken > 0 && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#2f8f6b',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    padding: '4px 14px',
                    borderRadius: '100px',
                    margin: '6px 0 10px',
                  }}
                >
                  ⚡ Answered in {participantScore.timeTaken}s
                </div>
              )}

              {participantScore && participantScore.streak > 1 && (
                <div style={{ color: '#f97316', fontWeight: 800, fontSize: '1rem', marginTop: '6px' }}>
                  🔥 {participantScore.streak} Answer Streak! (+{(Math.min(participantScore.streak * 10, 50))}% Bonus)
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--color-text-secondary)', margin: '14px 0 20px', fontSize: '1rem' }}>
              Keep going! More points coming up next.
            </div>
          )}

          {(revealData?.correctAnswer || activeSlide?.config?.correctAnswer) && (
            <div
              style={{
                background: 'rgba(92, 54, 73, 0.06)',
                borderRadius: '12px',
                padding: '12px',
                marginBottom: '20px',
                fontSize: '0.95rem',
              }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>Correct Answer: </span>
              <strong style={{ color: '#2f8f6b' }}>
                {(() => {
                  const ans = revealData?.correctAnswer ?? activeSlide?.config?.correctAnswer;
                  return Array.isArray(ans) ? ans.join(', ') : ans;
                })()}
              </strong>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-around',
              background: 'rgba(92, 54, 73, 0.06)',
              borderRadius: '14px',
              padding: '14px',
            }}
          >
            <div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Total Score</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>
                {participantScore?.totalScore?.toLocaleString() || 0}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Current Rank</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fbbf24' }}>
                #{participantScore?.rank || '-'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 5: Leaderboard Screen ─────────────────────────────────────────
  if (gameState === 'LEADERBOARD') {
    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div className="card" style={{ maxWidth: '420px', width: '100%', padding: '36px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '8px' }}>🏆</div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '6px' }}>Leaderboard</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', marginBottom: '24px' }}>
            Look at the host screen for full standings!
          </p>

          <div
            style={{
              background: 'rgba(92, 54, 73, 0.07)',
              borderRadius: '16px',
              padding: '20px',
              border: '1px solid rgba(92, 54, 73, 0.12)',
              marginBottom: '24px',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '4px' }}>{avatar}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fffaf3' }}>{nickname}</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fbbf24', marginTop: '10px' }}>
              Rank #{participantScore?.rank || '-'}
            </div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
              {participantScore?.totalScore?.toLocaleString() || 0} total points
            </div>
            {(participantScore?.pointsEarned || 0) > 0 && (
              <div style={{ color: '#2f8f6b', fontWeight: 700, fontSize: '0.9rem', marginTop: '6px' }}>
                +{participantScore?.pointsEarned} pts this round
                {participantScore?.timeTaken ? ` (⚡ ${participantScore.timeTaken}s)` : ''}
              </div>
            )}
          </div>

          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Waiting for next question...
          </p>
        </div>
      </div>
    );
  }

  // ─── STEP 6: Final Results Screen ───────────────────────────────────────
  if (gameState === 'FINAL_RESULTS') {
    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div
          className="card"
          style={{
            maxWidth: '440px',
            width: '100%',
            padding: '40px',
            textAlign: 'center',
            background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.15) 0%, rgba(251, 247, 240, 0.95) 100%)',
            border: '2px solid rgba(245, 158, 11, 0.4)',
          }}
        >
          <div style={{ fontSize: '4rem', marginBottom: '8px' }}>🎉</div>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fbbf24', marginBottom: '4px' }}>
            Game Finished!
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', marginBottom: '28px' }}>
            Congratulations on completing the quiz challenge!
          </p>

          <div
            style={{
              background: 'rgba(92, 54, 73, 0.07)',
              borderRadius: '20px',
              padding: '24px',
              marginBottom: '28px',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '4px' }}>{avatar}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{nickname}</div>
            <div style={{ fontSize: '3rem', fontWeight: 900, color: '#fbbf24', margin: '8px 0' }}>
              #{participantScore?.rank || 1}
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fffaf3' }}>
              {participantScore?.totalScore?.toLocaleString() || 0} Points
            </div>
          </div>

          <Link href="/" className="btn btn--primary btn--full" style={{ padding: '14px' }}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // ─── STEP 7: Question Active & Question Locked ──────────────────────────
  const hasVotedCurrent = currentSlideId ? votedSlides[currentSlideId] : false;

  return (
    <div className="attendee-screen">
      {announcementNotification && (
        <div style={{ background: 'linear-gradient(90deg, #d95745, #d1912c)', color: '#fffaf3', padding: '12px 20px', textAlign: 'center', fontWeight: 700, fontSize: '0.95rem', boxShadow: '0 4px 12px rgba(63,41,64,0.3)', zIndex: 100 }}>
          📢 {announcementNotification}
        </div>
      )}
      {/* Top Header */}
      <header className="attendee-header" style={{ justifyContent: 'space-between', padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.4rem' }}>{avatar}</span>
          <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{nickname}</span>
        </div>

        {/* Live Timer Pill */}
        {gameState === 'QUESTION_ACTIVE' && (
          <div
            style={{
              padding: '4px 12px',
              borderRadius: '100px',
              background: remainingTime <= 5 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(217, 87, 69, 0.2)',
              border: remainingTime <= 5 ? '1px solid #ef4444' : '1px solid #d95745',
              color: remainingTime <= 5 ? '#f87171' : '#9c4f73',
              fontWeight: 800,
              fontSize: '0.85rem',
            }}
          >
            ⏱️ {remainingTime}s left
          </div>
        )}

        {gameState === 'QUESTION_LOCKED' && (
          <span className="badge badge--danger">🔒 Locked</span>
        )}
      </header>

      {/* Main Content Area */}
      <div className="attendee-content" style={{ padding: '20px' }}>
        {gameState === 'QUESTION_LOCKED' && (
          <div
            className="auth-alert"
            style={{
              width: '100%',
              marginBottom: '20px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fde68a',
              textAlign: 'center',
            }}
          >
            🔒 Time&apos;s up! Waiting for the presenter to reveal results...
          </div>
        )}

        {activeSlide ? (
          <div style={{ width: '100%', maxWidth: '520px', margin: '0 auto' }}>
            <h1
              style={{
                fontSize: '1.4rem',
                fontWeight: 800,
                textAlign: 'center',
                marginBottom: '24px',
                lineHeight: 1.35,
              }}
            >
              {activeSlide.question}
            </h1>

            {/* Multiple Choice Mobile Buttons (Kahoot / Mentimeter Grid) */}
            {activeSlide.type === 'multiple_choice' && (
              <div>
                {hasVotedCurrent ? (
                  <div
                    className="card page-enter"
                    style={{
                      padding: '36px',
                      textAlign: 'center',
                      background: 'rgba(34, 197, 94, 0.1)',
                      border: '2px solid rgba(34, 197, 94, 0.4)',
                    }}
                  >
                    <div style={{ fontSize: '3rem', marginBottom: '12px' }}>✓</div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2f8f6b', marginBottom: '8px' }}>
                      Answer Submitted!
                    </h3>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
                      You selected: <strong style={{ color: '#fffaf3' }}>{mySubmittedAnswer}</strong>
                    </p>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '12px' }}>
                      Waiting for presenter to reveal correct answer...
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                    {(activeSlide.options || []).map((opt, i) => {
                      const colorScheme = optionColors[i % optionColors.length];

                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => submitVote(opt)}
                          disabled={votingLocked || gameState === 'QUESTION_LOCKED'}
                          style={{
                            background: colorScheme.bg,
                            color: colorScheme.text,
                            border: 'none',
                            borderRadius: '16px',
                            padding: '20px 24px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: '0 6px 20px rgba(63,41,64,0.25)',
                            transition: 'transform 0.15s ease, filter 0.15s ease',
                            opacity: votingLocked || gameState === 'QUESTION_LOCKED' ? 0.6 : 1,
                            textAlign: 'left',
                          }}
                        >
                          <span
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              background: 'rgba(63,41,64,0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.2rem',
                            }}
                          >
                            {colorScheme.symbol}
                          </span>
                          <span style={{ flex: 1 }}>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Word Cloud Input */}
            {activeSlide.type === 'word_cloud' && (
              <div>
                <form onSubmit={handleWordSubmit} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                  <input
                    type="text"
                    value={wordInput}
                    onChange={(e) => setWordInput(e.target.value)}
                    placeholder="Type a word..."
                    maxLength={30}
                    disabled={votingLocked}
                    className="form-input"
                  />
                  <button type="submit" disabled={votingLocked || !wordInput.trim()} className="btn btn--primary">
                    Send
                  </button>
                </form>
                {submittedWords.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {submittedWords.map((w, idx) => (
                      <span key={idx} className="badge badge--primary">
                        ✓ {w}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Open Text Input */}
            {activeSlide.type === 'open_text' && (
              <form onSubmit={handleOpenTextSubmit}>
                <textarea
                  value={openTextInput}
                  onChange={(e) => setOpenTextInput(e.target.value)}
                  placeholder="Share your thoughts..."
                  rows={4}
                  maxLength={250}
                  disabled={votingLocked}
                  className="form-input"
                  style={{ marginBottom: '16px', resize: 'vertical' }}
                />
                <button type="submit" disabled={votingLocked || !openTextInput.trim()} className="btn btn--primary btn--full">
                  Submit Response
                </button>
              </form>
            )}

            {/* Rating Scale */}
            {activeSlide.type === 'rating_scale' && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                {Array.from({ length: activeSlide.config?.max || 5 }).map((_, idx) => {
                  const score = idx + 1;
                  return (
                    <button
                      key={score}
                      type="button"
                      onClick={() => handleRatingSubmit(score)}
                      disabled={votingLocked || hasVotedCurrent}
                      className={`btn ${ratingValue === score ? 'btn--primary' : 'btn--secondary'}`}
                      style={{ width: '48px', height: '48px', borderRadius: '12px', fontSize: '1.2rem', fontWeight: 800 }}
                    >
                      {score}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Ranking */}
            {activeSlide.type === 'ranking' && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {rankingList.map((item, idx) => (
                    <div
                      key={item}
                      className="card"
                      style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span>#{idx + 1} {item}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => moveRankItem(idx, 'up')}
                          disabled={idx === 0 || hasVotedCurrent}
                          className="btn btn--ghost btn--sm"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveRankItem(idx, 'down')}
                          disabled={idx === rankingList.length - 1 || hasVotedCurrent}
                          className="btn btn--ghost btn--sm"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!hasVotedCurrent && (
                  <button onClick={handleRankingSubmit} disabled={votingLocked} className="btn btn--primary btn--full">
                    Submit Ranking
                  </button>
                )}
              </div>
            )}

            {/* Live Q&A */}
            {activeSlide.type === 'qa' && (
              <div>
                <form onSubmit={handleQuestionSubmit} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                  <input
                    type="text"
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    placeholder="Ask a question..."
                    maxLength={300}
                    className="form-input"
                  />
                  <button type="submit" disabled={!newQuestionText.trim()} className="btn btn--primary">
                    Ask
                  </button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {qaQuestions.map((q) => (
                    <div
                      key={q.id}
                      className="card"
                      style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span style={{ fontSize: '0.95rem' }}>{q.text}</span>
                      <button
                        type="button"
                        onClick={() => handleUpvoteQuestion(q.id)}
                        disabled={upvotedQuestions[q.id]}
                        className={`btn btn--sm ${upvotedQuestions[q.id] ? 'btn--primary' : 'btn--ghost'}`}
                      >
                        ▲ {q.upvotes}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scales (Likert statement rating matrix) */}
            {activeSlide.type === 'scales' && (
              <div>
                {hasVotedCurrent ? (
                  <div className="card page-enter" style={{ padding: '36px', textAlign: 'center', background: 'rgba(34, 197, 94, 0.1)', border: '2px solid rgba(34, 197, 94, 0.4)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '8px' }}>✓</div>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2f8f6b' }}>Ratings Submitted!</h3>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>Thanks for sharing your opinion.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {(activeSlide.options || []).map((statement) => {
                      const currentVal = scalesInput[statement] || 3;
                      return (
                        <div key={statement} className="card" style={{ padding: '16px' }}>
                          <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px' }}>{statement}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                            {[1, 2, 3, 4, 5].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setScalesInput((prev) => ({ ...prev, [statement]: val }))}
                                disabled={votingLocked}
                                style={{
                                  flex: 1,
                                  padding: '10px 0',
                                  borderRadius: '8px',
                                  background: currentVal === val ? '#d95745' : 'rgba(92, 54, 73, 0.07)',
                                  border: currentVal === val ? '2px solid #b65f78' : '1px solid var(--color-border)',
                                  color: currentVal === val ? '#fffaf3' : 'var(--color-text-secondary)',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                            <span>{activeSlide.config?.lowLabel || 'Disagree'}</span>
                            <span>{activeSlide.config?.highLabel || 'Agree'}</span>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        if (!currentSlideId || votingLocked) return;
                        submitVote(scalesInput as any);
                      }}
                      disabled={votingLocked}
                      className="btn btn--primary btn--full"
                    >
                      Submit Ratings
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 100 Points Allocation */}
            {activeSlide.type === 'hundred_points' && (() => {
              const totalAllocated = Object.values(hundredPointsInput).reduce((a, b) => a + (Number(b) || 0), 0);
              return (
                <div>
                  {hasVotedCurrent ? (
                    <div className="card page-enter" style={{ padding: '36px', textAlign: 'center', background: 'rgba(34, 197, 94, 0.1)', border: '2px solid rgba(34, 197, 94, 0.4)' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '8px' }}>✓</div>
                      <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2f8f6b' }}>100 Points Allocated!</h3>
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>Your priorities have been submitted.</p>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontWeight: 700 }}>
                        <span>Points Remaining:</span>
                        <span style={{ color: totalAllocated === 100 ? '#2f8f6b' : totalAllocated > 100 ? '#ef4444' : '#fbbf24' }}>
                          {100 - totalAllocated} pts
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                        {(activeSlide.options || []).map((opt) => {
                          const pts = hundredPointsInput[opt] || 0;
                          return (
                            <div key={opt} className="card" style={{ padding: '16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.92rem', fontWeight: 600 }}>
                                <span>{opt}</span>
                                <span style={{ color: '#2f8f6b' }}>{pts} pts</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={pts}
                                onChange={(e) => setHundredPointsInput((prev) => ({ ...prev, [opt]: Number(e.target.value) }))}
                                style={{ width: '100%', accentColor: '#d95745' }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!currentSlideId || votingLocked) return;
                          submitVote(hundredPointsInput as any);
                        }}
                        disabled={votingLocked}
                        className="btn btn--primary btn--full"
                      >
                        Submit 100 Points Allocation
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Number Input Slide */}
            {activeSlide.type === 'number' && (
              <div>
                {hasVotedCurrent ? (
                  <div className="card page-enter" style={{ padding: '36px', textAlign: 'center', background: 'rgba(34, 197, 94, 0.1)', border: '2px solid rgba(34, 197, 94, 0.4)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '8px' }}>✓</div>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2f8f6b' }}>Number Submitted!</h3>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>Your guess: {numberInput}</p>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!currentSlideId || votingLocked || !numberInput) return;
                      submitVote(Number(numberInput));
                    }}
                    style={{ textAlign: 'center' }}
                  >
                    <input
                      type="number"
                      value={numberInput}
                      onChange={(e) => setNumberInput(e.target.value)}
                      placeholder="0"
                      className="number-input-large"
                      style={{ marginBottom: '20px' }}
                      autoFocus
                      required
                    />
                    <button type="submit" disabled={votingLocked || !numberInput} className="btn btn--primary btn--full">
                      Submit Number
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Content Slide (Heading/Paragraph/Image/Video/Bullets) */}
            {(activeSlide.type === 'heading' || activeSlide.type === 'paragraph' || activeSlide.type === 'image' || activeSlide.type === 'video' || activeSlide.type === 'bullets') && (
              <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
                <span className="badge badge--draft" style={{ marginBottom: '16px' }}>
                  👀 Presenter is sharing content
                </span>
                {activeSlide.type === 'heading' && (
                  <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '12px' }}>{activeSlide.question}</h2>
                    {activeSlide.config?.subtitle && <p style={{ color: 'var(--color-text-secondary)' }}>{activeSlide.config.subtitle}</p>}
                  </div>
                )}
                {activeSlide.type === 'paragraph' && (
                  <div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '12px' }}>{activeSlide.question}</h3>
                    <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6, textAlign: 'left', whiteSpace: 'pre-wrap' }}>{activeSlide.config?.body}</p>
                  </div>
                )}
                {activeSlide.type === 'image' && (
                  <div>
                    {activeSlide.config?.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={activeSlide.config.imageUrl} alt={activeSlide.question} style={{ maxWidth: '100%', borderRadius: '12px', marginBottom: '12px' }} />
                    )}
                    {activeSlide.config?.caption && <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{activeSlide.config.caption}</p>}
                  </div>
                )}
                {activeSlide.type === 'video' && (
                  <div>
                    {activeSlide.config?.videoUrl && (
                      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '12px' }}>
                        <iframe src={activeSlide.config.videoUrl.replace('watch?v=', 'embed/')} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }} allowFullScreen />
                      </div>
                    )}
                  </div>
                )}
                {activeSlide.type === 'bullets' && (
                  <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                    {(activeSlide.options || []).map((b, i) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <span style={{ color: '#b65f78' }}>✦</span>
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ padding: '40px', textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
            <p style={{ color: 'var(--color-text-muted)' }}>Waiting for the presenter to share a slide...</p>
          </div>
        )}
      </div>
    </div>
  );
}
