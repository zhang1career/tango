import {getMixBgmApiUrl} from '@/config';

export type MixBgmRequest = {
  gameId: string;
  sceneBgmPath: string;
  eventBgmPath: string;
  outputPath: string;
};

export type MixBgmResponse = {
  ok: boolean;
  error?: string;
  outputPath?: string;
  outputFsPath?: string;
  eventVolume?: number;
};

function parseMixBgmErrorBody(status: number, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return `HTTP ${status}`;
  if (trimmed.includes('public base URL') && trimmed.includes('/tango/')) {
    return (
      '开发 API 未就绪：请停止后重新运行 npm run dev（vite.config 中的 /api/media/mix-bgm 需随 dev 服务启动加载）。' +
      ` 原始响应：${trimmed}`
    );
  }
  try {
    const json = JSON.parse(trimmed) as {error?: string; ok?: boolean};
    if (json.error) return json.error;
  } catch {
    // not JSON
  }
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
}

export async function mixSceneBgm(body: MixBgmRequest): Promise<MixBgmResponse> {
  const res = await fetch(getMixBgmApiUrl(), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: MixBgmResponse;
  try {
    json = JSON.parse(text) as MixBgmResponse;
  } catch {
    return {ok: false, error: parseMixBgmErrorBody(res.status, text)};
  }
  if (!res.ok && !json.error) {
    return {ok: false, error: `HTTP ${res.status}`};
  }
  return json;
}
