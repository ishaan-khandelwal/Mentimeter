'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface PresentationItem {
  _id: string;
  title: string;
  joinCode: string;
  status: 'draft' | 'live' | 'ended';
  slideCount?: number;
  createdAt: string;
  updatedAt: string;
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
      console.error('Failed to create presentation:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      const res = await fetch(`/api/v1/presentations/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPresentations((prev) => prev.filter((p) => p._id !== id));
      }
    } catch (err) {
      console.error('Failed to delete presentation:', err);
    }
  };

  const handleCopyLink = (joinCode: string) => {
    const url = `${window.location.origin}/join/${joinCode}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(joinCode);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="nav-skeleton" style={{ width: '200px', height: '40px', margin: '0 auto 20px' }} />
        <p style={{ color: 'var(--color-text-muted)' }}>Loading your workspace...</p>
      </div>
    );
  }

  return (
    <div className="container page-enter" style={{ padding: '40px 24px' }}>
      {/* Header section */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Your Presentations</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
            Welcome back, {session?.user?.name || session?.user?.email?.split('@')[0]}! Create, edit, and host live polls.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn--primary btn--lg"
        >
          <span>＋ New Presentation</span>
        </button>
      </div>

      {/* Presentations List or Empty State */}
      {presentations.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '60px 24px',
            textAlign: 'center',
            maxWidth: '560px',
            margin: '40px auto',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📊</div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>No presentations yet</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
            Create your first interactive presentation with polls, word clouds, ratings, rankings, and live Q&A.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn--primary"
          >
            Create Your First Presentation
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '24px',
          }}
        >
          {presentations.map((pres) => (
            <div
              key={pres._id}
              className="card card--hover"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '24px',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px',
                    marginBottom: '12px',
                  }}
                >
                  <span className="badge badge--primary">
                    CODE: {pres.joinCode}
                  </span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {new Date(pres.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: '1.2rem',
                    marginBottom: '8px',
                    wordBreak: 'break-word',
                  }}
                >
                  {pres.title}
                </h3>
              </div>

              <div style={{ marginTop: '24px' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <Link
                    href={`/present/${pres._id}`}
                    className="btn btn--primary btn--sm"
                    style={{ flex: 1 }}
                  >
                    ▶ Present Live
                  </Link>
                  <Link
                    href={`/presentations/${pres._id}/edit`}
                    className="btn btn--secondary btn--sm"
                    style={{ flex: 1 }}
                  >
                    ✏ Edit
                  </Link>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleCopyLink(pres.joinCode)}
                    className="btn btn--ghost btn--sm"
                    style={{ flex: 1, fontSize: '0.78rem' }}
                  >
                    {copiedCode === pres.joinCode ? '✓ Copied URL!' : '🔗 Copy Join Link'}
                  </button>
                  <button
                    onClick={() => handleDelete(pres._id, pres.title)}
                    className="btn btn--danger btn--sm"
                    title="Delete presentation"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
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
              maxWidth: '460px',
              padding: '32px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Create Presentation</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>
              Give your presentation a title. You can add questions and polls right after.
            </p>

            <form onSubmit={handleCreate}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Presentation Title</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Q3 All-Hands & Team Feedback"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn--ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="btn btn--primary"
                >
                  {creating ? 'Creating...' : 'Continue to Editor →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
