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
  options?: string[];
  countdownTimer?: NodeJS.Timeout;
  questionTimer?: NodeJS.Timeout;
  revealTally?: Tally;
}

/**
 * Normalizes and matches a submitted answer against the correct answer.
 * Supports exact text, case-insensitive trimmed matching, option indices, and option labels ("Option A", "A").
 */
function matchesAnswerOption(
  submitted: any,
  correct: any,
  options?: string[]
): boolean {
  if (submitted === null || submitted === undefined) return false;
  if (correct === null || correct === undefined) return false;

  const clean = (s: any) => String(s ?? '').trim().toLowerCase();
  const subStr = clean(submitted);
  const corStr = clean(correct);

  if (!subStr || !corStr) return false;
  if (subStr === corStr) return true;

  if (options && Array.isArray(options) && options.length > 0) {
    const optsClean = options.map(clean);

    // Option index matching (e.g. correct is "0" or 0, or submitted is "0" or 0)
    const corIndex = parseInt(corStr, 10);
    if (!isNaN(corIndex) && corIndex >= 0 && corIndex < optsClean.length) {
      if (subStr === optsClean[corIndex]) return true;
    }
    const subIndex = parseInt(subStr, 10);
    if (!isNaN(subIndex) && subIndex >= 0 && subIndex < optsClean.length) {
      if (corStr === optsClean[subIndex]) return true;
    }

    // Letter matching: 'A', 'B', 'C', 'D' or 'Option A', 'Option B'
    const matchLetter = (str: string): number => {
      const match = str.match(/^(?:option\s+)?([a-z])$/i);
      if (match) {
        return match[1].toLowerCase().charCodeAt(0) - 97;
      }
      return -1;
    };

    const corLetterIdx = matchLetter(corStr);
    if (corLetterIdx >= 0 && corLetterIdx < optsClean.length) {
      if (subStr === optsClean[corLetterIdx]) return true;
    }
    const subLetterIdx = matchLetter(subStr);
    if (subLetterIdx >= 0 && subLetterIdx < optsClean.length) {
      if (corStr === optsClean[subLetterIdx]) return true;
    }
  }

  return false;
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
      existing.online = true; // covers rejoin/reconnect after a disconnect
    } else {
      const newParticipant: GameParticipant = {
        token: participant.token,
        nickname: participant.nickname || 'Guest Player',
        avatar: participant.avatar || '🦊',
        score: 0,
        streak: 0,
        lastPoints: 0,
        lastCorrect: false,
        lastTimeTaken: 0,
        totalTimeTaken: 0,
        rank: session.participants.size + 1,
        previousRank: session.participants.size + 1,
        online: true,
      };
      session.participants.set(participant.token, newParticipant);
    }

    return this.getLobbyList(sessionId);
  }

  /**
   * Marks a participant as disconnected. They stay in the roster (so their
   * score survives for the leaderboard/final results if they reconnect or
   * the round already counted them), but drop out of the live "attending"
   * roster and the answered/total denominator.
   */
  public setParticipantOffline(sessionId: string, token: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const participant = session.participants.get(token);
    if (participant) participant.online = false;
  }

  public getLobbyList(sessionId: string): {
    participants: Array<{ token: string; nickname: string; avatar: string }>;
    count: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) return { participants: [], count: 0 };

    const list = Array.from(session.participants.values())
      .filter((p) => p.online)
      .map((p) => ({
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
    onComplete: () => void,
    options?: string[]
  ): void {
    const session = this.getOrCreateSession(sessionId, presentationId);

    this.clearTimers(sessionId);

    session.state = 'COUNTDOWN';
    session.currentSlideId = slideId;
    session.durationSeconds = durationSeconds || 20;
    session.correctAnswer = correctAnswer;
    session.options = options;
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
    onExpire: () => void,
    options?: string[]
  ): QuestionTimerState | null {
    const session = this.getOrCreateSession(sessionId, presentationId);

    this.clearTimers(sessionId);

    session.state = 'QUESTION_ACTIVE';
    session.currentSlideId = slideId;
    session.durationSeconds = durationSeconds || 20;
    session.correctAnswer = correctAnswer;
    if (options) session.options = options;
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
   * Records a vote / quiz response and calculates speed score according to time taken.
   * Faster answers strictly receive higher points.
   */
  public recordAnswer(
    sessionId: string,
    slideId: string,
    participantToken: string,
    submittedAnswer: string | number | string[] | Record<string, any>
  ): {
    pointsEarned: number;
    isCorrect: boolean;
    streak: number;
    totalScore: number;
    rank: number;
    timeTaken: number;
    shouldLockEarly: boolean;
    answeredCount: number;
    totalParticipants: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Reject stale votes for a slide that is no longer the live question —
    // never let a late arrival hijack the shared "current slide" pointer.
    if (session.currentSlideId && session.currentSlideId !== slideId) {
      return null;
    }
    if (!session.currentSlideId) {
      session.currentSlideId = slideId;
    }

    // Reject votes once the question has already been locked/revealed —
    // the client-side disabled button is not a security boundary.
    const closedStates: GameState[] = ['QUESTION_LOCKED', 'REVEAL', 'LEADERBOARD', 'FINAL_RESULTS'];
    if (closedStates.includes(session.state)) {
      return null;
    }

    // Self-heal: a vote can legitimately arrive a beat before the QUESTION_ACTIVE
    // state/timer broadcast lands (e.g. brief jitter during COUNTDOWN -> ACTIVE).
    if (session.state !== 'QUESTION_ACTIVE') {
      session.state = 'QUESTION_ACTIVE';
      if (session.questionStartedAt <= 0) {
        session.questionStartedAt = Date.now() - 500;
      }
    }

    session.answeredParticipants.add(participantToken);

    // Calculate time taken (in seconds)
    const now = Date.now();
    let elapsed = 0.5;
    if (session.questionStartedAt > 0) {
      elapsed = (now - session.questionStartedAt) / 1000;
    } else {
      session.questionStartedAt = now - 500;
    }
    const timeTaken = Math.max(0.1, Number(elapsed.toFixed(2)));

    // Evaluate correctness
    let isCorrect = false;
    const hasCorrectConfigured =
      session.correctAnswer !== null &&
      session.correctAnswer !== undefined &&
      (Array.isArray(session.correctAnswer)
        ? session.correctAnswer.length > 0
        : String(session.correctAnswer).trim().length > 0);

    if (hasCorrectConfigured) {
      if (Array.isArray(session.correctAnswer)) {
        if (Array.isArray(submittedAnswer)) {
          isCorrect =
            session.correctAnswer.length === submittedAnswer.length &&
            session.correctAnswer.every((ans) =>
              (submittedAnswer as any[]).some((sub) =>
                matchesAnswerOption(sub, ans, session.options)
              )
            );
        } else {
          isCorrect = session.correctAnswer.some((ans) =>
            matchesAnswerOption(submittedAnswer, ans, session.options)
          );
        }
      } else {
        if (Array.isArray(submittedAnswer)) {
          isCorrect = (submittedAnswer as any[]).some((sub) =>
            matchesAnswerOption(sub, session.correctAnswer, session.options)
          );
        } else {
          isCorrect = matchesAnswerOption(
            submittedAnswer,
            session.correctAnswer,
            session.options
          );
        }
      }
    } else {
      // Survey / Poll / Open mode (no correct answer designated) -> all submissions receive speed participation points
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
        lastTimeTaken: 0,
        totalTimeTaken: 0,
        rank: session.participants.size + 1,
        previousRank: session.participants.size + 1,
        online: true,
      };
      session.participants.set(participantToken, participant);
    } else if (!participant.online) {
      // Voting inherently means they have a live connection right now.
      participant.online = true;
    }

    let points = 0;
    if (isCorrect) {
      // Time ratio: 0.0 (fastest/instant) to 1.0 (at question expiration)
      const duration = Math.max(1, session.durationSeconds || 20);
      const ratio = Math.min(1, Math.max(0, timeTaken / duration));

      // Speed decay formula:
      // Instant answer (0s) -> speedFactor = 1.0 (1000 base points)
      // Answer at 50% duration -> speedFactor = 0.75 (750 base points)
      // Answer at deadline -> speedFactor = 0.50 (500 base points)
      // The particular user who takes less time gets strictly higher points!
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
    participant.lastTimeTaken = timeTaken;
    participant.totalTimeTaken += timeTaken;

    // Recalculate ranks across participants
    this.updateRankings(sessionId);

    // Check early lock condition: 100% of currently-connected participants have
    // answered. Uses the online count, not everyone who ever joined, so a
    // student who left mid-quiz doesn't permanently block the early lock.
    const totalParticipants = Array.from(session.participants.values()).filter((p) => p.online).length;
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
      timeTaken,
      shouldLockEarly,
      answeredCount,
      totalParticipants,
    };
  }

  /**
   * Recalculates leaderboard rankings with tie-breaking:
   * 1. Higher total score first
   * 2. Tie-break: lowest totalTimeTaken first (faster cumulative answers rank higher)
   */
  private updateRankings(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const list = Array.from(session.participants.values());
    list.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
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
          lastTimeTaken: p.lastTimeTaken,
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
        lastTimeTaken: p.lastTimeTaken,
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
