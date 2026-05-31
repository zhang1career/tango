/**
 * 场景编辑专用媒体字段（单张背景图 + AI 生成）
 */

import React, {useCallback, useEffect, useState} from 'react';
import {editorStyles as styles} from '../../styles/editorStyles';
import {
  buildSceneBgmPrompt,
  buildSceneImagePrompt,
  type SceneMediaPromptContext,
} from '../../utils/scene-media-prompt';
import {defaultSceneBgmSavePath, defaultSceneImageSavePath} from '@/config/media-paths';
import {generateAndSaveSceneBgm, generateAndSaveSceneImage} from '../../services/aigc-media';
import type {GameScene} from '../../schema/game-scene';

const aiPanelStyle: React.CSSProperties = {
  marginTop: 8,
  padding: 10,
  backgroundColor: '#1a1a2e',
  border: '1px solid #333',
  borderRadius: 6,
};

const aiLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#888',
  marginBottom: 4,
};

const statusOk: React.CSSProperties = {fontSize: 12, color: '#6ee7b7', marginTop: 6};
const statusErr: React.CSSProperties = {fontSize: 12, color: '#f87171', marginTop: 6};

function AiGenerateRow({
  savePath,
  onSavePathChange,
  onGenerate,
  generating,
  status,
  error,
}: {
  savePath: string;
  onSavePathChange: (v: string) => void;
  onGenerate: () => void;
  generating: boolean;
  status?: string;
  error?: string;
}) {
  return (
    <div style={aiPanelStyle}>
      <div style={aiLabelStyle}>AI 生成 · 保存路径</div>
      <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
        <input
          value={savePath}
          onChange={(e) => onSavePathChange(e.target.value)}
          style={{...styles.input, flex: 1, marginBottom: 0}}
          placeholder={defaultSceneImageSavePath('scene_01')}
          disabled={generating}
        />
        <button
          type="button"
          style={{...styles.btn, whiteSpace: 'nowrap', opacity: generating ? 0.6 : 1}}
          onClick={onGenerate}
          disabled={generating || !savePath.trim()}
        >
          {generating ? '生成中…' : 'AI 生成'}
        </button>
      </div>
      {status && <div style={statusOk}>{status}</div>}
      {error && <div style={statusErr}>{error}</div>}
    </div>
  );
}

export function SceneBackgroundImageField({
  scene,
  promptContext,
  gameId,
  value,
  onChange,
  editable,
}: {
  scene: GameScene;
  promptContext: SceneMediaPromptContext;
  gameId: string;
  value?: string[];
  onChange?: (v: string[] | undefined) => void;
  editable: boolean;
}) {
  const current = Array.isArray(value) && value.length ? value[0] : '';
  const [savePath, setSavePath] = useState(() => defaultSceneImageSavePath(scene.id));
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setSavePath(defaultSceneImageSavePath(scene.id));
    setStatus(undefined);
    setError(undefined);
  }, [scene.id]);

  const handleGenerate = useCallback(async () => {
    if (!onChange) return;
    const path = savePath.trim();
    if (!path) return;
    setGenerating(true);
    setStatus(undefined);
    setError(undefined);
    try {
      const prompt = buildSceneImagePrompt(scene, promptContext);
      const savedPath = await generateAndSaveSceneImage(prompt, path, gameId);
      onChange([savedPath]);
      setStatus(`已生成并保存，配图路径已更新`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [gameId, onChange, promptContext, savePath, scene]);

  if (!editable || !onChange) {
    return (
      <div style={styles.row}>
        <label style={styles.label}>配图</label>
        <div style={styles.readOnlyValue}>{current || '-'}</div>
      </div>
    );
  }

  return (
    <div style={styles.row}>
      <label style={styles.label}>配图</label>
      <div>
        <input
          value={current}
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange(v ? [v] : undefined);
          }}
          style={styles.input}
          placeholder={defaultSceneImageSavePath('scene_01')}
        />
        <AiGenerateRow
          savePath={savePath}
          onSavePathChange={setSavePath}
          onGenerate={handleGenerate}
          generating={generating}
          status={status}
          error={error}
        />
      </div>
    </div>
  );
}

export function SceneBackgroundMusicField({
  scene,
  promptContext,
  gameId,
  value,
  onChange,
  editable,
}: {
  scene: GameScene;
  promptContext: SceneMediaPromptContext;
  gameId: string;
  value?: string;
  onChange?: (v: string | undefined) => void;
  editable: boolean;
}) {
  const [savePath, setSavePath] = useState(() => defaultSceneBgmSavePath(scene.id));
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setSavePath(defaultSceneBgmSavePath(scene.id));
    setStatus(undefined);
    setError(undefined);
  }, [scene.id]);

  const handleGenerate = useCallback(async () => {
    if (!onChange) return;
    const path = savePath.trim();
    if (!path) return;
    setGenerating(true);
    setStatus(undefined);
    setError(undefined);
    try {
      const prompt = buildSceneBgmPrompt(scene, promptContext);
      const savedPath = await generateAndSaveSceneBgm(prompt, path, gameId);
      onChange(savedPath);
      setStatus('已生成并保存，背景音乐路径已更新');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [gameId, onChange, promptContext, savePath, scene]);

  if (!editable || !onChange) {
    return (
      <div style={styles.row}>
        <label style={styles.label}>背景音乐</label>
        <div style={styles.readOnlyValue}>{value ?? '-'}</div>
      </div>
    );
  }

  return (
    <div style={styles.row}>
      <label style={styles.label}>背景音乐</label>
      <div>
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
          style={styles.input}
          placeholder={defaultSceneBgmSavePath('scene_01')}
        />
        <AiGenerateRow
          savePath={savePath}
          onSavePathChange={setSavePath}
          onGenerate={handleGenerate}
          generating={generating}
          status={status}
          error={error}
        />
      </div>
    </div>
  );
}
