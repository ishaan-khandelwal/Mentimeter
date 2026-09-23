'use client';

import React, { useMemo } from 'react';
import type { LeaderboardEntry } from '@pollwave/shared';
import RunningAvatar from './RunningAvatar';
import { resolveCharacter } from '@/lib/characters';

interface QuizRaceLeaderboardProps {
  leaderboard: LeaderboardEntry[];
  lobbyParticipants?: Array<{ token: string; nickname: string; avatar: string }>;
  joinCode?: string;
  currentQuestionIndex?: number;
  totalQuestions?: number;
  onNextQuestion?: () => void;
  onShowFinalResults?: () => void;
  isLastQuestion?: boolean;
}

export default function QuizRaceLeaderboard({
  leaderboard,
  lobbyParticipants = [],
  joinCode,
  currentQuestionIndex = 1,
  totalQuestions = 1,
  onNextQuestion,
  onShowFinalResults,
  isLastQuestion = false,
}: QuizRaceLeaderboardProps) {
  // Construct dynamic leaderboard strictly from enrolled participants
  const activeLeaderboard: LeaderboardEntry[] = useMemo(() => {
    const list: LeaderboardEntry[] = [...(leaderboard || [])];

    // If any participants in the lobby have not scored points yet, make sure they are on the roster
    if (lobbyParticipants && lobbyParticipants.length > 0) {
      lobbyParticipants.forEach((lp) => {
        const alreadyIn = list.some(
          (e) => (e.token && e.token === lp.token) || (e.nickname && e.nickname.toLowerCase() === lp.nickname.toLowerCase())
        );
        if (!alreadyIn) {
          list.push({
            token: lp.token,
            nickname: lp.nickname,
            avatar: lp.avatar,
            score: 0,
            streak: 0,
            rank: list.length + 1,
            rankChange: 'new',
            lastPoints: 0,
            lastTimeTaken: 0,
          });
        }
      });
    }

    // Sort descending by score, tiebreak by fastest total response time or original rank
    const sorted = list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.rank || 0) - (b.rank || 0);
    });

    sorted.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    return sorted;
  }, [leaderboard, lobbyParticipants]);

  // Top 6 racers appear on the track lanes
  const trackRunners = activeLeaderboard.slice(0, 6);

  // Highest score for calculating runner distance along the track
  const highestScore = Math.max(...activeLeaderboard.map((r) => r.score), 0);

  // Rich, vibrant lane gradients that pop against the warm dashboard aesthetic
  const laneGradients = [
    'linear-gradient(90deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)', // Lane 1: Gold / Amber
    'linear-gradient(90deg, #0284c7 0%, #0ea5e9 50%, #38bdf8 100%)', // Lane 2: Azure / Sky
    'linear-gradient(90deg, #c2410c 0%, #ea580c 50%, #f97316 100%)', // Lane 3: Coral / Tangerine
    'linear-gradient(90deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)', // Lane 4: Royal Violet
    'linear-gradient(90deg, #047857 0%, #10b981 50%, #34d399 100%)', // Lane 5: Mint Emerald
    'linear-gradient(90deg, #be123c 0%, #e11d48 50%, #f43f5e 100%)', // Lane 6: Ruby Rose
  ];

  return (
    <div
      style={{
        flex: 1,
        minHeight: '100vh',
        background: 'radial-gradient(ellipse 90% 70% at 50% -10%, #fceddb 0%, #fbf7f0 55%, #f4eae0 100%)',
        color: '#3f2940',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflowX: 'hidden',
        padding: '20px 32px 130px',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Stadium Ambient Warm Glows */}
      <div
        style={{
          position: 'absolute',
          top: -60,
          left: '20%',
          width: '500px',
          height: '240px',
          background: 'radial-gradient(ellipse at center, rgba(217, 87, 69, 0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -60,
          right: '25%',
          width: '500px',
          height: '240px',
          background: 'radial-gradient(ellipse at center, rgba(245, 158, 11, 0.14) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          zIndex: 10,
        }}
      >
        {/* Brand Logo matching dashboard */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #d95745 0%, #963d46 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '1.25rem',
              color: '#fbf7f0',
              boxShadow: '0 4px 14px rgba(217, 87, 69, 0.35)',
            }}
          >
            🌊
          </div>
          <span style={{ fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-0.02em', color: '#3f2940' }}>
            PollWave
          </span>
        </div>

        {/* Question Counter Pill */}
        <div
          style={{
            padding: '6px 20px',
            borderRadius: '100px',
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(92, 54, 73, 0.12)',
            fontSize: '0.9rem',
            fontWeight: 700,
            color: '#69566a',
            boxShadow: '0 2px 10px rgba(63, 41, 64, 0.05)',
          }}
        >
          Question <strong style={{ color: '#d95745' }}>{currentQuestionIndex}</strong> of {totalQuestions}
        </div>

        {/* Live Quiz Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 16px',
            borderRadius: '100px',
            background: 'rgba(217, 87, 69, 0.10)',
            border: '1px solid rgba(217, 87, 69, 0.25)',
            color: '#d95745',
            fontSize: '0.84rem',
            fontWeight: 800,
          }}
        >
          <span style={{ fontSize: '0.75rem', animation: 'pulse 1.5s infinite' }}>●</span>
          <span>Live Leaderboard</span>
        </div>
      </div>

      {/* Main Title Section */}
      <div style={{ textAlign: 'center', marginBottom: '22px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span style={{ fontSize: '2.2rem' }}>🏆</span>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-0.03em', color: '#3f2940', margin: 0 }}>
            Sprint Leaderboard
          </h1>
        </div>
        <p style={{ color: '#69566a', fontSize: '1rem', marginTop: '4px', fontWeight: 500 }}>
          Live speed rankings based on answer correctness & velocity! 🏁
        </p>
      </div>

      {/* Main Stage: Left Race Track + Right Top 10 Sidebar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: '24px',
          flex: 1,
          alignItems: 'start',
          zIndex: 10,
        }}
      >
        {/* ─── LEFT: Stadium Running Track ──────────────────────────────── */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '1px solid rgba(92, 54, 73, 0.12)',
            padding: '24px',
            boxShadow: '0 12px 36px rgba(63, 41, 64, 0.08)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Header inside Track Arena */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '18px',
              padding: '0 6px',
            }}
          >
            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: 800,
                color: '#d95745',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>⚡</span> LIVE SPRINT ARENA
            </span>
            <span style={{ fontSize: '0.82rem', color: '#8d7a87', fontWeight: 600 }}>
              Speed Bonus + Correct Answer Velocity
            </span>
          </div>

          {/* If No Participants Enrolled Yet -> Warm Waiting Starting Grid */}
          {activeLeaderboard.length === 0 ? (
            <div
              style={{
                minHeight: '340px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
                textAlign: 'center',
                background: 'rgba(241, 231, 220, 0.45)',
                borderRadius: '18px',
                border: '2px dashed rgba(92, 54, 73, 0.18)',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🏁</div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#3f2940', marginBottom: '8px' }}>
                Waiting for Racers at the Starting Line!
              </h3>
              <p style={{ color: '#69566a', fontSize: '0.95rem', maxWidth: '420px', marginBottom: '20px' }}>
                Attendees will appear on the track automatically as they join and answer questions.
              </p>
              {joinCode && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 24px',
                    borderRadius: '100px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    border: '1.5px solid rgba(217, 87, 69, 0.3)',
                    boxShadow: '0 4px 16px rgba(63, 41, 64, 0.08)',
                  }}
                >
                  <span style={{ fontSize: '0.92rem', color: '#69566a' }}>
                    Join at <strong>pollwave.io/join</strong>
                  </span>
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #d95745 0%, #963d46 100%)',
                      color: '#ffffff',
                      fontWeight: 900,
                      fontSize: '1.1rem',
                      padding: '4px 14px',
                      borderRadius: '100px',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {joinCode}
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* Active Participants on Dynamic Track Lanes (Up to 6) */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                position: 'relative',
              }}
            >
              {trackRunners.map((runner, idx) => {
                const character = resolveCharacter(runner.avatar || runner.nickname, idx);
                const laneGradient = laneGradients[idx % laneGradients.length];

                // Dynamically calculate runner distance along lane
                // If highestScore is 0 (or start of game), all racers stand at the starting line (8%)
                // When points are scored, runner position scales from 8% to 82%
                let runnerDistance = 8;
                if (highestScore > 0) {
                  const ratio = Math.max(0, Math.min(1, runner.score / highestScore));
                  runnerDistance = 8 + ratio * 74;
                }

                return (
                  <div
                    key={runner.token || `${runner.nickname}-${idx}`}
                    style={{
                      position: 'relative',
                      height: '68px',
                      borderRadius: '16px',
                      background: laneGradient,
                      display: 'flex',
                      alignItems: 'center',
                      boxShadow:
                        '0 4px 14px rgba(63, 41, 64, 0.15), inset 0 2px 0 rgba(255, 255, 255, 0.3), inset 0 -2px 0 rgba(0, 0, 0, 0.15)',
                      overflow: 'visible',
                    }}
                  >
                    {/* Starting Line Marker (at 7%) */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '7%',
                        top: 0,
                        bottom: 0,
                        width: '3px',
                        background: 'rgba(255, 255, 255, 0.6)',
                        boxShadow: '0 0 6px rgba(255, 255, 255, 0.6)',
                        zIndex: 3,
                      }}
                    />

                    {/* Dashed track center line */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '50%',
                        height: '2px',
                        background:
                          'repeating-linear-gradient(90deg, rgba(255,255,255,0.45) 0px, rgba(255,255,255,0.45) 14px, transparent 14px, transparent 28px)',
                        pointerEvents: 'none',
                      }}
                    />

                    {/* Left: Rank Badge + Nickname & Points Pill */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        zIndex: 6,
                      }}
                    >
                      {/* Medal / Rank Circle */}
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '12px',
                          background:
                            idx === 0
                              ? 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)'
                              : idx === 1
                              ? 'linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)'
                              : idx === 2
                              ? 'linear-gradient(135deg, #fed7aa 0%, #c2410c 100%)'
                              : 'rgba(255, 255, 255, 0.92)',
                          border: idx < 3 ? '2px solid rgba(255,255,255,0.85)' : '1px solid rgba(92, 54, 73, 0.2)',
                          color: idx === 0 ? '#78350f' : idx === 1 ? '#0f172a' : idx === 2 ? '#7c2d12' : '#3f2940',
                          fontWeight: 900,
                          fontSize: '0.98rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: idx < 3 ? '0 4px 10px rgba(63, 41, 64, 0.25)' : '0 2px 6px rgba(63, 41, 64, 0.1)',
                        }}
                      >
                        {idx === 0 ? '👑 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : idx + 1}
                      </div>

                      {/* Nickname & Points Tag */}
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.94)',
                          backdropFilter: 'blur(8px)',
                          padding: '5px 12px',
                          borderRadius: '100px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: '1px solid rgba(92, 54, 73, 0.14)',
                          boxShadow: '0 2px 8px rgba(63, 41, 64, 0.08)',
                        }}
                      >
                        <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#3f2940' }}>
                          {runner.nickname}
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#69566a' }}>
                          {runner.score.toLocaleString()} pts
                        </span>
                        {runner.lastPoints !== undefined && runner.lastPoints > 0 && (
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#16a34a' }}>
                            +{runner.lastPoints}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Checkered Finish Line (Right Edge) */}
                    <div
                      className="checkered-finish-line"
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '42px',
                        zIndex: 4,
                        boxShadow: '-4px 0 16px rgba(63, 41, 64, 0.2)',
                      }}
                    />

                    {/* Animated Running Character on Lane */}
                    <div
                      style={{
                        position: 'absolute',
                        left: `${runnerDistance}%`,
                        bottom: 2,
                        zIndex: 8,
                        transition: 'left 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      }}
                    >
                      <RunningAvatar
                        character={character}
                        isFirst={idx === 0 && runner.score > 0}
                        nickname={runner.nickname}
                        pointsDelta={runner.lastPoints}
                        score={runner.score}
                        size={62}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Crowd & Glow Sticks Apron */}
          <div
            style={{
              marginTop: '18px',
              padding: '12px 18px',
              background: 'rgba(241, 231, 220, 0.65)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: '1px solid rgba(92, 54, 73, 0.10)',
            }}
          >
            {/* Waving Glowsticks Crowd Simulation */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#69566a', fontWeight: 700, marginRight: '6px' }}>
                Crowd Cheer:
              </span>
              {[
                { color: '#d95745', deg: '-15deg' },
                { color: '#f59e0b', deg: '12deg' },
                { color: '#2f8f6b', deg: '-10deg' },
                { color: '#0ea5e9', deg: '18deg' },
                { color: '#8b5cf6', deg: '-8deg' },
                { color: '#ec4899', deg: '14deg' },
                { color: '#d95745', deg: '-12deg' },
              ].map((stick, i) => (
                <div
                  key={i}
                  style={{
                    width: '4px',
                    height: '24px',
                    borderRadius: '2px',
                    background: stick.color,
                    boxShadow: `0 0 6px ${stick.color}`,
                    animation: `glowstickWave ${1.2 + (i % 3) * 0.3}s ease-in-out infinite alternate`,
                    transformOrigin: 'bottom center',
                  }}
                />
              ))}
            </div>

            <div style={{ fontSize: '0.84rem', color: '#69566a', fontWeight: 700 }}>
              🏁 Checkered Finish Line: Top 3 advance with bonus streaks!
            </div>
          </div>
        </div>

        {/* ─── RIGHT: Top 10 Glassmorphic Sidebar ──────────────────────── */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '1px solid rgba(92, 54, 73, 0.12)',
            padding: '20px',
            boxShadow: '0 12px 36px rgba(63, 41, 64, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>📊</span>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#3f2940', margin: 0 }}>
                Top {Math.min(10, Math.max(1, activeLeaderboard.length))}
              </h2>
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#8d7a87' }}>
              {activeLeaderboard.length} {activeLeaderboard.length === 1 ? 'racer' : 'racers'}
            </span>
          </div>

          {activeLeaderboard.length === 0 ? (
            <div
              style={{
                padding: '36px 12px',
                textAlign: 'center',
                color: '#8d7a87',
                fontSize: '0.88rem',
                fontWeight: 600,
              }}
            >
              No racers scored yet. Standings will populate here!
            </div>
          ) : (
            <>
              {/* 1st Place Highlight Card */}
              {activeLeaderboard[0] && (() => {
                const firstRunner = activeLeaderboard[0];
                const character = resolveCharacter(firstRunner.avatar || firstRunner.nickname, 0);

                return (
                  <div
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(254, 243, 199, 0.85) 0%, rgba(254, 226, 226, 0.75) 100%)',
                      border: '2px solid #f59e0b',
                      boxShadow: '0 4px 16px rgba(245, 158, 11, 0.18)',
                      borderRadius: '16px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.3rem' }}>👑</span>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: character.primaryColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.25rem',
                          boxShadow: `0 2px 8px ${character.primaryColor}55`,
                        }}
                      >
                        {character.emoji}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#3f2940' }}>
                          {firstRunner.nickname}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 700 }}>
                          Race Leader #1
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#9a3412' }}>
                        {firstRunner.score.toLocaleString()}
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#16a34a' }}>
                        pts
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Rows 2 through 10 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {activeLeaderboard.slice(1, 10).map((player, idx) => {
                  const rank = idx + 2;
                  const character = resolveCharacter(player.avatar || player.nickname, rank - 1);

                  return (
                    <div
                      key={player.token || `${player.nickname}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        background: 'rgba(92, 54, 73, 0.04)',
                        border: '1px solid rgba(92, 54, 73, 0.08)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: '18px', fontSize: '0.85rem', fontWeight: 700, color: '#8d7a87' }}>
                          {rank}
                        </span>
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: character.primaryColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1rem',
                          }}
                        >
                          {character.emoji}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#3f2940' }}>
                          {player.nickname}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#3f2940' }}>
                          {player.score.toLocaleString()}
                        </span>

                        {/* Rank delta badge */}
                        {typeof player.rankChange === 'number' ? (
                          player.rankChange > 0 ? (
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#16a34a' }}>
                              ↑{player.rankChange}
                            </span>
                          ) : player.rankChange < 0 ? (
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444' }}>
                              ↓{Math.abs(player.rankChange)}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8d7a87' }}>
                              —
                            </span>
                          )
                        ) : (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              background: 'rgba(217, 87, 69, 0.14)',
                              color: '#d95745',
                              padding: '1px 5px',
                              borderRadius: '4px',
                            }}
                          >
                            NEW
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Tip Box */}
          <div
            style={{
              marginTop: '4px',
              padding: '8px 12px',
              borderRadius: '100px',
              background: 'rgba(47, 143, 107, 0.08)',
              border: '1px solid rgba(47, 143, 107, 0.2)',
              color: '#2f8f6b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            <span>✓</span>
            <span>Faster correct answers = Higher points!</span>
            <span>⚡</span>
          </div>

          {/* Advance Action Buttons */}
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!isLastQuestion && onNextQuestion && (
              <button
                type="button"
                onClick={onNextQuestion}
                className="btn btn--primary btn--full"
                style={{
                  padding: '12px 20px',
                  fontWeight: 800,
                  fontSize: '0.98rem',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #d95745 0%, #963d46 100%)',
                  boxShadow: '0 6px 20px rgba(217, 87, 69, 0.35)',
                  color: '#ffffff',
                }}
              >
                Next Question ({currentQuestionIndex + 1}/{totalQuestions}) ➔
              </button>
            )}

            {isLastQuestion && onShowFinalResults && (
              <button
                type="button"
                onClick={onShowFinalResults}
                className="btn btn--primary btn--full"
                style={{
                  padding: '14px 20px',
                  fontWeight: 800,
                  fontSize: '1rem',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d95745 100%)',
                  boxShadow: '0 6px 20px rgba(245, 158, 11, 0.4)',
                  color: '#ffffff',
                }}
              >
                🎉 Champions Podium
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
