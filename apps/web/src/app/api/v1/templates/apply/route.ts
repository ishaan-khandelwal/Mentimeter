import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@pollwave/shared';
import { z } from 'zod';

const ApplyTemplateSchema = z.object({
  templateId: z.string(),
});

const TEMPLATES: Record<string, {
  title: string;
  theme: any;
  slides: Array<{
    type: string;
    question: string;
    options?: string[];
    config?: Record<string, any>;
  }>;
}> = {
  'team-retrospective': {
    title: 'Team All-Hands & Retrospective',
    theme: { colorScheme: 'saffron', fontStyle: 'modern', background: 'gradient' },
    slides: [
      {
        type: 'heading',
        question: 'Team All-Hands & Sprint Retrospective',
        config: { subtitle: 'Share feedback, celebrate wins, and prioritize next goals' },
      },
      {
        type: 'word_cloud',
        question: 'In one word, how was your week?',
        config: { maxEntries: 2 },
      },
      {
        type: 'scales',
        question: 'How do you feel about our current sprint execution?',
        options: [
          'Our sprint goals were clear and achievable',
          'We communicated blockers effectively',
          'Team morale and support remained high',
        ],
        config: { lowLabel: 'Strongly Disagree', highLabel: 'Strongly Agree' },
      },
      {
        type: 'hundred_points',
        question: 'Distribute 100 points across our top focus areas for next sprint',
        options: ['Bug Fixing & Tech Debt', 'New Feature Delivery', 'Documentation & Testing', 'Design Polish & UI'],
      },
      {
        type: 'qa',
        question: 'Open Q&A: What questions or ideas do you have for leadership?',
        config: { allowAnonymous: true },
      },
    ],
  },
  'product-roadmap': {
    title: 'Product Roadmap & Feature Prioritization',
    theme: { colorScheme: 'plum', fontStyle: 'modern', background: 'pattern' },
    slides: [
      {
        type: 'heading',
        question: 'Q3 Product Roadmap Prioritization',
        config: { subtitle: 'Help decide which features we build next' },
      },
      {
        type: 'multiple_choice',
        question: 'Which user persona is currently experiencing the biggest pain points?',
        options: ['Enterprise Admins', 'New Self-Serve Signups', 'Power Mobile Users', 'Free Tier Users'],
        config: { allowMultiple: false },
      },
      {
        type: 'hundred_points',
        question: 'Allocate 100 points to the features you want prioritized',
        options: ['AI Smart Summaries', 'Mobile Native Apps', 'Advanced CSV/PDF Reports', 'Custom Domain Branding'],
      },
      {
        type: 'rating_scale',
        question: 'How confident are you in our current quarterly ship date?',
        config: { min: 1, max: 5, lowLabel: 'Low Confidence', highLabel: 'Extremely Confident' },
      },
      {
        type: 'open_text',
        question: 'What is one feature or improvement we should consider that is NOT on the roadmap?',
      },
    ],
  },
  'classroom-quiz': {
    title: 'Interactive Knowledge Quiz Challenge',
    theme: { colorScheme: 'sunset', fontStyle: 'playful', background: 'solid' },
    slides: [
      {
        type: 'heading',
        question: 'Live Pop Quiz Challenge! 🚀',
        config: { subtitle: 'Get your phones ready. Speed and accuracy count for points!' },
      },
      {
        type: 'multiple_choice',
        question: 'Which of the following is NOT an advantage of real-time polling?',
        options: ['Instant audience feedback', 'Guaranteed 100% agreement', 'Higher engagement', 'Anonymous participation'],
        config: { correctAnswer: 'Guaranteed 100% agreement', durationSeconds: 20 },
      },
      {
        type: 'number',
        question: 'Guess the number: How many presentations are created globally every minute?',
        config: { min: 100, max: 100000, correctNumber: 3500 },
      },
      {
        type: 'ranking',
        question: 'Rank these factors by their impact on audience retention:',
        options: ['Interactive Questions', 'Concise Slide Design', 'Enthusiastic Speaker', 'Live Demos'],
      },
      {
        type: 'word_cloud',
        question: 'What was your favorite takeaway from today?',
        config: { maxEntries: 1 },
      },
    ],
  },
  'standup-checkin': {
    title: 'Daily Standup & Energy Check-in',
    theme: { colorScheme: 'forest', fontStyle: 'modern', background: 'gradient' },
    slides: [
      {
        type: 'number',
        question: 'Energy check: Rate your energy level today from 1 to 10',
        config: { min: 1, max: 10, step: 1 },
      },
      {
        type: 'word_cloud',
        question: 'What is your primary blocker today (if any)?',
        config: { maxEntries: 1 },
      },
      {
        type: 'multiple_choice',
        question: 'Are you on track to meet your sprint commitments?',
        options: ['Yes, fully on track 🟢', 'Slight delay, but manageable 🟡', 'Need urgent help / blocked 🔴'],
      },
    ],
  },
  'conference-keynote': {
    title: 'Conference Keynote & Audience Interaction',
    theme: { colorScheme: 'clay', fontStyle: 'classic', background: 'gradient' },
    slides: [
      {
        type: 'heading',
        question: 'Welcome to FutureTech 2026 Keynote',
        config: { subtitle: 'Join live on your phone using the code on screen' },
      },
      {
        type: 'word_cloud',
        question: 'Where is everyone joining from today? (City or Country)',
        config: { maxEntries: 1 },
      },
      {
        type: 'multiple_choice',
        question: 'How long have you been working with AI-driven developer tools?',
        options: ['Less than 6 months', '6 months to 1 year', '1 to 2 years', 'Over 2 years'],
      },
      {
        type: 'qa',
        question: 'Live Keynote Q&A — Submit and upvote questions for the speakers',
        config: { allowAnonymous: true, moderated: false },
      },
    ],
  },
};

// POST /api/v1/templates/apply — instantiate template into user presentation
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;
  const body = await req.json();
  const parsed = ApplyTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid template selection' }, { status: 400 });
  }

  const template = TEMPLATES[parsed.data.templateId];
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
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

  const presentation = await prisma.presentation.create({
    data: {
      ownerId: userId,
      title: template.title,
      joinCode,
      status: 'draft',
      theme: template.theme,
    },
  });

  if (template.slides.length > 0) {
    await prisma.slide.createMany({
      data: template.slides.map((s, idx) => ({
        presentationId: presentation.id,
        order: idx,
        type: s.type,
        question: s.question,
        options: s.options ?? undefined,
        config: s.config ?? undefined,
      })),
    });
  }

  return NextResponse.json({
    presentation: {
      _id: presentation.id,
      id: presentation.id,
      title: presentation.title,
      joinCode: presentation.joinCode,
      status: presentation.status,
    },
  }, { status: 201 });
}
