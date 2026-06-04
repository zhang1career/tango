/** 项目级自定义媒体：磁盘目录与场景 JSON 中的逻辑前缀（原始素材，多为 wav） */
export const CUSTOM_MEDIA_FS_DIR = 'assets/media_custom';
export const CUSTOM_MEDIA_LOGICAL_PREFIX = 'media_custom';

/** 合成/转码媒体：按游戏隔离，输出多为 mp3 */
export const GENERATED_MEDIA_FS_DIR = 'assets/media_gen';
export const GENERATED_MEDIA_LOGICAL_PREFIX = 'media_gen';

/** 场景轨在 BGM 合成中的固定增益（不写入配置文件） */
export const SCENE_BGM_MIX_VOLUME = 0.6;

/** 事件轨音量表：位于 assets/media_custom/bgm/bgm-event-volumes.json */
export const BGM_EVENT_VOLUMES_FILENAME = 'bgm-event-volumes.json';
export const DEFAULT_EVENT_BGM_VOLUME = 1;

export function defaultSceneImageSavePath(sceneId: string): string {
  return `${CUSTOM_MEDIA_LOGICAL_PREFIX}/bg/${sceneId}.png`;
}

export function defaultSceneBgmSavePath(sceneId: string): string {
  return `${CUSTOM_MEDIA_LOGICAL_PREFIX}/bgm/${sceneId}.mp3`;
}

/** 合成 BGM 默认输出路径（逻辑路径，需配合 gameId） */
export function defaultSynthesizedBgmPath(gameId: string, sceneId: string): string {
  return `${GENERATED_MEDIA_LOGICAL_PREFIX}/${gameId}/bgm/${sceneId}.mp3`;
}
