'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

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

interface SlideData {
  _id: string;
  presentationId: string;
  type: SlideType;
  question: string;
  order: number;
  options?: string[];
  config?: Record<string, any>;
  hideResults?: boolean;
  timerSeconds?: number | null;
  maxVotes?: number;
}

interface PresentationData {
  _id: string;
  title: string;
  joinCode: string;
  status: string;
  theme?: any;
  isAsyncForm?: boolean;
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
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Create Question Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<SlideType>('multiple_choice');
  const [createQuestion, setCreateQuestion] = useState('');
  const [createOptions, setCreateOptions] = useState<string[]>([
    'Option 1',
    'Option 2',
    'Option 3',
    'Option 4',
  ]);
  const [createCorrectAnswer, setCreateCorrectAnswer] = useState<string | string[] | null>('Option 1');
  const [createAllowMultiple, setCreateAllowMultiple] = useState(false);
  const [createDurationSeconds, setCreateDurationSeconds] = useState(20);
  const [createCreating, setCreateCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Theme Modal and Editor Mode states
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');

  const openCreateQuestionModal = (type: SlideType = 'multiple_choice') => {
    setCreateType(type);
    setCreateQuestion(
      type === 'multiple_choice'
        ? 'What is the correct answer to this question?'
        : type === 'word_cloud'
        ? 'Describe your thoughts in one word'
        : type === 'open_text'
        ? 'What is your response or answer?'
        : type === 'rating_scale'
        ? 'How would you rate this?'
        : type === 'ranking'
        ? 'Rank these items in priority order'
        : 'Ask your question for our Q&A session'
    );
    setCreateOptions(
      type === 'multiple_choice'
        ? ['Option A', 'Option B', 'Option C', 'Option D']
        : type === 'ranking'
        ? ['First Item', 'Second Item', 'Third Item']
        : []
    );
    setCreateCorrectAnswer(type === 'multiple_choice' ? 'Option A' : null);
    setCreateAllowMultiple(false);
    setCreateDurationSeconds(20);
    setCreateError(null);
    setShowCreateModal(true);
  };

  const handleConfirmCreateQuestion = async () => {
    if (!createQuestion.trim()) {
      setCreateError('Please enter a question or prompt.');
      return;
    }

    const trimmedOptions = (createType === 'multiple_choice' || createType === 'ranking')
      ? createOptions.map((o) => o.trim()).filter(Boolean)
      : [];

    if (createType === 'multiple_choice' && trimmedOptions.length < 2) {
      setCreateError('Please provide at least 2 non-empty options.');
      return;
    }

    setCreateCreating(true);
    setCreateError(null);

    try {
      const config: Record<string, any> = {
        durationSeconds: createDurationSeconds,
      };

      if (createType === 'multiple_choice') {
        config.allowMultiple = createAllowMultiple;
        if (createCorrectAnswer) {
          if (Array.isArray(createCorrectAnswer)) {
            const valid = createCorrectAnswer.filter((ans) => trimmedOptions.includes(ans));
            config.correctAnswer = valid.length > 0 ? valid : null;
          } else if (trimmedOptions.includes(createCorrectAnswer)) {
            config.correctAnswer = createCorrectAnswer;
          } else if (trimmedOptions.length > 0) {
            config.correctAnswer = trimmedOptions[0];
          }
        }
      } else if (createType === 'open_text') {
        if (typeof createCorrectAnswer === 'string' && createCorrectAnswer.trim()) {
          config.correctAnswer = createCorrectAnswer.trim();
        }
      } else if (createType === 'word_cloud') {
        config.maxEntries = 3;
      } else if (createType === 'rating_scale') {
        config.min = 1;
        config.max = 5;
        config.lowLabel = 'Needs Work';
        config.highLabel = 'Outstanding';
      } else if (createType === 'qa') {
        config.allowAnonymous = true;
        config.moderated = false;
      }

      const res = await fetch(`/api/v1/presentations/${id}/slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: createType,
          question: createQuestion.trim(),
          options: trimmedOptions,
          config,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSlides((prev) => [...prev, data.slide]);
        setActiveSlideIndex(slides.length);
        setShowCreateModal(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        setCreateError(errData.error || 'Failed to create question.');
      }
    } catch (err: any) {
      setCreateError(err?.message || 'Error creating question.');
    } finally {
      setCreateCreating(false);
    }
  };

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
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Save current slide to database
  const saveSlide = async (slide: SlideData) => {
    if (!slide?._id) return;
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
          hideResults: slide.hideResults,
          timerSeconds: slide.timerSeconds,
          maxVotes: slide.maxVotes,
        }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2500);
      } else {
        setSaveStatus('idle');
      }
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('idle');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicateSlide = async (slideId: string) => {
    try {
      const res = await fetch(`/api/v1/slides/${slideId}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSlides((prev) => {
          const next = [...prev];
          const idx = next.findIndex((s) => s._id === slideId);
          if (idx >= 0) {
            next.splice(idx + 1, 0, data.slide);
          } else {
            next.push(data.slide);
          }
          return next;
        });
      }
    } catch (err) {
      console.error('Error duplicating slide:', err);
    }
  };

  const handleUpdateTheme = async (themeObj: any) => {
    if (!presentation) return;
    const merged = { ...(presentation.theme || {}), ...themeObj };
    setPresentation({ ...presentation, theme: merged });
    try {
      await fetch(`/api/v1/presentations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: merged }),
      });
    } catch (err) {
      console.error('Error updating theme:', err);
    }
  };

  const handleToggleFormMode = async () => {
    if (!presentation) return;
    const newVal = !presentation.isAsyncForm;
    setPresentation({ ...presentation, isAsyncForm: newVal });
    try {
      await fetch(`/api/v1/presentations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAsyncForm: newVal }),
      });
    } catch (err) {
      console.error('Error toggling form mode:', err);
    }
  };

  // Debounced auto-save (triggers 600ms after user stops typing)
  const debouncedSave = useCallback((slide: SlideData) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setSaveStatus('saving');
    saveTimeoutRef.current = setTimeout(() => {
      saveSlide(slide);
    }, 600);
  }, []);

  // Update active slide field with automatic background save
  const updateActiveSlide = (fields: Partial<SlideData>) => {
    if (!activeSlide) return;
    const updatedSlide = { ...activeSlide, ...fields };
    setSlides((prev) => {
      const copy = [...prev];
      copy[activeSlideIndex] = updatedSlide;
      return copy;
    });
    debouncedSave(updatedSlide);
  };

  // Ensure latest changes are saved before opening Present Live
  const handlePresentLive = async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (activeSlide) {
      await saveSlide(activeSlide);
    }
    router.push(`/present/${id}`);
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
        scales: {
          question: 'How strongly do you agree with these statements?',
          options: ['Our goals are clear and achievable', 'Team collaboration is seamless', 'We have the right tools'],
          config: { lowLabel: 'Strongly Disagree', highLabel: 'Strongly Agree' },
        },
        hundred_points: {
          question: 'Distribute 100 points across our priorities:',
          options: ['Feature A', 'Feature B', 'Feature C', 'Technical Debt'],
          config: {},
        },
        number: {
          question: 'Guess the exact number or estimate:',
          options: [],
          config: { min: 0, max: 1000, step: 1 },
        },
        heading: {
          question: 'Presentation Title or Section',
          options: [],
          config: { subtitle: 'Add a subtitle or introduction for your audience' },
        },
        paragraph: {
          question: 'Key Summary & Insights',
          options: [],
          config: { body: 'Write any important notes, takeaways, or instructions here.' },
        },
        image: {
          question: 'Feature Showcase Image',
          options: [],
          config: { imageUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80', caption: 'Overview diagram' },
        },
        video: {
          question: 'Video Showcase',
          options: [],
          config: { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        },
        bullets: {
          question: 'Key Objectives & Takeaways',
          options: ['First primary takeaway', 'Second important milestone', 'Action steps going forward'],
          config: {},
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
        body: JSON.stringify({ topic: aiTopic.trim(), count: aiCount, difficulty: aiDifficulty }),
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
            config: item.config || (item.correctAnswer ? { correctAnswer: item.correctAnswer, durationSeconds: 20 } : {}),
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
    scales: '⚖️',
    hundred_points: '💯',
    number: '🔢',
    heading: '🏷️',
    paragraph: '📝',
    image: '🖼️',
    video: '🎬',
    bullets: '📋',
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
          background: 'rgba(241, 231, 220, 0.95)',
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
              maxWidth: '300px',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-border)')}
            onBlur={(e) => (e.target.style.borderColor = 'transparent')}
          />
          <span className="badge badge--primary">Code: {presentation?.joinCode}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowThemeModal(true)}
            className="btn btn--ghost btn--sm"
            title="Customize presentation colors, fonts, and themes"
          >
            🎨 Theme
          </button>

          <button
            type="button"
            onClick={handleToggleFormMode}
            className={`btn btn--sm ${presentation?.isAsyncForm ? 'btn--primary' : 'btn--ghost'}`}
            title="Toggle Async Form Mode (participants can answer without live session)"
          >
            📋 {presentation?.isAsyncForm ? 'Form: Active' : 'Form Mode'}
          </button>

          <Link
            href={`/presentations/${id}/results`}
            className="btn btn--ghost btn--sm"
            title="View Analytics & Responses"
          >
            📊 Results
          </Link>

          <button
            type="button"
            onClick={() => setEditorMode((prev) => (prev === 'edit' ? 'preview' : 'edit'))}
            className={`btn btn--sm ${editorMode === 'preview' ? 'btn--primary' : 'btn--secondary'}`}
            title="Toggle live presentation canvas preview"
          >
            {editorMode === 'preview' ? '✏ Edit Mode' : '👁 Preview'}
          </button>

          <button
            onClick={() => setShowAiModal(true)}
            className="btn btn--secondary btn--sm"
          >
            ✨ AI Generator
          </button>

          {activeSlide && (
            <button
              onClick={() => saveSlide(activeSlide)}
              disabled={saving}
              className={`btn btn--sm ${saveStatus === 'saved' ? 'btn--ghost' : 'btn--secondary'}`}
              style={{ minWidth: '100px' }}
            >
              {saveStatus === 'saving'
                ? '💾 Saving...'
                : saveStatus === 'saved'
                ? '✓ Saved!'
                : 'Save Changes'}
            </button>
          )}

          <button onClick={handlePresentLive} className="btn btn--primary btn--sm">
            ▶ Present Live
          </button>
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
              onClick={() => openCreateQuestionModal('multiple_choice')}
              className="btn btn--primary btn--sm"
              title="Create new question with correct answer options"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', padding: '6px 10px' }}
            >
              ＋ Add Question
            </button>
          </div>

          {slides.map((s, index) => {
            const isActive = index === activeSlideIndex;
            return (
              <div
                key={s._id}
                onClick={() => {
                  if (activeSlide && saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                    saveSlide(activeSlide);
                  }
                  setActiveSlideIndex(index);
                }}
                className={`slide-list-item ${isActive ? 'slide-list-item--active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: isActive ? 'rgba(217, 87, 69, 0.15)' : 'rgba(92, 54, 73, 0.05)',
                  border: isActive
                    ? '1px solid rgba(217, 87, 69, 0.4)'
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
                      maxWidth: s.config?.correctAnswer ? '80px' : '120px',
                    }}
                  >
                    {s.question || 'Untitled'}
                  </span>
                  {s.config?.correctAnswer && (
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        background: 'rgba(34, 197, 94, 0.15)',
                        color: '#2f8f6b',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                      }}
                      title={`Correct answer: ${Array.isArray(s.config.correctAnswer) ? s.config.correctAnswer.join(', ') : s.config.correctAnswer}`}
                    >
                      ✓ Quiz
                    </span>
                  )}
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
                      handleDuplicateSlide(s._id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                    title="Duplicate slide"
                  >
                    ⎘
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Slide Type</label>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Interactive &amp; Content Slides</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(
                    [
                      ['multiple_choice', '📊 Multiple Choice'],
                      ['word_cloud', '☁️ Word Cloud'],
                      ['scales', '⚖️ Scales (Likert)'],
                      ['hundred_points', '💯 100 Points'],
                      ['number', '🔢 Number'],
                      ['rating_scale', '⭐ Rating'],
                      ['ranking', '🏆 Ranking'],
                      ['open_text', '💬 Open Text'],
                      ['qa', '❓ Live Q&A'],
                      ['heading', '🏷️ Heading'],
                      ['paragraph', '📝 Paragraph'],
                      ['image', '🖼️ Image'],
                      ['video', '🎬 Video'],
                      ['bullets', '📋 Bullets'],
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
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">
                  {['heading', 'paragraph', 'image', 'video', 'bullets'].includes(activeSlide.type) ? 'Slide Heading / Title' : 'Question / Prompt'}
                </label>
                <input
                  type="text"
                  value={activeSlide.question}
                  onChange={(e) => updateActiveSlide({ question: e.target.value })}
                  placeholder={['heading', 'paragraph', 'image', 'video', 'bullets'].includes(activeSlide.type) ? 'Enter slide title...' : 'What would you like to ask your audience?'}
                  className="form-input"
                  style={{ fontSize: '1.1rem', fontWeight: 600, padding: '14px 18px' }}
                />
              </div>

              {/* Per-Slide Config Card (Mentimeter style) */}
              <div className="card" style={{ padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(92, 54, 73, 0.04)' }}>
                {/* Hide Results Toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={activeSlide.hideResults || false}
                    onChange={(e) => updateActiveSlide({ hideResults: e.target.checked })}
                  />
                  <span>🙈 Hide results until revealed</span>
                </label>

                {/* Per-Slide Timer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>⏱️ Timer:</span>
                  <select
                    className="form-select"
                    style={{ padding: '4px 8px', fontSize: '0.82rem', width: 'auto' }}
                    value={activeSlide.timerSeconds ?? ''}
                    onChange={(e) => updateActiveSlide({ timerSeconds: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">No timer</option>
                    <option value="15">15 seconds</option>
                    <option value="20">20 seconds</option>
                    <option value="30">30 seconds</option>
                    <option value="60">60 seconds</option>
                    <option value="90">90 seconds</option>
                    <option value="120">2 minutes</option>
                  </select>
                </div>

                {/* Max Votes for Multiple Choice */}
                {activeSlide.type === 'multiple_choice' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Max choices:</span>
                    <select
                      className="form-select"
                      style={{ padding: '4px 8px', fontSize: '0.82rem', width: 'auto' }}
                      value={activeSlide.maxVotes || 1}
                      onChange={(e) => updateActiveSlide({ maxVotes: Number(e.target.value) })}
                    >
                      <option value="1">1 choice (Single vote)</option>
                      <option value="2">Up to 2 choices</option>
                      <option value="3">Up to 3 choices</option>
                      <option value="5">Up to 5 choices</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Multiple Choice Options & Correct Answer */}
              {activeSlide.type === 'multiple_choice' && (() => {
                const isOptionCorrect = (opt: string) => {
                  if (!activeSlide.config?.correctAnswer) return false;
                  if (Array.isArray(activeSlide.config.correctAnswer)) {
                    return activeSlide.config.correctAnswer.includes(opt);
                  }
                  return activeSlide.config.correctAnswer === opt;
                };

                const toggleOptionCorrect = (opt: string) => {
                  const isMulti = activeSlide.config?.allowMultiple;
                  if (isMulti) {
                    const currentList: string[] = Array.isArray(activeSlide.config?.correctAnswer)
                      ? [...activeSlide.config.correctAnswer]
                      : activeSlide.config?.correctAnswer
                      ? [activeSlide.config.correctAnswer]
                      : [];
                    const idx = currentList.indexOf(opt);
                    if (idx >= 0) {
                      currentList.splice(idx, 1);
                    } else {
                      currentList.push(opt);
                    }
                    updateActiveSlide({
                      config: {
                        ...activeSlide.config,
                        correctAnswer: currentList.length > 0 ? currentList : null,
                      },
                    });
                  } else {
                    const isAlready = activeSlide.config?.correctAnswer === opt;
                    updateActiveSlide({
                      config: {
                        ...activeSlide.config,
                        correctAnswer: isAlready ? null : opt,
                      },
                    });
                  }
                };

                return (
                  <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                    {/* Correct Answer Header & Quick Selector */}
                    <div
                      style={{
                        padding: '16px',
                        borderRadius: '12px',
                        background: activeSlide.config?.correctAnswer
                          ? 'rgba(34, 197, 94, 0.08)'
                          : 'rgba(92, 54, 73, 0.05)',
                        border: activeSlide.config?.correctAnswer
                          ? '1px solid rgba(34, 197, 94, 0.35)'
                          : '1px solid var(--color-border)',
                        marginBottom: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.2rem' }}>🎯</span>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '0.98rem' }}>Quiz Correct Answer</span>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                              {activeSlide.config?.correctAnswer ? (
                                <span style={{ color: '#2f8f6b', fontWeight: 600 }}>
                                  ✓ Correct answer saved:{' '}
                                  {Array.isArray(activeSlide.config.correctAnswer)
                                    ? activeSlide.config.correctAnswer.join(', ')
                                    : activeSlide.config.correctAnswer}
                                </span>
                              ) : (
                                <span>No correct answer selected (Survey mode — all answers give participation points).</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quick Dropdown for Single Choice */}
                        {!activeSlide.config?.allowMultiple && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                              Choose Answer:
                            </span>
                            <select
                              className="form-select"
                              style={{ padding: '6px 12px', fontSize: '0.82rem', width: 'auto', borderRadius: '8px' }}
                              value={typeof activeSlide.config?.correctAnswer === 'string' ? activeSlide.config.correctAnswer : ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateActiveSlide({
                                  config: {
                                    ...activeSlide.config,
                                    correctAnswer: val ? val : null,
                                  },
                                });
                              }}
                            >
                              <option value="">-- None (Survey Mode) --</option>
                              {(activeSlide.options || []).map((opt, i) => (
                                <option key={i} value={opt}>
                                  Option {String.fromCharCode(65 + i)}: {opt || `(Option ${i + 1})`}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                      Options & Correct Answer Designation
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(activeSlide.options || []).map((opt, i) => {
                        const isCorrect = isOptionCorrect(opt);
                        return (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              gap: '10px',
                              alignItems: 'center',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              background: isCorrect ? 'rgba(34, 197, 94, 0.1)' : 'rgba(92, 54, 73, 0.04)',
                              border: isCorrect ? '1.5px solid #3f9a73' : '1px solid var(--color-border)',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <span
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: isCorrect ? '#3f9a73' : 'rgba(92, 54, 73, 0.08)',
                                color: isCorrect ? '#3f2940' : 'var(--color-text-secondary)',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.85rem',
                                flexShrink: 0,
                              }}
                            >
                              {String.fromCharCode(65 + i)}
                            </span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const newOpts = [...(activeSlide.options || [])];
                                const oldVal = newOpts[i];
                                const newVal = e.target.value;
                                newOpts[i] = newVal;

                                let updatedConfig = activeSlide.config || {};
                                if (Array.isArray(updatedConfig.correctAnswer)) {
                                  updatedConfig = {
                                    ...updatedConfig,
                                    correctAnswer: updatedConfig.correctAnswer.map((ans: string) =>
                                      ans === oldVal ? newVal : ans
                                    ),
                                  };
                                } else if (updatedConfig.correctAnswer === oldVal) {
                                  updatedConfig = {
                                    ...updatedConfig,
                                    correctAnswer: newVal,
                                  };
                                }

                                updateActiveSlide({
                                  options: newOpts,
                                  config: updatedConfig,
                                });
                              }}
                              placeholder={`Option ${i + 1}`}
                              className="form-input"
                              style={{ flex: 1 }}
                            />
                            <button
                              type="button"
                              onClick={() => toggleOptionCorrect(opt)}
                              className={`btn btn--sm ${isCorrect ? 'btn--primary' : 'btn--ghost'}`}
                              style={{
                                whiteSpace: 'nowrap',
                                fontSize: '0.8rem',
                                fontWeight: isCorrect ? 700 : 500,
                                background: isCorrect ? '#2f8f6b' : 'rgba(92, 54, 73, 0.07)',
                                borderColor: isCorrect ? '#3f9a73' : 'var(--color-border)',
                                color: isCorrect ? '#fffaf3' : 'var(--color-text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                minWidth: '125px',
                                justifyContent: 'center',
                              }}
                              title="Click to toggle whether this option is the correct answer"
                            >
                              {isCorrect ? '✓ Correct Answer' : '○ Mark Correct'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const newOpts = (activeSlide.options || []).filter((_, idx) => idx !== i);
                                let updatedConfig = activeSlide.config || {};
                                if (Array.isArray(updatedConfig.correctAnswer)) {
                                  const filtered = updatedConfig.correctAnswer.filter((ans: string) => ans !== opt);
                                  updatedConfig = {
                                    ...updatedConfig,
                                    correctAnswer: filtered.length > 0 ? filtered : null,
                                  };
                                } else if (updatedConfig.correctAnswer === opt) {
                                  updatedConfig = {
                                    ...updatedConfig,
                                    correctAnswer: null,
                                  };
                                }
                                updateActiveSlide({
                                  options: newOpts,
                                  config: updatedConfig,
                                });
                              }}
                              className="btn btn--danger btn--sm"
                              disabled={(activeSlide.options || []).length <= 2}
                              title="Remove option"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
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

                      {/* Quiz Timer Duration Selector */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>⏱️ Quiz Timer:</span>
                        <select
                          className="form-select"
                          style={{ padding: '4px 10px', fontSize: '0.85rem', width: 'auto' }}
                          value={activeSlide.config?.durationSeconds || 20}
                          onChange={(e) =>
                            updateActiveSlide({
                              config: { ...activeSlide.config, durationSeconds: Number(e.target.value) },
                            })
                          }
                        >
                          <option value="10">10 seconds</option>
                          <option value="20">20 seconds (Default)</option>
                          <option value="30">30 seconds</option>
                          <option value="60">60 seconds</option>
                          <option value="90">90 seconds</option>
                        </select>
                      </div>

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
                        Allow multiple options
                      </label>
                    </div>
                  </div>
                );
              })()}

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

              {/* Open Text Settings & Correct Answer */}
              {activeSlide.type === 'open_text' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                    Open Text Feedback &amp; Quiz Answer
                  </label>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
                    Participants will see a free-form text input and can submit responses in real time.
                  </p>

                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🎯 Accepted Correct Answer (Optional for Quiz)</span>
                      {activeSlide.config?.correctAnswer && (
                        <span className="badge badge--success" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                          Quiz Scoring Active
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={typeof activeSlide.config?.correctAnswer === 'string' ? activeSlide.config.correctAnswer : ''}
                      onChange={(e) =>
                        updateActiveSlide({
                          config: {
                            ...activeSlide.config,
                            correctAnswer: e.target.value.trim() ? e.target.value.trim() : null,
                          },
                        })
                      }
                      placeholder="e.g. Paris (Leave empty for open-ended survey without grading)"
                      className="form-input"
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                      If set, participant submissions that match this answer (case-insensitive) will receive speed quiz points.
                    </span>
                  </div>
                </div>
              )}

              {/* Scales / Likert Statements Settings */}
              {activeSlide.type === 'scales' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                    Statements to Rate (Likert Opinion Scale)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Low End Label</label>
                      <input
                        type="text"
                        value={activeSlide.config?.lowLabel || 'Strongly Disagree'}
                        onChange={(e) => updateActiveSlide({ config: { ...activeSlide.config, lowLabel: e.target.value } })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>High End Label</label>
                      <input
                        type="text"
                        value={activeSlide.config?.highLabel || 'Strongly Agree'}
                        onChange={(e) => updateActiveSlide({ config: { ...activeSlide.config, highLabel: e.target.value } })}
                        className="form-input"
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(activeSlide.options || []).map((stmt, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', width: '20px' }}>#{i + 1}</span>
                        <input
                          type="text"
                          value={stmt}
                          onChange={(e) => {
                            const copy = [...(activeSlide.options || [])];
                            copy[i] = e.target.value;
                            updateActiveSlide({ options: copy });
                          }}
                          placeholder={`Statement ${i + 1}`}
                          className="form-input"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const copy = (activeSlide.options || []).filter((_, idx) => idx !== i);
                            updateActiveSlide({ options: copy });
                          }}
                          disabled={(activeSlide.options || []).length <= 1}
                          className="btn btn--danger btn--sm"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const copy = [...(activeSlide.options || []), `New statement ${(activeSlide.options || []).length + 1}`];
                      updateActiveSlide({ options: copy });
                    }}
                    className="btn btn--secondary btn--sm"
                    style={{ marginTop: '16px' }}
                  >
                    ＋ Add Statement
                  </button>
                </div>
              )}

              {/* 100 Points Budget Allocation Settings */}
              {activeSlide.type === 'hundred_points' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                    Options to Distribute 100 Points Across
                  </label>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
                    Participants receive 100 points total and use sliders to allocate points to their preferred options.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(activeSlide.options || []).map((opt, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', width: '20px' }}>#{i + 1}</span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const copy = [...(activeSlide.options || [])];
                            copy[i] = e.target.value;
                            updateActiveSlide({ options: copy });
                          }}
                          placeholder={`Option ${i + 1}`}
                          className="form-input"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const copy = (activeSlide.options || []).filter((_, idx) => idx !== i);
                            updateActiveSlide({ options: copy });
                          }}
                          disabled={(activeSlide.options || []).length <= 2}
                          className="btn btn--danger btn--sm"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const copy = [...(activeSlide.options || []), `Option ${(activeSlide.options || []).length + 1}`];
                      updateActiveSlide({ options: copy });
                    }}
                    className="btn btn--secondary btn--sm"
                    style={{ marginTop: '16px' }}
                  >
                    ＋ Add Option
                  </button>
                </div>
              )}

              {/* Number Slide Settings */}
              {activeSlide.type === 'number' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                    Numeric Input &amp; Guessing Settings
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">Minimum Value</label>
                      <input
                        type="number"
                        value={activeSlide.config?.min ?? 0}
                        onChange={(e) => updateActiveSlide({ config: { ...activeSlide.config, min: Number(e.target.value) } })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Maximum Value</label>
                      <input
                        type="number"
                        value={activeSlide.config?.max ?? 1000}
                        onChange={(e) => updateActiveSlide({ config: { ...activeSlide.config, max: Number(e.target.value) } })}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Step</label>
                      <input
                        type="number"
                        value={activeSlide.config?.step ?? 1}
                        onChange={(e) => updateActiveSlide({ config: { ...activeSlide.config, step: Number(e.target.value) } })}
                        className="form-input"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">🎯 Correct Target Number (Optional Quiz grading)</label>
                    <input
                      type="number"
                      value={activeSlide.config?.correctNumber ?? ''}
                      onChange={(e) =>
                        updateActiveSlide({
                          config: {
                            ...activeSlide.config,
                            correctNumber: e.target.value !== '' ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="e.g. 42 (Leave empty if no exact correct answer)"
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {/* Heading Slide Settings */}
              {activeSlide.type === 'heading' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                    Heading &amp; Section Slide
                  </label>
                  <div className="form-group">
                    <label className="form-label">Subtitle or Supporting Description</label>
                    <input
                      type="text"
                      value={activeSlide.config?.subtitle || ''}
                      onChange={(e) => updateActiveSlide({ config: { ...activeSlide.config, subtitle: e.target.value } })}
                      placeholder="e.g. A deep dive into interactive presentations"
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {/* Paragraph / Rich Text Settings */}
              {activeSlide.type === 'paragraph' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                    Paragraph Content
                  </label>
                  <textarea
                    rows={6}
                    value={activeSlide.config?.body || ''}
                    onChange={(e) => updateActiveSlide({ config: { ...activeSlide.config, body: e.target.value } })}
                    placeholder="Write key takeaways, context, or meeting notes here..."
                    className="form-textarea"
                  />
                </div>
              )}

              {/* Image Slide Settings */}
              {activeSlide.type === 'image' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                    Image Presentation Slide
                  </label>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label">Image URL</label>
                    <input
                      type="url"
                      value={activeSlide.config?.imageUrl || ''}
                      onChange={(e) => updateActiveSlide({ config: { ...activeSlide.config, imageUrl: e.target.value } })}
                      placeholder="https://example.com/slide-image.jpg"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Caption / Footnote</label>
                    <input
                      type="text"
                      value={activeSlide.config?.caption || ''}
                      onChange={(e) => updateActiveSlide({ config: { ...activeSlide.config, caption: e.target.value } })}
                      placeholder="e.g. Architecture Overview Diagram"
                      className="form-input"
                    />
                  </div>
                  {activeSlide.config?.imageUrl && (
                    <div style={{ marginTop: '16px', textAlign: 'center' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activeSlide.config.imageUrl}
                        alt="Preview"
                        style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '10px', objectFit: 'contain' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Video Slide Settings */}
              {activeSlide.type === 'video' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                    Video Embed Slide
                  </label>
                  <div className="form-group">
                    <label className="form-label">YouTube / Video URL</label>
                    <input
                      type="url"
                      value={activeSlide.config?.videoUrl || ''}
                      onChange={(e) => updateActiveSlide({ config: { ...activeSlide.config, videoUrl: e.target.value } })}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {/* Bullets Slide Settings */}
              {activeSlide.type === 'bullets' && (
                <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                  <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                    Bullet Points List
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(activeSlide.options || []).map((bullet, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: '#b65f78' }}>✦</span>
                        <input
                          type="text"
                          value={bullet}
                          onChange={(e) => {
                            const copy = [...(activeSlide.options || [])];
                            copy[i] = e.target.value;
                            updateActiveSlide({ options: copy });
                          }}
                          placeholder={`Bullet item ${i + 1}`}
                          className="form-input"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const copy = (activeSlide.options || []).filter((_, idx) => idx !== i);
                            updateActiveSlide({ options: copy });
                          }}
                          disabled={(activeSlide.options || []).length <= 1}
                          className="btn btn--danger btn--sm"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const copy = [...(activeSlide.options || []), `New point ${(activeSlide.options || []).length + 1}`];
                      updateActiveSlide({ options: copy });
                    }}
                    className="btn btn--secondary btn--sm"
                    style={{ marginTop: '16px' }}
                  >
                    ＋ Add Bullet
                  </button>
                </div>
              )}

              {/* Live Canvas Preview Block (when in Preview mode or toggle) */}
              {editorMode === 'preview' && (
                <div
                  className="card"
                  style={{
                    padding: '40px 32px',
                    marginTop: '32px',
                    borderRadius: '16px',
                    background:
                      presentation?.theme?.colorScheme === 'saffron'
                        ? 'radial-gradient(ellipse at top, #6b3448 0%, #5b3047 60%, #4a2b40 100%)'
                        : presentation?.theme?.colorScheme === 'forest'
                        ? 'radial-gradient(ellipse at top, #2d6d56 0%, #285f4c 60%, #244c40 100%)'
                        : presentation?.theme?.colorScheme === 'sunset'
                        ? 'radial-gradient(ellipse at top, #8f3449 0%, #6b2f40 60%, #4d2935 100%)'
                        : presentation?.theme?.colorScheme === 'plum'
                        ? 'radial-gradient(ellipse at top, #6b3448 0%, #efe5dc 60%, #3f2940 100%)'
                        : presentation?.theme?.colorScheme === 'rose'
                        ? 'radial-gradient(ellipse at top, #93405d 0%, #5c3649 60%, #4a2b3b 100%)'
                        : presentation?.theme?.colorScheme === 'amber'
                        ? 'radial-gradient(ellipse at top, #80552b 0%, #5c473a 60%, #45372f 100%)'
                        : presentation?.theme?.colorScheme === 'clay'
                        ? 'radial-gradient(ellipse at top, #f1e7dc 0%, #efe5dc 60%, #e8ddd3 100%)'
                        : 'radial-gradient(ellipse at top, #6b3448 0%, #efe5dc 60%, #f7efe7 100%)',
                    fontFamily:
                      presentation?.theme?.fontStyle === 'classic'
                        ? 'Georgia, serif'
                        : presentation?.theme?.fontStyle === 'playful'
                        ? 'Comic Sans MS, cursive, sans-serif'
                        : presentation?.theme?.fontStyle === 'minimal'
                        ? 'monospace, sans-serif'
                        : 'inherit',
                    border: '2px solid rgba(217,87,69,0.4)',
                    boxShadow: '0 20px 50px rgba(63,41,64,0.5)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <span className="badge badge--live" style={{ fontSize: '0.75rem' }}>
                      ● Live Canvas Preview
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      Slide {activeSlideIndex + 1} of {slides.length}
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 800, textAlign: 'center', marginBottom: '28px', lineHeight: 1.3 }}>
                    {activeSlide.question}
                  </h2>

                  {/* Multiple Choice Preview */}
                  {activeSlide.type === 'multiple_choice' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                      {(activeSlide.options || []).map((opt, i) => (
                        <div
                          key={i}
                          style={{
                            padding: '16px 20px',
                            borderRadius: '12px',
                            background: 'rgba(92, 54, 73, 0.06)',
                            border: '1px solid rgba(92, 54, 73, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            fontWeight: 600,
                          }}
                        >
                          <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#d95745', color: '#fffaf3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800 }}>
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{opt}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Word Cloud Preview */}
                  {activeSlide.type === 'word_cloud' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', justifyContent: 'center', padding: '30px 0' }}>
                      {['Inspiration', 'Collaboration', 'Speed', 'Quality', 'Impact'].map((w, idx) => (
                        <span key={idx} style={{ fontSize: `${1.2 + idx * 0.3}rem`, fontWeight: 800, color: '#b65f78' }}>
                          {w}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Scales Preview */}
                  {activeSlide.type === 'scales' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {(activeSlide.options || []).map((s, i) => (
                        <div key={i} style={{ background: 'rgba(92, 54, 73, 0.05)', padding: '16px', borderRadius: '10px' }}>
                          <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '8px' }}>{s}</div>
                          <div style={{ height: '8px', background: 'rgba(92, 54, 73, 0.10)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: '70%', height: '100%', background: 'linear-gradient(90deg, #2d6d56, #2f8f6b)' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Number Preview */}
                  {activeSlide.type === 'number' && (
                    <div style={{ textAlign: 'center', padding: '30px 0' }}>
                      <div style={{ fontSize: '4rem', fontWeight: 900, color: '#d95745' }}>42.5</div>
                      <p style={{ color: 'var(--color-text-muted)' }}>Audience Average Estimate</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
              Select a slide or click ＋ Add Question to create one.
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
            background: 'rgba(63,41,64,0.75)',
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div className="form-group">
                <label className="form-label">Number of Slides</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={aiCount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setAiCount(1);
                      return;
                    }
                    const parsed = parseInt(raw, 10);
                    if (Number.isNaN(parsed)) return;
                    setAiCount(Math.min(20, Math.max(1, parsed)));
                  }}
                  className="form-input"
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Type any number from 1 to 20
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Question Difficulty</label>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                  className="form-select"
                >
                  <option value="easy">🟢 Easy — light &amp; accessible</option>
                  <option value="medium">🟡 Medium — general engagement</option>
                  <option value="hard">🔴 Hard — expert &amp; in-depth</option>
                </select>
              </div>
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

      {/* Create Question Modal with Correct Answer Selection */}
      {showCreateModal && (
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
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '650px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '32px',
              borderRadius: '16px',
              border: '1px solid rgba(92, 54, 73, 0.18)',
              boxShadow: '0 20px 60px rgba(63, 41, 64, 0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.6rem' }}>❓</span>
                <div>
                  <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Create Question</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    Add a quiz question or poll and specify the correct answer for leaderboard scoring.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="btn btn--ghost btn--sm"
                style={{ fontSize: '1.1rem', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="auth-alert auth-alert--error" style={{ marginBottom: '16px' }}>
                <span>⚠️</span>
                <span>{createError}</span>
              </div>
            )}

            {/* Slide Type Selection */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Question Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
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
                    onClick={() => {
                      setCreateType(t);
                      if (t === 'multiple_choice' && createOptions.length === 0) {
                        setCreateOptions(['Option A', 'Option B', 'Option C', 'Option D']);
                        setCreateCorrectAnswer('Option A');
                      }
                    }}
                    className={`btn btn--sm ${createType === t ? 'btn--primary' : 'btn--ghost'}`}
                    style={{ justifyContent: 'center', padding: '10px 8px', fontSize: '0.85rem' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Question Text */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Question / Prompt</label>
              <input
                type="text"
                value={createQuestion}
                onChange={(e) => setCreateQuestion(e.target.value)}
                placeholder="e.g. Which planet is known as the Red Planet?"
                className="form-input"
                style={{ fontSize: '1rem', fontWeight: 600, padding: '12px 16px' }}
                autoFocus
              />
            </div>

            {/* Multiple Choice Options & Mark Correct Answer */}
            {createType === 'multiple_choice' && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Options &amp; Correct Answer
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={createAllowMultiple}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setCreateAllowMultiple(checked);
                        if (checked) {
                          setCreateCorrectAnswer(
                            createCorrectAnswer
                              ? (Array.isArray(createCorrectAnswer) ? createCorrectAnswer : [createCorrectAnswer])
                              : []
                          );
                        } else {
                          setCreateCorrectAnswer(
                            Array.isArray(createCorrectAnswer) ? createCorrectAnswer[0] || null : createCorrectAnswer
                          );
                        }
                      }}
                    />
                    Multiple correct answers
                  </label>
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                  Click <strong>Mark Correct</strong> on the option that represents the right answer for the quiz.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {createOptions.map((opt, idx) => {
                    const isCorrect = Array.isArray(createCorrectAnswer)
                      ? createCorrectAnswer.includes(opt)
                      : createCorrectAnswer === opt;

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          background: isCorrect ? 'rgba(34, 197, 94, 0.12)' : 'rgba(92, 54, 73, 0.05)',
                          border: isCorrect ? '1.5px solid #3f9a73' : '1px solid var(--color-border)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: isCorrect ? '#3f9a73' : 'rgba(92, 54, 73, 0.10)',
                            color: isCorrect ? '#3f2940' : 'var(--color-text-muted)',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            flexShrink: 0,
                          }}
                        >
                          {String.fromCharCode(65 + idx)}
                        </span>

                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...createOptions];
                            const oldVal = newOpts[idx];
                            const newVal = e.target.value;
                            newOpts[idx] = newVal;

                            if (Array.isArray(createCorrectAnswer)) {
                              setCreateCorrectAnswer(createCorrectAnswer.map((ans) => (ans === oldVal ? newVal : ans)));
                            } else if (createCorrectAnswer === oldVal) {
                              setCreateCorrectAnswer(newVal);
                            }
                            setCreateOptions(newOpts);
                          }}
                          placeholder={`Option ${idx + 1}`}
                          className="form-input"
                          style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem' }}
                        />

                        {/* Mark Correct button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (createAllowMultiple) {
                              const currentList = Array.isArray(createCorrectAnswer)
                                ? [...createCorrectAnswer]
                                : createCorrectAnswer
                                ? [createCorrectAnswer]
                                : [];
                              const pos = currentList.indexOf(opt);
                              if (pos >= 0) currentList.splice(pos, 1);
                              else currentList.push(opt);
                              setCreateCorrectAnswer(currentList.length > 0 ? currentList : null);
                            } else {
                              setCreateCorrectAnswer(createCorrectAnswer === opt ? null : opt);
                            }
                          }}
                          className={`btn btn--sm ${isCorrect ? 'btn--primary' : 'btn--ghost'}`}
                          style={{
                            whiteSpace: 'nowrap',
                            fontSize: '0.78rem',
                            background: isCorrect ? '#2f8f6b' : 'transparent',
                            borderColor: isCorrect ? '#3f9a73' : undefined,
                            color: isCorrect ? '#fffaf3' : 'var(--color-text-secondary)',
                            fontWeight: isCorrect ? 700 : 500,
                            padding: '6px 12px',
                            minWidth: '120px',
                            justifyContent: 'center',
                          }}
                          title="Click to toggle whether this option is the correct answer"
                        >
                          {isCorrect ? '✓ Correct Answer' : '○ Mark Correct'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const newOpts = createOptions.filter((_, i) => i !== idx);
                            if (Array.isArray(createCorrectAnswer)) {
                              setCreateCorrectAnswer(createCorrectAnswer.filter((ans) => ans !== opt));
                            } else if (createCorrectAnswer === opt) {
                              setCreateCorrectAnswer(null);
                            }
                            setCreateOptions(newOpts);
                          }}
                          className="btn btn--danger btn--sm"
                          disabled={createOptions.length <= 2}
                          title="Remove option"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const newOpts = [...createOptions, `Option ${createOptions.length + 1}`];
                      setCreateOptions(newOpts);
                    }}
                    className="btn btn--secondary btn--sm"
                  >
                    ＋ Add Option
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>⏱️ Quiz Timer:</span>
                    <select
                      className="form-select"
                      style={{ padding: '4px 10px', fontSize: '0.85rem', width: 'auto' }}
                      value={createDurationSeconds}
                      onChange={(e) => setCreateDurationSeconds(Number(e.target.value))}
                    >
                      <option value="10">10 seconds</option>
                      <option value="20">20 seconds (Default)</option>
                      <option value="30">30 seconds</option>
                      <option value="60">60 seconds</option>
                      <option value="90">90 seconds</option>
                    </select>
                  </div>
                </div>

                {createCorrectAnswer && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', fontSize: '0.85rem', color: '#2f8f6b' }}>
                    🎯 <strong>Designated Correct Answer:</strong>{' '}
                    {Array.isArray(createCorrectAnswer) ? createCorrectAnswer.join(', ') : createCorrectAnswer}
                  </div>
                )}
              </div>
            )}

            {/* Open Text Correct Answer */}
            {createType === 'open_text' && (
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">🎯 Correct Answer (Optional for scored quiz)</label>
                <input
                  type="text"
                  value={typeof createCorrectAnswer === 'string' ? createCorrectAnswer : ''}
                  onChange={(e) => setCreateCorrectAnswer(e.target.value)}
                  placeholder="e.g. Paris (Leave empty for open survey without grading)"
                  className="form-input"
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                  If set, audience responses matching this text (case-insensitive) will receive speed quiz points.
                </span>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="btn btn--ghost"
                disabled={createCreating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateQuestion}
                disabled={createCreating || !createQuestion.trim()}
                className="btn btn--primary"
                style={{ minWidth: '140px' }}
              >
                {createCreating ? 'Creating Question...' : '✓ Create Question'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Theme Selector Modal */}
      {showThemeModal && (
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
          onClick={() => setShowThemeModal(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '640px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>🎨</span>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>Presentation Theme</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowThemeModal(false)}
                className="btn btn--ghost btn--sm"
              >
                ✕
              </button>
            </div>

            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Customize your presentation color palette, typography, and slide backdrop styling across presenter and audience screens.
            </p>

            {/* Color Palettes */}
            <div style={{ marginBottom: '24px' }}>
              <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                Color Palette
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                {[
                  { id: 'default', name: 'Default Warm', bg: '#efe5dc', primary: '#d95745', text: '#fffaf3' },
                  { id: 'saffron', name: 'Saffron Bloom', bg: '#5b3047', primary: '#d1912c', text: '#fffaf3' },
                  { id: 'forest', name: 'Emerald Forest', bg: '#285f4c', primary: '#2f8f6b', text: '#effaf3' },
                  { id: 'sunset', name: 'Sunset Glow', bg: '#6b2f40', primary: '#f43f5e', text: '#fff4f0' },
                  { id: 'plum', name: 'Plum Glow', bg: '#efe5dc', primary: '#9c4f73', text: '#fbf7f0' },
                  { id: 'rose', name: 'Rose Gold', bg: '#5c3649', primary: '#fb7185', text: '#fff4f0' },
                  { id: 'amber', name: 'Warm Amber', bg: '#5c473a', primary: '#f59e0b', text: '#fef3c7' },
                  { id: 'clay', name: 'Modern Clay', bg: '#efe5dc', primary: '#806c76', text: '#3f2940' },
                ].map((th) => {
                  const isSelected = (presentation?.theme?.colorScheme || 'default') === th.id;
                  return (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => handleUpdateTheme({ colorScheme: th.id })}
                      style={{
                        background: th.bg,
                        border: isSelected ? `2px solid ${th.primary}` : '1px solid var(--color-border)',
                        boxShadow: isSelected ? `0 0 12px ${th.primary}66` : 'none',
                        borderRadius: '10px',
                        padding: '12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: th.primary }} />
                        <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: th.text }} />
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: isSelected ? 700 : 500, color: th.text }}>
                        {th.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Typography */}
            <div style={{ marginBottom: '24px' }}>
              <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                Typography Style
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {[
                  { id: 'modern', name: 'Modern', sub: 'Inter / Sans' },
                  { id: 'classic', name: 'Classic', sub: 'Georgia / Serif' },
                  { id: 'playful', name: 'Playful', sub: 'Rounded / Fun' },
                  { id: 'minimal', name: 'Minimal', sub: 'Clean Mono' },
                ].map((font) => {
                  const isSelected = (presentation?.theme?.fontStyle || 'modern') === font.id;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => handleUpdateTheme({ fontStyle: font.id })}
                      className={`btn btn--sm ${isSelected ? 'btn--primary' : 'btn--ghost'}`}
                      style={{ flexDirection: 'column', padding: '10px', height: 'auto', textAlign: 'center' }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{font.name}</span>
                      <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>{font.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Background Style */}
            <div style={{ marginBottom: '28px' }}>
              <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
                Slide Background Style
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                  { id: 'gradient', name: 'Gradient', desc: 'Subtle angle' },
                  { id: 'solid', name: 'Solid', desc: 'Flat background' },
                  { id: 'pattern', name: 'Pattern', desc: 'Dotted grid' },
                ].map((bg) => {
                  const isSelected = (presentation?.theme?.background || 'gradient') === bg.id;
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => handleUpdateTheme({ background: bg.id })}
                      className={`btn btn--sm ${isSelected ? 'btn--primary' : 'btn--ghost'}`}
                      style={{ flexDirection: 'column', padding: '10px', height: 'auto', textAlign: 'center' }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{bg.name}</span>
                      <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>{bg.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowThemeModal(false)}
                className="btn btn--primary"
                style={{ minWidth: '120px' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
