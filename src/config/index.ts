/**
 * 游戏配置 - 从 .env 读取 (Vite: VITE_* 前缀)
 * 支持多游戏：gameId 用于数据隔离，默认 'default'
 */

import {CUSTOM_MEDIA_FS_DIR} from './media-paths';

const env = import.meta.env;

export const DEFAULT_GAME_ID = 'default';

/** 游戏数据根路径（如 assets/games），可从 VITE_GAMES_BASE_PATH 或 GAMES_BASE_PATH 配置 */
export function getGamesBasePath(): string {
  const v = (import.meta.env.VITE_GAMES_BASE_PATH ?? import.meta.env.GAMES_BASE_PATH ?? 'assets/games') as string;
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

/** 获取游戏数据路径前缀：{gamesBasePath}/{gameId}/，prod 静态资源用 */
export function getGameAssetsPrefix(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  return `${getGamesBasePath()}/${id}`;
}

/** 项目级自定义媒体目录（本地覆盖，不属于某个 gameId） */
export function getCustomMediaAssetsPrefix(): string {
  return CUSTOM_MEDIA_FS_DIR;
}

export function getContentPath(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  return `${getGamesBasePath()}/${id}/story.tw`;
}

export function getAIGCApiKey(): string {
  return env.AIGC_API_KEY ?? env.VITE_AIGC_API_KEY ?? '';
}

export function getAIGCApiUrl(): string {
  return env.AIGC_API_URL ?? env.VITE_AIGC_API_URL ?? '';
}

/** 剧情生成自动分页：每页最少字数 */
export function getPassagePageCharsMin(): number {
  const n = Number(env.VITE_PASSAGE_PAGE_CHARS_MIN);
  return Number.isNaN(n) || n < 1 ? 300 : n;
}

/** 剧情生成自动分页：每页最多字数 */
export function getPassagePageCharsMax(): number {
  const n = Number(env.VITE_PASSAGE_PAGE_CHARS_MAX);
  const min = getPassagePageCharsMin();
  return Number.isNaN(n) || n < min ? min + 200 : n;
}

/** dev: 显示编辑菜单；prod: 仅提供游戏，不提供时间线/地图/人物/事件/物品/元信息。配置 VITE_APP_MODE 或 APP_MODE */
export function getAppMode(): 'dev' | 'prod' {
  const v = (env.VITE_APP_MODE ?? env.APP_MODE ?? 'dev') as string;
  return v === 'prod' ? 'prod' : 'dev';
}

/** 行为引擎：可用行为列表最大返回数量 */
export function getBehaviorListLimit(): number {
  const n = Number(env.VITE_BEHAVIOR_LIST_LIMIT);
  return Number.isNaN(n) || n < 1 ? 10 : n;
}

/** 行为交互历史：弹窗打开时初始显示条数（与 VITE_BEHAVIOR_LIST_LIMIT 一致） */
export function getBehaviorHistoryInitialCount(): number {
  return getBehaviorListLimit();
}

/** 行为交互历史：向上滚动加载更多时，每页加载条数 */
export function getBehaviorHistoryPageSize(): number {
  const n = Number(env.VITE_BEHAVIOR_HISTORY_PAGE_SIZE);
  return Number.isNaN(n) || n < 1 ? getBehaviorListLimit() : n;
}

function toFetchUrl(relativePath: string): string {
  return relativePath.startsWith('/') || /^https?:\/\//i.test(relativePath) ? relativePath : `/${relativePath}`;
}

/** 人物数据请求 URL（dev 走 api，prod 走静态资源）。gameId 用于多游戏隔离 */
export function getCharactersFetchUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV ? `/api/games/${id}/story-characters` : (env.VITE_CHARACTERS_PATH ?? `${getGameAssetsPrefix(id)}/story-characters.json`);
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** 规则数据请求 URL */
export function getRulesFetchUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV ? `/api/games/${id}/story-rules` : (env.VITE_RULES_PATH ?? `${getGameAssetsPrefix(id)}/story-rules.json`);
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** 场景数据请求 URL */
export function getScenesFetchUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV ? `/api/games/${id}/story-scenes` : `${getGameAssetsPrefix(id)}/story-scenes.json`;
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** 事件数据请求 URL */
export function getEventsFetchUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV ? `/api/games/${id}/story-events` : `${getGameAssetsPrefix(id)}/story-events.json`;
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** 物品数据请求 URL */
export function getItemsFetchUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV ? `/api/games/${id}/story-items` : `${getGameAssetsPrefix(id)}/story-items.json`;
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** 元信息请求 URL */
export function getMetadataFetchUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV ? `/api/games/${id}/story-metadata` : `${getGameAssetsPrefix(id)}/story-metadata.json`;
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** 地图数据请求 URL */
export function getMapsFetchUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV ? `/api/games/${id}/story-maps` : `${getGameAssetsPrefix(id)}/story-maps.json`;
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** 功能板块请求 URL */
export function getFeaturesFetchUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV ? `/api/games/${id}/story-features` : `${getGameAssetsPrefix(id)}/story-features.json`;
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** 游戏内容请求 URL（story.tw）*/
export function getGameContentUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV ? `/api/games/${id}/game-content` : `${getGameAssetsPrefix(id)}/story.tw`;
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** 剧情框架请求 URL（story-fm.json）*/
export function getStoryFmFetchUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV ? `/api/games/${id}/story-fm` : `${getGameAssetsPrefix(id)}/story-fm.json`;
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** Godot 剧情包请求 URL（story_bundle.json）*/
export function getStoryBundleFetchUrl(gameId?: string): string {
  const id = gameId || DEFAULT_GAME_ID;
  const path = import.meta.env.DEV
    ? `/api/games/${id}/story-bundle`
    : `${getGameAssetsPrefix(id)}/story_bundle.json`;
  return import.meta.env.DEV ? path : toFetchUrl(path);
}

/** 媒体资源基础 URL（如 CDN）。多游戏时 resolveMediaUrl 会追加 /games/{gameId} */
export function getMediaBaseUrl(): string {
  const base = (env.VITE_MEDIA_BASE_URL ?? env.MEDIA_BASE_URL ?? '') as string;
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function isLegacyLocalMediaBase(base: string): boolean {
  const normalized = base.replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized === 'assets/media';
}

/** 解析媒体 URL：优先支持多游戏目录媒体，其次兼容旧 mediaBase/CDN 配置 */
export function resolveMediaUrl(path: string, gameId?: string): string {
  if (!path || /^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  const base = getMediaBaseUrl();

  if (gameId) {
    if (normalized.startsWith('media/')) {
      return toFetchUrl(`${getGameAssetsPrefix(gameId)}/${normalized}`);
    }
    if (normalized.startsWith('media_custom/') || normalized.startsWith('media-custom/')) {
      const subPath = normalized.replace(/^media[-_]custom\//, '');
      const customPrefix = getCustomMediaAssetsPrefix();
      if (!base || isLegacyLocalMediaBase(base)) {
        return toFetchUrl(`${customPrefix}/${subPath}`);
      }
      return `${base}/media_custom/${subPath}`;
    }
    // 新设计：媒体与游戏数据同目录（assets/games/{gameId}/...）
    // 同时兼容旧默认配置 assets/media，避免其覆盖新目录解析。
    if (!base || isLegacyLocalMediaBase(base)) {
      if (base) return `${base}/${normalized}`;
      return toFetchUrl(`${getGameAssetsPrefix(gameId)}/${normalized}`);
    }
    return `${base}/games/${gameId}/${normalized}`;
  }

  if (!base) return path;
  return `${base}/${normalized}`;
}
