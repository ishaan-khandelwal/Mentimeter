'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import Link from 'next/link';
import QRCode from 'qrcode';

type SlideType = 'multiple_choice' | 'word_cloud' | 'open_text' | 'rating_scale' | 'ranking' | 'qa';

interface Slide {
  _id: string;
  type: SlideType;
  question: string;
  options?: string[];
  order: number;
  config?: Record<string, any>;
}

interface Presentation {
  _id: string;
  title: string;
  joinCode: string;
  status: string;
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

  // AI Summary states
  const [aiSummary, setAiSummary] = useState<AiSummaryResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiSummaryModal, setShowAiSummaryModal] = useState(false);

  const [loading, setLoading] = useState(true);

  // Load presentation and slides
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`/api/v1/presentations/${id}`);
        if (!res.ok) {
          router.push('/dashboard');
          return;
        }
        const data = await res.json();
        setPresentation(data.presentation);
        setSlides(data.slides || []);

        if ((data.slides || []).length > 0) {
          setCurrentSlideId(data.slides[0]._id);
        }

        // Generate QR code for joining
        if (data.presentation?.joinCode) {
          const joinUrl = `${window.location.origin}/join/${data.presentation.joinCode}`;
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

        // Start or join session
        socket.emit('start_session', { presentationId: id, token });
      } catch (err) {
        console.error('Presenter auth error:', err);
      }
    }

    authPresenter();

    const onSessionStarted = (data: { sessionId: string; currentSlideId: string; votingLocked: boolean }) => {
      setSessionId(data.sessionId);
      setCurrentSlideId(data.currentSlideId);
      setVotingLocked(data.votingLocked);
    };

    const onSlideChanged = (data: { currentSlideId: string; votingLocked: boolean }) => {
      setCurrentSlideId(data.currentSlideId);
      setVotingLocked(data.votingLocked);
      setAiSummary(null); // Clear summary for new slide
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

    socket.on('session_started', onSessionStarted);
    socket.on('slide_changed', onSlideChanged);
    socket.on('voting_locked', onVotingLocked);
    socket.on('tally_update', onTallyUpdate);
    socket.on('presence_update', onPresenceUpdate);
    socket.on('question_update', onQuestionUpdate);

    return () => {
      socket.off('session_started', onSessionStarted);
      socket.off('slide_changed', onSlideChanged);
      socket.off('voting_locked', onVotingLocked);
      socket.off('tally_update', onTallyUpdate);
      socket.off('presence_update', onPresenceUpdate);
      socket.off('question_update', onQuestionUpdate);
    };
  }, [presentation, id]);

  const currentIndex = slides.findIndex((s) => s._id === currentSlideId);
  const activeSlide = slides[currentIndex] || slides[0] || null;

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

  // Generate Claude AI summary of audience responses
  const handleGenerateAiSummary = async () => {
    if (!activeSlide || !currentSlideId) return;
    setAiLoading(true);
    setShowAiSummaryModal(true);

    try {
      const currentTally = tallies[currentSlideId] || {};
      const responseList = Object.entries(currentTally).map(([key, count]) => ({
        answer: key,
        votes: count,
      }));

      const res = await fetch('/api/v1/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: activeSlide.question,
          slideType: activeSlide.type,
          responses: responseList.length > 0 ? responseList : [{ answer: 'No responses yet', votes: 0 }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiSummary(data);
      }
    } catch (err) {
      console.error('Failed to get AI summary:', err);
    } finally {
      setAiLoading(false);
    }
  };

  // Compute stats for current active slide
  const currentTally = useMemo(() => {
    return currentSlideId && tallies[currentSlideId] ? tallies[currentSlideId] : {};
  }, [currentSlideId, tallies]);

  const totalVotes = useMemo(() => {
    return Object.values(currentTally).reduce((sum, val) => sum + val, 0);
  }, [currentTally]);

  if (loading) {
    return (
      <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="nav-skeleton" style={{ width: '260px', height: '40px', margin: '0 auto 20px' }} />
        <p style={{ color: 'var(--color-text-muted)' }}>Launching presenter view...</p>
      </div>
    );
  }

  return (
    <div className="presenter-layout" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Presenter Toolbar */}
      <div className="presenter-toolbar" style={{ justifyContent: 'space-between', height: '68px', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/dashboard" className="btn btn--ghost btn--sm">
            ✕ Exit
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{presentation?.title}</span>
            <span className="badge badge--live">● LIVE</span>
          </div>
        </div>

        {/* Join instructions for audience */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
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
            <span style={{ color: '#22c55e', fontSize: '1.2rem' }}>●</span>
            <span style={{ fontWeight: 700 }}>{presenceCount}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>online</span>
          </div>

          <button
            onClick={handleToggleLock}
            className={`btn btn--sm ${votingLocked ? 'btn--secondary' : 'btn--ghost'}`}
          >
            {votingLocked ? '🔓 Unlock Voting' : '🔒 Lock Voting'}
          </button>

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

      {/* Main Slide Display Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '40px 60px', overflowY: 'auto' }}>
        {activeSlide ? (
          <div style={{ maxWidth: '1000px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Slide Question Header */}
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
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
              <h1
                style={{
                  fontSize: 'clamp(2rem, 4vw, 3.2rem)',
                  fontWeight: 800,
                  marginTop: '8px',
                  lineHeight: 1.25,
                }}
              >
                {activeSlide.question}
              </h1>
            </div>

            {/* Visualizer per Slide Type */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {/* Multiple Choice Chart */}
              {activeSlide.type === 'multiple_choice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {(activeSlide.options || []).map((opt, i) => {
                    const votes = currentTally[opt] || 0;
                    const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                    const colors = ['#7c5cfc', '#00d4aa', '#f59e0b', '#ec4899', '#3b82f6'];
                    const barColor = colors[i % colors.length];

                    return (
                      <div
                        key={opt}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '16px',
                          padding: '16px 24px',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Background Animated Progress Bar */}
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${percent}%`,
                            background: `${barColor}25`,
                            borderRight: `3px solid ${barColor}`,
                            transition: 'width 0.4s ease-out',
                            zIndex: 0,
                          }}
                        />

                        {/* Option Content */}
                        <div
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: barColor,
                                color: '#0d0d1a',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.1rem',
                              }}
                            >
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>{opt}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span style={{ fontSize: '1.1rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                              {votes} {votes === 1 ? 'vote' : 'votes'}
                            </span>
                            <span style={{ fontSize: '1.6rem', fontWeight: 800, minWidth: '70px', textAlign: 'right' }}>
                              {percent}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Word Cloud Visualizer */}
              {activeSlide.type === 'word_cloud' && (
                <div
                  className="card"
                  style={{
                    padding: '48px',
                    minHeight: '340px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '20px',
                  }}
                >
                  {Object.keys(currentTally).length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '1.2rem' }}>
                      Waiting for audience submissions...
                    </p>
                  ) : (
                    Object.entries(currentTally).map(([word, count]) => {
                      const maxCount = Math.max(...Object.values(currentTally), 1);
                      const fontScale = 1.2 + (count / maxCount) * 2.2;
                      const colors = ['#9d7eff', '#00d4aa', '#f59e0b', '#38bdf8', '#f43f5e', '#a78bfa'];
                      const wordColor = colors[Math.abs(word.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colors.length];

                      return (
                        <span
                          key={word}
                          style={{
                            fontSize: `${fontScale}rem`,
                            fontWeight: 800,
                            color: wordColor,
                            padding: '4px 12px',
                            transition: 'all 0.3s ease',
                            display: 'inline-block',
                          }}
                        >
                          {word}
                        </span>
                      );
                    })
                  )}
                </div>
              )}

              {/* Rating Scale Histogram & Average */}
              {activeSlide.type === 'rating_scale' && (
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                  {/* Big Average Score Callout */}
                  <div style={{ marginBottom: '32px' }}>
                    <div
                      style={{
                        fontSize: '4.5rem',
                        fontWeight: 900,
                        background: 'var(--gradient-brand)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        lineHeight: 1,
                      }}
                    >
                      {totalVotes > 0
                        ? (
                            Object.entries(currentTally).reduce(
                              (acc, [val, count]) => acc + Number(val) * count,
                              0,
                            ) / totalVotes
                          ).toFixed(1)
                        : '0.0'}
                    </div>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '1rem' }}>
                      Average Score from {totalVotes} responses
                    </span>
                  </div>

                  {/* Rating distribution columns */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      gap: '24px',
                      height: '180px',
                    }}
                  >
                    {Array.from({ length: activeSlide.config?.max || 5 }).map((_, idx) => {
                      const score = idx + 1;
                      const count = currentTally[String(score)] || 0;
                      const maxV = Math.max(...Object.values(currentTally), 1);
                      const barHeight = totalVotes > 0 ? Math.max(12, (count / maxV) * 140) : 12;

                      return (
                        <div key={score} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{count}</span>
                          <div
                            style={{
                              width: '44px',
                              height: `${barHeight}px`,
                              background: 'var(--gradient-primary)',
                              borderRadius: '8px',
                              transition: 'height 0.3s ease',
                            }}
                          />
                          <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>★ {score}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Open Text Submissions List */}
              {activeSlide.type === 'open_text' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '16px',
                    maxHeight: '450px',
                    overflowY: 'auto',
                    padding: '8px',
                  }}
                >
                  {Object.keys(currentTally).length === 0 ? (
                    <div className="card" style={{ gridColumn: '1/-1', padding: '40px', textAlign: 'center' }}>
                      <p style={{ color: 'var(--color-text-muted)', fontSize: '1.2rem' }}>
                        Waiting for audience responses...
                      </p>
                    </div>
                  ) : (
                    Object.keys(currentTally).map((text, i) => (
                      <div
                        key={i}
                        className="card page-enter"
                        style={{ padding: '20px', fontSize: '1.05rem', lineHeight: 1.5 }}
                      >
                        &ldquo;{text}&rdquo;
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Ranking Leaderboard */}
              {activeSlide.type === 'ranking' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(activeSlide.options || []).map((item, idx) => (
                    <div
                      key={item}
                      className="card"
                      style={{
                        padding: '18px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: idx === 0 ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                            color: idx === 0 ? '#0d0d1a' : 'white',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>{item}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Live Q&A Stream */}
              {activeSlide.type === 'qa' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {qaList.length === 0 ? (
                    <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                      <p style={{ color: 'var(--color-text-muted)', fontSize: '1.2rem' }}>
                        No questions submitted yet. Audience can submit in real-time.
                      </p>
                    </div>
                  ) : (
                    qaList
                      .slice()
                      .sort((a, b) => b.upvotes - a.upvotes)
                      .map((q) => (
                        <div
                          key={q.id}
                          className="card page-enter"
                          style={{
                            padding: '20px 24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '16px',
                          }}
                        >
                          <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>{q.text}</span>
                          <span
                            className="badge badge--primary"
                            style={{ fontSize: '1rem', padding: '6px 14px' }}
                          >
                            ▲ {q.upvotes}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>

            {/* Bottom Total Responses counter */}
            <div style={{ marginTop: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
              Total Responses: <strong style={{ color: 'var(--color-text-primary)' }}>{totalVotes}</strong>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <h2>No slides in this presentation</h2>
          </div>
        )}
      </div>

      {/* Bottom Presenter Navigation Bar */}
      <footer
        style={{
          borderTop: '1px solid var(--color-border)',
          background: 'rgba(13, 13, 26, 0.95)',
          padding: '14px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handlePrevSlide}
            disabled={currentIndex <= 0}
            className="btn btn--secondary"
          >
            ◀ Previous Slide
          </button>
          <button
            onClick={handleNextSlide}
            disabled={currentIndex >= slides.length - 1}
            className="btn btn--primary"
          >
            Next Slide ▶
          </button>
        </div>

        {/* Slide quick picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Jump to:</span>
          <select
            value={currentSlideId || ''}
            onChange={(e) => handleGoToSlide(e.target.value)}
            className="form-select"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.85rem' }}
          >
            {slides.map((s, idx) => (
              <option key={s._id} value={s._id}>
                {idx + 1}. {s.question.slice(0, 30)}
              </option>
            ))}
          </select>
        </div>
      </footer>

      {/* QR Code Modal */}
      {showQrModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
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
            background: 'rgba(0,0,0,0.75)',
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
    </div>
  );
}
