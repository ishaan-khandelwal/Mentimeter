import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@pollwave/shared';

interface RouteParams {
  params: { id: string };
}

// POST /api/v1/slides/:id/duplicate — duplicate a slide in place
export async function POST(_req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;

  const slide = await prisma.slide.findUnique({
    where: { id: params.id },
    include: { presentation: true },
  });

  if (!slide) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (slide.presentation.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Shift slides after this one
  await prisma.slide.updateMany({
    where: {
      presentationId: slide.presentationId,
      order: { gt: slide.order },
    },
    data: {
      order: { increment: 1 },
    },
  });

  const duplicated = await prisma.slide.create({
    data: {
      presentationId: slide.presentationId,
      type: slide.type,
      question: `${slide.question} (Copy)`,
      options: slide.options ?? undefined,
      config: slide.config ?? undefined,
      hideResults: slide.hideResults,
      timerSeconds: slide.timerSeconds,
      maxVotes: slide.maxVotes,
      order: slide.order + 1,
    },
  });

  return NextResponse.json({
    slide: {
      ...duplicated,
      _id: duplicated.id,
      options: (duplicated.options as string[]) || [],
      config: (duplicated.config as Record<string, any>) || {},
    },
  }, { status: 201 });
}
