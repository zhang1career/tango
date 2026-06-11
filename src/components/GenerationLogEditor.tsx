/**
 * 生成轨迹（原叙事引擎 → 生成轨迹）
 */

import React, {useEffect, useState} from 'react';
import type {GameScene} from '@/schema/game-scene';
import type {StoryGenerationTraces} from '@/schema/story-generation-traces';
import {useGameId} from '@/context/GameIdContext';
import {clearGenerationTraces, fetchGenerationTraces} from '@/utils/story-engine-files';
import {getScenesFetchUrl} from '@/config';
import {formatJsonCompact} from '@/utils/json-format';

const styles: Record<string, React.CSSProperties> = {
  container: {maxWidth: 960, margin: '0 auto', padding: 20, color: '#e8e8e8'},
  title: {margin: 0, fontSize: 20},
  hint: {color: '#888', fontSize: 13, marginBottom: 16},
  headerIconBtn: {
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

function ClearIcon({size = 18, style}: {size?: number; style?: React.CSSProperties}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{display: 'block', flexShrink: 0, ...style}}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function sceneDisplayName(scenes: GameScene[], sceneId: string): string {
  return scenes.find((s) => s.id === sceneId)?.name ?? sceneId;
}

const kindLabel: Record<string, string> = {
  decompose_scene: '场景分析',
  generate_block: '生成块',
  assemble_scene: '汇编场景',
  plan: '规划',
  write: '写作',
  audit: '审校',
  canon_settle: 'Canon',
};

export function GenerationLogEditor() {
  const {gameId} = useGameId();
  const [traces, setTraces] = useState<StoryGenerationTraces>({entries: []});
  const [scenes, setScenes] = useState<GameScene[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const reload = async () => {
    setError(null);
    try {
      const [t, scenesRes] = await Promise.all([
        fetchGenerationTraces(gameId),
        fetch(getScenesFetchUrl(gameId)),
      ]);
      setTraces(t);
      setScenes(scenesRes.ok ? ((await scenesRes.json()) as GameScene[]) : []);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void reload();
  }, [gameId]);

  const handleClear = async () => {
    if (!window.confirm('确定清空全部生成日志？此操作不可恢复。')) return;
    setClearing(true);
    setError(null);
    try {
      await clearGenerationTraces(gameId);
      setTraces({entries: []});
    } catch (e) {
      setError(String(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
        <h1 style={styles.title}>日志</h1>
        <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
          <button
            type="button"
            style={{...styles.headerIconBtn, opacity: clearing ? 0.5 : 1}}
            title="清空日志"
            aria-label="清空日志"
            disabled={clearing || (traces.entries ?? []).length === 0}
            onClick={() => void handleClear()}
          >
            <ClearIcon />
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            style={{
              padding: '6px 12px',
              backgroundColor: '#2d2d44',
              border: '1px solid #444',
              borderRadius: 6,
              color: '#e8e8e8',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            刷新
          </button>
        </div>
      </div>
      <p style={styles.hint}>
        开发模式自动记录的叙事生成轨迹（场景分析、块生成、汇编等）。不进游戏 zip。
      </p>
      {error && <p style={{color: '#f88'}}>{error}</p>}
      <div style={{fontSize: 12, fontFamily: 'monospace', color: '#e8e8e8'}}>
        {(traces.entries ?? []).length === 0 ? (
          <p style={{color: '#888'}}>暂无记录</p>
        ) : (
          [...traces.entries].reverse().slice(0, 80).map((e) => (
            <details key={e.id} style={{marginBottom: 8, border: '1px solid #333', padding: 8}}>
              <summary>
                {e.at} · {kindLabel[e.kind] ?? e.kind} · {e.sceneName ?? sceneDisplayName(scenes, e.sceneId)}
                {e.blockIndex != null ? `#${e.blockIndex}` : ''} · {e.model}
              </summary>
              <pre style={{whiteSpace: 'pre-wrap', color: '#ccc'}}>{formatJsonCompact(e.phases)}</pre>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
