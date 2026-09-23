import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@pollwave/shared';

interface RouteParams {
  params: { id: string };
}

// POST /api/v1/presentations/:id/duplicate — clone presentation + slides
export async function POST(_req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;

  const original = await prisma.presentation.findUnique({
    where: { id: params.id },
    include: { slides: { orderBy: { order: 'asc' } } },
  });

  if (!original || original.ownerId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let joinCode = '';
  let attempts = 0;
  do {
    joinCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    attempts++;
    const existing = await prisma.presentation.findUnique({ where: { joinCode } });
    if (!existing) break;
  } while (attempts < 20);

  const copy = await prisma.presentation.create({
    data: {
      ownerId: userId,
      title: `${original.title} (Copy)`,
      joinCode,
      status: 'draft',
      theme: (original.theme as any) ?? undefined,
      isAsyncForm: original.isAsyncForm,
    },
  });

  if ((original.slides as any[]).length > 0) {
    await prisma.slide.createMany({
      data: (original.slides as any[]).map((s: any) => ({
        presentationId: copy.id,
        order: s.order,
        type: s.type,
        question: s.question,
        options: s.options ?? undefined,
        config: s.config ?? undefined,
        hideResults: s.hideResults,
        timerSeconds: s.timerSeconds,
        maxVotes: s.maxVotes,
      })),
    });
  }

  return NextResponse.json({
    presentation: {
      _id: copy.id,
      id: copy.id,
      title: copy.title,
      joinCode: copy.joinCode,
      status: copy.status,
      createdAt: copy.createdAt.toISOString(),
      updatedAt: copy.updatedAt.toISOString(),
    },
  }, { status: 201 });
}
