import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@pollwave/shared';
import { z } from 'zod';

interface RouteParams {
  params: { id: string };
}

const UpdateSlideSchema = z.object({
  type: z.string().optional(),
  question: z.string().min(1).max(500).optional(),
  options: z.array(z.string().max(200)).optional(),
  order: z.number().int().min(0).optional(),
  config: z.record(z.any()).optional(),
});

// PATCH /api/v1/slides/:id
export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;

  const slide = await prisma.slide.findUnique({
    where: { id: params.id },
    include: { presentation: true },
  });

  if (!slide) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify ownership via presentation
  if (slide.presentation.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const result = UpdateSlideSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten().fieldErrors }, { status: 400 });
  }

  const updated = await prisma.slide.update({
    where: { id: params.id },
    data: {
      type: result.data.type,
      question: result.data.question,
      options: result.data.options,
      order: result.data.order,
      config: result.data.config,
    },
  });

  return NextResponse.json({
    ...updated,
    _id: updated.id,
    options: (updated.options as string[]) || [],
    config: (updated.config as Record<string, any>) || {},
  });
}

// DELETE /api/v1/slides/:id
export async function DELETE(_req: Request, { params }: RouteParams) {
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

  await prisma.slide.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ ok: true });
}
