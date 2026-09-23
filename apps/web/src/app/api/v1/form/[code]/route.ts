import { NextResponse } from 'next/server';
import { prisma } from '@pollwave/shared';
import crypto from 'crypto';

interface RouteParams {
  params: { code: string };
}

// GET /api/v1/form/:code — get presentation and slides for async form
export async function GET(_req: Request, { params }: RouteParams) {
  const joinCode = params?.code?.toUpperCase();

  if (!joinCode) {
    return NextResponse.json({ error: 'Invalid form code' }, { status: 400 });
  }

  const presentation = await prisma.presentation.findUnique({
    where: { joinCode },
    include: {
      slides: { orderBy: { order: 'asc' } },
    },
  });

  if (!presentation) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }

  const pres = presentation as any;

  // Check deadline if set
  if (pres.formDeadline) {
    const deadlineTime = new Date(pres.formDeadline).getTime();
    if (!isNaN(deadlineTime) && Date.now() > deadlineTime) {
      return NextResponse.json({ error: 'This form has expired' }, { status: 410 });
    }
  }

  return NextResponse.json({
    presentation: {
      id: pres.id,
      _id: pres.id,
      title: pres.title,
      joinCode: pres.joinCode,
      theme: pres.theme,
      isAsyncForm: Boolean(pres.isAsyncForm),
      formDeadline: pres.formDeadline ? new Date(pres.formDeadline).toISOString() : null,
    },
    slides: (pres.slides || []).map((s: any) => ({
      _id: s.id,
      id: s.id,
      order: s.order,
      type: s.type,
      question: s.question,
      options: (s.options as string[]) || [],
      config: (s.config as Record<string, any>) || {},
      hideResults: Boolean(s.hideResults),
      timerSeconds: s.timerSeconds ?? null,
      maxVotes: s.maxVotes ?? 1,
    })),
  });
}

// POST /api/v1/form/:code — submit responses asynchronously
export async function POST(req: Request, { params }: RouteParams) {
  const joinCode = params?.code?.toUpperCase();

  if (!joinCode) {
    return NextResponse.json({ error: 'Invalid form code' }, { status: 400 });
  }

  const presentation = await prisma.presentation.findUnique({
    where: { joinCode },
  });

  if (!presentation) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }

  const pres = presentation as any;

  if (pres.formDeadline) {
    const deadlineTime = new Date(pres.formDeadline).getTime();
    if (!isNaN(deadlineTime) && Date.now() > deadlineTime) {
      return NextResponse.json({ error: 'This form has expired' }, { status: 410 });
    }
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

  const sessionId = session.id;

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
        sessionId,
        presentationId: presentation.id,
        participantToken: hashedToken,
        value: value as any,
      },
    });
  });

  await Promise.all(promises);

  return NextResponse.json({ success: true, count: Object.keys(responses).length });
}
