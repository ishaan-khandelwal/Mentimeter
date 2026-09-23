'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface SlideResult {
  id: string;
  order: number;
  type: string;
  question: string;
  options: string[];
  responseCount: number;
  tally: Record<string, number>;
  textAnswers: string[];
  numericValues: number[];
  average: number | null;
}

interface ResultsData {
  presentation: {
    id: string;
    title: string;
    joinCode: string;
    status: string;
    theme?: any;
    isAsyncForm?: boolean;
    createdAt: string;
  };
  totalResponses: number;
  uniqueParticipants: number;
  sessionCount: number;
  slides: SlideResult[];
}

export default function PresentationResultsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);

  useEffect(() => {
    async function fetchResults() {
      try {
        const res = await fetch(`/api/v1/presentations/${id}/results`);
        if (!res.ok) {
          if (res.status === 401) router.push('/login');
          throw new Error('Failed to load presentation results');
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || 'Error loading results');
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [id, router]);

  const handleDownloadCsv = () => {
    window.open(`/api/v1/presentations/${id}/results?format=csv`, '_blank');
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="spinner spinner--lg" style={{ margin: '0 auto 20px' }} />
        <p style={{ color: 'var(--color-text-muted)' }}>Loading presentation analytics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <div className="card" style={{ maxWidth: '500px', margin: '0 auto', padding: '40px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ marginBottom: '12px' }}>Could not load results</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
            {error || 'Presentation not found or access denied.'}
          </p>
          <Link href="/dashboard" className="btn btn--primary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { presentation, totalResponses, uniqueParticipants, sessionCount, slides } = data;
  const activeSlide = slides[activeSlideIdx] || null;

  return (
    <div className="container page-enter" style={{ padding: '36px 24px 80px', minHeight: '100vh' }}>
      {/* Navigation Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <Link href="/dashboard" className="btn btn--ghost btn--sm">
              ← Dashboard
            </Link>
            <span className="badge badge--primary">Code: {presentation.joinCode}</span>
            {presentation.isAsyncForm && <span className="badge badge--draft">Async Form</span>}
          </div>
          <h1 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800 }}>
            {presentation.title} <span className="text-gradient">Analytics</span>
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button id="download-csv-btn" onClick={handleDownloadCsv} className="export-btn">
            📥 Export CSV
          </button>
          <Link href={`/presentations/${presentation.id}/edit`} className="btn btn--secondary btn--sm">
            ✏ Edit Slides
          </Link>
          <Link href={`/present/${presentation.id}`} className="btn btn--primary btn--sm">
            ▶ Present Live
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="dash-stats" style={{ marginBottom: '36px' }}>
        <div className="dash-stat">
          <div className="dash-stat__value">{totalResponses}</div>
          <div className="dash-stat__label">Total Submissions</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat__value">{uniqueParticipants}</div>
          <div className="dash-stat__label">Unique Voters</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat__value">{slides.length}</div>
          <div className="dash-stat__label">Interactive Slides</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat__value">{sessionCount}</div>
          <div className="dash-stat__label">Live Sessions Run</div>
        </div>
      </div>

      {slides.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem' }}>
            This presentation has no slides yet.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Slide Navigation List */}
          <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>
              Slide Breakdown ({slides.length})
            </span>
            {slides.map((s, idx) => {
              const isActive = idx === activeSlideIdx;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSlideIdx(idx)}
                  className={`slide-list-item ${isActive ? 'slide-list-item--active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderRadius: '10px',
                    background: isActive ? 'rgba(217, 87, 69, 0.16)' : 'rgba(92, 54, 73, 0.04)',
                    border: isActive ? '1px solid var(--color-primary)' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: isActive ? '#fffaf3' : 'var(--color-text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.82rem', color: isActive ? '#b65f78' : 'var(--color-text-muted)' }}>
                      #{idx + 1}
                    </span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                      {s.question}
                    </span>
                  </div>
                  <span className="badge badge--draft" style={{ fontSize: '0.72rem', padding: '2px 6px' }}>
                    {s.responseCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Slide Results Detail */}
          {activeSlide && (
            <div className="card" style={{ padding: '36px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#b65f78' }}>
                    Slide {activeSlide.order + 1} · {activeSlide.type.replace('_', ' ')}
                  </span>
                  <h2 style={{ fontSize: '1.6rem', marginTop: '6px', lineHeight: 1.3 }}>
                    {activeSlide.question}
                  </h2>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                    {activeSlide.responseCount}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Responses
                  </div>
                </div>
              </div>

              {/* Multiple Choice / Ranking Render */}
              {(activeSlide.type === 'multiple_choice' || activeSlide.type === 'ranking') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {activeSlide.options.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>No options defined for this question.</p>
                  ) : (
                    activeSlide.options.map((opt, i) => {
                      const votes = activeSlide.tally[opt] || 0;
                      const percent = activeSlide.responseCount > 0 ? Math.round((votes / activeSlide.responseCount) * 100) : 0;
                      return (
                        <div key={opt} style={{ background: 'rgba(92, 54, 73, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(92, 54, 73, 0.08)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.95rem', fontWeight: 600 }}>
                            <span>
                              <strong style={{ color: '#b65f78', marginRight: '8px' }}>{String.fromCharCode(65 + i)}.</strong>
                              {opt}
                            </span>
                            <span>{votes} votes ({percent}%)</span>
                          </div>
                          <div style={{ height: '14px', background: 'rgba(92, 54, 73, 0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${percent}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #d95745, #b65f78)',
                                borderRadius: '6px',
                                transition: 'width 0.5s ease',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Scales / Hundred Points Render */}
              {(activeSlide.type === 'scales' || activeSlide.type === 'hundred_points') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {Object.keys(activeSlide.tally).length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>No statement responses recorded yet.</p>
                  ) : (
                    Object.entries(activeSlide.tally).map(([statement, score]) => (
                      <div key={statement} style={{ background: 'rgba(92, 54, 73, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(92, 54, 73, 0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.95rem', fontWeight: 600 }}>
                          <span>{statement}</span>
                          <span style={{ color: '#2f8f6b' }}>{score} Total Score / Points</span>
                        </div>
                        <div style={{ height: '10px', background: 'rgba(92, 54, 73, 0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(5, (score / (activeSlide.responseCount || 1)) * 20))}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #2d6d56, #2f8f6b)',
                              borderRadius: '6px',
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Rating Scale / Number Render */}
              {(activeSlide.type === 'rating_scale' || activeSlide.type === 'number' || activeSlide.type === 'rating') && (
                <div style={{ textAlign: 'center', padding: '36px 0' }}>
                  <div style={{ fontSize: '4.5rem', fontWeight: 900, background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>
                    {activeSlide.average !== null ? activeSlide.average : '—'}
                  </div>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '1rem', marginTop: '12px' }}>
                    Average from {activeSlide.responseCount} submission(s)
                  </p>
                  {activeSlide.numericValues.length > 0 && (
                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '24px', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                      <span>Min: <strong>{Math.min(...activeSlide.numericValues)}</strong></span>
                      <span>Max: <strong>{Math.max(...activeSlide.numericValues)}</strong></span>
                      <span>Submissions: <strong>{activeSlide.numericValues.length}</strong></span>
                    </div>
                  )}
                </div>
              )}

              {/* Word Cloud / Open Text / Q&A Render */}
              {(activeSlide.type === 'word_cloud' || activeSlide.type === 'open_text' || activeSlide.type === 'qa') && (
                <div>
                  {activeSlide.textAnswers.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '40px 0' }}>
                      No text answers submitted yet.
                    </p>
                  ) : activeSlide.type === 'word_cloud' ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '20px 0' }}>
                      {activeSlide.textAnswers.map((txt, idx) => (
                        <span
                          key={idx}
                          style={{
                            padding: '8px 16px',
                            background: 'rgba(217,87,69,0.15)',
                            border: '1px solid rgba(217,87,69,0.3)',
                            borderRadius: '100px',
                            fontSize: '1rem',
                            fontWeight: 600,
                            color: '#9c4f73',
                          }}
                        >
                          {txt}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px', marginTop: '16px' }}>
                      {activeSlide.textAnswers.map((txt, idx) => (
                        <div key={idx} style={{ background: 'rgba(92, 54, 73, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(92, 54, 73, 0.08)', fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
                          &ldquo;{txt}&rdquo;
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
