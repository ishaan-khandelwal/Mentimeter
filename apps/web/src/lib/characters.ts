export interface Character {
  id: string;
  name: string;
  emoji: string;
  title: string;
  primaryColor: string;
  secondaryColor: string;
  trackColor: string;
  trackGradient: string;
  badgeBg: string;
}

export const CHARACTERS: Character[] = [
  {
    id: 'speedy_fox',
    name: 'SpeedyFox',
    emoji: '🦊',
    title: 'Lightning Sprinter',
    primaryColor: '#f59e0b',
    secondaryColor: '#d97706',
    trackColor: '#f59e0b',
    trackGradient: 'linear-gradient(90deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)',
    badgeBg: 'rgba(245, 158, 11, 0.25)',
  },
  {
    id: 'quiz_master',
    name: 'QuizMaster',
    emoji: '🐼',
    title: 'Knowledge Champ',
    primaryColor: '#0ea5e9',
    secondaryColor: '#0284c7',
    trackColor: '#0ea5e9',
    trackGradient: 'linear-gradient(90deg, #0284c7 0%, #0ea5e9 50%, #38bdf8 100%)',
    badgeBg: 'rgba(14, 165, 233, 0.25)',
  },
  {
    id: 'brainy_lion',
    name: 'BrainyLion',
    emoji: '🦁',
    title: 'Roaring Racer',
    primaryColor: '#f97316',
    secondaryColor: '#ea580c',
    trackColor: '#f97316',
    trackGradient: 'linear-gradient(90deg, #ea580c 0%, #f97316 50%, #fb923c 100%)',
    badgeBg: 'rgba(249, 115, 22, 0.25)',
  },
  {
    id: 'unicorn_ace',
    name: 'UnicornAce',
    emoji: '🦄',
    title: 'Magic Glider',
    primaryColor: '#a855f7',
    secondaryColor: '#9333ea',
    trackColor: '#a855f7',
    trackGradient: 'linear-gradient(90deg, #9333ea 0%, #a855f7 50%, #c084fc 100%)',
    badgeBg: 'rgba(168, 85, 247, 0.25)',
  },
  {
    id: 'tech_titan',
    name: 'TechTitan',
    emoji: '🤖',
    title: 'Cyber Dasher',
    primaryColor: '#10b981',
    secondaryColor: '#059669',
    trackColor: '#10b981',
    trackGradient: 'linear-gradient(90deg, #059669 0%, #10b981 50%, #34d399 100%)',
    badgeBg: 'rgba(16, 185, 129, 0.25)',
  },
  {
    id: 'cat_champion',
    name: 'CatChampion',
    emoji: '🐱',
    title: 'Swift Paws',
    primaryColor: '#f43f5e',
    secondaryColor: '#e11d48',
    trackColor: '#f43f5e',
    trackGradient: 'linear-gradient(90deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%)',
    badgeBg: 'rgba(244, 63, 94, 0.25)',
  },
  {
    id: 'star_rider',
    name: 'StarRider',
    emoji: '⭐',
    title: 'Cosmic Dasher',
    primaryColor: '#eab308',
    secondaryColor: '#ca8a04',
    trackColor: '#eab308',
    trackGradient: 'linear-gradient(90deg, #ca8a04 0%, #eab308 50%, #facc15 100%)',
    badgeBg: 'rgba(234, 179, 8, 0.25)',
  },
  {
    id: 'pizza_pro',
    name: 'PizzaPro',
    emoji: '🍕',
    title: 'Slice of Speed',
    primaryColor: '#f97316',
    secondaryColor: '#c2410c',
    trackColor: '#f97316',
    trackGradient: 'linear-gradient(90deg, #c2410c 0%, #f97316 50%, #fdba74 100%)',
    badgeBg: 'rgba(249, 115, 22, 0.25)',
  },
  {
    id: 'ocean_queen',
    name: 'OceanQueen',
    emoji: '🐙',
    title: 'Tidal Sprinter',
    primaryColor: '#ec4899',
    secondaryColor: '#db2777',
    trackColor: '#ec4899',
    trackGradient: 'linear-gradient(90deg, #db2777 0%, #ec4899 50%, #f472b6 100%)',
    badgeBg: 'rgba(236, 72, 153, 0.25)',
  },
  {
    id: 'fire_bolt',
    name: 'FireBolt',
    emoji: '🔥',
    title: 'Blazing Comet',
    primaryColor: '#ef4444',
    secondaryColor: '#dc2626',
    trackColor: '#ef4444',
    trackGradient: 'linear-gradient(90deg, #dc2626 0%, #ef4444 50%, #f87171 100%)',
    badgeBg: 'rgba(239, 68, 68, 0.25)',
  },
  {
    id: 'rocket_racer',
    name: 'RocketRacer',
    emoji: '🚀',
    title: 'Hyperspace Blitz',
    primaryColor: '#6366f1',
    secondaryColor: '#4f46e5',
    trackColor: '#6366f1',
    trackGradient: 'linear-gradient(90deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%)',
    badgeBg: 'rgba(99, 102, 241, 0.25)',
  },
  {
    id: 'thunder_volt',
    name: 'ThunderVolt',
    emoji: '⚡',
    title: 'Volt Striker',
    primaryColor: '#eab308',
    secondaryColor: '#854d0e',
    trackColor: '#eab308',
    trackGradient: 'linear-gradient(90deg, #854d0e 0%, #eab308 50%, #fef08a 100%)',
    badgeBg: 'rgba(234, 179, 8, 0.25)',
  },
];

/**
 * Finds character by ID, emoji, or nickname match.
 * Falls back to index-based character if not matched.
 */
export function resolveCharacter(avatarOrNickname?: string, index: number = 0): Character {
  if (!avatarOrNickname) return CHARACTERS[index % CHARACTERS.length];

  const foundByEmoji = CHARACTERS.find((c) => c.emoji === avatarOrNickname);
  if (foundByEmoji) return foundByEmoji;

  const foundByName = CHARACTERS.find(
    (c) => c.name.toLowerCase() === avatarOrNickname.toLowerCase() ||
           c.id.toLowerCase() === avatarOrNickname.toLowerCase()
  );
  if (foundByName) return foundByName;

  // Fuzzy check
  const fuzzy = CHARACTERS.find(
    (c) => avatarOrNickname.toLowerCase().includes(c.name.toLowerCase().slice(0, 4))
  );
  if (fuzzy) return fuzzy;

  return CHARACTERS[index % CHARACTERS.length];
}
