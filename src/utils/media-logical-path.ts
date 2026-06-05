import {dirname, normalize, resolve} from 'node:path';
import {
  BGM_EVENT_VOLUMES_FILENAME,
  CUSTOM_MEDIA_FS_DIR,
  CUSTOM_MEDIA_LOGICAL_PREFIX,
  DEFAULT_BGM_MIX_VOLUME,
  GENERATED_MEDIA_FS_DIR,
  GENERATED_MEDIA_LOGICAL_PREFIX,
} from '../config/media-paths';
import {parseBgmMixVolume, readBgmVolumeFromMap, wavBasenameFromLogicalPath} from './bgm-volumes';
import {isMp3LogicalPath, isWavLogicalPath, normalizeLogicalMediaPath} from './media-path-helpers';

export {isMp3LogicalPath, isWavLogicalPath, normalizeLogicalMediaPath};

function isPathTraversal(segmentPath: string): boolean {
  const n = normalize(segmentPath);
  return n.startsWith('..') || n.includes('/../') || n.includes('\\..\\');
}

/**
 * 将 JSON 中的逻辑媒体路径解析为项目根下的绝对路径。
 * 仅支持 media_custom/ 与 media_gen/{gameId}/ 前缀。
 */
export function resolveMediaToFsPath(
  logicalPath: string,
  gameId: string,
  projectRoot: string
): {ok: true; fsPath: string} | {ok: false; error: string} {
  const normalized = normalizeLogicalMediaPath(logicalPath);
  if (!normalized) {
    return {ok: false, error: '路径不能为空'};
  }
  if (isPathTraversal(normalized)) {
    return {ok: false, error: `非法路径: ${logicalPath}`};
  }
  if (/^https?:\/\//i.test(normalized)) {
    return {ok: false, error: '仅支持 media_custom 或 media_gen 相对路径'};
  }

  const root = resolve(projectRoot);

  if (normalized.startsWith(`${CUSTOM_MEDIA_LOGICAL_PREFIX}/`)) {
    const sub = normalized.slice(`${CUSTOM_MEDIA_LOGICAL_PREFIX}/`.length);
    const fsPath = resolve(root, CUSTOM_MEDIA_FS_DIR, sub);
    if (!fsPath.startsWith(resolve(root, CUSTOM_MEDIA_FS_DIR))) {
      return {ok: false, error: `非法路径: ${logicalPath}`};
    }
    return {ok: true, fsPath};
  }

  const genPrefix = `${GENERATED_MEDIA_LOGICAL_PREFIX}/${gameId}/`;
  if (normalized.startsWith(genPrefix)) {
    const sub = normalized.slice(genPrefix.length);
    const fsPath = resolve(root, GENERATED_MEDIA_FS_DIR, gameId, sub);
    const base = resolve(root, GENERATED_MEDIA_FS_DIR, gameId);
    if (!fsPath.startsWith(base)) {
      return {ok: false, error: `非法路径: ${logicalPath}`};
    }
    return {ok: true, fsPath};
  }

  return {
    ok: false,
    error: `路径须以 ${CUSTOM_MEDIA_LOGICAL_PREFIX}/ 或 ${GENERATED_MEDIA_LOGICAL_PREFIX}/${gameId}/ 开头`,
  };
}

export function bgmEventVolumesFsPath(projectRoot: string): string {
  return resolve(projectRoot, CUSTOM_MEDIA_FS_DIR, 'bgm', BGM_EVENT_VOLUMES_FILENAME);
}

export function readBgmVolumesFromFile(
  projectRoot: string,
  readFile: (p: string) => string,
  exists: (p: string) => boolean
): Record<string, number> {
  const configPath = bgmEventVolumesFsPath(projectRoot);
  if (!exists(configPath)) return {};
  try {
    const parsed = JSON.parse(readFile(configPath)) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const volume = parseBgmMixVolume(value);
      if (volume != null) out[key] = volume;
    }
    return out;
  } catch {
    return {};
  }
}

/** Node 环境读取 BGM 轨音量（vite 中间件用；场景轨与事件轨共用同一配置表） */
export function readBgmVolumeFromFile(
  wavLogicalPath: string,
  projectRoot: string,
  readFile: (p: string) => string,
  exists: (p: string) => boolean
): number {
  const basename = wavBasenameFromLogicalPath(wavLogicalPath);
  if (!basename) return DEFAULT_BGM_MIX_VOLUME;
  return readBgmVolumeFromMap(readBgmVolumesFromFile(projectRoot, readFile, exists), wavLogicalPath);
}

/** @deprecated 使用 readBgmVolumeFromFile */
export const readEventBgmVolumeFromFile = readBgmVolumeFromFile;

export function ensureParentDir(fsPath: string, mkdirSync: (dir: string, opts: {recursive: boolean}) => void): void {
  mkdirSync(dirname(fsPath), {recursive: true});
}
