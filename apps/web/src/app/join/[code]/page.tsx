'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { getParticipantToken } from '@/lib/participant';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import type {
  GameState,
  QuestionTimerState,
  GameStateChangedEvent,
  ParticipantScoreEvent,
} from '@pollwave/shared';

type SlideType = 'multiple_choice' | 'word_cloud' | 'open_text' | 'rating_scale' | 'ranking' | 'qa';

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
      socket.emit('join_session', {
        joinCode: code,
        participantToken,
      });

      // Auto-join lobby if nickname already established
      const savedNick = localStorage.getItem('pollwave_nickname') || nickname;
      const savedAvatar = localStorage.getItem('pollwave_avatar') || avatar;
      if (savedNick) {
        socket.emit('join_lobby', {
          joinCode: code,
          participantToken,
          nickname: savedNick,
          avatar: savedAvatar,
        });
      }
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
      if (data.slideId) setCurrentSlideId(data.slideId);
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
    socket.on('slide_changed', onSlideChanged);
    socket.on('voting_locked', onVotingLocked);
    socket.on('session_ended', onSessionEnded);
    socket.on('question_update', onQuestionUpdate);
    socket.on('game_state_changed', onGameStateChanged);
    socket.on('participant_score', onParticipantScore);
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
      socket.off('error', onError);
    };
  }, [code, participantToken, nickname, avatar]);

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
    { bg: '#ef4444', text: '#ffffff', symbol: '▲' },
    { bg: '#3b82f6', text: '#ffffff', symbol: '◆' },
    { bg: '#f59e0b', text: '#ffffff', symbol: '●' },
    { bg: '#10b981', text: '#ffffff', symbol: '■' },
    { bg: '#8b5cf6', text: '#ffffff', symbol: '★' },
    { bg: '#ec4899', text: '#ffffff', symbol: '✦' },
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

  // ─── STEP 1: Nickname & Emoji Avatar Picker ─────────────────────────────
  if (!hasJoinedLobby) {
    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div className="card" style={{ maxWidth: '420px', width: '100%', padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '8px' }}>{avatar}</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '6px' }}>Choose Your Avatar</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
            Pick an emoji and nickname to enter the quiz room.
          </p>

          {/* Avatar selector pills */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '10px',
              marginBottom: '24px',
            }}
          >
            {AVATAR_OPTIONS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setAvatar(em)}
                style={{
                  fontSize: '1.6rem',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  border: avatar === em ? '2px solid #7c5cfc' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: avatar === em ? 'rgba(124, 92, 252, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                  transform: avatar === em ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.2s ease',
                }}
              >
                {em}
              </button>
            ))}
          </div>

          <form onSubmit={handleJoinLobby}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ textAlign: 'left' }}>Your Nickname</label>
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
              Join Game ➔
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── STEP 2: Waiting Room Lobby Screen ──────────────────────────────────
  if (gameState === 'LOBBY') {
    return (
      <div className="attendee-screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div className="card" style={{ maxWidth: '420px', width: '100%', padding: '36px', textAlign: 'center' }}>
          <div
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(124, 92, 252, 0.3) 0%, rgba(236, 72, 153, 0.3) 100%)',
              border: '3px solid #7c5cfc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '3.5rem',
              margin: '0 auto 20px',
              boxShadow: '0 0 30px rgba(124, 92, 252, 0.4)',
            }}
          >
            {avatar}
          </div>

          <h2 style={{ fontSize: '1.7rem', fontWeight: 800, marginBottom: '6px' }}>{nickname}</h2>
          <div
            style={{
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: '100px',
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#4ade80',
              fontWeight: 800,
              fontSize: '0.85rem',
              marginBottom: '20px',
            }}
          >
            ✓ YOU&apos;RE IN THE LOBBY
          </div>

          <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem', lineHeight: 1.5, marginBottom: '24px' }}>
            Look at the host screen! The quiz will begin as soon as the presenter starts it.
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
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
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
              background: 'linear-gradient(135deg, #ec4899 0%, #7c5cfc 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '5rem',
              fontWeight: 900,
              color: '#ffffff',
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
            border: isCorrect ? '2px solid #22c55e' : '2px solid #ef4444',
            background: isCorrect ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          }}
        >
          <div style={{ fontSize: '4rem', marginBottom: '12px' }}>
            {isCorrect ? '🎉' : '❌'}
          </div>

          <h2 style={{ fontSize: '2rem', fontWeight: 900, color: isCorrect ? '#4ade80' : '#f87171', marginBottom: '6px' }}>
            {isCorrect ? 'CORRECT!' : 'NOT QUITE!'}
          </h2>

          {isCorrect ? (
            <div style={{ margin: '16px 0 24px' }}>
              <div
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 900,
                  color: '#ffffff',
                }}
              >
                +{participantScore?.pointsEarned || 0} pts
              </div>
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

          {revealData?.correctAnswer && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: '12px',
                padding: '12px',
                marginBottom: '20px',
                fontSize: '0.95rem',
              }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>Correct Answer: </span>
              <strong style={{ color: '#4ade80' }}>
                {Array.isArray(revealData.correctAnswer)
                  ? revealData.correctAnswer.join(', ')
                  : revealData.correctAnswer}
              </strong>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-around',
              background: 'rgba(255, 255, 255, 0.04)',
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
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '16px',
              padding: '20px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              marginBottom: '24px',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '4px' }}>{avatar}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffffff' }}>{nickname}</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fbbf24', marginTop: '10px' }}>
              Rank #{participantScore?.rank || '-'}
            </div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
              {participantScore?.totalScore?.toLocaleString() || 0} total points
            </div>
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
            background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.15) 0%, rgba(13, 13, 26, 0.95) 100%)',
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
              background: 'rgba(255, 255, 255, 0.05)',
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
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>
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
              background: remainingTime <= 5 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(124, 92, 252, 0.2)',
              border: remainingTime <= 5 ? '1px solid #ef4444' : '1px solid #7c5cfc',
              color: remainingTime <= 5 ? '#f87171' : '#c4b5fd',
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
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4ade80', marginBottom: '8px' }}>
                      Answer Submitted!
                    </h3>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
                      You selected: <strong style={{ color: '#ffffff' }}>{mySubmittedAnswer}</strong>
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
                            boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
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
                              background: 'rgba(0,0,0,0.2)',
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
