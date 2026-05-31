/** 项目级自定义媒体：磁盘目录与场景 JSON 中的逻辑前缀 */
export const CUSTOM_MEDIA_FS_DIR = 'assets/media_custom';
export const CUSTOM_MEDIA_LOGICAL_PREFIX = 'media_custom';

export function defaultSceneImageSavePath(sceneId: string): string {
  return `${CUSTOM_MEDIA_LOGICAL_PREFIX}/bg/${sceneId}.png`;
}

export function defaultSceneBgmSavePath(sceneId: string): string {
  return `${CUSTOM_MEDIA_LOGICAL_PREFIX}/bgm/${sceneId}.mp3`;
}

/** 将用户输入的保存路径规范为逻辑路径，并标明落盘根目录 */
export function normalizeMediaSavePath(inputPath: string): {
  logicalPath: string;
  fsSubPath: string;
  root: 'custom' | 'game';
} {
  const normalized = inputPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.startsWith(`${CUSTOM_MEDIA_FS_DIR}/`)) {
    const sub = normalized.slice(`${CUSTOM_MEDIA_FS_DIR}/`.length);
    return {logicalPath: `${CUSTOM_MEDIA_LOGICAL_PREFIX}/${sub}`, fsSubPath: sub, root: 'custom'};
  }
  if (normalized.startsWith(`${CUSTOM_MEDIA_LOGICAL_PREFIX}/`)) {
    const sub = normalized.slice(`${CUSTOM_MEDIA_LOGICAL_PREFIX}/`.length);
    return {logicalPath: normalized, fsSubPath: sub, root: 'custom'};
  }
  return {logicalPath: normalized, fsSubPath: normalized, root: 'game'};
}
