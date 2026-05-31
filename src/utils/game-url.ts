import {DEFAULT_GAME_ID, getConfiguredDefaultGameId} from '@/config';

/** URL 查询参数名，如 /tango/?game=lin_zexu */
export const GAME_URL_PARAM = 'game';

export function isValidGameId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function parseGameIdFromUrl(search?: string): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(search ?? window.location.search);
  const raw = params.get(GAME_URL_PARAM)?.trim();
  if (!raw || !isValidGameId(raw)) return null;
  return raw;
}

/** 启动时解析：URL 参数 > VITE_DEFAULT_GAME_ID > default */
export function resolveInitialGameId(): string {
  return parseGameIdFromUrl() ?? getConfiguredDefaultGameId();
}

/** 切换游戏时同步地址栏；default 时移除参数以保持 URL 简洁 */
export function setGameIdInUrl(gameId: string, replace = true): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const defaultId = getConfiguredDefaultGameId();
  if (!gameId || gameId === defaultId || gameId === DEFAULT_GAME_ID) {
    url.searchParams.delete(GAME_URL_PARAM);
  } else {
    url.searchParams.set(GAME_URL_PARAM, gameId);
  }
  const next = url.pathname + url.search + url.hash;
  if (replace) {
    window.history.replaceState(null, '', next);
  } else {
    window.history.pushState(null, '', next);
  }
}
