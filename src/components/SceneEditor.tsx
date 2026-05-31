/**
 * 场景编辑界面
 */

import React, {useEffect, useState} from 'react';
import {getScenesFetchUrl, getMapsFetchUrl, getCharactersFetchUrl, getEventsFetchUrl, getItemsFetchUrl, getMetadataFetchUrl, getRulesFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import type {StoryFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {GameBehavior} from '../schema/game-behavior';
import {ItemsEditorCard} from './cards/ItemsEditorCard';
import {AttributeValuesCard} from './cards/AttributeValuesCard';
import {InventoryValuesCard} from './cards/InventoryValuesCard';
import {MediaUrlField} from './ui/MediaFields';
import {SceneBackgroundImageField, SceneBackgroundMusicField} from './ui/SceneMediaFields';
import type {SceneMediaPromptContext} from '../utils/scene-media-prompt';
import {buildSceneMediaPromptContext} from '../utils/scene-media-prompt';
import {formatJsonCompact} from '../utils/json-format';
import {DetailEditModal} from './ui/DetailEditModal';
import {RuleIdsSelector} from './ui/RuleIdsSelector';
import {editorStyles as styles} from '../styles/editorStyles';

function getFirstAiBlock(scene: GameScene): {summary: string; hints?: string; wordCount?: number} | null {
  const blocks = Array.isArray(scene.passageBlocks) ? scene.passageBlocks : [];
  const block = blocks.find((it) => it.type === 'ai');
  return block && block.type === 'ai' ? block : null;
}

function upsertFirstAiBlock(
  scene: GameScene,
  patch: (block: {type: 'ai'; summary: string; hints?: string; wordCount?: number}) => {
    type: 'ai';
    summary: string;
    hints?: string;
    wordCount?: number;
  }
): GameScene {
  const blocks = Array.isArray(scene.passageBlocks) ? [...scene.passageBlocks] : [];
  const index = blocks.findIndex((it) => it.type === 'ai');
  if (index >= 0) {
    const existing = blocks[index];
    if (existing.type === 'ai') blocks[index] = patch(existing);
  } else {
    blocks.push(patch({type: 'ai', summary: ''}));
  }
  return {...scene, passageBlocks: blocks};
}

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

async function saveScenesToPreset(scenes: unknown, gameId: string): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getScenesFetchUrl(gameId), {
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
  gameId: string;
  mediaPromptContext: SceneMediaPromptContext;
  attributeDefs: import('../schema/metadata').CharacterAttributeDef[];
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
                            gameId,
                            mediaPromptContext,
                            attributeDefs,
                            items,
                            mapNodeIds,
                            characterIds,
                            eventIds,
                            ruleIds: ruleList,
                            onUpdate,
                          }: SceneFormProps) {
  const firstAi = getFirstAiBlock(scene);
  const overrideMap = scene.characterOverrides ?? {};
  const overrideCharacterIds = Object.keys(overrideMap);
  const toBehaviorId = (charId: string) =>
    `ovr_${charId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const updateOverride = (
    charId: string,
    patch: (current: NonNullable<GameScene['characterOverrides']>[string]) => NonNullable<GameScene['characterOverrides']>[string]
  ) => {
    if (!onUpdate) return;
    onUpdate((s) => {
      const currentMap = s.characterOverrides ?? {};
      const nextMap = {...currentMap, [charId]: patch(currentMap[charId] ?? {})};
      return {...s, characterOverrides: Object.keys(nextMap).length ? nextMap : undefined};
    });
  };
  const removeOverride = (charId: string) => {
    if (!onUpdate) return;
    onUpdate((s) => {
      const currentMap = {...(s.characterOverrides ?? {})};
      delete currentMap[charId];
      return {...s, characterOverrides: Object.keys(currentMap).length ? currentMap : undefined};
    });
  };
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
      <FieldRow label="AI 概要（第一个 ai 块）" value={firstAi?.summary ?? ''} editable={editable && !!onUpdate}>
        <textarea
          value={firstAi?.summary ?? ''}
          onChange={(e) => onUpdate!((s) => upsertFirstAiBlock(s, (block) => ({...block, summary: e.target.value})))}
          style={{...styles.input, ...styles.textarea, minHeight: 60}}
          placeholder="该场景第一个 AI 块的概要"
        />
      </FieldRow>
      <FieldRow label="写作提示（第一个 ai 块）" value={firstAi?.hints ?? ''} editable={editable && !!onUpdate}>
        <input
          value={firstAi?.hints ?? ''}
          onChange={(e) =>
            onUpdate!((s) =>
              upsertFirstAiBlock(s, (block) => ({...block, hints: e.target.value || undefined}))
            )
          }
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
        <label style={styles.label}>对手戏人物集（counterpartCharacterIds）</label>
        {editable && onUpdate ? (
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
            {characterIds.map((c) => {
              const selected = (scene.counterpartCharacterIds ?? []).includes(c.id);
              return (
                <label key={`cp-${c.id}`} style={{display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      const ids = scene.counterpartCharacterIds ?? [];
                      const next = e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id);
                      onUpdate((s) => ({...s, counterpartCharacterIds: next.length ? next : undefined}));
                    }}
                  />
                  {c.name}
                </label>
              );
            })}
          </div>
        ) : (
          <div style={styles.readOnlyValue}>
            {(scene.counterpartCharacterIds ?? []).map((id) => characterIds.find((c) => c.id === id)?.name ?? id).join(', ') || '-'}
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

      <div style={styles.row}>
        <label style={styles.label}>角色覆写（characterOverrides）</label>
        {editable && onUpdate ? (
          <>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10}}>
              {characterIds.map((c) => {
                const selected = !!overrideMap[c.id];
                return (
                  <label key={`ovr-sel-${c.id}`} style={{display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateOverride(c.id, (x) => x);
                        } else {
                          removeOverride(c.id);
                        }
                      }}
                    />
                    {c.name}
                  </label>
                );
              })}
            </div>
            {overrideCharacterIds.length === 0 ? (
              <div style={styles.readOnlyValue}>未启用角色覆写</div>
            ) : (
              overrideCharacterIds.map((charId) => {
                const char = characterIds.find((c) => c.id === charId);
                const ovr = overrideMap[charId] ?? {};
                const lib = ovr.behaviorLibrary ?? [];
                return (
                  <div key={`ovr-${charId}`} style={{...styles.card, marginBottom: 12}}>
                    <div style={styles.cardHead}>
                      <span>{char?.name ?? charId}（{charId}）</span>
                      <button type="button" style={styles.btnSmall} onClick={() => removeOverride(charId)}>
                        移除覆写
                      </button>
                    </div>
                    <div style={{padding: 12}}>
                      <div style={styles.row}>
                        <label style={styles.label}>描述覆写</label>
                        <textarea
                          value={ovr.description ?? ''}
                          onChange={(e) =>
                            updateOverride(charId, (x) => ({...x, description: e.target.value || undefined}))
                          }
                          style={{...styles.input, ...styles.textarea, minHeight: 60}}
                          placeholder="留空表示不覆写人物描述"
                        />
                      </div>
                      <AttributeValuesCard
                        attributeDefs={attributeDefs}
                        values={ovr.attributes}
                        onChange={(v) =>
                          updateOverride(charId, (x) => ({
                            ...x,
                            attributes: Object.keys(v).length ? v : undefined,
                          }))
                        }
                        title="属性覆写（整对象替换）"
                        readOnly={false}
                      />
                      <InventoryValuesCard
                        items={items}
                        inventory={ovr.inventory ?? []}
                        onChange={(ids) =>
                          updateOverride(charId, (x) => ({
                            ...x,
                            inventory: ids.length ? ids : undefined,
                          }))
                        }
                        title="背包覆写（数组 replace）"
                        readOnly={false}
                      />
                      <div style={styles.row}>
                        <label style={styles.label}>行为库覆写（数组 replace）</label>
                        {lib.map((b, i) => (
                          <div key={`${charId}-${b.id}-${i}`} style={{...styles.card, marginBottom: 8}}>
                            <div style={{padding: 10}}>
                              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
                                <span style={{fontSize: 12, color: '#aaa'}}>行为 #{i + 1}</span>
                                <button
                                  type="button"
                                  style={styles.btnSmall}
                                  onClick={() =>
                                    updateOverride(charId, (x) => ({
                                      ...x,
                                      behaviorLibrary: (x.behaviorLibrary ?? []).filter((_, idx) => idx !== i),
                                    }))
                                  }
                                >
                                  删除
                                </button>
                              </div>
                              <input
                                value={b.id}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, id: e.target.value} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="行为 id"
                              />
                              <input
                                value={b.q}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, q: e.target.value} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="请求 q"
                              />
                              <input
                                value={b.a}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, a: e.target.value} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="响应 a"
                              />
                              <select
                                value={b.t ?? 'dialog'}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, t: e.target.value as GameBehavior['t']} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                              >
                                <option value="dialog">dialog</option>
                                <option value="action">action</option>
                              </select>
                              <input
                                value={b.actionKind ?? ''}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, actionKind: e.target.value || undefined} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="actionKind（可选）"
                              />
                              <input
                                value={(b.sceneIds ?? []).join(',')}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i
                                        ? {
                                          ...it,
                                          sceneIds: e.target.value
                                            .split(',')
                                            .map((s) => s.trim())
                                            .filter(Boolean).length
                                            ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                                            : undefined,
                                        }
                                        : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="sceneIds（逗号分隔，可选）"
                              />
                              <input
                                value={b.judgeExpr ?? ''}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, judgeExpr: e.target.value || undefined} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="judgeExpr（可选）"
                              />
                              <input
                                value={b.writebackExpr ?? ''}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, writebackExpr: e.target.value || undefined} : it
                                    ),
                                  }))
                                }
                                style={styles.input}
                                placeholder="writebackExpr（可选）"
                              />
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          style={styles.btnSmall}
                          onClick={() =>
                            updateOverride(charId, (x) => ({
                              ...x,
                              behaviorLibrary: [
                                ...(x.behaviorLibrary ?? []),
                                {id: toBehaviorId(charId), q: '', a: '', t: 'dialog'},
                              ],
                            }))
                          }
                        >
                          + 添加覆写行为
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        ) : (
          <div style={styles.readOnlyValue}>
            {overrideCharacterIds.length
              ? overrideCharacterIds.map((id) => characterIds.find((c) => c.id === id)?.name ?? id).join(', ')
              : '-'}
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
      <FieldRow label="条件表达式" value={scene.conditions ?? ''} editable={editable && !!onUpdate}>
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
      <SceneBackgroundImageField
        scene={scene}
        promptContext={mediaPromptContext}
        gameId={gameId}
        value={scene.images}
        onChange={(v) => onUpdate?.((s) => ({...s, images: v?.length ? v : undefined}))}
        editable={editable && !!onUpdate}
      />
      <SceneBackgroundMusicField
        scene={scene}
        promptContext={mediaPromptContext}
        gameId={gameId}
        value={scene.backgroundMusic}
        onChange={(v) => onUpdate?.((s) => ({...s, backgroundMusic: v}))}
        editable={editable && !!onUpdate}
      />
    </div>
  );
}

async function preloadForScenes(updateFw: (fn: (d: StoryFramework) => StoryFramework) => void, gameId: string) {
  const apis: Array<{ url: string; key: keyof StoryFramework }> = [
    {url: getMapsFetchUrl(gameId), key: 'maps'},
    {url: getCharactersFetchUrl(gameId), key: 'characters'},
    {url: getEventsFetchUrl(gameId), key: 'events'},
    {url: getItemsFetchUrl(gameId), key: 'items'},
    {url: getMetadataFetchUrl(gameId), key: 'metadata'},
    {url: getRulesFetchUrl(gameId), key: 'gameRules'},
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
  const {gameId} = useGameId();
  const {checkAuthForSave} = useAuth();
  useEffect(() => {
    preloadForScenes(updateFw, gameId);
  }, [updateFw, gameId]);

  useEffect(() => {
    fetch(getScenesFetchUrl(gameId))
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        updateFw((d) => ({...d, scenes: list as GameScene[]}));
      })
      .catch(() => {
      });
  }, [updateFw, gameId]);

  const scenes = fw.scenes ?? [];
  const setScenes = (fn: (s: GameScene[]) => GameScene[]) =>
    updateFw((d) => ({...d, scenes: fn(d.scenes ?? [])}));

  const items = fw.items ?? [];
  const attributeDefs = fw.metadata?.characterAttributes ?? [];
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
    passageBlocks: [{type: 'ai', summary: ''}],
  }));

  const openAddModal = () => {
    setNewScene({id: `scene_${Date.now()}`, name: '新场景', passageBlocks: [{type: 'ai', summary: ''}]});
    setAddModalOpen(true);
  };

  const confirmAddScene = async () => {
    const next = [...scenes, newScene];
    setScenes(() => next);
    const result = await saveScenesToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  const updateScene = (index: number, fn: (s: GameScene) => GameScene) =>
    setScenes((s) => s.map((x, i) => (i === index ? fn(x) : x)));

  const removeScene = async (index: number) => {
    const next = scenes.filter((_, i) => i !== index);
    setScenes(() => next);
    const result = await saveScenesToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };
  const removeSceneWithAuth = (index: number) => checkAuthForSave(() => removeScene(index));

  const saveScenes = async () => {
    const result = await saveScenesToPreset(scenes, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setEditIndex(null);
  };

  const mediaContextOptions = {
    storyBackground: fw.background,
    writingRules: fw.rules,
    mapNodeIds,
    characters: fw.characters ?? [],
    events: fw.events ?? [],
  };
  const buildMediaCtx = (scene: GameScene): SceneMediaPromptContext =>
    buildSceneMediaPromptContext(scene, mediaContextOptions);

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
                <button type="button" style={styles.btnIcon} onClick={() => removeSceneWithAuth(ci)} title="删除">
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
            gameId={gameId}
            mediaPromptContext={buildMediaCtx(scenes[detailIndex])}
            attributeDefs={attributeDefs}
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
          onSave={() => checkAuthForSave(saveScenes)}>
          <SceneFormContent
            scene={scenes[editIndex]}
            editable={true}
            gameId={gameId}
            mediaPromptContext={buildMediaCtx(scenes[editIndex])}
            attributeDefs={attributeDefs}
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
          onSave={() => checkAuthForSave(confirmAddScene)}
        >
          <SceneFormContent
            scene={newScene}
            editable={true}
            gameId={gameId}
            mediaPromptContext={buildMediaCtx(newScene)}
            attributeDefs={attributeDefs}
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
