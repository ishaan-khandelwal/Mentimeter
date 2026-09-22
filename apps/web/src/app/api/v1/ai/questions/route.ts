import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const AiQuestionsSchema = z.object({
  topic: z.string().min(2).max(500),
  count: z.number().min(1).max(10).optional().default(3),
});

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

  const { topic, count } = parsed.data;

  // Check if Anthropic API key is present
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-anthropic-api-key') {
    // Provide realistic intelligent fallback slides for demo/development
    const fallbackSlides = [
      {
        type: 'multiple_choice',
        question: `How would you prioritize our current focus on "${topic}"?`,
        options: ['High priority — immediate focus', 'Medium priority — steady progress', 'Low priority — backlog for now', 'Need more information first'],
      },
      {
        type: 'word_cloud',
        question: `In one word, what comes to mind when you think of "${topic}"?`,
        options: [],
      },
      {
        type: 'rating_scale',
        question: `On a scale of 1-5, how confident do you feel about "${topic}"?`,
        options: [],
      },
    ].slice(0, count);

    return NextResponse.json({ slides: fallbackSlides });
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const systemPrompt = `You are an expert interactive presentation designer.
Generate ${count} interactive presentation questions for live audience engagement on the topic provided.
Valid slide types are: "multiple_choice", "word_cloud", "open_text", "rating_scale", "ranking", "qa".
Respond ONLY with a valid JSON array of objects with the structure:
[
  {
    "type": "multiple_choice" | "word_cloud" | "open_text" | "rating_scale" | "ranking" | "qa",
    "question": "Engaging question text",
    "options": ["Option 1", "Option 2"] // only for multiple_choice and ranking
  }
]`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Topic: "${topic}". Create ${count} diverse and engaging interactive poll questions.` }],
    });

    const firstContent = response.content[0];
    const textContent = firstContent.type === 'text' ? firstContent.text : '';
    
    // Extract JSON from response text (handling possible markdown backticks)
    const jsonMatch = textContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Invalid JSON format from AI response');
    }

    const slides = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ slides });
  } catch (err: any) {
    console.error('[AI Question Generator Error]:', err?.message || err);
    return NextResponse.json(
      { error: 'Failed to generate questions with AI: ' + (err?.message || 'Unknown error') },
      { status: 500 },
    );
  }
}
