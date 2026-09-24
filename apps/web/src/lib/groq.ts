// Thin wrapper around the Groq API (OpenAI-compatible chat completions) using
// plain fetch — no SDK dependency needed. Free API key at https://console.groq.com/keys
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

export function getGroqApiKey(): string | null {
  const key = process.env.GROQ_API_KEY;
  if (!key || key === 'your-groq-api-key-here') return null;
  return key;
}

export async function generateWithGroq(params: {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
      max_tokens: params.maxOutputTokens ?? 2048,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Groq API error (${res.status}): ${errBody || res.statusText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) {
    throw new Error('Groq returned an empty response');
  }
  return text;
}
