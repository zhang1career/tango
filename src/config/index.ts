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
