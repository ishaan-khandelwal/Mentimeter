import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateWithAi, hasAnyAiProvider } from '@/lib/aiProvider';
import { z } from 'zod';

const AiQuestionsSchema = z.object({
  topic: z.string().min(2).max(500),
  count: z.number().int().min(1).max(20).optional().default(3),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
});

const difficultyGuidance: Record<'easy' | 'medium' | 'hard', string> = {
  easy: 'Keep questions simple, broad, and accessible — light icebreaker-style prompts anyone can answer instantly with no prior knowledge.',
  medium: 'Write moderately challenging questions that require some thought or opinion, suitable for a general engaged audience.',
  hard: 'Write in-depth, specific, and challenging questions that require expertise, careful reasoning, or nuanced opinions on the topic.',
};

function buildPrompts(topic: string, count: number, difficulty: 'easy' | 'medium' | 'hard') {
  const systemPrompt = `You are an expert interactive presentation designer.
Generate ${count} interactive presentation questions for live audience engagement on the topic provided.
Difficulty level: "${difficulty}". ${difficultyGuidance[difficulty]}
Valid slide types are: "multiple_choice", "word_cloud", "open_text", "rating_scale", "ranking", "qa".
Respond ONLY with a valid JSON array of objects with the structure:
[
  {
    "type": "multiple_choice" | "word_cloud" | "open_text" | "rating_scale" | "ranking" | "qa",
    "question": "Engaging question text",
    "options": ["Option 1", "Option 2"], // only for multiple_choice and ranking
    "correctAnswer": "Option 1" // only for multiple_choice: designate the correct quiz answer from the options array
  }
]`;
  const userPrompt = `Topic: "${topic}". Create ${count} diverse and engaging interactive poll questions at "${difficulty}" difficulty.`;
  return { systemPrompt, userPrompt };
}

function extractSlidesJson(text: string) {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Invalid JSON format from AI response');
  }
  return JSON.parse(jsonMatch[0]);
}

function buildFallbackSlides(topic: string, count: number, difficulty: 'easy' | 'medium' | 'hard') {
  const easyPool = [
    { type: 'multiple_choice', question: `What's your first impression of "${topic}"?`, options: ['Excited', 'Curious', 'Neutral', 'Unsure'], correctAnswer: 'Excited' },
    { type: 'word_cloud', question: `In one word, what comes to mind when you think of "${topic}"?`, options: [] },
    { type: 'rating_scale', question: `On a scale of 1-5, how familiar are you with "${topic}"?`, options: [] },
  ];
  const mediumPool = [
    { type: 'multiple_choice', question: `How would you prioritize our current focus on "${topic}"?`, options: ['High priority — immediate focus', 'Medium priority — steady progress', 'Low priority — backlog for now', 'Need more information first'], correctAnswer: 'High priority — immediate focus' },
    { type: 'rating_scale', question: `On a scale of 1-5, how confident do you feel about "${topic}"?`, options: [] },
    { type: 'ranking', question: `Rank these aspects of "${topic}" by importance`, options: ['Impact', 'Feasibility', 'Cost', 'Timeline'] },
    { type: 'open_text', question: `What's one challenge you associate with "${topic}"?`, options: [] },
  ];
  const hardPool = [
    { type: 'open_text', question: `What's the biggest risk or trade-off you see with "${topic}", and why?`, options: [] },
    { type: 'ranking', question: `Rank these strategic considerations for "${topic}" from most to least critical`, options: ['Long-term impact', 'Resource constraints', 'Stakeholder alignment', 'Technical complexity'] },
    { type: 'qa', question: `Ask a probing question about "${topic}" for the group to debate`, options: [] },
    { type: 'multiple_choice', question: `Which approach best addresses the core tension in "${topic}"?`, options: ['Iterative experimentation', 'Upfront comprehensive planning', 'Hybrid, phased rollout', 'Defer to external expertise'], correctAnswer: 'Hybrid, phased rollout' },
  ];
  const pool = difficulty === 'easy' ? easyPool : difficulty === 'hard' ? hardPool : mediumPool;
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = AiQuestionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const { topic, count, difficulty } = parsed.data;
  const { systemPrompt, userPrompt } = buildPrompts(topic, count, difficulty);

  // Tries Gemini -> Groq -> Anthropic (whichever are configured), falling through
  // on failure. Falls back to static templates if none are configured at all.
  if (!hasAnyAiProvider()) {
    return NextResponse.json({ slides: buildFallbackSlides(topic, count, difficulty) });
  }

  try {
    const textContent = await generateWithAi({ systemPrompt, userPrompt, maxOutputTokens: 4096 });
    const slides = extractSlidesJson(textContent);
    return NextResponse.json({ slides });
  } catch (err: any) {
    console.error('[AI Question Generator Error]:', err?.message || err);
    return NextResponse.json(
      { error: 'Failed to generate questions with AI: ' + (err?.message || 'Unknown error') },
      { status: 500 },
    );
  }
}
