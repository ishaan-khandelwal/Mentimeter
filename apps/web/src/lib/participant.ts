import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'pollwave_participant_token';

export function getParticipantToken(): string {
  if (typeof window === 'undefined') return '';
  let token = localStorage.getItem(STORAGE_KEY);
  if (!token) {
    token = uuidv4();
    localStorage.setItem(STORAGE_KEY, token);
  }
  return token;
}
