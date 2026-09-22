// ─── Slide Types ────────────────────────────────────────────────────────────

export type SlideType =
  | 'multiple_choice'
  | 'word_cloud'
  | 'open_text'
  | 'rating'
  | 'ranking'
  | 'qa';

// ─── Presentation Status ─────────────────────────────────────────────────────

export type PresentationStatus = 'draft' | 'live' | 'ended';

// ─── Session Status ───────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'ended';

// ─── User Plan ────────────────────────────────────────────────────────────────

export type UserPlan = 'free' | 'pro';

// ─── Plain (serialized) interfaces used on the client ────────────────────────

export interface IUserPublic {
  _id: string;
  email: string;
  plan: UserPlan;
  createdAt: string;
}

export interface ISlidePublic {
  _id: string;
  presentationId: string;
  type: SlideType;
  question: string;
  options: string[];
  order: number;
  aiGenerated: boolean;
}

export interface IPresentationPublic {
  _id: string;
  ownerId: string;
  title: string;
  joinCode: string;
  status: PresentationStatus;
  createdAt: string;
  slides?: ISlidePublic[];
}

export interface ISessionPublic {
  _id: string;
  presentationId: string;
  startedAt: string;
  endedAt: string | null;
  currentSlideId: string | null;
  status: SessionStatus;
  votingLocked: boolean;
}

export interface IResponsePublic {
  _id: string;
  presentationId: string;
  slideId: string;
  sessionId: string;
  value: string | string[] | number;
  createdAt: string;
}

export interface IAnalyticsPublic {
  _id: string;
  presentationId: string;
  sessionId: string;
  totalParticipants: number;
  peakConcurrentUsers: number;
  avgResponseTime: number;
  completionRate: number;
  dropOffRate: number;
  createdAt: string;
}

// ─── Tally ────────────────────────────────────────────────────────────────────

/** Map of option/value → count */
export type Tally = Record<string, number>;

// ─── QA Question (stored in Redis, flushed to Mongo) ─────────────────────────

export interface QAQuestion {
  id: string;
  slideId: string;
  sessionId: string;
  text: string;
  upvotes: number;
  participantToken: string; // hashed
  createdAt: number; // unix ms
}

// ─── Socket Events ───────────────────────────────────────────────────────────

// Attendee → Server
export interface JoinSessionPayload {
  joinCode: string;
  participantToken: string;
}

export interface SubmitVotePayload {
  slideId: string;
  value: string | string[] | number;
  participantToken: string;
}

export interface SubmitQuestionPayload {
  slideId: string;
  text: string;
  participantToken: string;
}

export interface UpvoteQuestionPayload {
  questionId: string;
  participantToken: string;
}

// Presenter → Server (all require socket auth)
export interface StartSessionPayload {
  presentationId: string;
}

export interface EndSessionPayload {
  sessionId: string;
}

export interface ChangeSlidePayload {
  sessionId: string;
  slideId?: string; // for go_to_slide
}

export interface LockVotingPayload {
  sessionId: string;
  locked: boolean;
}

// Server → All (broadcast)
export interface SessionStartedEvent {
  sessionId: string;
  currentSlideId: string;
  votingLocked: boolean;
}

export interface SessionEndedEvent {
  sessionId: string;
}

export interface SlideChangedEvent {
  currentSlideId: string;
  votingLocked: boolean;
}

export interface TallyUpdateEvent {
  slideId: string;
  tally: Tally;
}

export interface PresenceUpdateEvent {
  count: number;
  presenterOnline: boolean;
}

export interface QuestionUpdateEvent {
  questions: QAQuestion[];
}

export interface VotingLockedEvent {
  locked: boolean;
}

export interface ErrorEvent {
  code: string;
  message: string;
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export interface AIGeneratedSlide {
  type: SlideType;
  question: string;
  options: string[];
}

export interface AISummaryResult {
  themes: string[];
  synthesis: string;
}
