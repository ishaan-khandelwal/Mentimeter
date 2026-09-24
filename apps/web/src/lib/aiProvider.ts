import Anthropic from '@anthropic-ai/sdk';
import { generateWithGemini, getGeminiApiKey } from './gemini';
import { generateWithGroq, getGroqApiKey } from './groq';

function getAnthropicApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'your-anthropic-api-key') return null;
  return key;
}

export function hasAnyAiProvider(): boolean {
  return !!getGeminiApiKey() || !!getGroqApiKey() || !!getAnthropicApiKey();
}

async function generateWithAnthropic(params: {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: params.maxOutputTokens ?? 2048,
    system: params.systemPrompt,
    messages: [{ role: 'user', content: params.userPrompt }],
  });
  const firstContent = response.content[0];
  const text = firstContent.type === 'text' ? firstContent.text : '';
  if (!text) throw new Error('Anthropic returned an empty response');
  return text;
}

/**
 * Tries each configured AI provider in order (Gemini -> Groq -> Anthropic),
 * falling through to the next on failure (e.g. a transient 503) instead of
 * failing the whole request just because the first provider is having issues.
 */
export async function generateWithAi(params: {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const providers: Array<{ name: string; enabled: boolean; run: () => Promise<string> }> = [
    { name: 'Gemini', enabled: !!getGeminiApiKey(), run: () => generateWithGemini(params) },
    { name: 'Groq', enabled: !!getGroqApiKey(), run: () => generateWithGroq(params) },
    { name: 'Anthropic', enabled: !!getAnthropicApiKey(), run: () => generateWithAnthropic(params) },
  ];

  const errors: string[] = [];
  for (const provider of providers) {
    if (!provider.enabled) continue;
    try {
      return await provider.run();
    } catch (err: any) {
      const message = err?.message || String(err);
      console.error(`[AI Provider] ${provider.name} failed:`, message);
      errors.push(`${provider.name}: ${message}`);
    }
  }

  throw new Error(errors.length ? errors.join(' | ') : 'No AI provider configured');
}
