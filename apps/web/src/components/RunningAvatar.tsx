'use client';

import React from 'react';
import { Character } from '@/lib/characters';

interface RunningAvatarProps {
  character: Character;
  isFirst?: boolean;
  nickname: string;
  pointsDelta?: number;
  score?: number;
  size?: number;
}

export default function RunningAvatar({
  character,
  isFirst = false,
  nickname,
  pointsDelta,
  size = 72,
}: RunningAvatarProps) {
  // Select specific illustration based on character id
  const renderCharacterGraphic = () => {
    switch (character.id) {
      case 'speedy_fox':
        return (
          <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible' }}>
            {/* Speed lines */}
            <path d="M5,50 Q-15,48 -25,50" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
            <path d="M10,65 Q-10,65 -20,68" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
            <path d="M15,35 Q-5,32 -18,34" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
            
            {/* Fluffy Fox Tail */}
            <path d="M25,55 Q10,75 -5,60 Q-15,45 10,40 Q20,38 30,48 Z" fill="#ea580c" />
            <path d="M0,58 Q-12,48 -5,60 Q-15,45 -2,42 Z" fill="#ffffff" />
            
            {/* Back Leg */}
            <path d="M38,65 Q30,85 22,88 Q20,92 28,92 Q38,90 46,75 Z" fill="#c2410c" />
            {/* Back Sneaker */}
            <rect x="18" y="87" width="16" height="8" rx="4" fill="#3b82f6" />
            
            {/* Torso & Athletic Jersey */}
            <ellipse cx="50" cy="58" rx="16" ry="18" fill="#ea580c" />
            <path d="M38,48 Q50,45 62,48 L58,72 Q50,75 42,72 Z" fill="#2563eb" />
            <text x="50" y="64" fill="#ffffff" fontSize="9" fontWeight="900" textAnchor="middle">21</text>
            
            {/* Front Leg (Stepping forward) */}
            <path d="M52,65 Q65,78 75,82 Q82,84 80,89 Q72,92 60,82 Z" fill="#ea580c" />
            {/* Front Sneaker */}
            <rect x="70" y="81" width="18" height="9" rx="4" fill="#ffffff" stroke="#2563eb" strokeWidth="2" />
            
            {/* Head */}
            <ellipse cx="62" cy="35" rx="18" ry="16" fill="#f97316" />
            {/* Ears */}
            <polygon points="52,24 58,8 66,22" fill="#ea580c" />
            <polygon points="55,22 59,12 63,21" fill="#fef3c7" />
            <polygon points="68,23 76,10 82,24" fill="#ea580c" />
            <polygon points="70,21 76,13 79,22" fill="#18181b" />
            
            {/* Cheeks & White Muzzle */}
            <path d="M54,38 Q64,48 76,38 Q82,42 75,48 Q64,52 52,44 Z" fill="#ffffff" />
            {/* Nose */}
            <circle cx="74" cy="40" r="3" fill="#18181b" />
            {/* Eyes (Happy running expression) */}
            <ellipse cx="60" cy="32" rx="3.5" ry="4" fill="#18181b" />
            <circle cx="61.5" cy="30.5" r="1.2" fill="#ffffff" />
            <ellipse cx="72" cy="33" rx="3" ry="3.5" fill="#18181b" />
            <circle cx="73" cy="32" r="1" fill="#ffffff" />
            {/* Smile */}
            <path d="M68,43 Q72,47 75,43" stroke="#18181b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            
            {/* Front Arm (Pumping) */}
            <path d="M48,50 Q60,52 70,45 Q75,42 76,46 Q70,54 55,56 Z" fill="#f97316" />
            <circle cx="73" cy="45" r="4.5" fill="#ffffff" />
          </svg>
        );

      case 'quiz_master':
        return (
          <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible' }}>
            {/* Speed lines */}
            <path d="M5,55 Q-15,55 -25,58" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
            <path d="M12,40 Q-8,38 -18,40" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />

            {/* Back Leg */}
            <path d="M38,68 Q28,84 20,88 Q18,92 26,92 Q36,88 44,75 Z" fill="#18181b" />
            <rect x="16" y="86" width="16" height="8" rx="4" fill="#0284c7" />

            {/* Panda Body & Blue Hoodie */}
            <ellipse cx="50" cy="60" rx="18" ry="19" fill="#ffffff" stroke="#18181b" strokeWidth="3" />
            <path d="M36,50 Q50,46 64,50 L60,74 Q50,78 40,74 Z" fill="#0ea5e9" />
            <circle cx="50" cy="62" r="5" fill="#ffffff" opacity="0.8" />

            {/* Front Leg */}
            <path d="M52,68 Q65,80 76,84 Q82,86 80,90 Q70,94 58,82 Z" fill="#18181b" />
            <rect x="72" y="83" width="18" height="9" rx="4" fill="#ffffff" stroke="#0284c7" strokeWidth="2" />

            {/* Panda Head */}
            <ellipse cx="62" cy="36" rx="19" ry="17" fill="#ffffff" stroke="#18181b" strokeWidth="2" />
            {/* Ears */}
            <circle cx="48" cy="22" r="7" fill="#18181b" />
            <circle cx="76" cy="23" r="7" fill="#18181b" />
            {/* Eye Patches */}
            <ellipse cx="56" cy="34" rx="5.5" ry="7" fill="#18181b" transform="rotate(-15 56 34)" />
            <circle cx="56" cy="33" r="2" fill="#ffffff" />
            <ellipse cx="70" cy="35" rx="5.5" ry="7" fill="#18181b" transform="rotate(15 70 35)" />
            <circle cx="70" cy="34" r="2" fill="#ffffff" />
            {/* Nose & Mouth */}
            <ellipse cx="63" cy="42" rx="3.5" ry="2.5" fill="#18181b" />
            <path d="M60,45 Q63,48 66,45" stroke="#18181b" strokeWidth="1.5" fill="none" strokeLinecap="round" />

            {/* Front Arm */}
            <path d="M48,52 Q62,54 72,46 Q76,43 77,47 Q70,56 55,58 Z" fill="#18181b" />
            <circle cx="74" cy="46" r="4.5" fill="#0284c7" />
          </svg>
        );

      case 'brainy_lion':
        return (
          <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible' }}>
            {/* Speed lines */}
            <path d="M8,55 Q-15,55 -25,58" stroke="#fb923c" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
            {/* Tail */}
            <path d="M25,58 Q10,70 5,62 Q0,55 12,48" stroke="#d97706" strokeWidth="4" fill="none" strokeLinecap="round" />
            <circle cx="5" cy="62" r="6" fill="#78350f" />

            {/* Back Leg */}
            <path d="M38,65 Q28,84 22,88 Q20,92 28,92 Q38,88 46,75 Z" fill="#b45309" />
            <rect x="18" y="86" width="16" height="8" rx="4" fill="#ea580c" />

            {/* Body & Orange Jersey */}
            <ellipse cx="50" cy="58" rx="16" ry="18" fill="#f59e0b" />
            <path d="M38,48 Q50,45 62,48 L58,72 Q50,75 42,72 Z" fill="#ea580c" />
            <circle cx="50" cy="60" r="5" fill="#fef08a" />

            {/* Front Leg */}
            <path d="M52,65 Q66,78 76,82 Q82,84 80,89 Q72,92 60,82 Z" fill="#d97706" />
            <rect x="72" y="81" width="18" height="9" rx="4" fill="#ffffff" stroke="#ea580c" strokeWidth="2" />

            {/* Big Fluffy Lion Mane */}
            <circle cx="62" cy="35" r="22" fill="#78350f" />
            <circle cx="62" cy="35" r="18" fill="#9a3412" />
            {/* Face */}
            <circle cx="63" cy="35" r="14" fill="#fbbf24" />
            {/* Ears */}
            <circle cx="52" cy="22" r="5" fill="#9a3412" />
            <circle cx="74" cy="22" r="5" fill="#9a3412" />
            {/* Eyes */}
            <ellipse cx="59" cy="32" rx="2.5" ry="3.5" fill="#18181b" />
            <ellipse cx="69" cy="32" rx="2.5" ry="3.5" fill="#18181b" />
            {/* Muzzle & Nose */}
            <ellipse cx="64" cy="39" rx="5" ry="4" fill="#fef3c7" />
            <polygon points="62,37 66,37 64,40" fill="#78350f" />

            {/* Front Arm */}
            <path d="M48,50 Q60,52 70,45 Q75,42 76,46 Q70,54 55,56 Z" fill="#d97706" />
            <circle cx="73" cy="45" r="4.5" fill="#f59e0b" />
          </svg>
        );

      case 'unicorn_ace':
        return (
          <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible' }}>
            {/* Speed lines */}
            <path d="M8,50 Q-15,48 -25,50" stroke="#c084fc" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
            {/* Rainbow Tail */}
            <path d="M26,55 Q10,75 -5,65 Q-12,50 12,42 Z" fill="#ec4899" />
            <path d="M24,52 Q8,68 -2,58 Q-8,45 10,40 Z" fill="#8b5cf6" opacity="0.8" />

            {/* Back Leg */}
            <path d="M38,65 Q28,84 22,88 Q20,92 28,92 Q38,88 46,75 Z" fill="#e9d5ff" />
            <rect x="18" y="86" width="16" height="8" rx="4" fill="#a855f7" />

            {/* Torso & Purple Jersey */}
            <ellipse cx="50" cy="58" rx="16" ry="18" fill="#faf5ff" stroke="#e9d5ff" strokeWidth="2" />
            <path d="M38,48 Q50,45 62,48 L58,72 Q50,75 42,72 Z" fill="#9333ea" />
            <polygon points="50,56 52,60 56,60 53,63 54,67 50,64 46,67 47,63 44,60 48,60" fill="#fde047" />

            {/* Front Leg */}
            <path d="M52,65 Q66,78 76,82 Q82,84 80,89 Q72,92 60,82 Z" fill="#f3e8ff" />
            <rect x="72" y="81" width="18" height="9" rx="4" fill="#ffffff" stroke="#9333ea" strokeWidth="2" />

            {/* Head */}
            <ellipse cx="62" cy="35" rx="17" ry="15" fill="#ffffff" stroke="#e9d5ff" strokeWidth="1.5" />
            {/* Golden Magic Horn */}
            <polygon points="68,23 82,3 74,21" fill="#facc15" stroke="#ca8a04" strokeWidth="1" />
            {/* Mane */}
            <path d="M46,26 Q54,16 66,22 Q60,34 50,38 Z" fill="#ec4899" />
            <path d="M42,34 Q50,24 60,28" stroke="#8b5cf6" strokeWidth="3" fill="none" />
            {/* Eye */}
            <ellipse cx="65" cy="33" rx="3.5" ry="4" fill="#581c87" />
            <circle cx="66" cy="31.5" r="1.2" fill="#ffffff" />
            {/* Muzzle */}
            <path d="M72,36 Q78,38 78,42 Q76,46 70,44 Z" fill="#fce7f3" />
            <circle cx="75" cy="40" r="1.5" fill="#db2777" />

            {/* Front Arm */}
            <path d="M48,50 Q60,52 70,45 Q75,42 76,46 Q70,54 55,56 Z" fill="#ffffff" stroke="#e9d5ff" strokeWidth="1" />
            <circle cx="73" cy="45" r="4.5" fill="#c084fc" />
          </svg>
        );

      case 'tech_titan':
        return (
          <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible' }}>
            {/* Speed & Jet Trail */}
            <path d="M5,58 L-20,58" stroke="#34d399" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
            <path d="M10,46 L-15,46" stroke="#059669" strokeWidth="3" strokeLinecap="round" opacity="0.7" />

            {/* Back Leg */}
            <rect x="25" y="65" width="10" height="24" rx="5" fill="#334155" transform="rotate(25 25 65)" />
            <rect x="15" y="84" width="18" height="8" rx="4" fill="#10b981" />

            {/* Robot Body */}
            <rect x="36" y="44" width="28" height="28" rx="8" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
            {/* Glowing Core */}
            <circle cx="50" cy="58" r="6" fill="#10b981" />
            <circle cx="50" cy="58" r="3" fill="#ffffff" />

            {/* Front Leg */}
            <rect x="52" y="64" width="10" height="24" rx="5" fill="#475569" transform="rotate(-35 52 64)" />
            <rect x="68" y="80" width="18" height="8" rx="4" fill="#38bdf8" />

            {/* Head */}
            <rect x="48" y="20" width="28" height="22" rx="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
            {/* Antenna */}
            <line x1="62" y1="20" x2="62" y2="12" stroke="#38bdf8" strokeWidth="2" />
            <circle cx="62" cy="11" r="3" fill="#10b981" />
            {/* Visor Eye Screen */}
            <rect x="52" y="25" width="20" height="10" rx="3" fill="#0284c7" />
            <circle cx="58" cy="30" r="2.5" fill="#38bdf8" />
            <circle cx="66" cy="30" r="2.5" fill="#38bdf8" />

            {/* Front Arm */}
            <rect x="52" y="48" width="20" height="8" rx="4" fill="#334155" transform="rotate(-20 52 48)" />
            <circle cx="72" cy="42" r="5" fill="#10b981" />
          </svg>
        );

      case 'cat_champion':
      default:
        return (
          <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible' }}>
            {/* Speed lines */}
            <path d="M5,52 Q-15,50 -25,52" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
            <path d="M10,65 Q-10,65 -20,68" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />

            {/* Tail */}
            <path d="M26,56 Q10,75 -2,62 Q-10,50 14,44" stroke="#94a3b8" strokeWidth="5" fill="none" strokeLinecap="round" />

            {/* Back Leg */}
            <path d="M38,65 Q30,85 22,88 Q20,92 28,92 Q38,90 46,75 Z" fill="#64748b" />
            <rect x="18" y="87" width="16" height="8" rx="4" fill="#f43f5e" />

            {/* Torso & Red/Navy Jersey */}
            <ellipse cx="50" cy="58" rx="16" ry="18" fill="#94a3b8" />
            <path d="M38,48 Q50,45 62,48 L58,72 Q50,75 42,72 Z" fill="#e11d48" />
            <text x="50" y="64" fill="#ffffff" fontSize="9" fontWeight="900" textAnchor="middle">★</text>

            {/* Front Leg */}
            <path d="M52,65 Q65,78 75,82 Q82,84 80,89 Q72,92 60,82 Z" fill="#94a3b8" />
            <rect x="70" y="81" width="18" height="9" rx="4" fill="#ffffff" stroke="#e11d48" strokeWidth="2" />

            {/* Cat Head */}
            <circle cx="62" cy="35" r="17" fill="#94a3b8" />
            {/* Ears */}
            <polygon points="50,25 54,10 62,22" fill="#64748b" />
            <polygon points="53,23 55,14 60,22" fill="#fda4af" />
            <polygon points="66,22 74,10 78,25" fill="#64748b" />
            <polygon points="68,22 73,14 75,23" fill="#fda4af" />

            {/* Cheeks & Whiskers */}
            <line x1="72" y1="38" x2="84" y2="36" stroke="#475569" strokeWidth="1.5" />
            <line x1="72" y1="41" x2="84" y2="42" stroke="#475569" strokeWidth="1.5" />
            <ellipse cx="64" cy="40" rx="4" ry="3" fill="#ffffff" />
            <polygon points="62,37 66,37 64,39" fill="#f43f5e" />

            {/* Eyes */}
            <ellipse cx="58" cy="32" rx="3.5" ry="4" fill="#0f172a" />
            <circle cx="59.5" cy="30.5" r="1.2" fill="#ffffff" />
            <ellipse cx="70" cy="32" rx="3" ry="3.5" fill="#0f172a" />
            <circle cx="71" cy="31" r="1" fill="#ffffff" />

            {/* Front Arm */}
            <path d="M48,50 Q60,52 70,45 Q75,42 76,46 Q70,54 55,56 Z" fill="#94a3b8" />
            <circle cx="73" cy="45" r="4.5" fill="#ffffff" />
          </svg>
        );
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
        animation: 'runnerBounce 0.45s ease-in-out infinite alternate',
      }}
    >
      {/* Floating Crown for 1st Place */}
      {isFirst && (
        <div
          style={{
            position: 'absolute',
            top: -46,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '1.5rem',
            animation: 'crownFloat 1.2s ease-in-out infinite alternate',
            filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.9))',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          👑
        </div>
      )}

      {/* Floating Nickname + Points Badge Centered Above Runner */}
      <div
        style={{
          position: 'absolute',
          top: -24,
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          background: 'rgba(63, 41, 64, 0.92)',
          backdropFilter: 'blur(8px)',
          border: `1.5px solid ${character.primaryColor}`,
          boxShadow: `0 4px 12px rgba(63, 41, 64, 0.3), 0 0 8px ${character.primaryColor}55`,
          borderRadius: '100px',
          padding: '2px 8px',
          zIndex: 8,
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#fbf7f0' }}>
          {nickname}
        </span>
        {pointsDelta !== undefined && pointsDelta > 0 && (
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              color: '#34d399',
              background: 'rgba(52, 211, 153, 0.2)',
              borderRadius: '6px',
              padding: '1px 5px',
            }}
          >
            +{pointsDelta}
          </span>
        )}
      </div>

      {/* Render Character SVG */}
      <div style={{ filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.45))' }}>
        {renderCharacterGraphic()}
      </div>

      {/* Speed Dust / Foot Trail */}
      <div
        style={{
          position: 'absolute',
          bottom: -4,
          left: -8,
          width: 32,
          height: 6,
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.4) 0%, transparent 80%)',
          borderRadius: '50%',
          filter: 'blur(2px)',
        }}
      />
    </div>
  );
}
