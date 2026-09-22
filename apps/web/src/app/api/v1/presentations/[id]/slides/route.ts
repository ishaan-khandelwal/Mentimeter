import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@pollwave/shared';
import { z } from 'zod';

interface RouteParams {
  params: { id: string };
}

const SlideSchema = z.object({
  type: z.string(),
  question: z.string().min(1).max(500),
  options: z.array(z.string().max(200)).optional().default([]),
  order: z.number().int().min(0).optional(),
  config: z.record(z.any()).optional().default({}),
});

// POST /api/v1/presentations/:id/slides — add a slide
export async function POST(req: Request, { params }: RouteParams) {
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
  const result = SlideSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten().fieldErrors }, { status: 400 });
  }

  // Determine next order index
  const lastSlide = await prisma.slide.findFirst({
    where: { presentationId: params.id },
    orderBy: { order: 'desc' },
  });

  const order = result.data.order ?? (lastSlide ? lastSlide.order + 1 : 0);

  const slide = await prisma.slide.create({
    data: {
      presentationId: params.id,
      type: result.data.type,
      question: result.data.question,
      options: result.data.options,
      config: result.data.config,
      order,
    },
  });

  return NextResponse.json(
    {
      slide: {
        ...slide,
        _id: slide.id,
        options: (slide.options as string[]) || [],
        config: (slide.config as Record<string, any>) || {},
      },
    },
    { status: 201 },
  );
}

// GET /api/v1/presentations/:id/slides — list slides
export async function GET(_req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slides = await prisma.slide.findMany({
    where: { presentationId: params.id },
    orderBy: { order: 'asc' },
  });

  const formatted = slides.map((s) => ({
    ...s,
    _id: s.id,
    options: (s.options as string[]) || [],
    config: (s.config as Record<string, any>) || {},
  }));

  return NextResponse.json(formatted);
}
