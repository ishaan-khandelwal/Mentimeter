'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface TemplateCard {
  id: string;
  title: string;
  description: string;
  category: 'Meetings' | 'Education' | 'Workshops' | 'Standups';
  emoji: string;
  gradient: string;
  slidesCount: number;
  slideTypes: string[];
}

const TEMPLATE_LIST: TemplateCard[] = [
  {
    id: 'team-retrospective',
    title: 'Team All-Hands & Sprint Retrospective',
    description: 'Collect honest team sentiment, sprint blockers, and prioritize roadmap focus with budget allocation.',
    category: 'Meetings',
    emoji: '🚀',
    gradient: 'linear-gradient(135deg, #d1912c, #9f6a21)',
    slidesCount: 5,
    slideTypes: ['Heading', 'Word Cloud', 'Scales (Likert)', '100 Points', 'Live Q&A'],
  },
  {
    id: 'product-roadmap',
    title: 'Product Roadmap & Feature Prioritization',
    description: 'Engage stakeholders in ranking user pain points, allocating points across feature proposals, and confidence check.',
    category: 'Workshops',
    emoji: '🎯',
    gradient: 'linear-gradient(135deg, #d95745, #963d46)',
    slidesCount: 5,
    slideTypes: ['Heading', 'Multiple Choice', '100 Points', 'Rating Scale', 'Open Text'],
  },
  {
    id: 'classroom-quiz',
    title: 'Interactive Knowledge Quiz Challenge',
    description: 'Gamified speed quiz challenge with leaderboard, numeric guess slide, and rank order prioritization.',
    category: 'Education',
    emoji: '🏆',
    gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)',
    slidesCount: 5,
    slideTypes: ['Heading', 'Multiple Choice (Quiz)', 'Number Guess', 'Ranking', 'Word Cloud'],
  },
  {
    id: 'standup-checkin',
    title: 'Daily Standup & Energy Check-in',
    description: 'Fast 3-minute morning team check-in to gauge energy levels, surface blockers, and sprint readiness.',
    category: 'Standups',
    emoji: '⚡',
    gradient: 'linear-gradient(135deg, #3f9a73, #2d6d56)',
    slidesCount: 3,
    slideTypes: ['Number Rating (1-10)', 'Word Cloud', 'Multiple Choice'],
  },
  {
    id: 'conference-keynote',
    title: 'Conference Keynote & Audience Interaction',
    description: 'Welcome large audiences, visualize attendee origins in real-time word clouds, and moderate high-vote Q&A.',
    category: 'Workshops',
    emoji: '🎤',
    gradient: 'linear-gradient(135deg, #806c76, #806c76)',
    slidesCount: 4,
    slideTypes: ['Heading Slide', 'Word Cloud', 'Poll', 'Live Q&A'],
  },
];

export default function TemplatesPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const categories = ['All', 'Meetings', 'Workshops', 'Education', 'Standups'];

  const filtered = selectedCategory === 'All'
    ? TEMPLATE_LIST
    : TEMPLATE_LIST.filter((t) => t.category === selectedCategory);

  const handleUseTemplate = async (templateId: string) => {
    setApplyingId(templateId);
    try {
      const res = await fetch('/api/v1/templates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      if (res.status === 401) {
        router.push('/login?callbackUrl=/templates');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        router.push(`/presentations/${data.presentation.id}/edit`);
      } else {
        alert('Failed to apply template. Please try again.');
      }
    } catch (err) {
      console.error('Error applying template:', err);
      alert('Network error while creating presentation.');
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="container page-enter" style={{ padding: '40px 24px 80px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', maxWidth: '750px', margin: '0 auto 48px' }}>
        <div style={{ marginBottom: '12px' }}>
          <span className="badge badge--live" style={{ fontSize: '0.8rem' }}>
            📚 Mentimeter-Inspired Template Library
          </span>
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 800, marginBottom: '16px' }}>
          Interactive Presentation <span className="text-gradient">Templates</span>
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', lineHeight: 1.6 }}>
          Jumpstart your meetings, classes, and retrospectives with pre-built slide decks loaded with polls, scales, budget points, and Q&A.
        </p>
      </div>

      {/* Category Pills */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '40px', flexWrap: 'wrap' }}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`btn ${selectedCategory === cat ? 'btn--primary' : 'btn--ghost'}`}
            style={{ borderRadius: '100px', padding: '8px 20px', fontSize: '0.9rem' }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid of Templates */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
        {filtered.map((t) => (
          <div key={t.id} className="card card--hover pres-card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="pres-card__cover" style={{ background: t.gradient, minHeight: '140px' }}>
              <span style={{ fontSize: '3.5rem' }}>{t.emoji}</span>
              <div style={{ position: 'absolute', top: 12, right: 12 }}>
                <span className="badge badge--draft" style={{ background: 'rgba(63,41,64,0.4)', backdropFilter: 'blur(4px)' }}>
                  {t.slidesCount} slides
                </span>
              </div>
            </div>

            <div className="pres-card__body" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#b65f78', marginBottom: '6px' }}>
                  {t.category}
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', lineHeight: 1.3 }}>
                  {t.title}
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '18px' }}>
                  {t.description}
                </p>

                {/* Included Slide Types Pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
                  {t.slideTypes.map((type) => (
                    <span
                      key={type}
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '3px 8px',
                        background: 'rgba(92, 54, 73, 0.08)',
                        border: '1px solid rgba(92, 54, 73, 0.12)',
                        borderRadius: '6px',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {type}
                    </span>
                  ))}
                </div>
              </div>

              <button
                id={`use-template-${t.id}`}
                onClick={() => handleUseTemplate(t.id)}
                disabled={applyingId === t.id}
                className="btn btn--primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {applyingId === t.id ? 'Creating Deck...' : '✨ Use This Template'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Back to Dashboard Footer */}
      <div style={{ textAlign: 'center', marginTop: '60px' }}>
        <Link href="/dashboard" className="btn btn--ghost">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
