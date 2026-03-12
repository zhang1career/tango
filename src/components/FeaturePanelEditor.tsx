/**
 * 功能板块编辑 - 战斗等模块配置
 */

import React, {useCallback, useEffect, useState} from 'react';
import {getFeaturesFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import type {FeaturesConfig} from '../schema/features';
import {MediaUrlField} from './ui/MediaFields';
import {formatJsonCompact} from '../utils/json-format';
import {editorStyles as styles} from '../styles/editorStyles';

const DEFAULT_FEATURES: FeaturesConfig = { battle: {} };

async function loadFeatures(gameId: string): Promise<FeaturesConfig> {
  try {
    const res = await fetch(getFeaturesFetchUrl(gameId));
    if (!res.ok) return DEFAULT_FEATURES;
    const data = await res.json();
    return data ?? DEFAULT_FEATURES;
  } catch {
    return DEFAULT_FEATURES;
  }
}

async function saveFeatures(features: FeaturesConfig, gameId: string): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getFeaturesFetchUrl(gameId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: formatJsonCompact(features),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return { ok: true };
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  const blob = new Blob([formatJsonCompact(features)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-features.json';
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true };
}

export function FeaturePanelEditor() {
  const {gameId} = useGameId();
  const {checkAuthForSave} = useAuth();
  const [features, setFeatures] = useState<FeaturesConfig>(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFeatures(gameId).then((d) => {
      setFeatures(d);
      setLoading(false);
    });
  }, [gameId]);

  const updateFeatures = useCallback((fn: (f: FeaturesConfig) => FeaturesConfig) => {
    setFeatures((prev) => fn(prev));
  }, []);

  const handleSaveBattle = useCallback(async () => {
    setSaving(true);
    const result = await saveFeatures(features, gameId);
    setSaving(false);
    if (!result.ok) {
      alert(`保存失败: ${result.error}`);
    }
  }, [features, gameId]);

  if (loading) {
    return (
      <div style={{ ...styles.container, padding: 40, textAlign: 'center', color: '#888' }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>功能板块</h1>
      </div>

      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, color: '#a78bfa', margin: 0 }}>战斗</h2>
          <button type="button" style={styles.btn} onClick={() => checkAuthForSave(handleSaveBattle)} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
        <div
          style={{
            padding: 20,
            backgroundColor: '#1e1e32',
            borderRadius: 8,
            border: '1px solid #333',
          }}
        >
          <MediaUrlField
            label="背景音乐"
            value={features.battle?.backgroundMusic}
            onChange={(v) =>
              updateFeatures((f) => ({
                ...f,
                battle: { ...f.battle, backgroundMusic: v },
              }))
            }
            placeholder="战斗时的背景音乐 URL 或相对路径"
            editable={true}
          />
        </div>
      </section>
    </div>
  );
}
