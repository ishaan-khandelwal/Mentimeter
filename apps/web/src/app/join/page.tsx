'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError('Please enter a join code');
      return;
    }
    router.push(`/join/${cleanCode}`);
  };

  return (
    <div className="auth-page">
      <div className="card auth-card page-enter" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚡</div>
        <h1 className="auth-title">Join a Presentation</h1>
        <p className="auth-subtitle" style={{ marginBottom: '24px' }}>
          Enter the 6-character code shown on the presenter&apos;s screen.
        </p>

        {error && (
          <div className="auth-alert auth-alert--error" style={{ marginBottom: '16px' }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <input
              type="text"
              autoFocus
              maxLength={8}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="e.g. 7K9X2B"
              className="form-input"
              style={{
                textAlign: 'center',
                fontSize: '1.75rem',
                fontWeight: 800,
                letterSpacing: '0.2em',
                padding: '16px',
                textTransform: 'uppercase',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={!code.trim()}
            className="btn btn--primary btn--full btn--lg"
            style={{ marginTop: '12px' }}
          >
            Join Live Session →
          </button>
        </form>
      </div>
    </div>
  );
}
