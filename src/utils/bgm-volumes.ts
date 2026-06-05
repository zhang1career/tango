import {
  BGM_MIX_VOLUME_MAX,
  BGM_MIX_VOLUME_MIN,
  BGM_MIX_VOLUME_STEP,
  DEFAULT_BGM_MIX_VOLUME,
} from '../config/media-paths';
import {normalizeLogicalMediaPath} from './media-path-helpers';

export function wavBasenameFromLogicalPath(logicalPath: string | undefined): string {
  return normalizeLogicalMediaPath(logicalPath ?? '').split('/').pop() ?? '';
}

export function roundBgmMixVolume(value: number): number {
  // 用整数步数换算，避免 0.1 步进时的 IEEE754 误差（如 6 * 0.1 → 0.6000000000000001）
  const stepsPerUnit = Math.round(1 / BGM_MIX_VOLUME_STEP);
  const minSteps = Math.round(BGM_MIX_VOLUME_MIN * stepsPerUnit);
  const maxSteps = Math.round(BGM_MIX_VOLUME_MAX * stepsPerUnit);
  const steps = Math.round(value * stepsPerUnit);
  const clampedSteps = Math.min(maxSteps, Math.max(minSteps, steps));
  return clampedSteps / stepsPerUnit;
}

export function parseBgmMixVolume(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < BGM_MIX_VOLUME_MIN || value > BGM_MIX_VOLUME_MAX) return undefined;
  return roundBgmMixVolume(value);
}

export function savedBgmMixVolume(
  volumes: Record<string, number>,
  wavBasename: string
): number {
  if (!wavBasename) return DEFAULT_BGM_MIX_VOLUME;
  const v = volumes[wavBasename];
  return typeof v === 'number' && Number.isFinite(v) ? roundBgmMixVolume(v) : DEFAULT_BGM_MIX_VOLUME;
}

export function parseBgmVolumesFile(content: string): Record<string, number> {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const volume = parseBgmMixVolume(value);
    if (volume != null && volume !== DEFAULT_BGM_MIX_VOLUME) {
      out[key] = volume;
    }
  }
  return out;
}

/** 合并音量更新：值为默认 1 时从表中移除该文件名 */
export function applyBgmVolumeUpdates(
  current: Record<string, number>,
  updates: Record<string, number>
): Record<string, number> {
  const next = {...current};
  for (const [filename, volume] of Object.entries(updates)) {
    if (!filename.trim()) continue;
    const rounded = roundBgmMixVolume(volume);
    if (rounded === DEFAULT_BGM_MIX_VOLUME) {
      delete next[filename];
    } else {
      next[filename] = rounded;
    }
  }
  return next;
}

export function normalizeBgmVolumesMap(volumes: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(volumes)) {
    const rounded = roundBgmMixVolume(value);
    if (rounded !== DEFAULT_BGM_MIX_VOLUME) {
      out[key] = rounded;
    }
  }
  return out;
}

export function readBgmVolumeFromMap(
  volumes: Record<string, number>,
  wavLogicalPath: string
): number {
  return savedBgmMixVolume(volumes, wavBasenameFromLogicalPath(wavLogicalPath));
}
