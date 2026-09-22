import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@pollwave/shared';
import { z } from 'zod';

interface RouteParams {
  params: { id: string };
}

// GET /api/v1/presentations/:id — get with slides
export async function GET(_req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;

  const presentation = await prisma.presentation.findUnique({
    where: { id: params.id },
  });

  if (!presentation || presentation.ownerId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const slides = await prisma.slide.findMany({
    where: { presentationId: params.id },
    orderBy: { order: 'asc' },
  });

  const formattedPresentation = {
    ...presentation,
    _id: presentation.id,
  };

  const formattedSlides = slides.map((s) => ({
    ...s,
    _id: s.id,
    options: (s.options as string[]) || [],
    config: (s.config as Record<string, any>) || {},
  }));

  return NextResponse.json({
    presentation: formattedPresentation,
    slides: formattedSlides,
  });
}

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(['draft', 'live', 'ended']).optional(),
});

// PATCH /api/v1/presentations/:id — update title or status
export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;

  const presentation = await prisma.presentation.findUnique({
    where: { id: params.id },
  });

  if (!presentation || presentation.ownerId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const result = UpdateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten().fieldErrors }, { status: 400 });
  }

  const updated = await prisma.presentation.update({
    where: { id: params.id },
    data: result.data,
  });

  return NextResponse.json({
    ...updated,
    _id: updated.id,
  });
}

// DELETE /api/v1/presentations/:id — delete presentation and all cascading slides
export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;

  const presentation = await prisma.presentation.findUnique({
    where: { id: params.id },
  });

  if (!presentation || presentation.ownerId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Cascade delete is handled by Prisma schema relation onDelete: Cascade
  await prisma.presentation.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ ok: true });
}
