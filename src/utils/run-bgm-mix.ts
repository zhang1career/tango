import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';

export type RunBgmMixArgs = {
  sceneFsPath: string;
  eventFsPath: string;
  outputFsPath: string;
  sceneVolume: number;
  eventVolume: number;
};

const ALOOP = 'aloop=loop=-1:size=2e+09';
const DURATION_EPS = 0.05;

function getAudioDurationSec(fsPath: string): {ok: true; duration: number} | {ok: false; error: string} {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      fsPath,
    ],
    {encoding: 'utf-8'}
  );
  if (result.error) {
    return {ok: false, error: `无法启动 ffprobe: ${result.error.message}`};
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    return {ok: false, error: detail || `ffprobe 退出码 ${result.status}`};
  }
  const duration = Number.parseFloat((result.stdout || '').trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    return {ok: false, error: `无法读取音频时长: ${fsPath}`};
  }
  return {ok: true, duration};
}

function buildMixFilter(args: {
  sceneVolume: number;
  eventVolume: number;
  sceneDuration: number;
  eventDuration: number;
}): string {
  const targetDur = Math.max(args.sceneDuration, args.eventDuration);
  const sceneNeedsLoop = args.sceneDuration + DURATION_EPS < args.eventDuration;
  const eventNeedsLoop = args.eventDuration + DURATION_EPS < args.sceneDuration;

  let sceneChain = '[0:a]';
  if (sceneNeedsLoop) {
    sceneChain += `${ALOOP},atrim=0:${targetDur},`;
  }
  sceneChain += `volume=${args.sceneVolume}[a0]`;

  let eventChain = '[1:a]';
  if (eventNeedsLoop) {
    eventChain += `${ALOOP},atrim=0:${targetDur},`;
  }
  eventChain += `volume=${args.eventVolume}[a1]`;

  return `${sceneChain};${eventChain};[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[out]`;
}

export function runBgmMixFfmpeg(args: RunBgmMixArgs): {ok: true} | {ok: false; error: string} {
  const sceneDur = getAudioDurationSec(args.sceneFsPath);
  if (!sceneDur.ok) return sceneDur;
  const eventDur = getAudioDurationSec(args.eventFsPath);
  if (!eventDur.ok) return eventDur;

  const filter = buildMixFilter({
    sceneVolume: args.sceneVolume,
    eventVolume: args.eventVolume,
    sceneDuration: sceneDur.duration,
    eventDuration: eventDur.duration,
  });

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
