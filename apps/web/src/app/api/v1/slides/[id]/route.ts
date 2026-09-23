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
  hideResults: z.boolean().optional(),
  timerSeconds: z.number().nullable().optional(),
  maxVotes: z.number().int().min(1).max(20).optional(),
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

  const updateData: any = {};
  if (result.data.type !== undefined) updateData.type = result.data.type;
  if (result.data.question !== undefined) updateData.question = result.data.question;
  if (result.data.options !== undefined) updateData.options = result.data.options;
  if (result.data.order !== undefined) updateData.order = result.data.order;
  if (result.data.config !== undefined) updateData.config = result.data.config;
  if (result.data.hideResults !== undefined) updateData.hideResults = result.data.hideResults;
  if (result.data.timerSeconds !== undefined) updateData.timerSeconds = result.data.timerSeconds;
  if (result.data.maxVotes !== undefined) updateData.maxVotes = result.data.maxVotes;

  const updated = await prisma.slide.update({
    where: { id: params.id },
    data: updateData,
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
