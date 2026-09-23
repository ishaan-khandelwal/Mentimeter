import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PollWave - Interactive Presentation & Live Audience Engagement Tool',
  description:
    'Create responsive live presentations with polls, word clouds, Q&A, quizzes, and real-time audience feedback.',
};

const slideTypes = [
  { label: 'Polls', detail: 'Multiple choice with live animated results.' },
  { label: 'Word clouds', detail: 'Turn open responses into instant patterns.' },
  { label: 'Q&A', detail: 'Collect, upvote, and answer audience questions.' },
  { label: 'Ranking', detail: 'Let participants prioritize what matters.' },
  { label: 'Scales', detail: 'Measure agreement, confidence, and sentiment.' },
  { label: 'Quizzes', detail: 'Run quick checks with visible momentum.' },
];

const workflow = [
  { step: '01', title: 'Build the moment', text: 'Start from a blank deck or a ready template and add interaction where discussion usually drops.' },
  { step: '02', title: 'Invite the room', text: 'Share one short code. People answer from any device while your screen updates live.' },
  { step: '03', title: 'Read the signal', text: 'Export responses, spot trends, and use AI summaries to turn feedback into decisions.' },
];

export default function HomePage() {
  return (
    <div className="home-shell page-enter">
      <section className="home-hero">
        <div className="home-hero__ambient" aria-hidden="true" />

        <div className="home-hero__content">
          <p className="home-eyebrow">Live polls, questions, quizzes, and feedback</p>
          <h1>PollWave makes every room answer back.</h1>
          <p className="home-hero__copy">
            Create beautiful interactive presentations that work on every screen, update in real time,
            and keep your audience part of the conversation.
          </p>

          <div className="home-actions" aria-label="Primary actions">
            <Link href="/signup" className="btn btn--primary btn--lg">
              Start free
            </Link>
            <Link href="/join" className="btn btn--secondary btn--lg">
              Join a session
            </Link>
          </div>

          <dl className="home-proof">
            <div>
              <dt>8+</dt>
              <dd>interaction types</dd>
            </div>
            <div>
              <dt>Live</dt>
              <dd>audience results</dd>
            </div>
            <div>
              <dt>AI</dt>
              <dd>question help</dd>
            </div>
          </dl>
        </div>

        <div className="live-preview" aria-label="Live presentation preview">
          <div className="live-preview__topbar">
            <span>PollWave Live</span>
            <strong>Code 849201</strong>
          </div>
          <div className="live-preview__stage">
            <div className="live-preview__status">
              <span className="live-dot" aria-hidden="true" />
              142 voters connected
            </div>
            <h2>What should we prioritize next quarter?</h2>

            <div className="result-list">
              <div className="result-row result-row--first">
                <span>AI assistant features</span>
                <strong>58%</strong>
                <div><span /></div>
              </div>
              <div className="result-row result-row--second">
                <span>Performance and speed</span>
                <strong>26%</strong>
                <div><span /></div>
              </div>
              <div className="result-row result-row--third">
                <span>New themes and branding</span>
                <strong>16%</strong>
                <div><span /></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-section--split">
        <div>
          <p className="home-eyebrow">Everything presenters need</p>
          <h2>One deck can teach, vote, debate, and decide.</h2>
        </div>
        <p>
          PollWave keeps the slide experience clean while giving facilitators the controls needed
          for workshops, classes, town halls, and product reviews.
        </p>
      </section>

      <section className="slide-grid" aria-label="PollWave interaction types">
        {slideTypes.map((item) => (
          <article className="slide-tile" key={item.label}>
            <h3>{item.label}</h3>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="workflow-section">
        <div className="workflow-section__intro">
          <p className="home-eyebrow">Simple workflow</p>
          <h2>From idea to audience signal in minutes.</h2>
        </div>
        <div className="workflow-list">
          {workflow.map((item) => (
            <article className="workflow-item" key={item.step}>
              <span>{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-cta">
        <p className="home-eyebrow">Ready when the room is</p>
        <h2>Build your first interactive presentation today.</h2>
        <Link href="/signup" className="btn btn--primary btn--lg">
          Create a presentation
        </Link>
      </section>
    </div>
  );
}
