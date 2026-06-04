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

export async function mixSceneBgm(body: MixBgmRequest): Promise<MixBgmResponse> {
  const res = await fetch('/api/media/mix-bgm', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as MixBgmResponse;
  if (!res.ok && !json.error) {
    return {ok: false, error: `HTTP ${res.status}`};
  }
  return json;
}
