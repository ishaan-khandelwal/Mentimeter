import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PollWave — Live Polling & Presentations',
};

export default function HomePage() {
  return (
    <div className="page-container page-enter">
      {/* ── Hero ── */}
      <section style={{ padding: '100px 24px 80px', textAlign: 'center', position: 'relative' }}>
        <div className="container container--narrow">
          <div style={{ marginBottom: 24 }}>
            <span className="badge badge--live" style={{ fontSize: '0.8rem' }}>
              Real-time · Zero Setup · No Participant Limits
            </span>
          </div>

          <h1 style={{ marginBottom: 24 }}>
            Turn Every Presentation Into a{' '}
            <span className="text-gradient">Live Conversation</span>
          </h1>

          <p style={{ fontSize: '1.15rem', marginBottom: 40, maxWidth: 560, margin: '0 auto 40px' }}>
            PollWave lets you build interactive slide decks with live polls, word clouds,
            Q&A sessions, and more. Powered by AI. Built for scale.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" className="btn btn--primary btn--lg">
              Start for Free
            </Link>
            <Link href="/join" className="btn btn--ghost btn--lg">
              Join a Session
            </Link>
          </div>
        </div>
      </section>

      {/* ── Feature Grid ── */}
      <section style={{ padding: '60px 24px 100px' }}>
        <div className="container">
          <h2 style={{ textAlign: 'center', marginBottom: 48 }}>
            Everything you need to{' '}
            <span className="text-gradient">engage your audience</span>
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {features.map((f) => (
              <div key={f.title} className="card card--hover card--glow" style={{ padding: '28px 24px' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ marginBottom: 8, fontSize: '1.05rem' }}>{f.title}</h3>
                <p style={{ fontSize: '0.88rem', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '80px 24px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="container container--narrow">
          <h2 style={{ marginBottom: 16 }}>Ready to wow your audience?</h2>
          <p style={{ marginBottom: 32 }}>Free forever for unlimited audiences. No credit card required.</p>
          <Link href="/signup" className="btn btn--primary btn--lg">
            Create Your First Presentation
          </Link>
        </div>
      </section>
    </div>
  );
}

const features = [
  { icon: '📊', title: 'Multiple Choice', desc: 'Create engaging polls with live animated bar charts that update as votes pour in.' },
  { icon: '☁️', title: 'Word Cloud', desc: 'Collect open responses and watch a dynamic word cloud grow in real time.' },
  { icon: '💬', title: 'Open Text', desc: 'Gather qualitative responses and use AI to instantly identify themes.' },
  { icon: '⭐', title: 'Rating Scale', desc: 'Measure sentiment on a 1–10 scale with a beautiful distribution histogram.' },
  { icon: '🏆', title: 'Ranking', desc: 'Let your audience drag-and-rank options. Results show weighted scores live.' },
  { icon: '🙋', title: 'Live Q&A', desc: 'Attendees submit and upvote questions. Best questions rise to the top.' },
  { icon: '🤖', title: 'AI-Powered', desc: 'Generate slide questions from any topic with Claude AI in seconds.' },
  { icon: '⚡', title: 'Built for Scale', desc: 'Redis-backed, horizontally scalable. Tested for 500+ concurrent voters.' },
];
