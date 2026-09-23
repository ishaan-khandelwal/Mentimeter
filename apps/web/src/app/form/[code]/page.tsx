'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { getParticipantToken } from '@/lib/participant';
import confetti from 'canvas-confetti';
import Link from 'next/link';

interface Slide {
  id: string;
  order: number;
  type: string;
  question: string;
  options: string[];
  config: Record<string, any>;
}

interface FormPresentation {
  id: string;
  title: string;
  joinCode: string;
  theme?: any;
  isAsyncForm?: boolean;
}

export default function AsyncFormPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();

  const [presentation, setPresentation] = useState<FormPresentation | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const participantToken = useMemo(() => {
    return typeof window !== 'undefined' ? getParticipantToken() : '';
  }, []);

  useEffect(() => {
    async function loadForm() {
      try {
        const res = await fetch(`/api/v1/form/${code}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Form not found or has expired');
        }
        const data = await res.json();
        setPresentation(data.presentation);
        setSlides(data.slides || []);
      } catch (err: any) {
        setError(err.message || 'Error loading form');
      } finally {
        setLoading(false);
      }
    }
    loadForm();
  }, [code]);

  const updateAnswer = (slideId: string, val: any) => {
    setAnswers((prev) => ({ ...prev, [slideId]: val }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/form/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantToken,
          responses: answers,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      } else {
        alert('Failed to submit form. Please try again.');
      }
    } catch (err) {
      console.error('Submission error:', err);
      alert('Error submitting responses.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="spinner spinner--lg" style={{ margin: '0 auto 20px' }} />
        <p style={{ color: 'var(--color-text-muted)' }}>Loading form...</p>
      </div>
    );
  }

  if (error || !presentation) {
    return (
      <div className="container" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <div className="card" style={{ maxWidth: '480px', margin: '0 auto', padding: '40px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📋</div>
          <h2 style={{ marginBottom: '12px' }}>Form Unavailable</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
            {error || 'This presentation form could not be loaded.'}
          </p>
          <Link href="/join" className="btn btn--primary">
            Join Live Session Instead
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="container page-enter" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="card" style={{ maxWidth: '520px', margin: '0 auto', padding: '48px 36px' }}>
          <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🎉</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '12px' }}>
            Thank You!
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.05rem', lineHeight: 1.6, marginBottom: '32px' }}>
            Your responses to <strong>{presentation.title}</strong> have been recorded successfully.
          </p>
          <Link href="/" className="btn btn--primary">
            Back to PollWave
          </Link>
        </div>
      </div>
    );
  }

  // Filter out non-interactive content slides for step navigation or show them as reading cards
  const interactiveSlides = slides;
  const currentSlide = interactiveSlides[currentStep] || null;
  const progressPercent = Math.round(((currentStep + 1) / interactiveSlides.length) * 100);

  return (
    <div className="container page-enter" style={{ padding: '40px 20px 80px', maxWidth: '680px', minHeight: '100vh' }}>
      {/* Top Header */}
      <div style={{ marginBottom: '28px', textAlign: 'center' }}>
        <span className="badge badge--draft" style={{ marginBottom: '8px' }}>
          📋 PollWave Async Form Mode
        </span>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '8px' }}>
          {presentation.title}
        </h1>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
          <span>Question {currentStep + 1} of {interactiveSlides.length}</span>
          <span>{progressPercent}% completed</span>
        </div>
        <div style={{ height: '8px', background: 'rgba(92, 54, 73, 0.08)', borderRadius: '10px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #d95745, #b65f78)',
              borderRadius: '10px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Slide Card */}
      {currentSlide && (
        <div className="card" style={{ padding: '36px 28px', marginBottom: '28px' }}>
          <div style={{ marginBottom: '24px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#b65f78', letterSpacing: '0.08em' }}>
              {currentSlide.type.replace('_', ' ')}
            </span>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 700, marginTop: '6px', lineHeight: 1.35 }}>
              {currentSlide.question}
            </h2>
          </div>

          {/* Multiple Choice */}
          {currentSlide.type === 'multiple_choice' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {currentSlide.options.map((opt) => {
                const isSelected = answers[currentSlide.id] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateAnswer(currentSlide.id, opt)}
                    style={{
                      padding: '16px 20px',
                      borderRadius: '12px',
                      background: isSelected ? 'rgba(217, 87, 69, 0.2)' : 'rgba(92, 54, 73, 0.05)',
                      border: isSelected ? '2px solid #d95745' : '1px solid var(--color-border)',
                      color: isSelected ? '#fffaf3' : 'var(--color-text-primary)',
                      fontWeight: 600,
                      fontSize: '1rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{opt}</span>
                    <span style={{ fontSize: '1.2rem', color: isSelected ? '#b65f78' : 'var(--color-text-muted)' }}>
                      {isSelected ? '●' : '○'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Rating Scale */}
          {currentSlide.type === 'rating_scale' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => updateAnswer(currentSlide.id, star)}
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '14px',
                      fontSize: '1.4rem',
                      fontWeight: 800,
                      background: answers[currentSlide.id] === star ? '#d95745' : 'rgba(92, 54, 73, 0.07)',
                      border: answers[currentSlide.id] === star ? '2px solid #b65f78' : '1px solid var(--color-border)',
                      color: answers[currentSlide.id] === star ? '#fffaf3' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {star}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                <span>{currentSlide.config?.lowLabel || 'Poor'}</span>
                <span>{currentSlide.config?.highLabel || 'Excellent'}</span>
              </div>
            </div>
          )}

          {/* Scales (Likert statement ratings) */}
          {currentSlide.type === 'scales' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {(currentSlide.options || []).map((statement) => {
                const currentVal = answers[currentSlide.id]?.[statement] || 3;
                return (
                  <div key={statement} style={{ background: 'rgba(92, 54, 73, 0.04)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(92, 54, 73, 0.08)' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px' }}>{statement}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      {[1, 2, 3, 4, 5].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            const prevObj = answers[currentSlide.id] || {};
                            updateAnswer(currentSlide.id, { ...prevObj, [statement]: val });
                          }}
                          style={{
                            flex: 1,
                            padding: '10px 0',
                            borderRadius: '8px',
                            background: currentVal === val ? '#d95745' : 'rgba(92, 54, 73, 0.06)',
                            border: currentVal === val ? '1.5px solid #b65f78' : '1px solid var(--color-border)',
                            color: currentVal === val ? '#fffaf3' : 'var(--color-text-secondary)',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 100 Points Budget Allocation */}
          {currentSlide.type === 'hundred_points' && (() => {
            const currentPoints: Record<string, number> = answers[currentSlide.id] || {};
            const totalAllocated = Object.values(currentPoints).reduce((a, b) => a + (Number(b) || 0), 0);
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '0.9rem', fontWeight: 700 }}>
                  <span>Points Allocated:</span>
                  <span style={{ color: totalAllocated === 100 ? '#2f8f6b' : totalAllocated > 100 ? '#ef4444' : '#fbbf24' }}>
                    {totalAllocated} / 100 Points
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {(currentSlide.options || []).map((opt) => {
                    const val = currentPoints[opt] || 0;
                    return (
                      <div key={opt}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                          <span>{opt}</span>
                          <span style={{ fontWeight: 700, color: '#2f8f6b' }}>{val} pts</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={val}
                          onChange={(e) => {
                            const newObj = { ...currentPoints, [opt]: Number(e.target.value) };
                            updateAnswer(currentSlide.id, newObj);
                          }}
                          style={{ width: '100%', accentColor: '#d95745' }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Number Slide */}
          {currentSlide.type === 'number' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <input
                type="number"
                value={answers[currentSlide.id] ?? ''}
                onChange={(e) => updateAnswer(currentSlide.id, Number(e.target.value))}
                placeholder="Enter a number..."
                className="number-input-large"
              />
            </div>
          )}

          {/* Open Text / Word Cloud / Q&A */}
          {(currentSlide.type === 'open_text' || currentSlide.type === 'word_cloud' || currentSlide.type === 'qa') && (
            <div>
              <textarea
                rows={3}
                value={answers[currentSlide.id] || ''}
                onChange={(e) => updateAnswer(currentSlide.id, e.target.value)}
                placeholder={currentSlide.type === 'word_cloud' ? 'Enter a word or phrase...' : 'Type your answer here...'}
                className="form-textarea"
                style={{ fontSize: '1rem', padding: '14px' }}
              />
            </div>
          )}

          {/* Content Slide (Heading/Paragraph/Image/Video) */}
          {(currentSlide.type === 'heading' || currentSlide.type === 'paragraph' || currentSlide.type === 'image' || currentSlide.type === 'video') && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-secondary)' }}>
              {currentSlide.config?.subtitle && <p style={{ fontSize: '1.1rem' }}>{currentSlide.config.subtitle}</p>}
              {currentSlide.config?.body && <p style={{ fontSize: '1rem', lineHeight: 1.6 }}>{currentSlide.config.body}</p>}
            </div>
          )}
        </div>
      )}

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
        <button
          type="button"
          onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
          disabled={currentStep === 0}
          className="btn btn--ghost"
        >
          ← Previous
        </button>

        {currentStep < interactiveSlides.length - 1 ? (
          <button
            type="button"
            onClick={() => setCurrentStep((prev) => Math.min(interactiveSlides.length - 1, prev + 1))}
            className="btn btn--primary"
          >
            Next Question →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="btn btn--primary"
            style={{ background: 'linear-gradient(135deg, #3f9a73, #2d6d56)', borderColor: '#3f9a73' }}
          >
            {submitting ? 'Submitting...' : '✓ Submit All Responses'}
          </button>
        )}
      </div>
    </div>
  );
}
