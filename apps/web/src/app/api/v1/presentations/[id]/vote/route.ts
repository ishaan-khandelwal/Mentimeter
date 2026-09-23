import { NextResponse } from 'next/server';
import { prisma } from '@pollwave/shared';
import crypto from 'crypto';

interface RouteParams {
  params: { id: string };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// GET /api/v1/presentations/:id/vote — Get live aggregated tallies and answered counts
export async function GET(_req: Request, { params }: RouteParams) {
  const query = params.id;

  const presentation = await prisma.presentation.findFirst({
    where: {
      OR: [
        { id: query },
        { joinCode: query.toUpperCase() },
      ],
      status: { not: 'ended' },
    },
    include: {
      slides: { select: { id: true, options: true, type: true } },
    },
  });

  if (!presentation) {
    return NextResponse.json({ error: 'Presentation not found' }, { status: 404 });
  }

  // Fetch all responses for this presentation
  const responses = await prisma.response.findMany({
    where: { presentationId: presentation.id },
    select: {
      slideId: true,
      value: true,
      participantToken: true,
    },
  });

  const tallies: Record<string, Record<string, number>> = {};
  const answeredCounts: Record<string, number> = {};

  // Initialize for all slides
  presentation.slides.forEach((s) => {
    tallies[s.id] = {};
    answeredCounts[s.id] = 0;
    if (Array.isArray(s.options)) {
      (s.options as string[]).forEach((opt) => {
        tallies[s.id][opt] = 0;
      });
    }
  });

  // Aggregate responses
  responses.forEach((r) => {
    if (!tallies[r.slideId]) tallies[r.slideId] = {};
    answeredCounts[r.slideId] = (answeredCounts[r.slideId] || 0) + 1;

    const val = r.value;
    if (typeof val === 'string' || typeof val === 'number') {
      const key = String(val);
      tallies[r.slideId][key] = (tallies[r.slideId][key] || 0) + 1;
    } else if (Array.isArray(val)) {
      val.forEach((item) => {
        const key = String(item);
        tallies[r.slideId][key] = (tallies[r.slideId][key] || 0) + 1;
      });
    }
  });

  return NextResponse.json({
    presentationId: presentation.id,
    tallies,
    answeredCounts,
    totalResponses: responses.length,
  });
}

// POST /api/v1/presentations/:id/vote — Submit vote directly via REST
export async function POST(req: Request, { params }: RouteParams) {
  const query = params.id;

  const presentation = await prisma.presentation.findFirst({
    where: {
      OR: [
        { id: query },
        { joinCode: query.toUpperCase() },
      ],
      status: { not: 'ended' },
    },
    include: {
      sessions: { where: { status: 'active' }, orderBy: { startedAt: 'desc' }, take: 1 },
      slides: { select: { id: true, options: true, type: true } },
    },
  });

  if (!presentation) {
    return NextResponse.json({ error: 'Presentation not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { slideId, value, participantToken } = body as {
    slideId?: string;
    value?: any;
    participantToken?: string;
  };

  if (!slideId || value === undefined || !participantToken) {
    return NextResponse.json({ error: 'Missing slideId, value, or participantToken' }, { status: 400 });
  }

  const hashedToken = hashToken(participantToken);

  // Ensure active session exists
  let session = presentation.sessions[0];
  if (!session) {
    session = await prisma.session.create({
      data: {
        presentationId: presentation.id,
        currentSlideId: slideId,
        status: 'active',
      },
    });
  }

  // Upsert vote into PostgreSQL
  const savedResponse = await prisma.response.upsert({
    where: {
      slideId_participantToken: {
        slideId,
        participantToken: hashedToken,
      },
    },
    update: {
      value: value as any,
      sessionId: session.id,
    },
    create: {
      presentationId: presentation.id,
      sessionId: session.id,
      slideId,
      participantToken: hashedToken,
      value: value as any,
    },
  });

  // Count total answers for this slide
  const slideCount = await prisma.response.count({
    where: {
      presentationId: presentation.id,
      slideId,
    },
  });

  return NextResponse.json({
    success: true,
    responseId: savedResponse.id,
    slideId,
    answeredCount: slideCount,
  });
}
