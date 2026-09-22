'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function Navbar() {
  const { data: session, status } = useSession();
  const [quickCode, setQuickCode] = useState('');
  const router = useRouter();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCode.trim()) return;
    router.push(`/join/${quickCode.trim().toUpperCase()}`);
  };

  return (
    <header className="navbar-container">
      <div className="navbar-inner">
        <div className="navbar-left">
          <Link href="/" className="navbar-brand">
            <span className="brand-icon">⚡</span>
            <span className="brand-name">
              Poll<span className="brand-gradient">Wave</span>
            </span>
          </Link>
          <nav className="nav-links">
            <Link href="/dashboard" className="nav-link">
              Dashboard
            </Link>
            <Link href="/join" className="nav-link">
              Enter Code
            </Link>
          </nav>
        </div>

        <div className="navbar-right">
          {/* Quick Join input */}
          <form onSubmit={handleJoin} className="quick-join-form">
            <input
              type="text"
              placeholder="Join code (e.g. 849201)"
              value={quickCode}
              onChange={(e) => setQuickCode(e.target.value.toUpperCase())}
              maxLength={8}
              className="quick-join-input"
            />
            <button type="submit" className="quick-join-btn" disabled={!quickCode.trim()}>
              Join
            </button>
          </form>

          {status === 'loading' ? (
            <div className="nav-skeleton" />
          ) : session?.user ? (
            <div className="user-menu">
              <span className="user-email" title={session.user.email ?? ''}>
                {session.user.name || session.user.email?.split('@')[0]}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="btn btn-secondary btn-sm"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="auth-buttons">
              <Link href="/login" className="btn btn-secondary btn-sm">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm">
                Sign up free
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
