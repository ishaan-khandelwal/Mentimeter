'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type SlideType = 'multiple_choice' | 'word_cloud' | 'open_text' | 'rating_scale' | 'ranking' | 'qa';

interface SlideData {
  _id: string;
  presentationId: string;
  type: SlideType;
  question: string;
  order: number;
  options?: string[];
  config?: Record<string, any>;
}

interface PresentationData {
  _id: string;
  title: string;
  joinCode: string;
  status: string;
}

export default function PresentationEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // AI Modal states
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(3);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const createInitialSlide = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/presentations/${id}/slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'multiple_choice',
          question: 'What is your main goal for today?',
          options: ['Learn new insights', 'Network with peers', 'Ask questions', 'Get inspired'],
          config: { allowMultiple: false },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSlides([data.slide]);
      }
    } catch (err) {
      console.error('Error creating initial slide:', err);
    }
  }, [id]);

  // Load presentation and slides
  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/presentations/${id}`);
      if (!res.ok) {
        if (res.status === 401) router.push('/login');
        return;
      }
      const data = await res.json();
      setPresentation(data.presentation);
      setSlides(data.slides || []);
      if ((data.slides || []).length === 0) {
        // Create an initial slide if none exists
        createInitialSlide();
      }
    } catch (err) {
      console.error('Error loading presentation:', err);
    } finally {
      setLoading(false);
    }
  }, [id, router, createInitialSlide]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeSlide = slides[activeSlideIndex] || null;

  // Update active slide field
  const updateActiveSlide = (fields: Partial<SlideData>) => {
    if (!activeSlide) return;
    setSlides((prev) => {
      const copy = [...prev];
      copy[activeSlideIndex] = { ...copy[activeSlideIndex], ...fields };
      return copy;
    });
    setSaveStatus('idle');
  };

  // Save current slide to database
  const saveSlide = async (slide: SlideData) => {
    setSaving(true);
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/v1/slides/${slide._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: slide.type,
          question: slide.question,
          options: slide.options || [],
          config: slide.config || {},
        }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // Add new slide
  const handleAddSlide = async (type: SlideType = 'multiple_choice') => {
    try {
      const defaultQuestions: Record<SlideType, { question: string; options?: string[]; config?: any }> = {
        multiple_choice: {
          question: 'New Multiple Choice Question',
          options: ['Option 1', 'Option 2', 'Option 3'],
          config: { allowMultiple: false },
        },
        word_cloud: {
          question: 'Describe your thoughts in one word',
          options: [],
          config: { maxEntries: 3 },
        },
        open_text: {
          question: 'What thoughts or feedback would you like to share?',
          options: [],
          config: {},
        },
        rating_scale: {
          question: 'How would you rate this session so far?',
          options: [],
          config: { min: 1, max: 5, lowLabel: 'Needs Work', highLabel: 'Outstanding' },
        },
        ranking: {
          question: 'Rank these items in order of priority',
          options: ['Item A', 'Item B', 'Item C'],
          config: {},
        },
        qa: {
          question: 'Ask any questions for our Q&A session',
          options: [],
          config: { allowAnonymous: true, moderated: false },
        },
      };

      const preset = defaultQuestions[type];
      const res = await fetch(`/api/v1/presentations/${id}/slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          question: preset.question,
          options: preset.options || [],
          config: preset.config || {},
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSlides((prev) => [...prev, data.slide]);
        setActiveSlideIndex(slides.length);
      }
    } catch (err) {
      console.error('Error adding slide:', err);
    }
  };

  // Delete slide
  const handleDeleteSlide = async (slideId: string, index: number) => {
    if (slides.length <= 1) {
      alert('Your presentation must have at least one slide.');
      return;
    }
    if (!confirm('Are you sure you want to delete this slide?')) return;

    try {
      const res = await fetch(`/api/v1/slides/${slideId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const nextSlides = slides.filter((s) => s._id !== slideId);
        setSlides(nextSlides);
        if (activeSlideIndex >= nextSlides.length) {
          setActiveSlideIndex(Math.max(0, nextSlides.length - 1));
        }
      }
    } catch (err) {
      console.error('Error deleting slide:', err);
    }
  };

  // Reorder slides
  const handleMoveSlide = async (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= slides.length) return;

    const newSlides = [...slides];
    const [moved] = newSlides.splice(fromIndex, 1);
    newSlides.splice(toIndex, 0, moved);

    setSlides(newSlides);
    setActiveSlideIndex(toIndex);

    // Call reorder API
    try {
      await fetch(`/api/v1/presentations/${id}/slides/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideIds: newSlides.map((s) => s._id),
        }),
      });
    } catch (err) {
      console.error('Failed to sync slide order:', err);
    }
  };

  // Update presentation title
  const handleTitleChange = async (newTitle: string) => {
    if (!presentation) return;
    setPresentation({ ...presentation, title: newTitle });
    try {
      await fetch(`/api/v1/presentations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (err) {
      console.error('Error updating title:', err);
    }
  };

  // Generate slides with AI
  const handleGenerateAi = async () => {
    if (!aiTopic.trim() || aiGenerating) return;
    setAiGenerating(true);
    setAiError(null);

    try {
      const res = await fetch('/api/v1/ai/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: aiTopic.trim(), count: aiCount }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate slides');
      }

      // Add each generated slide
      for (const item of data.slides) {
        const slideRes = await fetch(`/api/v1/presentations/${id}/slides`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: item.type || 'multiple_choice',
            question: item.question,
            options: item.options || [],
            config: {},
          }),
        });
        if (slideRes.ok) {
          const slideData = await slideRes.json();
          setSlides((prev) => [...prev, slideData.slide]);
        }
      }

      setShowAiModal(false);
      setAiTopic('');
    } catch (err: any) {
      setAiError(err.message || 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="nav-skeleton" style={{ width: '240px', height: '40px', margin: '0 auto 20px' }} />
        <p style={{ color: 'var(--color-text-muted)' }}>Loading presentation editor...</p>
      </div>
    );
  }

  const slideTypeIcons: Record<SlideType, string> = {
    multiple_choice: '📊',
    word_cloud: '☁️',
    open_text: '💬',
    rating_scale: '⭐',
    ranking: '🏆',
    qa: '❓',
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid var(--color-border)',
          background: 'rgba(19, 19, 31, 0.95)',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/dashboard" className="btn btn--ghost btn--sm">
            ← Dashboard
          </Link>
          <input
            type="text"
            value={presentation?.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: '6px',
              color: 'var(--color-text-primary)',
              fontSize: '1.15rem',
              fontWeight: 700,
              padding: '4px 8px',
              outline: 'none',
              maxWidth: '360px',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-border)')}
            onBlur={(e) => (e.target.style.borderColor = 'transparent')}
          />
          <span className="badge badge--primary">Code: {presentation?.joinCode}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setShowAiModal(true)}
            className="btn btn--secondary btn--sm"
          >
            ✨ AI Slide Generator
          </button>

          {activeSlide && (
            <button
              onClick={() => saveSlide(activeSlide)}
              disabled={saving}
              className="btn btn--ghost btn--sm"
            >
              {saveStatus === 'saving'
                ? '💾 Saving...'
                : saveStatus === 'saved'
                ? '✓ Saved!'
                : 'Save Changes'}
            </button>
          )}

          <Link href={`/present/${id}`} className="btn btn--primary btn--sm">
            ▶ Present Live
          </Link>
        </div>
      </div>

      {/* Main Workspace: Sidebar + Editor */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', flex: 1, minHeight: 0 }}>
        {/* Left Sidebar: Slides List */}
        <div
          style={{
            borderRight: '1px solid var(--color-border)',
            background: 'var(--color-bg-2)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Slides ({slides.length})
            </span>
            <button
              onClick={() => handleAddSlide('multiple_choice')}
              className="btn btn--secondary btn--sm"
              title="Add slide"
            >
              ＋ Add
            </button>
          </div>

          {slides.map((s, index) => {
            const isActive = index === activeSlideIndex;
            return (
              <div
                key={s._id}
                onClick={() => setActiveSlideIndex(index)}
                className={`slide-list-item ${isActive ? 'slide-list-item--active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: isActive ? 'rgba(124, 92, 252, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: isActive
                    ? '1px solid rgba(124, 92, 252, 0.4)'
                    : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                    {index + 1}
                  </span>
                  <span>{slideTypeIcons[s.type] || '📄'}</span>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '120px',
                    }}
                  >
                    {s.question || 'Untitled'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveSlide(index, 'up');
                    }}
                    disabled={index === 0}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                    title="Move Up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveSlide(index, 'down');
                    }}
                    disabled={index === slides.length - 1}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                    title="Move Down"
                  >
                    ▼
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSlide(s._id, index);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#f87171',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                    title="Delete slide"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Editor Area */}
        <div style={{ padding: '32px', overflowY: 'auto' }}>
          {activeSlide ? (
            <div style={{ maxWidth: '780px', margin: '0 auto' }}>
              {/* Slide Type Switcher */}
              <div style={{ marginBottom: '24px' }}>
                <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                  Question Type
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(
                    [
                      ['multiple_choice', '📊 Multiple Choice'],
                      ['word_cloud', '☁️ Word Cloud'],
                      ['open_text', '💬 Open Text'],
                      ['rating_scale', '⭐ Rating Scale'],
                      ['ranking', '🏆 Ranking'],
                      ['qa', '❓ Live Q&A'],
                    ] as [SlideType, string][]
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updateActiveSlide({ type: t })}
                      className={`btn btn--sm ${
                        activeSlide.type === t ? 'btn--primary' : 'btn--ghost'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question Input */}
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label">Question / Prompt</label>
                <input
                  type="text"
                  value={activeSlide.question}
                  onChange={(e) => updateActiveSlide({ question: e.target.value })}
                  placeholder="What would you like to ask your audience?"
                  className="form-input"
                  style={{ fontSize: '1.1rem', fontWeight: 600, padding: '14px 18px' }}
                />
              </div>

              {/* Multiple Choice Options */}
              {activeSlide.type === 'multiple_choice' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                    Options
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(activeSlide.options || []).map((opt, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span
                          style={{
                            width: '24px',
                            color: 'var(--color-text-muted)',
                            fontWeight: 700,
                            textAlign: 'center',
                          }}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...(activeSlide.options || [])];
                            newOpts[i] = e.target.value;
                            updateActiveSlide({ options: newOpts });
                          }}
                          placeholder={`Option ${i + 1}`}
                          className="form-input"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newOpts = (activeSlide.options || []).filter((_, idx) => idx !== i);
                            updateActiveSlide({ options: newOpts });
                          }}
                          className="btn btn--danger btn--sm"
                          disabled={(activeSlide.options || []).length <= 2}
                          title="Remove option"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const newOpts = [...(activeSlide.options || []), `Option ${(activeSlide.options || []).length + 1}`];
                        updateActiveSlide({ options: newOpts });
                      }}
                      className="btn btn--secondary btn--sm"
                    >
                      ＋ Add Option
                    </button>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={activeSlide.config?.allowMultiple || false}
                        onChange={(e) =>
                          updateActiveSlide({
                            config: { ...activeSlide.config, allowMultiple: e.target.checked },
                          })
                        }
                      />
                      Allow participants to select multiple options
                    </label>
                  </div>
                </div>
              )}

              {/* Word Cloud Settings */}
              {activeSlide.type === 'word_cloud' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                    Word Cloud Settings
                  </label>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
                    Audience submissions appear dynamically in a live interactive word cloud.
                  </p>
                  <div className="form-group" style={{ maxWidth: '280px' }}>
                    <label className="form-label">Max entries per participant</label>
                    <select
                      className="form-select"
                      value={activeSlide.config?.maxEntries || 3}
                      onChange={(e) =>
                        updateActiveSlide({
                          config: { ...activeSlide.config, maxEntries: Number(e.target.value) },
                        })
                      }
                    >
                      <option value="1">1 word</option>
                      <option value="2">2 words</option>
                      <option value="3">3 words</option>
                      <option value="5">5 words</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Rating Scale Settings */}
              {activeSlide.type === 'rating_scale' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                    Rating Scale Settings
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">Low Label (Score 1)</label>
                      <input
                        type="text"
                        value={activeSlide.config?.lowLabel || 'Poor'}
                        onChange={(e) =>
                          updateActiveSlide({
                            config: { ...activeSlide.config, lowLabel: e.target.value },
                          })
                        }
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">High Label (Max Score)</label>
                      <input
                        type="text"
                        value={activeSlide.config?.highLabel || 'Excellent'}
                        onChange={(e) =>
                          updateActiveSlide({
                            config: { ...activeSlide.config, highLabel: e.target.value },
                          })
                        }
                        className="form-input"
                      />
                    </div>
                  </div>
                  <div className="form-group" style={{ maxWidth: '200px' }}>
                    <label className="form-label">Scale Range</label>
                    <select
                      className="form-select"
                      value={activeSlide.config?.max || 5}
                      onChange={(e) =>
                        updateActiveSlide({
                          config: { ...activeSlide.config, max: Number(e.target.value) },
                        })
                      }
                    >
                      <option value="5">1 to 5 Stars</option>
                      <option value="10">1 to 10 Scale</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Ranking Items */}
              {activeSlide.type === 'ranking' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                    Items to Rank
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(activeSlide.options || []).map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                          #{i + 1}
                        </span>
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const newOpts = [...(activeSlide.options || [])];
                            newOpts[i] = e.target.value;
                            updateActiveSlide({ options: newOpts });
                          }}
                          placeholder={`Item ${i + 1}`}
                          className="form-input"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newOpts = (activeSlide.options || []).filter((_, idx) => idx !== i);
                            updateActiveSlide({ options: newOpts });
                          }}
                          className="btn btn--danger btn--sm"
                          disabled={(activeSlide.options || []).length <= 2}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const newOpts = [...(activeSlide.options || []), `Item ${(activeSlide.options || []).length + 1}`];
                      updateActiveSlide({ options: newOpts });
                    }}
                    className="btn btn--secondary btn--sm"
                    style={{ marginTop: '16px' }}
                  >
                    ＋ Add Item
                  </button>
                </div>
              )}

              {/* Q&A Settings */}
              {activeSlide.type === 'qa' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                    Live Q&A Options
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={activeSlide.config?.allowAnonymous ?? true}
                        onChange={(e) =>
                          updateActiveSlide({
                            config: { ...activeSlide.config, allowAnonymous: e.target.checked },
                          })
                        }
                      />
                      <span>Allow audience to submit questions anonymously</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={activeSlide.config?.moderated ?? false}
                        onChange={(e) =>
                          updateActiveSlide({
                            config: { ...activeSlide.config, moderated: e.target.checked },
                          })
                        }
                      />
                      <span>Enable question moderation (presenter approves before showing)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Open Text Information */}
              {activeSlide.type === 'open_text' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                    Open Text Feedback
                  </label>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                    Participants will see a free-form text input and can submit responses in real time.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
              Select a slide or click ＋ Add to create one.
            </div>
          )}
        </div>
      </div>

      {/* AI Slide Generator Modal */}
      {showAiModal && (
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
          onClick={() => setShowAiModal(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '520px', padding: '32px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '1.5rem' }}>✨</span>
              <h2 style={{ fontSize: '1.35rem' }}>AI Slide Generator</h2>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Powered by Claude. Describe your meeting, presentation topic, or workshop, and we&apos;ll create engaging interactive poll questions.
            </p>

            {aiError && (
              <div className="auth-alert auth-alert--error" style={{ marginBottom: '16px' }}>
                <span>⚠️</span>
                <span>{aiError}</span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">Presentation Topic or Goal</label>
              <textarea
                rows={3}
                placeholder="e.g. Quarterly Team Retrospective: what went well, challenges, and team morale"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                className="form-textarea"
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">Number of Interactive Slides</label>
              <select
                value={aiCount}
                onChange={(e) => setAiCount(Number(e.target.value))}
                className="form-select"
              >
                <option value="2">2 slides</option>
                <option value="3">3 slides</option>
                <option value="4">4 slides</option>
                <option value="5">5 slides</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="btn btn--ghost"
                disabled={aiGenerating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateAi}
                disabled={aiGenerating || !aiTopic.trim()}
                className="btn btn--primary"
              >
                {aiGenerating ? 'Generating Slides...' : '✨ Generate & Add Slides'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
