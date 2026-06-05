import React, {useMemo, useState} from 'react';
import {editorStyles as styles} from '../../styles/editorStyles';
import {defaultSynthesizedBgmPath} from '@/config/media-paths';
import {mixSceneBgm} from '@/services/bgm-mix';
import {isWavLogicalPath} from '@/utils/media-path-helpers';

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
  const [status, setStatus] = useState<string | null>(null);

  const defaultOutput = useMemo(() => defaultSynthesizedBgmPath(gameId, sceneId), [gameId, sceneId]);
  const outputValue = synthesizedBgm ?? '';
  const showMixButton = import.meta.env.DEV && editable && !!onSynthesizedBgmChange;

  const handleMix = async () => {
    const err = validateMixInputs({
      gameId,
      sceneId,
      sceneBgm,
      eventBgm,
      synthesizedBgm: outputValue || defaultOutput,
      editable,
      onSynthesizedBgmChange,
    });
    if (err) {
      alert(err);
      return;
    }
    const outputPath = (outputValue || defaultOutput).trim();
    setMixing(true);
    setStatus(null);
    try {
      const result = await mixSceneBgm({
        gameId,
        sceneBgmPath: sceneBgm!.trim(),
        eventBgmPath: eventBgm!.trim(),
        outputPath,
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
      alert(msg);
    } catch (e) {
      const message = String(e);
      setStatus(message);
      alert(`合成失败: ${message}`);
    } finally {
      setMixing(false);
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
      {showMixButton && (
        <div style={{...styles.row, marginTop: -8}}>
          <span style={styles.label} />
          <div>
            <button
              type="button"
              style={styles.btn}
              disabled={mixing}
              onClick={() => void handleMix()}
            >
              {mixing ? '合成中…' : '合成声音'}
            </button>
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
