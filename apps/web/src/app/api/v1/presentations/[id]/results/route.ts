import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@pollwave/shared';

interface RouteParams {
  params: { id: string };
}

// GET /api/v1/presentations/:id/results — get analytics & responses or CSV export
export async function GET(req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;
  const url = new URL(req.url);
  const format = url.searchParams.get('format'); // 'csv' or null

  const presentation = await prisma.presentation.findUnique({
    where: { id: params.id },
    include: {
      slides: { orderBy: { order: 'asc' } },
      responses: {
        orderBy: { createdAt: 'asc' },
        include: { slide: true },
      },
      sessions: {
        orderBy: { startedAt: 'desc' },
      },
    },
  });

  if (!presentation || presentation.ownerId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Who each hashed participantToken belongs to (nickname/avatar are only
  // ever sent at join time, never with individual votes), keyed per-session
  // since the same browser token can rejoin under a different nickname.
  const participants = await prisma.participant.findMany({
    where: { presentationId: presentation.id },
  });
  const participantMap = new Map(
    participants.map((p) => [`${p.sessionId}:${p.participantToken}`, { nickname: p.nickname, avatar: p.avatar }])
  );
  const getRespondent = (sessionId: string, participantToken: string) =>
    participantMap.get(`${sessionId}:${participantToken}`) || { nickname: 'Anonymous', avatar: '❓' };

  // Handle CSV export
  if (format === 'csv') {
    const rows = [
      ['Response ID', 'Slide Order', 'Slide Type', 'Question', 'Respondent', 'Response Value', 'Submitted At'],
    ];

    for (const r of presentation.responses) {
      let valStr = '';
      if (typeof r.value === 'object') {
        valStr = JSON.stringify(r.value);
      } else {
        valStr = String(r.value ?? '');
      }

      const respondent = getRespondent(r.sessionId, r.participantToken);

      rows.push([
        r.id,
        String(r.slide.order + 1),
        r.slide.type,
        `"${r.slide.question.replace(/"/g, '""')}"`,
        `"${respondent.nickname.replace(/"/g, '""')}"`,
        `"${valStr.replace(/"/g, '""')}"`,
        r.createdAt.toISOString(),
      ]);
    }

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${presentation.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_results.csv"`,
      },
    });
  }

  // Aggregate results per slide
  const uniqueParticipants = new Set(presentation.responses.map((r) => r.participantToken)).size;

  const slidesWithResults = presentation.slides.map((slide) => {
    const slideResponses = presentation.responses.filter((r) => r.slideId === slide.id);
    const options = (slide.options as string[]) || [];

    // Tally based on slide type
    const tally: Record<string, number> = {};
    const textAnswers: string[] = [];
    const numericValues: number[] = [];

    if (slide.type === 'multiple_choice' || slide.type === 'ranking') {
      options.forEach((opt) => (tally[opt] = 0));
      slideResponses.forEach((r) => {
        if (Array.isArray(r.value)) {
          r.value.forEach((v) => {
            const key = String(v);
            tally[key] = (tally[key] || 0) + 1;
          });
        } else if (typeof r.value === 'string') {
          tally[r.value] = (tally[r.value] || 0) + 1;
        }
      });
    } else if (slide.type === 'scales' || slide.type === 'hundred_points') {
      // For scales or hundred_points, value is often an object { [statementOrOption]: score }
      slideResponses.forEach((r) => {
        if (typeof r.value === 'object' && r.value !== null && !Array.isArray(r.value)) {
          Object.entries(r.value).forEach(([k, v]) => {
            const num = Number(v) || 0;
            tally[k] = (tally[k] || 0) + num;
          });
        }
      });
    } else if (slide.type === 'number' || slide.type === 'rating') {
      slideResponses.forEach((r) => {
        const num = Number(r.value);
        if (!isNaN(num)) numericValues.push(num);
      });
    } else {
      // word_cloud, open_text, qa
      slideResponses.forEach((r) => {
        if (typeof r.value === 'string') textAnswers.push(r.value);
        else if (typeof r.value === 'object') textAnswers.push(JSON.stringify(r.value));
      });
    }

    const avg = numericValues.length > 0
      ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
      : null;

    // Individual respondent breakdown — who gave which answer, and when.
    const respondents = slideResponses
      .map((r) => {
        const { nickname, avatar } = getRespondent(r.sessionId, r.participantToken);
        return {
          nickname,
          avatar,
          value: r.value,
          submittedAt: r.createdAt.toISOString(),
        };
      })
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

    return {
      id: slide.id,
      _id: slide.id,
      order: slide.order,
      type: slide.type,
      question: slide.question,
      options,
      hideResults: slide.hideResults,
      timerSeconds: slide.timerSeconds,
      maxVotes: slide.maxVotes,
      responseCount: slideResponses.length,
      respondents,
      tally,
      textAnswers,
      numericValues,
      average: avg ? Math.round(avg * 10) / 10 : null,
    };
  });

  return NextResponse.json({
    presentation: {
      _id: presentation.id,
      id: presentation.id,
      title: presentation.title,
      joinCode: presentation.joinCode,
      status: presentation.status,
      theme: presentation.theme,
      isAsyncForm: presentation.isAsyncForm,
      createdAt: presentation.createdAt.toISOString(),
      updatedAt: presentation.updatedAt.toISOString(),
    },
    totalResponses: presentation.responses.length,
    uniqueParticipants,
    sessionCount: presentation.sessions.length,
    slides: slidesWithResults,
  });
}
