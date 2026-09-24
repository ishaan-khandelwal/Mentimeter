// Thin wrapper around the Gemini API (Google AI Studio) using plain fetch —
// no SDK dependency needed. Get a free API key at https://aistudio.google.com/apikey
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'your-gemini-api-key-here') return null;
  return key;
}

const RETRYABLE_STATUS = new Set([429, 503]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateWithGemini(params: {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  maxRetries?: number;
}): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const maxRetries = params.maxRetries ?? 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: params.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: params.userPrompt }] }],
          generationConfig: {
            maxOutputTokens: params.maxOutputTokens ?? 2048,
            temperature: 0.8,
          },
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
      if (!text) {
        const blockReason = data?.promptFeedback?.blockReason;
        throw new Error(blockReason ? `Gemini blocked the response: ${blockReason}` : 'Gemini returned an empty response');
      }
      return text;
    }

    const errBody = await res.text().catch(() => '');
    lastError = new Error(`Gemini API error (${res.status}): ${errBody || res.statusText}`);

    if (!RETRYABLE_STATUS.has(res.status) || attempt === maxRetries) {
      throw lastError;
    }
    await sleep(500 * Math.pow(2, attempt)); // 500ms, 1s, 2s...
  }

  throw lastError ?? new Error('Gemini API request failed');
}
