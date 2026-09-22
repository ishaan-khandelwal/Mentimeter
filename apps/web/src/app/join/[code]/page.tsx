'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { getParticipantToken } from '@/lib/participant';
import Link from 'next/link';

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

  const activeSlide = slides.find((s) => s._id === currentSlideId) || null;

  // Initialize ranking options when active slide changes
  useEffect(() => {
    if (activeSlide?.type === 'ranking' && activeSlide.options) {
      setRankingList([...activeSlide.options]);
    }
    // Reset selection when changing slides
    setSelectedOptions([]);
    setWordInput('');
    setOpenTextInput('');
    setRatingValue(null);
  }, [currentSlideId, activeSlide]);

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
    };

    const onSessionJoined = (data: {
      sessionId: string;
      currentSlideId: string | null;
      votingLocked: boolean;
      slides: Slide[];
    }) => {
      setStatus('connected');
      setSlides(data.slides);
      setCurrentSlideId(data.currentSlideId);
      setVotingLocked(data.votingLocked);
    };

    const onSlideChanged = (data: { currentSlideId: string; votingLocked: boolean }) => {
      setCurrentSlideId(data.currentSlideId);
      setVotingLocked(data.votingLocked);
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

    const onError = (data: { code: string; message: string }) => {
      setStatus('error');
      setErrorMessage(data.message || 'Unable to join session');
    };

    socket.on('connect', onConnect);
    socket.on('session_joined', onSessionJoined);
    socket.on('slide_changed', onSlideChanged);
    socket.on('voting_locked', onVotingLocked);
    socket.on('session_ended', onSessionEnded);
    socket.on('question_update', onQuestionUpdate);
    socket.on('error', onError);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('session_joined', onSessionJoined);
      socket.off('slide_changed', onSlideChanged);
      socket.off('voting_locked', onVotingLocked);
      socket.off('session_ended', onSessionEnded);
      socket.off('question_update', onQuestionUpdate);
      socket.off('error', onError);
    };
  }, [code, participantToken]);

  // Submit generic vote
  const submitVote = useCallback(
    (value: any) => {
      if (!currentSlideId || votingLocked) return;
      const socket = getSocket();
      socket.emit('submit_vote', {
        slideId: currentSlideId,
        value,
        participantToken,
      });
      setVotedSlides((prev) => ({ ...prev, [currentSlideId]: true }));
    },
    [currentSlideId, votingLocked, participantToken],
  );

  // Submit Multiple Choice
  const handleMultipleChoiceSubmit = (opt: string) => {
    const isMulti = activeSlide?.config?.allowMultiple;
    if (isMulti) {
      const next = selectedOptions.includes(opt)
        ? selectedOptions.filter((o) => o !== opt)
        : [...selectedOptions, opt];
      setSelectedOptions(next);
      submitVote(next);
    } else {
      setSelectedOptions([opt]);
      submitVote(opt);
    }
  };

  // Submit Word Cloud
  const handleWordCloudSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const word = wordInput.trim();
    if (!word) return;

    submitVote(word);
    setSubmittedWords((prev) => [...prev, word]);
    setWordInput('');
  };

  // Submit Open Text
  const handleOpenTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openTextInput.trim()) return;
    submitVote(openTextInput.trim());
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
      prev.map((q) => (q.id === questionId ? { ...q, upvotes: q.upvotes + 1 } : q)),
    );
  };

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
          <h2>Session Not Found</h2>
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

  const hasVotedCurrent = currentSlideId ? votedSlides[currentSlideId] : false;

  return (
    <div className="attendee-screen">
      {/* Top Header */}
      <header className="attendee-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="brand-icon" style={{ fontSize: '1.2rem' }}>⚡</span>
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>PollWave</span>
        </div>
        <span className="badge badge--primary">Code: {code}</span>
      </header>

      {/* Main Content Area */}
      <div className="attendee-content">
        {votingLocked && (
          <div
            className="auth-alert"
            style={{
              width: '100%',
              marginBottom: '20px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fde68a',
              justifyContent: 'center',
            }}
          >
            🔒 Voting is currently locked by the presenter
          </div>
        )}

        {activeSlide ? (
          <div style={{ width: '100%' }} className="page-enter">
            {/* Question Title */}
            <h1
              style={{
                fontSize: '1.6rem',
                fontWeight: 800,
                textAlign: 'center',
                marginBottom: '28px',
                lineHeight: 1.3,
              }}
            >
              {activeSlide.question}
            </h1>

            {/* Slide Type: Multiple Choice */}
            {activeSlide.type === 'multiple_choice' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(activeSlide.options || []).map((opt, i) => {
                  const isSelected = selectedOptions.includes(opt);
                  return (
                    <button
                      key={i}
                      onClick={() => handleMultipleChoiceSubmit(opt)}
                      disabled={votingLocked}
                      className="card card--hover"
                      style={{
                        padding: '18px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        textAlign: 'left',
                        border: isSelected
                          ? '2px solid var(--color-primary)'
                          : '1px solid var(--color-border)',
                        background: isSelected
                          ? 'rgba(124, 92, 252, 0.2)'
                          : 'rgba(255, 255, 255, 0.04)',
                        color: 'var(--color-text-primary)',
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        cursor: votingLocked ? 'not-allowed' : 'pointer',
                        borderRadius: '12px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: isSelected ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          flexShrink: 0,
                        }}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Slide Type: Word Cloud */}
            {activeSlide.type === 'word_cloud' && (
              <div className="card" style={{ padding: '28px' }}>
                <form onSubmit={handleWordCloudSubmit}>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <input
                      type="text"
                      maxLength={30}
                      value={wordInput}
                      onChange={(e) => setWordInput(e.target.value)}
                      placeholder="Type your word..."
                      className="form-input"
                      disabled={votingLocked}
                      style={{ fontSize: '1.1rem', textAlign: 'center', padding: '16px' }}
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={votingLocked || !wordInput.trim()}
                    className="btn btn--primary btn--full btn--lg"
                  >
                    Submit Word
                  </button>
                </form>

                {submittedWords.length > 0 && (
                  <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      Your submissions:
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
                      {submittedWords.map((w, idx) => (
                        <span key={idx} className="badge badge--primary">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Slide Type: Open Text */}
            {activeSlide.type === 'open_text' && (
              <div className="card" style={{ padding: '28px' }}>
                {hasVotedCurrent ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>✓</div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Response Submitted!</h3>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                      Your thoughts have been shared with the presenter.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleOpenTextSubmit}>
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <textarea
                        rows={4}
                        maxLength={500}
                        value={openTextInput}
                        onChange={(e) => setOpenTextInput(e.target.value)}
                        placeholder="Write your thoughts here..."
                        className="form-textarea"
                        disabled={votingLocked}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={votingLocked || !openTextInput.trim()}
                      className="btn btn--primary btn--full btn--lg"
                    >
                      Send Feedback
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Slide Type: Rating Scale */}
            {activeSlide.type === 'rating_scale' && (
              <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
                  {Array.from({ length: activeSlide.config?.max || 5 }).map((_, idx) => {
                    const score = idx + 1;
                    const isSelected = ratingValue === score;
                    return (
                      <button
                        key={score}
                        onClick={() => handleRatingSubmit(score)}
                        disabled={votingLocked}
                        style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '12px',
                          background: isSelected ? 'var(--gradient-primary)' : 'rgba(255,255,255,0.06)',
                          border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                          color: 'white',
                          fontSize: '1.25rem',
                          fontWeight: 700,
                          cursor: votingLocked ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {score}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  <span>{activeSlide.config?.lowLabel || 'Poor'}</span>
                  <span>{activeSlide.config?.highLabel || 'Excellent'}</span>
                </div>
              </div>
            )}

            {/* Slide Type: Ranking */}
            {activeSlide.type === 'ranking' && (
              <div className="card" style={{ padding: '24px' }}>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: '16px', textAlign: 'center' }}>
                  Use arrows to order items by your preference (top = highest).
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {rankingList.map((item, idx) => (
                    <div
                      key={item}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-primary-light)' }}>
                          #{idx + 1}
                        </span>
                        <span style={{ fontWeight: 600 }}>{item}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => moveRankItem(idx, 'up')}
                          disabled={idx === 0 || votingLocked}
                          className="btn btn--ghost btn--sm"
                          style={{ padding: '4px 8px' }}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveRankItem(idx, 'down')}
                          disabled={idx === rankingList.length - 1 || votingLocked}
                          className="btn btn--ghost btn--sm"
                          style={{ padding: '4px 8px' }}
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleRankingSubmit}
                  disabled={votingLocked}
                  className="btn btn--primary btn--full btn--lg"
                >
                  Submit Ranking
                </button>
              </div>
            )}

            {/* Slide Type: Q&A */}
            {activeSlide.type === 'qa' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="card" style={{ padding: '24px' }}>
                  <form onSubmit={handleQuestionSubmit}>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <input
                        type="text"
                        maxLength={200}
                        value={newQuestionText}
                        onChange={(e) => setNewQuestionText(e.target.value)}
                        placeholder="Ask a question..."
                        className="form-input"
                        disabled={votingLocked}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={votingLocked || !newQuestionText.trim()}
                      className="btn btn--primary btn--full"
                    >
                      Submit Question
                    </button>
                  </form>
                </div>

                {/* Questions List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {qaQuestions.map((q) => {
                    const isUpvoted = upvotedQuestions[q.id];
                    return (
                      <div
                        key={q.id}
                        className="card"
                        style={{
                          padding: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <p style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: '0.95rem' }}>
                          {q.text}
                        </p>
                        <button
                          onClick={() => handleUpvoteQuestion(q.id)}
                          disabled={isUpvoted}
                          className={`qa-upvote__btn ${isUpvoted ? 'qa-upvote__btn--voted' : ''}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            background: isUpvoted ? 'rgba(124,92,252,0.2)' : 'transparent',
                            color: isUpvoted ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                            cursor: isUpvoted ? 'default' : 'pointer',
                          }}
                        >
                          <span>▲</span>
                          <span style={{ fontWeight: 700 }}>{q.upvotes}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vote Confirmation Indicator */}
            {hasVotedCurrent && (
              <div
                style={{
                  marginTop: '20px',
                  textAlign: 'center',
                  fontSize: '0.85rem',
                  color: 'var(--color-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>✓</span>
                <span>Response recorded in real-time</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⏳</div>
            <h2>Waiting for presenter...</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px' }}>
              The presentation will begin shortly when the presenter starts the first slide.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
