/**
 * PollWave Competition & Game Loop Manager
 *
 * Implements 7-state Kahoot/Mentimeter competition state machine:
 * LOBBY → COUNTDOWN → QUESTION_ACTIVE → QUESTION_LOCKED → REVEAL → LEADERBOARD → FINAL_RESULTS
 *
 * Features:
 * - Real-time participant waiting room / lobby tracking
 * - Server-authoritative 3-2-1 countdown & question timer
 * - Kahoot speed scoring formula with streak multiplier:
 *   points = round(1000 * (1 - (timeTaken / durationSeconds) * 0.5) * streakMultiplier)
 * - Tie-breaking by cumulative answer time
 * - Early lock when 100% of participants have answered
 */

import {
  GameState,
  GameParticipant,
  LeaderboardEntry,
  QuestionTimerState,
  Tally,
} from '@pollwave/shared';

export interface SessionGameState {
  sessionId: string;
  presentationId: string;
  state: GameState;
  currentSlideId: string | null;
  participants: Map<string, GameParticipant>; // keyed by participantToken
  answeredParticipants: Set<string>; // tokens of participants who voted on current slide
  questionStartedAt: number;
  durationSeconds: number;
  correctAnswer: string | string[] | null;
  countdownTimer?: NodeJS.Timeout;
  questionTimer?: NodeJS.Timeout;
  revealTally?: Tally;
}

export class GameManager {
  private static instance: GameManager;
  private sessions = new Map<string, SessionGameState>();

  private constructor() {}

  public static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  /**
   * Initializes or gets the game state for a session.
   */
  public getOrCreateSession(sessionId: string, presentationId: string): SessionGameState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        presentationId,
        state: 'LOBBY',
        currentSlideId: null,
        participants: new Map(),
        answeredParticipants: new Set(),
        questionStartedAt: 0,
        durationSeconds: 20,
        correctAnswer: null,
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  public getSession(sessionId: string): SessionGameState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Attendee joins lobby with chosen nickname and avatar
   */
  public joinLobby(
    sessionId: string,
    presentationId: string,
    participant: { token: string; nickname: string; avatar: string }
  ): { participants: Array<{ token: string; nickname: string; avatar: string }>; count: number } {
    const session = this.getOrCreateSession(sessionId, presentationId);

    const existing = session.participants.get(participant.token);
    if (existing) {
      existing.nickname = participant.nickname || existing.nickname;
      existing.avatar = participant.avatar || existing.avatar;
    } else {
      const newParticipant: GameParticipant = {
        token: participant.token,
        nickname: participant.nickname || 'Guest Player',
        avatar: participant.avatar || '🦊',
        score: 0,
        streak: 0,
        lastPoints: 0,
        lastCorrect: false,
        totalTimeTaken: 0,
        rank: session.participants.size + 1,
        previousRank: session.participants.size + 1,
      };
      session.participants.set(participant.token, newParticipant);
    }

    return this.getLobbyList(sessionId);
  }

  public getLobbyList(sessionId: string): {
    participants: Array<{ token: string; nickname: string; avatar: string }>;
    count: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) return { participants: [], count: 0 };

    const list = Array.from(session.participants.values()).map((p) => ({
      token: p.token,
      nickname: p.nickname,
      avatar: p.avatar,
    }));

    return { participants: list, count: list.length };
  }

  /**
   * Sets game state directly
   */
  public setState(sessionId: string, state: GameState): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = state;
    }
  }

  /**
   * Start 3-2-1 Countdown before question begins
   */
  public startCountdown(
    sessionId: string,
    presentationId: string,
    slideId: string,
    durationSeconds: number,
    correctAnswer: string | string[] | null,
    onTick: (count: number) => void,
    onComplete: () => void
  ): void {
    const session = this.getOrCreateSession(sessionId, presentationId);

    this.clearTimers(sessionId);

    session.state = 'COUNTDOWN';
    session.currentSlideId = slideId;
    session.durationSeconds = durationSeconds || 20;
    session.correctAnswer = correctAnswer;
    session.answeredParticipants.clear();

    let count = 3;
    onTick(count);

    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        onTick(count);
      } else {
        clearInterval(interval);
        session.countdownTimer = undefined;
        onComplete();
      }
    }, 1000);

    session.countdownTimer = interval;
  }

  /**
   * Start Question timer (e.g. 20s)
   */
  public startQuestion(
    sessionId: string,
    presentationId: string,
    slideId: string,
    durationSeconds: number,
    correctAnswer: string | string[] | null,
    onExpire: () => void
  ): QuestionTimerState | null {
    const session = this.getOrCreateSession(sessionId, presentationId);

    this.clearTimers(sessionId);

    session.state = 'QUESTION_ACTIVE';
    session.currentSlideId = slideId;
    session.durationSeconds = durationSeconds || 20;
    session.correctAnswer = correctAnswer;
    session.answeredParticipants.clear();
    session.questionStartedAt = Date.now();

    session.questionTimer = setTimeout(() => {
      session.questionTimer = undefined;
      this.lockQuestion(sessionId);
      onExpire();
    }, session.durationSeconds * 1000);

    return this.getTimerState(sessionId);
  }

  /**
   * Locks question when time expires or 100% answered
   */
  public lockQuestion(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.clearTimers(sessionId);
    session.state = 'QUESTION_LOCKED';
  }

  /**
   * Records a vote / quiz response and calculates Kahoot speed score
   */
  public recordAnswer(
    sessionId: string,
    slideId: string,
    participantToken: string,
    submittedAnswer: string | number | string[]
  ): {
    pointsEarned: number;
    isCorrect: boolean;
    streak: number;
    totalScore: number;
    rank: number;
    shouldLockEarly: boolean;
    answeredCount: number;
    totalParticipants: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== 'QUESTION_ACTIVE') {
      return null;
    }

    if (session.currentSlideId !== slideId) {
      return null;
    }

    // Double voting guard
    if (session.answeredParticipants.has(participantToken)) {
      return null;
    }

    session.answeredParticipants.add(participantToken);

    // Calculate time taken
    const now = Date.now();
    const timeTaken = Math.max(0.1, (now - session.questionStartedAt) / 1000);

    // Normalize submitted answer to string representation for comparison
    const cleanStr = (s: any) => String(s ?? '').trim().toLowerCase();

    // Evaluate correctness
    let isCorrect = false;
    if (session.correctAnswer !== null && session.correctAnswer !== undefined) {
      if (Array.isArray(session.correctAnswer)) {
        const correctClean = session.correctAnswer.map(cleanStr);
        if (Array.isArray(submittedAnswer)) {
          const submittedClean = submittedAnswer.map(cleanStr);
          isCorrect =
            correctClean.length === submittedClean.length &&
            correctClean.every((ans) => submittedClean.includes(ans));
        } else {
          isCorrect = correctClean.includes(cleanStr(submittedAnswer));
        }
      } else {
        isCorrect = cleanStr(session.correctAnswer) === cleanStr(submittedAnswer);
      }
    } else {
      // If no correct answer configured, award participation points (flat 1000 scaled by speed)
      isCorrect = true;
    }

    let participant = session.participants.get(participantToken);
    if (!participant) {
      participant = {
        token: participantToken,
        nickname: 'Player',
        avatar: '🦊',
        score: 0,
        streak: 0,
        lastPoints: 0,
        lastCorrect: false,
        totalTimeTaken: 0,
        rank: session.participants.size + 1,
        previousRank: session.participants.size + 1,
      };
      session.participants.set(participantToken, participant);
    }

    let points = 0;
    if (isCorrect) {
      // Speed factor: 1.0 (instant) down to 0.5 (at expiration)
      const ratio = Math.min(1, Math.max(0, timeTaken / session.durationSeconds));
      const speedFactor = 1 - ratio * 0.5;

      // Streak multiplier: +10% per consecutive correct answer, up to +50%
      const streakMultiplier = 1 + Math.min(participant.streak * 0.1, 0.5);

      points = Math.round(1000 * speedFactor * streakMultiplier);
      participant.streak += 1;
    } else {
      participant.streak = 0;
      points = 0;
    }

    participant.score += points;
    participant.lastPoints = points;
    participant.lastCorrect = isCorrect;
    participant.totalTimeTaken += timeTaken;

    // Recalculate ranks across participants
    this.updateRankings(sessionId);

    // Check early lock condition: 100% of participants have answered
    const totalParticipants = session.participants.size;
    const answeredCount = session.answeredParticipants.size;
    const shouldLockEarly = totalParticipants > 0 && answeredCount >= totalParticipants;

    if (shouldLockEarly) {
      this.lockQuestion(sessionId);
    }

    return {
      pointsEarned: points,
      isCorrect,
      streak: participant.streak,
      totalScore: participant.score,
      rank: participant.rank,
      shouldLockEarly,
      answeredCount,
      totalParticipants,
    };
  }

  /**
   * Recalculates leaderboard rankings with tie-breaking
   */
  private updateRankings(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const list = Array.from(session.participants.values());
    list.sort((a, b) => {
      // 1. Higher score first
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // 2. Tie-break: lowest totalTimeTaken first
      return a.totalTimeTaken - b.totalTimeTaken;
    });

    list.forEach((p, idx) => {
      p.rank = idx + 1;
    });
  }

  /**
   * Advance to Leaderboard and freeze rank changes
   */
  public getLeaderboard(sessionId: string): {
    entries: LeaderboardEntry[];
    totalParticipants: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) return { entries: [], totalParticipants: 0 };

    this.updateRankings(sessionId);

    const entries: LeaderboardEntry[] = Array.from(session.participants.values())
      .map((p) => {
        let rankChange: number | 'new' = 0;
        if (p.previousRank === 0) {
          rankChange = 'new';
        } else {
          // e.g. prev 3, now 1 -> change = +2 (climbed)
          rankChange = p.previousRank - p.rank;
        }

        // Snapshot current rank as previous rank for next round
        p.previousRank = p.rank;

        return {
          token: p.token,
          nickname: p.nickname,
          avatar: p.avatar,
          score: p.score,
          streak: p.streak,
          rank: p.rank,
          rankChange,
          lastPoints: p.lastPoints,
        };
      })
      .sort((a, b) => a.rank - b.rank);

    return {
      entries: entries.slice(0, 10), // Top 10 for presenter screen
      totalParticipants: session.participants.size,
    };
  }

  /**
   * Final Results with Podium
   */
  public getFinalResults(sessionId: string): {
    podium: LeaderboardEntry[];
    fullLeaderboard: LeaderboardEntry[];
  } {
    const session = this.sessions.get(sessionId);
    if (!session) return { podium: [], fullLeaderboard: [] };

    this.updateRankings(sessionId);

    const full = Array.from(session.participants.values())
      .map((p) => ({
        token: p.token,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        streak: p.streak,
        rank: p.rank,
        rankChange: p.previousRank - p.rank,
        lastPoints: p.lastPoints,
      }))
      .sort((a, b) => a.rank - b.rank);

    const podium = full.slice(0, 3);

    return { podium, fullLeaderboard: full };
  }

  public getTimerState(sessionId: string): QuestionTimerState | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.currentSlideId) return null;

    return {
      slideId: session.currentSlideId,
      questionStartedAt: session.questionStartedAt,
      durationSeconds: session.durationSeconds,
      answeredCount: session.answeredParticipants.size,
      totalParticipants: session.participants.size,
    };
  }

  public clearTimers(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.countdownTimer) {
      clearInterval(session.countdownTimer);
      session.countdownTimer = undefined;
    }
    if (session.questionTimer) {
      clearTimeout(session.questionTimer);
      session.questionTimer = undefined;
    }
  }

  public endSession(sessionId: string): void {
    this.clearTimers(sessionId);
    this.sessions.delete(sessionId);
  }
}

export const gameManager = GameManager.getInstance();
