import { NextResponse } from 'next/server';
import { prisma } from '@pollwave/shared';
import crypto from 'crypto';

interface RouteParams {
  params: { code: string };
}

// GET /api/v1/form/:code — get presentation and slides for async form
export async function GET(_req: Request, { params }: RouteParams) {
  const joinCode = params.code.toUpperCase();

  const presentation = await prisma.presentation.findUnique({
    where: { joinCode },
    include: {
      slides: { orderBy: { order: 'asc' } },
    },
  });

  if (!presentation) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }

  // Check deadline if set
  if (presentation.formDeadline && new Date() > new Date(presentation.formDeadline)) {
    return NextResponse.json({ error: 'This form has expired' }, { status: 410 });
  }

  return NextResponse.json({
    presentation: {
      id: presentation.id,
      title: presentation.title,
      joinCode: presentation.joinCode,
      theme: presentation.theme,
      isAsyncForm: presentation.isAsyncForm,
      formDeadline: presentation.formDeadline?.toISOString() ?? null,
    },
    slides: presentation.slides.map((s: any) => ({
      _id: s.id,
      id: s.id,
      order: s.order,
      type: s.type,
      question: s.question,
      options: (s.options as string[]) || [],
      config: (s.config as Record<string, any>) || {},
      hideResults: s.hideResults,
      timerSeconds: s.timerSeconds,
      maxVotes: s.maxVotes,
    })),
  });
}

// POST /api/v1/form/:code — submit responses asynchronously
export async function POST(req: Request, { params }: RouteParams) {
  const joinCode = params.code.toUpperCase();

  const presentation = await prisma.presentation.findUnique({
    where: { joinCode },
  });

  if (!presentation) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }

  if (presentation.formDeadline && new Date() > new Date(presentation.formDeadline)) {
    return NextResponse.json({ error: 'This form has expired' }, { status: 410 });
  }

  const body = await req.json();
  const { responses, participantToken } = body as {
    responses: Record<string, any>; // { [slideId]: value }
    participantToken: string;
  };

  if (!participantToken || !responses) {
    return NextResponse.json({ error: 'Missing token or responses' }, { status: 400 });
  }

  const hashedToken = crypto.createHash('sha256').update(participantToken).digest('hex');

  // Find or create default session for async responses
  let session = await prisma.session.findFirst({
    where: { presentationId: presentation.id, status: 'active' },
  });

  if (!session) {
    session = await prisma.session.create({
      data: {
        presentationId: presentation.id,
        status: 'active',
      },
    });
  }

  // Upsert responses
  const promises = Object.entries(responses).map(async ([slideId, value]) => {
    return prisma.response.upsert({
      where: {
        slideId_participantToken: {
          slideId,
          participantToken: hashedToken,
        },
      },
      update: {
        value: value as any,
      },
      create: {
        slideId,
        sessionId: session!.id,
        presentationId: presentation.id,
        participantToken: hashedToken,
        value: value as any,
      },
    });
  });

  await Promise.all(promises);

  return NextResponse.json({ success: true, count: Object.keys(responses).length });
}
