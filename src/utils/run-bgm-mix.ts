import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {SCENE_BGM_MIX_VOLUME} from '../config/media-paths';

export type RunBgmMixArgs = {
  sceneFsPath: string;
  eventFsPath: string;
  outputFsPath: string;
  eventVolume: number;
};

export function runBgmMixFfmpeg(args: RunBgmMixArgs): {ok: true} | {ok: false; error: string} {
  const filter = `[0:a]volume=${SCENE_BGM_MIX_VOLUME}[a0];[1:a]volume=${args.eventVolume}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[out]`;
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      args.sceneFsPath,
      '-i',
      args.eventFsPath,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-vn',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      args.outputFsPath,
    ],
    {encoding: 'utf-8'}
  );
  if (result.error) {
    return {ok: false, error: `无法启动 ffmpeg: ${result.error.message}`};
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    return {ok: false, error: detail || `ffmpeg 退出码 ${result.status}`};
  }
  if (!existsSync(args.outputFsPath)) {
    return {ok: false, error: `ffmpeg 未生成输出文件: ${args.outputFsPath}`};
  }
  return {ok: true};
}
