import React, {useEffect, useMemo, useRef, useState} from 'react';
import {resolveMediaUrl} from '@/config';
import {editorStyles as styles} from '../../styles/editorStyles';
import {
  BGM_MIX_VOLUME_MAX,
  BGM_MIX_VOLUME_MIN,
  BGM_MIX_VOLUME_STEP,
  DEFAULT_BGM_MIX_VOLUME,
  defaultSynthesizedBgmPath,
} from '@/config/media-paths';
import {mixSceneBgm} from '@/services/bgm-mix';
import {fetchBgmVolumes, saveBgmVolumes} from '@/services/bgm-volumes';
import {
  roundBgmMixVolume,
  savedBgmMixVolume,
  wavBasenameFromLogicalPath,
} from '@/utils/bgm-volumes';
import {isWavLogicalPath} from '@/utils/media-path-helpers';
import {mediaUrlExists} from '@/utils/scene-bgm';

function FieldRow({
  label,
  value,
  editable,
  children,
}: {
  label: string;
  value?: string;
  editable: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={styles.row}>
      <label style={styles.label}>{label}</label>
      {editable && children ? children : <div style={styles.readOnlyValue}>{value ?? '-'}</div>}
    </div>
  );
}

function formatSavedVolumeLabel(volume: number): string {
  return volume === DEFAULT_BGM_MIX_VOLUME
    ? `${volume}（默认）`
    : String(volume);
}

function VolumeControl({
  label,
  filename,
  savedVolume,
  draftVolume,
  onDraftChange,
}: {
  label: string;
  filename: string;
  savedVolume: number;
  draftVolume: number;
  onDraftChange: (v: number) => void;
}) {
  const dirty = roundBgmMixVolume(draftVolume) !== roundBgmMixVolume(savedVolume);

  return (
    <div style={{marginBottom: 10}}>
      <div style={{display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4}}>
        <span style={{fontSize: 13, color: '#ccc'}}>
          {label}
          {filename ? ` (${filename})` : ''}
        </span>
        <span style={{fontSize: 12, color: dirty ? '#fbbf24' : '#888', flexShrink: 0}}>
          当前设定 {formatSavedVolumeLabel(savedVolume)}
          {dirty ? ' · 未保存' : ''}
        </span>
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
        <input
          type="range"
          min={BGM_MIX_VOLUME_MIN}
          max={BGM_MIX_VOLUME_MAX}
          step={BGM_MIX_VOLUME_STEP}
          value={draftVolume}
          onChange={(e) => onDraftChange(roundBgmMixVolume(Number(e.target.value)))}
          style={{flex: 1}}
        />
        <input
          type="number"
          min={BGM_MIX_VOLUME_MIN}
          max={BGM_MIX_VOLUME_MAX}
          step={BGM_MIX_VOLUME_STEP}
          value={draftVolume}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            onDraftChange(roundBgmMixVolume(n));
          }}
          style={{...styles.input, width: 72, flexShrink: 0}}
        />
      </div>
    </div>
  );
}

export type BgmSynthesisContext = {
  gameId: string;
  sceneId: string;
  sceneBgm?: string;
  eventBgm?: string;
  synthesizedBgm?: string;
  onSynthesizedBgmChange?: (v: string | undefined) => void;
  editable: boolean;
};

function validateMixInputs(ctx: BgmSynthesisContext): string | null {
  const scenePath = ctx.sceneBgm?.trim();
  const eventPath = ctx.eventBgm?.trim();
  if (!scenePath) {
    return '场景「背景音乐」为空，且无可回落的统一失败结局 BGM。请填写场景 BGM，或在「功能」页配置支线失败结局统一背景音乐';
  }
  if (!eventPath) return '请先为关联事件填写「背景音乐」（须为 wav 路径）';
  if (!isWavLogicalPath(scenePath)) return '场景背景音乐仅支持 .wav 文件';
  if (!isWavLogicalPath(eventPath)) return '事件背景音乐仅支持 .wav 文件';
  if (!ctx.synthesizedBgm?.trim()) return '请填写「合成声音」输出路径';
  return null;
}

export function BgmSynthesisField({
  gameId,
  sceneId,
  sceneBgm,
  eventBgm,
  synthesizedBgm,
  onSynthesizedBgmChange,
  editable,
}: BgmSynthesisContext) {
  const [mixing, setMixing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [volumeConfig, setVolumeConfig] = useState<Record<string, number>>({});
  const [configLoaded, setConfigLoaded] = useState(false);
  const [draftSceneVolume, setDraftSceneVolume] = useState(DEFAULT_BGM_MIX_VOLUME);
  const [draftEventVolume, setDraftEventVolume] = useState(DEFAULT_BGM_MIX_VOLUME);
  const [outputReady, setOutputReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevSceneBasename = useRef('');
  const prevEventBasename = useRef('');

  const defaultOutput = useMemo(() => defaultSynthesizedBgmPath(gameId, sceneId), [gameId, sceneId]);
  const outputValue = synthesizedBgm ?? '';
  const outputPath = (outputValue || defaultOutput).trim();
  const showDevControls = import.meta.env.DEV && editable && !!onSynthesizedBgmChange;

  const sceneBasename = wavBasenameFromLogicalPath(sceneBgm);
  const eventBasename = wavBasenameFromLogicalPath(eventBgm);
  const savedSceneVolume = savedBgmMixVolume(volumeConfig, sceneBasename);
  const savedEventVolume = savedBgmMixVolume(volumeConfig, eventBasename);
  const volumesDirty =
    roundBgmMixVolume(draftSceneVolume) !== savedSceneVolume ||
    roundBgmMixVolume(draftEventVolume) !== savedEventVolume;

  useEffect(() => {
    if (!showDevControls) return;
    let cancelled = false;
    void fetchBgmVolumes().then((result) => {
      if (cancelled) return;
      if (result.ok && result.volumes) {
        setVolumeConfig(result.volumes);
      }
      setConfigLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [showDevControls]);

  useEffect(() => {
    if (!configLoaded) return;
    if (sceneBasename !== prevSceneBasename.current) {
      prevSceneBasename.current = sceneBasename;
      setDraftSceneVolume(savedSceneVolume);
    }
  }, [configLoaded, sceneBasename, savedSceneVolume]);

  useEffect(() => {
    if (!configLoaded) return;
    if (eventBasename !== prevEventBasename.current) {
      prevEventBasename.current = eventBasename;
      setDraftEventVolume(savedEventVolume);
    }
  }, [configLoaded, eventBasename, savedEventVolume]);

  useEffect(() => {
    if (!outputPath) {
      setOutputReady(false);
      return;
    }
    let cancelled = false;
    const url = resolveMediaUrl(outputPath, gameId);
    void mediaUrlExists(url).then((ok) => {
      if (!cancelled) setOutputReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [outputPath, gameId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlaying(false);
    const onPause = () => setPlaying(false);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.pause();
    };
  }, []);

  const handleSaveVolumes = async () => {
    if (!sceneBasename && !eventBasename) {
      alert('请先填写场景与事件的 wav 背景音乐');
      return;
    }
    const updates: Record<string, number> = {};
    if (sceneBasename) updates[sceneBasename] = draftSceneVolume;
    if (eventBasename) updates[eventBasename] = draftEventVolume;

    setSaving(true);
    setStatus(null);
    try {
      const result = await saveBgmVolumes(updates);
      if (!result.ok || !result.volumes) {
        const message = result.error ?? '保存失败';
        setStatus(message);
        alert(message);
        return;
      }
      setVolumeConfig(result.volumes);
      setStatus('音量设置已保存');
    } catch (e) {
      const message = String(e);
      setStatus(message);
      alert(`保存失败: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleMix = async () => {
    const err = validateMixInputs({
      gameId,
      sceneId,
      sceneBgm,
      eventBgm,
      synthesizedBgm: outputPath,
      editable,
      onSynthesizedBgmChange,
    });
    if (err) {
      alert(err);
      return;
    }
    setMixing(true);
    setStatus(null);
    try {
      const result = await mixSceneBgm({
        gameId,
        sceneBgmPath: sceneBgm!.trim(),
        eventBgmPath: eventBgm!.trim(),
        outputPath,
        sceneVolume: draftSceneVolume,
        eventVolume: draftEventVolume,
      });
      if (!result.ok) {
        setStatus(result.error ?? '合成失败');
        alert(result.error ?? '合成失败');
        return;
      }
      const volumeLines = [
        result.sceneVolume != null ? `场景轨音量：${result.sceneVolume}` : null,
        result.eventVolume != null ? `事件轨音量：${result.eventVolume}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      const msg = result.outputFsPath
        ? `合成完成：\n${result.outputPath}\n\n磁盘路径：\n${result.outputFsPath}${
            volumeLines ? `\n\n${volumeLines}` : ''
          }`
        : `合成完成：${result.outputPath}`;
      setStatus(msg);
      onSynthesizedBgmChange?.(outputPath);
      setOutputReady(true);
      alert(msg);
    } catch (e) {
      const message = String(e);
      setStatus(message);
      alert(`合成失败: ${message}`);
    } finally {
      setMixing(false);
    }
  };

  const handlePlay = async () => {
    if (!outputPath) {
      alert('请先填写合成输出路径');
      return;
    }
    const url = resolveMediaUrl(outputPath, gameId);
    const exists = await mediaUrlExists(url);
    if (!exists) {
      alert('合成文件不存在，请先点击「合成声音」');
      return;
    }
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    audio.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    setPlaying(true);
    try {
      await audio.play();
    } catch (e) {
      setPlaying(false);
      alert(`播放失败: ${String(e)}`);
    }
  };

  if (!editable || !onSynthesizedBgmChange) {
    return (
      <FieldRow label="合成声音" value={synthesizedBgm} editable={false}>
        {null}
      </FieldRow>
    );
  }

  return (
    <>
      <FieldRow label="合成声音" value={outputValue} editable={true}>
        <input
          value={outputValue}
          onChange={(e) =>
            onSynthesizedBgmChange(e.target.value === '' ? undefined : e.target.value)
          }
          style={styles.input}
          placeholder={defaultOutput}
        />
      </FieldRow>
      {showDevControls && (
        <div style={{...styles.row, marginTop: -8}}>
          <span style={styles.label} />
          <div style={{flex: 1}}>
            {configLoaded ? (
              <>
                {sceneBasename ? (
                  <VolumeControl
                    label="场景轨音量"
                    filename={sceneBasename}
                    savedVolume={savedSceneVolume}
                    draftVolume={draftSceneVolume}
                    onDraftChange={setDraftSceneVolume}
                  />
                ) : (
                  <p style={{fontSize: 12, color: '#888', marginBottom: 10}}>
                    场景轨音量：请先填写场景 wav 背景音乐
                  </p>
                )}
                {eventBasename ? (
                  <VolumeControl
                    label="事件轨音量"
                    filename={eventBasename}
                    savedVolume={savedEventVolume}
                    draftVolume={draftEventVolume}
                    onDraftChange={setDraftEventVolume}
                  />
                ) : (
                  <p style={{fontSize: 12, color: '#888', marginBottom: 10}}>
                    事件轨音量：请先为关联事件填写 wav 背景音乐
                  </p>
                )}
              </>
            ) : (
              <p style={{fontSize: 12, color: '#888', marginBottom: 10}}>加载音量设置…</p>
            )}
            <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8}}>
              <button
                type="button"
                style={styles.btn}
                disabled={mixing || !configLoaded}
                onClick={() => void handleMix()}
              >
                {mixing ? '合成中…' : '合成声音'}
              </button>
              <button
                type="button"
                style={styles.btn}
                disabled={!outputReady && !playing}
                onClick={() => void handlePlay()}
                title={outputReady ? '试听合成 mp3' : '需先合成'}
              >
                {playing ? '停止' : '播放'}
              </button>
              <button
                type="button"
                style={styles.btn}
                disabled={saving || !configLoaded || !volumesDirty}
                onClick={() => void handleSaveVolumes()}
              >
                {saving ? '保存中…' : '保存设置'}
              </button>
            </div>
            {status && (
              <pre
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: '#aaa',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {status}
              </pre>
            )}
          </div>
        </div>
      )}
    </>
  );
}
