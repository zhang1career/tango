/** 项目级自定义媒体：磁盘目录与场景 JSON 中的逻辑前缀 */
export const CUSTOM_MEDIA_FS_DIR = 'assets/media_custom';
export const CUSTOM_MEDIA_LOGICAL_PREFIX = 'media_custom';

export function defaultSceneImageSavePath(sceneId: string): string {
  return `${CUSTOM_MEDIA_LOGICAL_PREFIX}/bg/${sceneId}.png`;
}

export function defaultSceneBgmSavePath(sceneId: string): string {
  return `${CUSTOM_MEDIA_LOGICAL_PREFIX}/bgm/${sceneId}.mp3`;
}
