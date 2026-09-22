import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const TokenSchema = z.object({
  presentationId: z.string().min(1),
});

/**
 * Issues a short-lived JWT for Socket.io presenter authentication.
 * Called by the presenter UI before connecting to the Socket.io server.
 *
 * The Express Socket.io middleware verifies this token to gate presenter events.
 * Token is scoped to { userId, presentationId } and expires in 15 minutes.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const result = TokenSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'presentationId required' }, { status: 400 });
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const token = jwt.sign(
    { userId, presentationId: result.data.presentationId },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  );

  return NextResponse.json({ token });
}
