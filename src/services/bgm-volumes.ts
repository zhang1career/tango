import {getBgmVolumesApiUrl} from '@/config';

export type BgmVolumesResponse = {
  ok: boolean;
  error?: string;
  volumes?: Record<string, number>;
};

function parseApiError(status: number, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return `HTTP ${status}`;
  try {
    const json = JSON.parse(trimmed) as {error?: string};
    if (json.error) return json.error;
  } catch {
    // not JSON
  }
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
}

export async function fetchBgmVolumes(): Promise<BgmVolumesResponse> {
  const res = await fetch(getBgmVolumesApiUrl());
  const text = await res.text();
  let json: BgmVolumesResponse;
  try {
    json = JSON.parse(text) as BgmVolumesResponse;
  } catch {
    return {ok: false, error: parseApiError(res.status, text)};
  }
  if (!res.ok && !json.error) {
    return {ok: false, error: `HTTP ${res.status}`};
  }
  return json;
}

export async function saveBgmVolumes(updates: Record<string, number>): Promise<BgmVolumesResponse> {
  const res = await fetch(getBgmVolumesApiUrl(), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({updates}),
  });
  const text = await res.text();
  let json: BgmVolumesResponse;
  try {
    json = JSON.parse(text) as BgmVolumesResponse;
  } catch {
    return {ok: false, error: parseApiError(res.status, text)};
  }
  if (!res.ok && !json.error) {
    return {ok: false, error: `HTTP ${res.status}`};
  }
  return json;
}
