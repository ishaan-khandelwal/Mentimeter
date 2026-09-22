import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@pollwave/shared';
import { z } from 'zod';
import { nanoid } from './utils';

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
});

// GET /api/v1/presentations — list creator's presentations
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;

  const presentations = await prisma.presentation.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { slides: true },
      },
    },
  });

  const formatted = presentations.map((p) => ({
    _id: p.id,
    id: p.id,
    title: p.title,
    joinCode: p.joinCode,
    status: p.status,
    slideCount: p._count.slides,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return NextResponse.json({ presentations: formatted });
}

// POST /api/v1/presentations — create a new presentation
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const result = CreateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten().fieldErrors }, { status: 400 });
  }

  const userId = (session.user as { id?: string }).id!;

  // Generate a unique 6-character join code
  let joinCode: string = '';
  let attempts = 0;
  do {
    joinCode = nanoid(6);
    attempts++;
    if (attempts > 10) throw new Error('Failed to generate unique join code');
    const existing = await prisma.presentation.findUnique({ where: { joinCode } });
    if (!existing) break;
  } while (true);

  const presentation = await prisma.presentation.create({
    data: {
      ownerId: userId,
      title: result.data.title,
      joinCode,
      status: 'draft',
    },
  });

  return NextResponse.json(
    {
      presentation: {
        _id: presentation.id,
        id: presentation.id,
        title: presentation.title,
        joinCode: presentation.joinCode,
        status: presentation.status,
        createdAt: presentation.createdAt.toISOString(),
        updatedAt: presentation.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
