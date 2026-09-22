import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export interface PresenterJWTPayload {
  userId: string;
  presentationId: string;
  iat: number;
  exp: number;
}

export function requirePresenterAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing auth token' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as PresenterJWTPayload;
    // Attach to request for downstream use
    (req as Request & { presenter: PresenterJWTPayload }).presenter = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Issue a short-lived presenter socket token */
export function issuePresenterToken(
  userId: string,
  presentationId: string,
): string {
  return jwt.sign({ userId, presentationId }, config.jwtSecret, {
    expiresIn: '15m',
  });
}

/** Verify a presenter socket token (used in Socket.io middleware) */
export function verifyPresenterToken(token: string): PresenterJWTPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as PresenterJWTPayload;
  } catch {
    return null;
  }
}
