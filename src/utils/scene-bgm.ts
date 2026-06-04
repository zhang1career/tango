import {resolveMediaUrl} from '@/config';

export type SceneBgmSources = {
  synthesizedBgm?: string;
  backgroundMusic?: string;
};

const mediaExistsCache = new Map<string, boolean>();

/** 检测媒体 URL 是否可访问（用于合成 BGM 是否存在） */
export async function mediaUrlExists(url: string): Promise<boolean> {
  const cached = mediaExistsCache.get(url);
  if (cached !== undefined) return cached;

  let ok = false;
  try {
    const head = await fetch(url, {method: 'HEAD', cache: 'no-cache'});
    if (head.ok) {
      ok = true;
    } else if (head.status === 405 || head.status === 501) {
      const probe = await fetch(url, {
        method: 'GET',
        headers: {Range: 'bytes=0-0'},
        cache: 'no-cache',
      });
      ok = probe.ok;
    }
  } catch {
    ok = false;
  }
  mediaExistsCache.set(url, ok);
  return ok;
}

/**
 * 场景 BGM：合成路径非空且文件存在时用 synthesizedBgm，否则用 backgroundMusic。
 */
export async function resolveSceneBgmPath(
  sources: SceneBgmSources,
  gameId: string
): Promise<string | undefined> {
  const synthesized = sources.synthesizedBgm?.trim();
  const fallback = sources.backgroundMusic?.trim();

  if (synthesized) {
    const url = resolveMediaUrl(synthesized, gameId);
    if (await mediaUrlExists(url)) return synthesized;
  }
  return fallback || undefined;
}
