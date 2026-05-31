/**
 * 通过 OpenAI 兼容 chat/completions 生成场景配图与 BGM，并保存到 assets/media_custom
 */

import {getAIGCApiKey, getAIGCApiUrl} from '@/config';
import {normalizeMediaSavePath} from '@/config/media-paths';

const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_MUSIC_MODEL = 'suno-v3.5';

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string; image_url?: { url?: string } }>;
    };
  }>;
};

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '');
}

async function chatCompletion(model: string, prompt: string, apiKey: string, apiUrl: string): Promise<ChatCompletionResponse> {
  const res = await fetch(`${normalizeApiUrl(apiUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{role: 'user', content: prompt}],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 错误 ${res.status}: ${err}`);
  }
  return (await res.json()) as ChatCompletionResponse;
}

function decodeBase64Payload(dataUrlOrBase64: string): { bytes: Uint8Array; mimeType: string } {
  const dataUrlMatch = dataUrlOrBase64.match(/^data:([^;]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const b64 = dataUrlMatch[2].replace(/\s/g, '');
    return {mimeType, bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))};
  }
  const b64 = dataUrlOrBase64.replace(/\s/g, '');
  return {mimeType: 'application/octet-stream', bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))};
}

function extractUrlFromText(text: string): string | null {
  const md = text.match(/!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/);
  if (md?.[1]) return md[1];
  const plain = text.match(/(https?:\/\/[^\s"'<>]+)/);
  return plain?.[1] ?? null;
}

type MessageContent = string | Array<{ type?: string; text?: string; image_url?: { url?: string } }>;

function extractMediaFromMessage(content: MessageContent | undefined): {
  sourceUrl?: string;
  base64?: string;
  mimeType?: string;
} {
  if (!content) throw new Error('API 未返回内容');

  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('data:')) return {base64: trimmed};
    const url = extractUrlFromText(trimmed);
    if (url) return {sourceUrl: url};
    if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 100) {
      return {base64: trimmed};
    }
    throw new Error('无法从 API 文本响应中解析媒体 URL 或 base64');
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === 'image_url' && part.image_url?.url) {
        const url = part.image_url.url;
        if (url.startsWith('data:')) return {base64: url};
        return {sourceUrl: url};
      }
      if (part?.text) {
        const nested = extractMediaFromMessage(part.text);
        if (nested.sourceUrl || nested.base64) return nested;
      }
    }
  }

  throw new Error('无法从 API 响应中解析媒体内容');
}

async function saveGameMedia(
  gameId: string,
  relativePath: string,
  opts: { contentBase64?: string; sourceUrl?: string }
): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error('保存媒体文件仅支持开发模式（npm run dev）');
  }
  const res = await fetch(`/api/games/${gameId}/media`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      path: relativePath,
      contentBase64: opts.contentBase64,
      sourceUrl: opts.sourceUrl,
    }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error || `保存失败 HTTP ${res.status}`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

async function persistGeneratedMedia(
  gameId: string,
  savePath: string,
  extracted: { sourceUrl?: string; base64?: string; mimeType?: string }
): Promise<string> {
  const {logicalPath} = normalizeMediaSavePath(savePath);
  if (extracted.sourceUrl) {
    await saveGameMedia(gameId, savePath, {sourceUrl: extracted.sourceUrl});
    return logicalPath;
  }
  if (extracted.base64) {
    const {bytes} = decodeBase64Payload(extracted.base64);
    await saveGameMedia(gameId, savePath, {contentBase64: bytesToBase64(bytes)});
    return logicalPath;
  }
  throw new Error('未获取到可保存的媒体数据');
}

export async function generateAndSaveSceneImage(
  prompt: string,
  savePath: string,
  gameId: string,
  model = DEFAULT_IMAGE_MODEL
): Promise<string> {
  const apiKey = getAIGCApiKey();
  const apiUrl = getAIGCApiUrl();
  if (!apiKey) throw new Error('请配置 VITE_AIGC_API_KEY');
  if (!apiUrl) throw new Error('请配置 VITE_AIGC_API_URL');

  const json = await chatCompletion(model, prompt, apiKey, apiUrl);
  const content = json.choices?.[0]?.message?.content;
  const extracted = extractMediaFromMessage(content);
  return persistGeneratedMedia(gameId, savePath, extracted);
}

export async function generateAndSaveSceneBgm(
  prompt: string,
  savePath: string,
  gameId: string,
  model = DEFAULT_MUSIC_MODEL
): Promise<string> {
  const apiKey = getAIGCApiKey();
  const apiUrl = getAIGCApiUrl();
  if (!apiKey) throw new Error('请配置 VITE_AIGC_API_KEY');
  if (!apiUrl) throw new Error('请配置 VITE_AIGC_API_URL');

  const json = await chatCompletion(model, prompt, apiKey, apiUrl);
  const content = json.choices?.[0]?.message?.content;
  const extracted = extractMediaFromMessage(content);
  return persistGeneratedMedia(gameId, savePath, extracted);
}
