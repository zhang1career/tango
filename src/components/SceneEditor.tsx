/**
 * 场景编辑界面
 */

import React, {useEffect, useState} from 'react';
import type {StoryFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {ItemsEditorCard} from './cards/ItemsEditorCard';
import {MediaUrlField, MediaCarouselField} from './ui/MediaFields';
import {formatJsonCompact} from '../utils/json-format';
import {DetailEditModal} from './ui/DetailEditModal';
import {RuleIdsSelector} from './ui/RuleIdsSelector';
import {editorStyles as styles} from '../styles/editorStyles';

function FieldRow({
                    label,
                    value,
                    editable: isEditable,
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
      {isEditable && children ? children : <div style={styles.readOnlyValue}>{value ?? '-'}</div>}
    </div>
  );
}

async function saveScenesToPreset(scenes: unknown): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch('/api/story-scenes', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(scenes),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(scenes)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-scenes.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
}

type SceneFormProps = {
  scene: GameScene;
  editable: boolean;
  items: import('../schema/game-item').GameItem[];
  mapNodeIds: Array<{ id: string; name: string; mapName: string }>;
  characterIds: Array<{ id: string; name: string }>;
  eventIds: Array<{ id: string; name: string }>;
  ruleIds: Array<{ id: string; name: string }>;
  onUpdate?: (fn: (s: GameScene) => GameScene) => void;
  collapsibleDefaultExpanded?: boolean;
};

function SceneFormContent({
                            scene,
                            editable,
                            items,
                            mapNodeIds,
                            characterIds,
                            eventIds,
                            ruleIds: ruleList,
                            onUpdate,
                          }: SceneFormProps) {
  return (
    <div>
      <FieldRow label="ID" value={scene.id} editable={editable && !!onUpdate}>
        <input
          value={scene.id}
          onChange={(e) => onUpdate!((s) => ({...s, id: e.target.value}))}
          style={styles.input}
          placeholder="scene_xxx"
        />
      </FieldRow>
      <FieldRow label="名称" value={scene.name} editable={editable && !!onUpdate}>
        <input
          value={scene.name}
          onChange={(e) => onUpdate!((s) => ({...s, name: e.target.value}))}
          style={styles.input}
          placeholder="市集"
        />
      </FieldRow>
      <FieldRow label="概要" value={scene.summary} editable={editable && !!onUpdate}>
        <textarea
          value={scene.summary}
          onChange={(e) => onUpdate!((s) => ({...s, summary: e.target.value}))}
          style={{...styles.input, ...styles.textarea, minHeight: 60}}
          placeholder="剧情概要，AI 据此生成正文"
        />
      </FieldRow>
      <FieldRow label="写作提示" value={scene.hints ?? ''} editable={editable && !!onUpdate}>
        <input
          value={scene.hints ?? ''}
          onChange={(e) => onUpdate!((s) => ({...s, hints: e.target.value || undefined}))}
          style={styles.input}
          placeholder="可选"
        />
      </FieldRow>

      <div style={styles.row}>
        <label style={styles.label}>关联地图节点</label>
        {editable && onUpdate ? (
          <select
            value={scene.mapNodeId ?? ''}
            onChange={(e) => onUpdate((s) => ({...s, mapNodeId: e.target.value || undefined}))}
            style={styles.input}
          >
            <option value="">无</option>
            {mapNodeIds.map((n) => (
              <option key={n.id} value={n.id}>
                {n.mapName} / {n.name}
              </option>
            ))}
          </select>
        ) : (
          <div style={styles.readOnlyValue}>
            {scene.mapNodeId ? mapNodeIds.find((n) => n.id === scene.mapNodeId)?.name ?? scene.mapNodeId : '-'}
          </div>
        )}
      </div>

      <div style={styles.row}>
        <label style={styles.label}>出场人物</label>
        {editable && onUpdate ? (
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
            {characterIds.map((c) => {
              const selected = (scene.characterIds ?? []).includes(c.id);
              return (
                <label key={c.id} style={{display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      const ids = scene.characterIds ?? [];
                      const next = e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id);
                      onUpdate((s) => ({...s, characterIds: next.length ? next : undefined}));
                    }}
                  />
                  {c.name}
                </label>
              );
            })}
          </div>
        ) : (
          <div style={styles.readOnlyValue}>
            {(scene.characterIds ?? []).map((id) => characterIds.find((c) => c.id === id)?.name ?? id).join(', ') || '-'}
          </div>
        )}
      </div>

      <div style={styles.row}>
        <label style={styles.label}>关联事件</label>
        {editable && onUpdate ? (
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
            {eventIds.map((evt) => {
              const selected = (scene.eventIds ?? []).includes(evt.id);
              return (
                <label key={evt.id} style={{display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      const ids = scene.eventIds ?? [];
                      const next = e.target.checked ? [...ids, evt.id] : ids.filter((x) => x !== evt.id);
                      onUpdate((s) => ({...s, eventIds: next.length ? next : undefined}));
                    }}
                  />
                  {evt.name}
                </label>
              );
            })}
          </div>
        ) : (
          <div style={styles.readOnlyValue}>
            {(scene.eventIds ?? []).map((id) => eventIds.find((e) => e.id === id)?.name ?? id).join(', ') || '-'}
          </div>
        )}
      </div>

      <RuleIdsSelector
        ruleList={ruleList}
        value={scene.ruleIds ?? []}
        onChange={(ids) => onUpdate?.((s) => ({...s, ruleIds: ids.length ? ids : undefined}))}
        readOnly={!editable || !onUpdate}
        label="规则"
      />
      <FieldRow label="条件" value={scene.conditions ?? ''} editable={editable && !!onUpdate}>
        <input
          value={scene.conditions ?? ''}
          onChange={(e) => onUpdate!((s) => ({...s, conditions: e.target.value || undefined}))}
          style={styles.input}
          placeholder="$time == 'day'"
        />
      </FieldRow>

      <ItemsEditorCard
        items={items}
        give={Array.isArray(scene.stateActions?.give) ? scene.stateActions.give : scene.stateActions?.give ? [scene.stateActions.give] : []}
        take={Array.isArray(scene.stateActions?.take) ? scene.stateActions.take : scene.stateActions?.take ? [scene.stateActions.take] : []}
        onChange={
          onUpdate
            ? (give, take) =>
              onUpdate((s) => ({
                ...s,
                stateActions: {
                  ...s.stateActions,
                  give: give.length ? give : undefined,
                  take: take.length ? take : undefined,
                },
              }))
            : undefined
        }
        title="物品"
        readOnly={!editable || !onUpdate}
      />

      <MediaUrlField
        label="开场动画"
        value={scene.openingAnimation}
        onChange={(v) => onUpdate?.((s) => ({...s, openingAnimation: v}))}
        editable={editable && !!onUpdate}
      />
      <MediaCarouselField
        label="配图"
        value={scene.images}
        onChange={(v) => onUpdate?.((s) => ({...s, images: v.length ? v : undefined}))}
        editable={editable && !!onUpdate}
      />
      <MediaUrlField
        label="背景音乐"
        value={scene.backgroundMusic}
        onChange={(v) => onUpdate?.((s) => ({...s, backgroundMusic: v}))}
        editable={editable && !!onUpdate}
      />
    </div>
  );
}

async function preloadForScenes(updateFw: (fn: (d: StoryFramework) => StoryFramework) => void) {
  const apis: Array<{ url: string; key: keyof StoryFramework }> = [
    {url: '/api/save-story-maps', key: 'maps'},
    {url: '/api/story-characters', key: 'characters'},
    {url: '/api/story-events', key: 'events'},
    {url: '/api/story-items', key: 'items'},
    {url: '/api/story-metadata', key: 'metadata'},
    {url: '/api/story-rules', key: 'gameRules'},
  ];
  for (const {url, key} of apis) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const parsed = key === 'metadata'
          ? (data?.characterAttributes ? {characterAttributes: data.characterAttributes} : null)
          : (Array.isArray(data) ? data : null);
        if (parsed) updateFw((d) => ({...d, [key]: parsed}));
      }
    } catch {
      // ignore
    }
  }
}

export function SceneEditor({
                              fw,
                              updateFw,
                            }: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  useEffect(() => {
    preloadForScenes(updateFw);
  }, [updateFw]);

  useEffect(() => {
    fetch('/api/story-scenes')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        updateFw((d) => ({...d, scenes: list as GameScene[]}));
      })
      .catch(() => {
      });
  }, [updateFw]);

  const scenes = fw.scenes ?? [];
  const setScenes = (fn: (s: GameScene[]) => GameScene[]) =>
    updateFw((d) => ({...d, scenes: fn(d.scenes ?? [])}));

  const items = fw.items ?? [];
  const mapNodeIds: Array<{ id: string; name: string; mapName: string }> = [];
  for (const map of fw.maps ?? []) {
    for (const n of map.nodes) mapNodeIds.push({id: n.id, name: n.name, mapName: map.name});
  }
  const characterIds = (fw.characters ?? []).map((c) => ({id: c.id, name: c.name}));
  const eventIds = (fw.events ?? []).map((e) => ({id: e.id, name: e.name}));
  const ruleIds = (fw.gameRules ?? []).map((r) => ({id: r.id, name: r.name}));

  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newScene, setNewScene] = useState<GameScene>(() => ({
    id: `scene_${Date.now()}`,
    name: '新场景',
    summary: '',
  }));

  const openAddModal = () => {
    setNewScene({id: `scene_${Date.now()}`, name: '新场景', summary: ''});
    setAddModalOpen(true);
  };

  const confirmAddScene = async () => {
    const next = [...scenes, newScene];
    setScenes(() => next);
    const result = await saveScenesToPreset(next);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  const updateScene = (index: number, fn: (s: GameScene) => GameScene) =>
    setScenes((s) => s.map((x, i) => (i === index ? fn(x) : x)));

  const removeScene = async (index: number) => {
    const next = scenes.filter((_, i) => i !== index);
    setScenes(() => next);
    const result = await saveScenesToPreset(next);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };

  const saveScenes = async () => {
    const result = await saveScenesToPreset(scenes);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setEditIndex(null);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>场景</h1>
        <button type="button" style={styles.btn} onClick={openAddModal}>
          + 添加场景
        </button>
      </header>

      <section style={styles.section}>
        {scenes.length === 0 && (
          <p style={{color: '#888', fontSize: 14}}>暂无场景，点击「添加场景」创建。</p>
        )}

        {scenes.map((scene, ci) => (
          <div key={`scene-${ci}`} style={styles.card}>
            <div style={styles.cardHead}>
              <span
                style={{fontWeight: 600, flex: 1, cursor: 'pointer'}}
                onClick={() => setDetailIndex(ci)}
              >
                {scene.name}
                <span style={{marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400}}>
                  {scene.id}
                </span>
              </span>
              <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <button type="button" style={styles.btnIcon} onClick={() => setEditIndex(ci)} title="编辑">
                  ✎
                </button>
                <button type="button" style={styles.btnIcon} onClick={() => removeScene(ci)} title="删除">
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {detailIndex !== null && scenes[detailIndex] && (
        <DetailEditModal
          title="场景详情"
          open={true}
          onClose={() => setDetailIndex(null)}
          editable={false}>
          <SceneFormContent
            scene={scenes[detailIndex]}
            editable={false}
            items={items}
            mapNodeIds={mapNodeIds}
            characterIds={characterIds}
            eventIds={eventIds}
            ruleIds={ruleIds}
            collapsibleDefaultExpanded
          />
        </DetailEditModal>
      )}

      {editIndex !== null && scenes[editIndex] && (
        <DetailEditModal
          title="编辑场景"
          open={true}
          onClose={() => setEditIndex(null)}
          editable={true}
          onSave={saveScenes}>
          <SceneFormContent
            scene={scenes[editIndex]}
            editable={true}
            items={items}
            mapNodeIds={mapNodeIds}
            characterIds={characterIds}
            eventIds={eventIds}
            ruleIds={ruleIds}
            onUpdate={(fn) => updateScene(editIndex, fn)}
          />
        </DetailEditModal>
      )}

      {addModalOpen && (
        <DetailEditModal
          title="添加场景"
          open={true}
          onClose={() => setAddModalOpen(false)}
          editable={true}
          onSave={confirmAddScene}
        >
          <SceneFormContent
            scene={newScene}
            editable={true}
            items={items}
            mapNodeIds={mapNodeIds}
            characterIds={characterIds}
            eventIds={eventIds}
            ruleIds={ruleIds}
            onUpdate={(fn) => setNewScene(fn(newScene))}
          />
        </DetailEditModal>
      )}
    </div>
  );
}
