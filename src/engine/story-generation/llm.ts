import {getAIGCApiKey, getAIGCApiUrl, getAIGCModel} from '@/config';

export type ChatMessage = {role: 'system' | 'user' | 'assistant'; content: string};

export function requireAigcConfig(): {apiKey: string; apiUrl: string; model: string} {
  const apiKey = getAIGCApiKey();
  const apiUrl = getAIGCApiUrl();
  if (!apiKey) throw new Error('未配置 VITE_AIGC_API_KEY');
  if (!apiUrl) throw new Error('未配置 VITE_AIGC_API_URL');
  const model = getAIGCModel();
  return {apiKey, apiUrl, model};
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: {temperature?: number; model?: string}
): Promise<string> {
  const {apiKey, apiUrl, model: defaultModel} = requireAigcConfig();
  const model = options?.model ?? defaultModel;
  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 错误 ${res.status}: ${err}`);
  }
  const json = (await res.json()) as {choices?: Array<{message?: {content?: string}}>};
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('API 未返回内容');
  return content;
}

export function previewText(text: string, max = 400): string {
  const c = text.replace(/\s+/g, ' ').trim();
  return c.length > max ? `${c.slice(0, max)}…` : c;
}
