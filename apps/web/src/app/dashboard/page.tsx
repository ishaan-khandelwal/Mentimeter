'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

interface PresentationItem {
  _id: string;
  title: string;
  joinCode: string;
  status: 'draft' | 'live' | 'ended';
  slideCount?: number;
  createdAt: string;
  updatedAt: string;
  isAsyncForm?: boolean;
}

const COVER_EMOJIS = ['🎯', '📊', '💡', '🚀', '✨', '🎨', '🌟', '🔥', '⚡', '🎭', '🌊', '🎪'];
const COVER_GRADIENTS = [
  'linear-gradient(135deg,#d95745,#963d46)',
  'linear-gradient(135deg,#d1912c,#9f6a21)',
  'linear-gradient(135deg,#3f9a73,#2d6d56)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#ec4899,#be185d)',
  'linear-gradient(135deg,#3f9a73,#2d6d56)',
];

function getCoverInfo(id: string) {
  const hash = id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
  return {
    emoji: COVER_EMOJIS[hash % COVER_EMOJIS.length],
    gradient: COVER_GRADIENTS[hash % COVER_GRADIENTS.length],
  };
}

function getStatusBadge(status: string) {
  if (status === 'live') return <span className="badge badge--live">Live</span>;
  if (status === 'ended') return <span className="badge badge--ended">Ended</span>;
  return <span className="badge badge--draft">Draft</span>;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [presentations, setPresentations] = useState<PresentationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/dashboard');
    } else if (status === 'authenticated') {
      fetchPresentations();
    }
  }, [status, router]);

  const fetchPresentations = async () => {
    try {
      const res = await fetch('/api/v1/presentations');
      if (res.ok) {
        const data = await res.json();
        setPresentations(data.presentations || []);
      }
    } catch (err) {
      console.error('Failed to load presentations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/v1/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreateModal(false);
        setNewTitle('');
        router.push(`/presentations/${data.presentation._id}/edit`);
      }
    } catch (err) {
      console.error('Failed to create:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicating(id);
    try {
      const res = await fetch(`/api/v1/presentations/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        await fetchPresentations();
      }
    } catch (err) {
      console.error('Failed to duplicate:', err);
    } finally {
      setDuplicating(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this presentation? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/presentations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPresentations((prev) => prev.filter((p) => p._id !== id));
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyLink = (joinCode: string) => {
    const url = `${window.location.origin}/join/${joinCode}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(joinCode);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const filtered = useMemo(() => {
    let result = [...presentations];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) => p.title.toLowerCase().includes(q));
    }
    if (sortBy === 'name') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }
    return result;
  }, [presentations, searchQuery, sortBy]);

  const totalSlides = presentations.reduce((acc, p) => acc + (p.slideCount || 0), 0);
  const liveCount = presentations.filter((p) => p.status === 'live').length;

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="spinner spinner--lg" style={{ margin: '0 auto 20px' }} />
        <p style={{ color: 'var(--color-text-muted)' }}>Loading your workspace...</p>
      </div>
    );
  }

  const userName = session?.user?.name || session?.user?.email?.split('@')[0] || 'there';

  return (
    <div className="container page-enter" style={{ padding: '40px 24px', minHeight: '100vh' }}>
      {/* Hero */}
      <div className="dash-hero">
        <div>
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2rem)', marginBottom: '8px' }}>
            Welcome back, <span className="text-gradient">{userName}!</span>
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Build engaging interactive presentations. Your audience is waiting.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
          <Link href="/templates" className="btn btn--ghost">🎨 Templates</Link>
          <button id="new-presentation-btn" onClick={() => setShowCreateModal(true)} className="btn btn--primary btn--lg">
            ＋ New Presentation
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="dash-stats">
        <div className="dash-stat"><div className="dash-stat__value">{presentations.length}</div><div className="dash-stat__label">Presentations</div></div>
        <div className="dash-stat"><div className="dash-stat__value">{totalSlides}</div><div className="dash-stat__label">Total Slides</div></div>
        <div className="dash-stat"><div className="dash-stat__value">{liveCount}</div><div className="dash-stat__label">Live Now</div></div>
        <div className="dash-stat"><div className="dash-stat__value">{presentations.filter(p => p.status === 'ended').length}</div><div className="dash-stat__label">Completed</div></div>
      </div>

      {/* Filter Bar */}
      <div className="dash-filter-bar">
        <input id="search-presentations" type="text" placeholder="🔍  Search presentations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'name')} className="form-select" style={{ width: 'auto' }}>
          <option value="date">Newest first</option>
          <option value="name">A → Z</option>
        </select>
        <div className="view-toggle">
          <button id="view-grid-btn" className={`view-toggle__btn ${viewMode === 'grid' ? 'view-toggle__btn--active' : ''}`} onClick={() => setViewMode('grid')} title="Grid view">⊞</button>
          <button id="view-list-btn" className={`view-toggle__btn ${viewMode === 'list' ? 'view-toggle__btn--active' : ''}`} onClick={() => setViewMode('list')} title="List view">≡</button>
        </div>
      </div>

      {/* Presentation List */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center', maxWidth: '560px', margin: '40px auto' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>{searchQuery ? '🔍' : '📊'}</div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>{searchQuery ? 'No results found' : 'No presentations yet'}</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
            {searchQuery ? `No presentations match "${searchQuery}".` : 'Create your first interactive presentation.'}
          </p>
          {!searchQuery && (
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/templates" className="btn btn--ghost">Browse Templates</Link>
              <button onClick={() => setShowCreateModal(true)} className="btn btn--primary">Create Presentation</button>
            </div>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {filtered.map((pres) => {
            const cover = getCoverInfo(pres._id);
            return (
              <div key={pres._id} className="card card--hover pres-card">
                <div className="pres-card__cover" style={{ background: cover.gradient }}>
                  <span style={{ fontSize: '3rem' }}>{cover.emoji}</span>
                  <div style={{ position: 'absolute', top: 10, right: 10 }}>{getStatusBadge(pres.status)}</div>
                </div>
                <div className="pres-card__body">
                  <div>
                    <div className="pres-card__title">{pres.title}</div>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span>{new Date(pres.createdAt).toLocaleDateString()}</span>
                      {pres.slideCount !== undefined && <span>{pres.slideCount} slides</span>}
                      <span className="badge badge--primary" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>{pres.joinCode}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Link href={`/present/${pres._id}`} className="btn btn--primary btn--sm" style={{ flex: 1 }}>▶ Present</Link>
                      <Link href={`/presentations/${pres._id}/edit`} className="btn btn--secondary btn--sm" style={{ flex: 1 }}>✏ Edit</Link>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Link href={`/presentations/${pres._id}/results`} className="btn btn--ghost btn--sm" style={{ flex: 1, fontSize: '0.78rem' }}>📊 Results</Link>
                      <button onClick={() => handleCopyLink(pres.joinCode)} className="btn btn--ghost btn--sm" style={{ flex: 1, fontSize: '0.78rem' }}>{copiedCode === pres.joinCode ? '✓ Copied!' : '🔗 Share'}</button>
                      <button id={`duplicate-btn-${pres._id}`} onClick={() => handleDuplicate(pres._id)} disabled={duplicating === pres._id} className="btn btn--ghost btn--sm" title="Duplicate">{duplicating === pres._id ? '…' : '⎘'}</button>
                      <button id={`delete-btn-${pres._id}`} onClick={() => handleDelete(pres._id)} disabled={deletingId === pres._id} className="btn btn--danger btn--sm" title="Delete">🗑</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {filtered.map((pres, idx) => {
            const cover = getCoverInfo(pres._id);
            return (
              <div key={pres._id} className="pres-card-list" style={{ borderBottom: idx < filtered.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <div className="pres-card-list__icon" style={{ background: cover.gradient }}>{cover.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pres-card-list__title">{pres.title}</div>
                  <div className="pres-card-list__meta">{new Date(pres.createdAt).toLocaleDateString()} · {pres.slideCount || 0} slides · {pres.joinCode}</div>
                </div>
                {getStatusBadge(pres.status)}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <Link href={`/present/${pres._id}`} className="btn btn--primary btn--sm">▶</Link>
                  <Link href={`/presentations/${pres._id}/edit`} className="btn btn--ghost btn--sm">✏</Link>
                  <Link href={`/presentations/${pres._id}/results`} className="btn btn--ghost btn--sm">📊</Link>
                  <button onClick={() => handleCopyLink(pres.joinCode)} className="btn btn--ghost btn--sm">{copiedCode === pres.joinCode ? '✓' : '🔗'}</button>
                  <button onClick={() => handleDuplicate(pres._id)} disabled={duplicating === pres._id} className="btn btn--ghost btn--sm">⎘</button>
                  <button onClick={() => handleDelete(pres._id)} disabled={deletingId === pres._id} className="btn btn--danger btn--sm">🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(63,41,64,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setShowCreateModal(false)}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '36px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '16px' }}>✨</div>
            <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>Create Presentation</h2>
            <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '28px', fontSize: '0.9rem' }}>Give your presentation a title. You will add slides right after.</p>
            <form onSubmit={handleCreate}>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label">Presentation Title</label>
                <input id="presentation-title-input" type="text" required autoFocus placeholder="e.g. Team Q3 Kickoff Polls" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="form-input" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn--ghost">Cancel</button>
                <button id="create-presentation-submit" type="submit" disabled={creating || !newTitle.trim()} className="btn btn--primary">{creating ? 'Creating...' : 'Continue to Editor →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
