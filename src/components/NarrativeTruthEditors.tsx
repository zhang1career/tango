/**
 * 伏笔池 / Canon 全局编辑
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import {getCharactersFetchUrl, getScenesFetchUrl} from '@/config';
import type {GameCharacter} from '@/schema/game-character';
import type {GameScene} from '@/schema/game-scene';
import {
  EMPTY_STORY_CANON,
  normalizeStoryCanon,
  type CanonCharacterState,
  type CanonSceneState,
  type StoryCanon,
} from '@/schema/story-canon';
import {
  EMPTY_STORY_FORESHADOWING,
  FORESHADOW_STATUS_OPTIONS,
  applyForeshadowStatusChange,
  canClearForeshadowThread,
  canPlantForeshadowThread,
  clearForeshadowThread,
  foreshadowStatusLabel,
  foreshadowStatusStyle,
  normalizeStoryForeshadowing,
  plantForeshadowThread,
  type ForeshadowPlantRef,
  type ForeshadowThread,
  type StoryForeshadowing,
} from '@/schema/story-foreshadowing';
import {fetchStoryCanon, fetchStoryForeshadowing, saveStoryCanon, saveStoryForeshadowing} from '@/utils/story-engine-files';
import {useNarrativeTruth} from '@/context/NarrativeTruthContext';
import {useNotification} from '@/context/NotificationContext';
import {formatJsonCompact} from '@/utils/json-format';
import {editorStyles as styles} from '@/styles/editorStyles';
import {listStyles} from '@/styles/listStyles';
import {ListClearButton, ListDeleteButton, ListOpsCell, ListPlantButton, ListSectionHead} from './ui/ListPrimitives';
import {DetailEditModal} from './ui/DetailEditModal';
import {IdNameSelect} from './ui/IdNameSelect';
import {MultiSelectField} from './ui/MultiSelectField';
import {buildIdNameDict, resolveIdName, type IdNameDict} from '@/utils/id-name-dict';

type Tab = 'foreshadowing' | 'canon';

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#d1d5db',
};

const card: React.CSSProperties = {
  marginBottom: 12,
  border: '1px solid #333',
  borderRadius: 8,
  overflow: 'hidden',
};

const cardHead: React.CSSProperties = {
  padding: '10px 14px',
  backgroundColor: '#252540',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
};

const cardBody: React.CSSProperties = {
  padding: 14,
};

const tabBtnBase: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: '#2d2d44',
  border: '1px solid #444',
  borderRadius: 6,
  color: '#e8e8e8',
  cursor: 'pointer',
  fontSize: 13,
};

const hintText: React.CSSProperties = {color: '#888', fontSize: 12, margin: '0 0 8px'};

const headerIconBtn: React.CSSProperties = {
  ...styles.btnIcon,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 6,
  borderRadius: 6,
};

function RefreshIcon({size = 18, style}: {size?: number; style?: React.CSSProperties}) {
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
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function formatAnchorsInput(anchors: string[] | undefined): string {
  return anchors?.join(', ') ?? '';
}

function parseAnchorsInput(value: string): string[] | undefined {
  const items = value
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function parseBlockIndexInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function mergePlantRef(
  prev: ForeshadowPlantRef | undefined,
  key: 'sceneId' | 'blockIndex',
  value: string
): ForeshadowPlantRef | undefined {
  if (key === 'sceneId') {
    const sceneId = value.trim();
    if (!sceneId) return undefined;
    return prev?.blockIndex === undefined ? {sceneId} : {sceneId, blockIndex: prev.blockIndex};
  }
  const sceneId = prev?.sceneId?.trim();
  if (!sceneId) return undefined;
  const blockIndex = parseBlockIndexInput(value);
  return blockIndex === undefined ? {sceneId} : {sceneId, blockIndex};
}

const PAYOFF_TARGET_SEP = /[、,，]/;

function parsePayoffTargetParts(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(PAYOFF_TARGET_SEP).map((s) => s.trim()).filter(Boolean);
}

function isSceneIdToken(part: string, sceneIdSet: Set<string>): boolean {
  return sceneIdSet.has(part) || /^scene_/.test(part);
}

function splitPayoffTarget(
  value: string | undefined,
  sceneIdSet: Set<string>
): {sceneIds: string[]; other: string[]} {
  const sceneIds: string[] = [];
  const other: string[] = [];
  for (const part of parsePayoffTargetParts(value)) {
    if (isSceneIdToken(part, sceneIdSet)) sceneIds.push(part);
    else other.push(part);
  }
  return {sceneIds, other};
}

function joinPayoffTarget(sceneIds: string[], other: string[]): string | undefined {
  const parts = [...sceneIds, ...other];
  return parts.length ? parts.join('、') : undefined;
}

function sortedSceneIds(scenes: GameScene[], extraIds: string[] = []): string[] {
  const known = new Set(scenes.map((s) => s.id));
  const extras = extraIds.filter((id) => id && !known.has(id));
  return [...extras, ...scenes.map((s) => s.id)].sort((a, b) => a.localeCompare(b));
}

function SceneIdSelect({
  value,
  onChange,
  scenes,
  sceneLabel,
  allowEmpty = true,
  placeholder = '选择场景',
}: {
  value: string | undefined;
  onChange: (sceneId: string | undefined) => void;
  scenes: GameScene[];
  sceneLabel: (sceneId: string) => string;
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  const ids = useMemo(() => sortedSceneIds(scenes, value ? [value] : []), [scenes, value]);
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      style={styles.input}
    >
      {allowEmpty && !value ? <option value="">{placeholder}</option> : null}
      {ids.map((sid) => (
        <option key={sid} value={sid}>
          {sceneLabel(sid)}
        </option>
      ))}
    </select>
  );
}

function PayoffTargetSceneSelect({
  value,
  onChange,
  scenes,
  sceneLabel,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  scenes: GameScene[];
  sceneLabel: (sceneId: string) => string;
}) {
  const sceneIdSet = useMemo(() => new Set(scenes.map((s) => s.id)), [scenes]);
  const {sceneIds, other} = useMemo(
    () => splitPayoffTarget(value, sceneIdSet),
    [value, sceneIdSet]
  );
  const options = useMemo(() => {
    const known = new Set(scenes.map((s) => s.id));
    const extras = sceneIds.filter((id) => id && !known.has(id));
    return [
      ...extras.map((id) => ({id, name: sceneLabel(id)})),
      ...scenes.map((s) => ({id: s.id, name: sceneLabel(s.id)})),
    ];
  }, [scenes, sceneIds, sceneLabel]);

  return (
    <div>
      <MultiSelectField
        label=""
        options={options}
        value={sceneIds}
        onChange={(selected) => onChange(joinPayoffTarget(selected, other))}
        addPlaceholder="添加回收目标场景…"
        emptyHint="（未选择场景）"
      />
      {other.length ? (
        <p style={{...hintText, margin: '4px 0 0'}}>另含文字说明：{other.join('、')}</p>
      ) : null}
    </div>
  );
}

export function NarrativeTruthEditors({
  scenes: scenesProp,
  fixedTab,
  hideTabBar = false,
}: {
  scenes?: GameScene[];
  fixedTab?: Tab;
  hideTabBar?: boolean;
}) {
  const {gameId} = useGameId();
  const {checkAuthForSave} = useAuth();
  const {addNotification} = useNotification();
  const {bumpRevision} = useNarrativeTruth();
  const [internalTab, setInternalTab] = useState<Tab>('foreshadowing');
  const tab = fixedTab ?? internalTab;
  const [foreshadowing, setForeshadowing] = useState<StoryForeshadowing>(EMPTY_STORY_FORESHADOWING);
  const [canon, setCanon] = useState<StoryCanon>(EMPTY_STORY_CANON);
  const [scenes, setScenes] = useState<GameScene[]>([]);
  const [characters, setCharacters] = useState<GameCharacter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [foreshadowOpenState, setForeshadowOpenState] = useState<Record<string, boolean>>({});

  const sceneMap = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const sceneLabel = useCallback(
    (sceneId: string) => sceneMap.get(sceneId)?.name ?? sceneId,
    [sceneMap]
  );
  const characterDict = useMemo(() => buildIdNameDict(characters), [characters]);

  const reload = useCallback(async () => {
    setError(null);
    const [fs, c, scenesRes, charsRes] = await Promise.all([
      fetchStoryForeshadowing(gameId),
      fetchStoryCanon(gameId),
      scenesProp ? Promise.resolve(null) : fetch(getScenesFetchUrl(gameId)),
      fetch(getCharactersFetchUrl(gameId)),
    ]);
    if (scenesProp) setScenes(scenesProp);
    else if (scenesRes?.ok) setScenes((await scenesRes.json()) as GameScene[]);
    if (charsRes.ok) setCharacters((await charsRes.json()) as GameCharacter[]);
    setForeshadowing(fs);
    setCanon(c);
  }, [gameId, scenesProp]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveCurrent = () => {
    void checkAuthForSave(async () => {
      setSaving(true);
      setError(null);
      try {
        if (tab === 'foreshadowing') {
          await saveStoryForeshadowing(gameId, foreshadowing);
          addNotification('info', '伏笔池已保存');
        } else {
          await saveStoryCanon(gameId, canon);
          addNotification('info', 'Canon 已保存');
        }
        bumpRevision();
      } catch (e) {
        setError(String(e));
      } finally {
        setSaving(false);
      }
    });
  };

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      style={{...tabBtnBase, ...(tab === id ? {backgroundColor: '#4a3a6a'} : {})}}
      onClick={() => setInternalTab(id)}
    >
      {label}
    </button>
  );

  const saveLabel = saving ? '保存中…' : tab === 'foreshadowing' ? '保存伏笔池' : '保存 Canon';
  const saveTitle = tab === 'foreshadowing'
    ? '写入 story-foreshadowing.json'
    : '写入 story-canon.json';

  const saveBtn = (
    <button
      type="button"
      style={{...styles.btn, opacity: saving ? 0.5 : 1}}
      title={saveTitle}
      aria-label={saveTitle}
      onClick={() => void saveCurrent()}
      disabled={saving}
    >
      {saveLabel}
    </button>
  );

  return (
    <div>
      {!hideTabBar && (
        <div style={{display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center'}}>
          {tabBtn('foreshadowing', '伏笔池')}
          {tabBtn('canon', 'Canon')}
          <div style={{marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center'}}>
            {saveBtn}
            <button type="button" style={headerIconBtn} title="刷新" aria-label="刷新" onClick={() => void reload()}>
              <RefreshIcon />
            </button>
          </div>
        </div>
      )}
      {hideTabBar && (
        <div style={{display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end'}}>
          {saveBtn}
          <button type="button" style={headerIconBtn} title="刷新" aria-label="刷新" onClick={() => void reload()}>
            <RefreshIcon />
          </button>
        </div>
      )}
      {error && <p style={{color: '#f88'}}>{error}</p>}
      {tab === 'foreshadowing' && (
        <div>
          <ListSectionHead
            title={<span style={sectionTitle}>伏笔</span>}
            addTitle="添加伏笔"
            onAdd={() =>
              setForeshadowing((f) => ({
                threads: [
                  ...f.threads,
                  {id: `fs_${Date.now()}`, title: '新伏笔', status: 'planned', priority: 2},
                ],
              }))
            }
          />
          {(foreshadowing.threads ?? []).length === 0 && (
            <p style={{color: '#888', fontSize: 12, margin: '0 0 8px'}}>暂无伏笔，点击 + 添加。</p>
          )}
          {(foreshadowing.threads ?? []).map((th, ti) => {
            const threadKey = th.id || String(ti);
            const open = foreshadowOpenState[threadKey] ?? false;
            const displayTitle = th.title.trim() || '未命名伏笔';
            const plantEnabled = canPlantForeshadowThread(th);
            const clearEnabled = canClearForeshadowThread(th);
            const toggleOpen = () =>
              setForeshadowOpenState((prev) => ({...prev, [threadKey]: !open}));

            return (
            <div key={threadKey} style={card}>
              <div
                style={cardHead}
                onClick={toggleOpen}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleOpen();
                  }
                }}
              >
                <span>
                  {open ? '▼' : '▶'} {displayTitle}
                  {th.status ? (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 500,
                        padding: '1px 6px',
                        borderRadius: 4,
                        ...foreshadowStatusStyle(th.status),
                      }}
                    >
                      {foreshadowStatusLabel(th.status)}
                    </span>
                  ) : null}
                </span>
                <ListOpsCell>
                  <span onClick={(e) => e.stopPropagation()} style={{display: 'contents'}}>
                  <ListPlantButton
                    title={plantEnabled ? '埋设' : th.status !== 'planned' ? '埋设（仅待埋设可用）' : '埋设（请先选择埋设场景）'}
                    disabled={!plantEnabled}
                    stopPropagation
                    onClick={() =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) => (i === ti ? plantForeshadowThread(t) : t)),
                      }))
                    }
                  />
                  <ListClearButton
                    title={clearEnabled ? '清除' : '清除（仅已埋设或已回收可用）'}
                    confirmMessage={`确认清除伏笔「${displayTitle}」的埋设与回收信息？`}
                    disabled={!clearEnabled}
                    stopPropagation
                    onClick={() =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) => (i === ti ? clearForeshadowThread(t) : t)),
                      }))
                    }
                  />
                  <ListDeleteButton
                    title="删除伏笔"
                    confirmMessage={`确认删除伏笔「${displayTitle}」？`}
                    onClick={() =>
                      setForeshadowing((f) => ({
                        threads: f.threads.filter((_, i) => i !== ti),
                      }))
                    }
                  />
                  </span>
                </ListOpsCell>
              </div>
              {open ? (
              <div style={cardBody}>
                <div style={styles.row}>
                  <label style={styles.label}>id</label>
                  <input
                    value={th.id}
                    onChange={(e) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) => (i === ti ? {...t, id: e.target.value} : t)),
                      }))
                    }
                    style={styles.input}
                    placeholder="id"
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>标题</label>
                  <input
                    value={th.title}
                    onChange={(e) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) => (i === ti ? {...t, title: e.target.value} : t)),
                      }))
                    }
                    style={styles.input}
                    placeholder="title"
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>状态</label>
                  <select
                    value={th.status}
                    onChange={(e) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti
                            ? applyForeshadowStatusChange(t, e.target.value as ForeshadowThread['status'])
                            : t
                        ),
                      }))
                    }
                    style={styles.input}
                  >
                    {FORESHADOW_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>优先级</label>
                  <select
                    value={th.priority ?? 2}
                    onChange={(e) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti ? {...t, priority: Number(e.target.value)} : t
                        ),
                      }))
                    }
                    style={styles.input}
                  >
                    <option value={1}>1（高）</option>
                    <option value={2}>2（中）</option>
                    <option value={3}>3（低）</option>
                  </select>
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>埋设要点</label>
                  <textarea
                    value={th.setup ?? ''}
                    onChange={(e) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti ? {...t, setup: e.target.value || undefined} : t
                        ),
                      }))
                    }
                    style={{...styles.input, ...styles.textarea, minHeight: 48}}
                    placeholder="读者应注意到什么、用什么意象或道具"
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>回收要点</label>
                  <textarea
                    value={th.payoff ?? ''}
                    onChange={(e) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti ? {...t, payoff: e.target.value || undefined} : t
                        ),
                      }))
                    }
                    style={{...styles.input, ...styles.textarea, minHeight: 48}}
                    placeholder="回收时须兑现什么信息或情绪"
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>触发词</label>
                  <input
                    value={formatAnchorsInput(th.anchors)}
                    onChange={(e) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti ? {...t, anchors: parseAnchorsInput(e.target.value)} : t
                        ),
                      }))
                    }
                    style={styles.input}
                    placeholder="逗号分隔；备忘或块级约束参考"
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>埋设场景</label>
                  <SceneIdSelect
                    value={th.plantedIn?.sceneId}
                    scenes={scenes}
                    sceneLabel={sceneLabel}
                    onChange={(sceneId) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti
                            ? {...t, plantedIn: mergePlantRef(t.plantedIn, 'sceneId', sceneId ?? '')}
                            : t
                        ),
                      }))
                    }
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>埋设块序</label>
                  <input
                    value={th.plantedIn?.blockIndex ?? ''}
                    onChange={(e) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti
                            ? {...t, plantedIn: mergePlantRef(t.plantedIn, 'blockIndex', e.target.value)}
                            : t
                        ),
                      }))
                    }
                    style={styles.input}
                    placeholder="可选，passage block 序号"
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>回收截止</label>
                  <SceneIdSelect
                    value={th.payoffBy}
                    scenes={scenes}
                    sceneLabel={sceneLabel}
                    onChange={(sceneId) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti ? {...t, payoffBy: sceneId} : t
                        ),
                      }))
                    }
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>回收目标</label>
                  <PayoffTargetSceneSelect
                    value={th.payoffTarget}
                    scenes={scenes}
                    sceneLabel={sceneLabel}
                    onChange={(payoffTarget) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti ? {...t, payoffTarget} : t
                        ),
                      }))
                    }
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>回收场景</label>
                  <SceneIdSelect
                    value={th.resolvedIn?.sceneId}
                    scenes={scenes}
                    sceneLabel={sceneLabel}
                    onChange={(sceneId) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti
                            ? {...t, resolvedIn: mergePlantRef(t.resolvedIn, 'sceneId', sceneId ?? '')}
                            : t
                        ),
                      }))
                    }
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>回收块序</label>
                  <input
                    value={th.resolvedIn?.blockIndex ?? ''}
                    onChange={(e) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti
                            ? {...t, resolvedIn: mergePlantRef(t.resolvedIn, 'blockIndex', e.target.value)}
                            : t
                        ),
                      }))
                    }
                    style={styles.input}
                    placeholder="可选，passage block 序号"
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>备注</label>
                  <textarea
                    value={th.notes ?? ''}
                    onChange={(e) =>
                      setForeshadowing((f) => ({
                        threads: f.threads.map((t, i) =>
                          i === ti ? {...t, notes: e.target.value || undefined} : t
                        ),
                      }))
                    }
                    style={{...styles.input, ...styles.textarea, minHeight: 40}}
                    placeholder="维护者备注（可选）"
                  />
                </div>
              </div>
              ) : null}
            </div>
            );
          })}
        </div>
      )}

      {tab === 'canon' && (
        <CanonTabEditor
          canon={canon}
          scenes={scenes}
          characterDict={characterDict}
          onCanonChange={setCanon}
        />
      )}
    </div>
  );
}

function sceneDisplayName(scenes: GameScene[], sceneId: string): string {
  return scenes.find((s) => s.id === sceneId)?.name ?? sceneId;
}

const zoneHead: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#9ca3af',
  margin: '16px 0 8px',
  paddingBottom: 6,
  borderBottom: '1px solid #333',
};

function CanonTabEditor({
  canon,
  scenes,
  characterDict,
  onCanonChange,
}: {
  canon: StoryCanon;
  scenes: GameScene[];
  characterDict: IdNameDict;
  onCanonChange: React.Dispatch<React.SetStateAction<StoryCanon>>;
}) {
  const [sceneOpenState, setSceneOpenState] = useState<Record<string, boolean>>({});

  return (
    <div>
      <div style={styles.row}>
        <label style={styles.label}>globalNotes</label>
        <textarea
          value={canon.globalNotes ?? ''}
          onChange={(e) => onCanonChange((c) => ({...c, globalNotes: e.target.value || undefined}))}
          style={{...styles.input, ...styles.textarea, minHeight: 60, width: '100%'}}
          placeholder="globalNotes"
        />
      </div>
      <ListSectionHead
        title={<span style={sectionTitle}>场景状态快照</span>}
        addTitle="添加场景状态快照"
        onAdd={() => {
          const id = prompt('场景 id');
          if (!id?.trim()) return;
          const sceneId = id.trim();
          onCanonChange((c) => ({
            ...c,
            scenes: {...c.scenes, [sceneId]: {lastUpdatedAt: new Date().toISOString()}},
          }));
          setSceneOpenState((prev) => ({...prev, [sceneId]: true}));
        }}
      />
      {Object.keys(canon.scenes).length === 0 && (
        <p style={{color: '#888', fontSize: 12, margin: '0 0 8px'}}>暂无场景状态快照，点击 + 添加。</p>
      )}
      {Object.entries(canon.scenes).map(([sceneId, st]) => {
        const open = sceneOpenState[sceneId] ?? false;
        const toggleOpen = () =>
          setSceneOpenState((prev) => ({...prev, [sceneId]: !open}));

        return (
        <CanonSceneEditor
          key={sceneId}
          displayName={sceneDisplayName(scenes, sceneId)}
          characterDict={characterDict}
          state={st}
          open={open}
          onToggleOpen={toggleOpen}
            onChange={(next) =>
              onCanonChange((c) => ({
                ...c,
                scenes: {...c.scenes, [sceneId]: next},
              }))
            }
            onRemove={() =>
              onCanonChange((c) => {
                const nextScenes = {...c.scenes};
                delete nextScenes[sceneId];
                return {...c, scenes: nextScenes};
              })
            }
          />
        );
      })}
    </div>
  );
}

function CanonCharacterStatesEditor({
  characterStates,
  characterDict,
  onChange,
}: {
  characterStates: Record<string, CanonCharacterState>;
  characterDict: IdNameDict;
  onChange: (next: Record<string, CanonCharacterState>) => void;
}) {
  const [charOpenState, setCharOpenState] = useState<Record<string, boolean>>({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [pickCharId, setPickCharId] = useState('');
  const entries = Object.entries(characterStates);
  const availableDict = useMemo(() => {
    const next: IdNameDict = {};
    for (const [id, name] of Object.entries(characterDict)) {
      if (!characterStates[id]) next[id] = name;
    }
    return next;
  }, [characterDict, characterStates]);
  const canAddCharacter = Object.keys(availableDict).length > 0;

  const openAddModal = () => {
    setPickCharId('');
    setAddModalOpen(true);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
    setPickCharId('');
  };

  const confirmAddCharacter = () => {
    if (!pickCharId || characterStates[pickCharId]) return;
    onChange({...characterStates, [pickCharId]: {}});
    setCharOpenState((prev) => ({...prev, [pickCharId]: true}));
    closeAddModal();
  };

  return (
    <div style={{marginTop: 8}}>
      <ListSectionHead
        title={<span style={{...sectionTitle, fontSize: 13}}>角色状态</span>}
        addTitle="添加角色"
        onAdd={openAddModal}
      />
      {entries.length === 0 && (
        <p style={{color: '#888', fontSize: 12, margin: '0 0 8px'}}>暂无角色状态记录。</p>
      )}
      {entries.map(([charId, cs]) => {
        const open = charOpenState[charId] ?? false;
        const charName = resolveIdName(characterDict, charId);
        const toggleOpen = () =>
          setCharOpenState((prev) => ({...prev, [charId]: !open}));

        return (
        <div key={charId} style={{...card, marginBottom: 8, borderColor: '#2a2a2a'}}>
          <div
            style={cardHead}
            onClick={toggleOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleOpen();
              }
            }}
          >
            <span style={{fontSize: 13}}>
              {open ? '▼' : '▶'} {charName}
            </span>
            <ListOpsCell>
              <span onClick={(e) => e.stopPropagation()} style={{display: 'contents'}}>
                <ListDeleteButton
                  title="删除角色状态"
                  confirmMessage={`确认删除角色「${charName}」的状态？`}
                  onClick={() => {
                    const next = {...characterStates};
                    delete next[charId];
                    onChange(next);
                  }}
                />
              </span>
            </ListOpsCell>
          </div>
          {open ? (
          <div style={{...cardBody, paddingTop: 8}}>
            <div style={styles.row}>
              <label style={styles.label}>location</label>
              <input
                value={cs.location ?? ''}
                onChange={(e) =>
                  onChange({
                    ...characterStates,
                    [charId]: {...cs, location: e.target.value.trim() || undefined},
                  })
                }
                style={{...styles.input, width: '100%'}}
                placeholder="角色落点（可选）"
              />
            </div>
            <div style={styles.row}>
              <label style={styles.label}>emotion</label>
              <input
                value={cs.emotion ?? ''}
                onChange={(e) =>
                  onChange({
                    ...characterStates,
                    [charId]: {...cs, emotion: e.target.value.trim() || undefined},
                  })
                }
                style={{...styles.input, width: '100%'}}
                placeholder="情绪（可选）"
              />
            </div>
            <div style={styles.row}>
              <label style={styles.label}>knows</label>
              <textarea
                value={(cs.knows ?? []).join('\n')}
                onChange={(e) =>
                  onChange({
                    ...characterStates,
                    [charId]: {
                      ...cs,
                      knows: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
                style={{...styles.input, ...styles.textarea, minHeight: 40, width: '100%'}}
                placeholder="该角色已知事实（每行一条）"
              />
            </div>
          </div>
          ) : null}
        </div>
        );
      })}
      {addModalOpen &&
        createPortal(
          <DetailEditModal
            title="添加角色"
            open
            onClose={closeAddModal}
            editable={canAddCharacter}
            onSave={canAddCharacter ? confirmAddCharacter : undefined}
          >
            {canAddCharacter ? (
              <div style={styles.row}>
                <label style={styles.label}>角色</label>
                <IdNameSelect
                  dict={availableDict}
                  value={pickCharId}
                  onChange={setPickCharId}
                  allowEmpty
                  placeholder="选择角色"
                  style={{...styles.input, width: '100%'}}
                />
              </div>
            ) : (
              <p style={{color: '#888', fontSize: 13, margin: 0}}>
                无可添加的角色（本场已全部纳入，或 story-characters 中无人物数据）。
              </p>
            )}
          </DetailEditModal>,
          document.body
        )}
    </div>
  );
}

function CanonSceneEditor({
  displayName,
  characterDict,
  state,
  open,
  onToggleOpen,
  onChange,
  onRemove,
}: {
  displayName: string;
  characterDict: IdNameDict;
  state: CanonSceneState;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (s: CanonSceneState) => void;
  onRemove: () => void;
}) {
  return (
    <div style={card}>
      <div
        style={cardHead}
        onClick={onToggleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleOpen();
          }
        }}
      >
        <span>
          {open ? '▼' : '▶'} {displayName}
        </span>
        <ListOpsCell>
          <span onClick={(e) => e.stopPropagation()} style={{display: 'contents'}}>
            <ListDeleteButton
              title="删除场景状态快照"
              confirmMessage={`确认删除场景状态快照「${displayName}」？`}
              onClick={onRemove}
            />
          </span>
        </ListOpsCell>
      </div>
      {open ? (
      <div style={cardBody}>
        <div style={styles.row}>
          <label style={styles.label}>summary</label>
          <textarea
            value={state.summary ?? ''}
            onChange={(e) =>
              onChange({
                ...state,
                summary: e.target.value.trim() || undefined,
              })
            }
            style={{...styles.input, ...styles.textarea, minHeight: 48, width: '100%'}}
            placeholder="本场结局浓缩陈述（1–3 句）"
          />
        </div>
        <div style={styles.row}>
          <label style={styles.label}>确立事实</label>
          <textarea
            value={(state.facts ?? []).join('\n')}
            onChange={(e) =>
              onChange({
                ...state,
                facts: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
              })
            }
            style={{...styles.input, ...styles.textarea, minHeight: 48, width: '100%'}}
            placeholder="确立事实（每行一条，可核验的客观事实）"
          />
        </div>
        <div style={styles.row}>
          <label style={styles.label}>未解问题</label>
          <textarea
            value={(state.openQuestions ?? []).join('\n')}
            onChange={(e) =>
              onChange({
                ...state,
                openQuestions: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
              })
            }
            style={{...styles.input, ...styles.textarea, minHeight: 40, width: '100%'}}
            placeholder="未解问题（每行一条）"
          />
        </div>
        <CanonCharacterStatesEditor
          characterStates={state.characterStates ?? {}}
          characterDict={characterDict}
          onChange={(characterStates) =>
            onChange({
              ...state,
              characterStates: Object.keys(characterStates).length ? characterStates : undefined,
            })
          }
        />
      </div>
      ) : null}
    </div>
  );
}
