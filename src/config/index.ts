/**
 * 游戏配置 - 从 .env 读取 (Vite: VITE_* 前缀)
 */

const env = import.meta.env;

export function getContentPath(): string {
  return env.GAME_CONTENT_PATH ?? env.VITE_GAME_CONTENT_PATH ?? '';
}

export function getAIGCApiKey(): string {
  return env.AIGC_API_KEY ?? env.VITE_AIGC_API_KEY ?? '';
}

export function getAIGCApiUrl(): string {
  return env.AIGC_API_URL ?? env.VITE_AIGC_API_URL ?? '';
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

/** 人物数据请求 URL（dev 走 api，prod 走静态资源） */
export function getCharactersFetchUrl(): string {
  return import.meta.env.DEV ? '/api/story-characters' : (env.VITE_CHARACTERS_PATH ?? 'assets/story-characters.json');
}

/** 规则数据请求 URL（dev 走 api，prod 走静态资源） */
export function getRulesFetchUrl(): string {
  return import.meta.env.DEV ? '/api/story-rules' : (env.VITE_RULES_PATH ?? 'assets/story-rules.json');
}
