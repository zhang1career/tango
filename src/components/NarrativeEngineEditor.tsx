/**
 * 叙事引擎 - 大纲 / 伏笔 / Canon / 生成轨迹
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import {getScenesFetchUrl, getStoryFmFetchUrl} from '@/config';
import type {GameScene} from '@/schema/game-scene';
import type {StoryFramework} from '@/schema/story-framework';
import {fromPersistedFramework, migrateFramework} from '@/schema/story-framework';
import {
  EMPTY_STORY_CANON,
  normalizeStoryCanon,
  type CanonSceneState,
  type StoryCanon,
} from '@/schema/story-canon';
import {
  EMPTY_STORY_FORESHADOWING,
  FORESHADOW_STATUS_OPTIONS,
  foreshadowStatusLabel,
  normalizeStoryForeshadowing,
  type ForeshadowPlantRef,
  type ForeshadowThread,
  type StoryForeshadowing,
} from '@/schema/story-foreshadowing';
import {
  EMPTY_STORY_OUTLINE,
  normalizeStoryOutline,
  type OutlineBeat,
  type StoryOutline,
} from '@/schema/story-outline';
import {
  EMPTY_GENERATION_TRACES,
  normalizeGenerationTraces,
  type StoryGenerationTraces,
} from '@/schema/story-generation-traces';
import {
  fetchGenerationTraces,
  fetchStoryCanon,
  fetchStoryForeshadowing,
  fetchStoryOutline,
  saveStoryCanon,
  saveStoryForeshadowing,
  saveStoryOutline,
} from '@/utils/story-engine-files';
import {formatJsonCompact} from '@/utils/json-format';
import {editorStyles as styles} from '@/styles/editorStyles';
import {listStyles} from '@/styles/listStyles';
import {
  ListDeleteButton,
  ListOpsCell,
  ListSectionHead,
  ListTableHeader,
  ListTableRow,
} from './ui/ListPrimitives';
import {ConfirmModal} from './ui/ConfirmModal';
import {
  applyProgressAnchor,
  ensureOutlineWithFm,
  findFmChapter,
  getAnchorChapterIndex,
  inferProgressAnchorFromScenes,
  isChapterMarkedArchived,
  sceneIdsAvailableForBeat,
  splitOutlineByRollingWindow,
  type OutlineChapterZone,
} from '@/utils/story-outline-fm';
import {getChapterAvailableSceneIds} from '@/utils/chapter-scene';

type Tab = 'outline' | 'foreshadowing' | 'canon' | 'traces';

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

const outlineBeatGrid = {gridTemplateColumns: '9rem 1fr 4.5rem'};

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

const saveTargetByTab: Record<Exclude<Tab, 'traces'>, string> = {
  outline: 'story-outline.json',
  foreshadowing: 'story-foreshadowing.json',
  canon: 'story-canon.json',
};

function SaveIcon({size = 18, style}: {size?: number; style?: React.CSSProperties}) {
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

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

async function loadFw(gameId: string): Promise<StoryFramework | null> {
  const res = await fetch(getStoryFmFetchUrl(gameId));
  if (!res.ok) return null;
  const parsed = (await res.json()) as Record<string, unknown>;
  migrateFramework(parsed as unknown as StoryFramework);
  return fromPersistedFramework(parsed);
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
  const ids = useMemo(() => sortedSceneIds(scenes, sceneIds), [scenes, sceneIds]);

  return (
    <div>
      <select
        multiple
        value={sceneIds}
        onChange={(e) => {
          const selected = Array.from(e.target.selectedOptions, (o) => o.value);
          onChange(joinPayoffTarget(selected, other));
        }}
        style={{...styles.input, minHeight: 88}}
      >
        {ids.map((sid) => (
          <option key={sid} value={sid}>
            {sceneLabel(sid)}
          </option>
        ))}
      </select>
      <p style={{...hintText, margin: '4px 0 0'}}>
        按住 Ctrl（Mac：⌘）多选。
        {other.length ? ` 另含文字说明：${other.join('、')}` : ''}
      </p>
    </div>
  );
}

export function NarrativeEngineEditor() {
  const {gameId} = useGameId();
  const {checkAuthForSave} = useAuth();
  const [tab, setTab] = useState<Tab>('outline');
  const [fw, setFw] = useState<StoryFramework | null>(null);
  const [outline, setOutline] = useState<StoryOutline>(EMPTY_STORY_OUTLINE);
  const [foreshadowing, setForeshadowing] = useState<StoryForeshadowing>(EMPTY_STORY_FORESHADOWING);
  const [canon, setCanon] = useState<StoryCanon>(EMPTY_STORY_CANON);
  const [traces, setTraces] = useState<StoryGenerationTraces>(EMPTY_GENERATION_TRACES);
  const [scenes, setScenes] = useState<GameScene[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [foreshadowOpenState, setForeshadowOpenState] = useState<Record<string, boolean>>({});

  const sceneMap = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const sceneLabel = useCallback(
    (sceneId: string) => sceneMap.get(sceneId)?.name ?? sceneId,
    [sceneMap]
  );

  const reload = useCallback(async () => {
    setError(null);
    const [f, o, fs, c, t, scenesRes] = await Promise.all([
      loadFw(gameId),
      fetchStoryOutline(gameId),
      fetchStoryForeshadowing(gameId),
      fetchStoryCanon(gameId),
      fetchGenerationTraces(gameId),
      fetch(getScenesFetchUrl(gameId)),
    ]);
    const loadedScenes = scenesRes.ok ? ((await scenesRes.json()) as GameScene[]) : [];
    setFw(f);
    setScenes(Array.isArray(loadedScenes) ? loadedScenes : []);
    setOutline(f ? ensureOutlineWithFm(o, f, loadedScenes) : o);
    setForeshadowing(fs);
    setCanon(c);
    setTraces(t);
  }, [gameId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveCurrent = () => {
    void checkAuthForSave(async () => {
      setSaving(true);
      setError(null);
      try {
        if (tab === 'outline') await saveStoryOutline(gameId, outline);
        else if (tab === 'foreshadowing') await saveStoryForeshadowing(gameId, foreshadowing);
        else if (tab === 'canon') await saveStoryCanon(gameId, canon);
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
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  const saveTitle =
    tab === 'traces'
      ? undefined
      : saving
        ? `保存 ${saveTargetByTab[tab]}…`
        : `保存 ${saveTargetByTab[tab]}`;

  return (
    <div style={{...styles.container, maxWidth: 960}}>
      <div style={styles.header}>
        <h2 style={styles.title}>叙事引擎</h2>
        <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
          {tab !== 'traces' && (
            <button
              type="button"
              style={{...headerIconBtn, opacity: saving ? 0.5 : 1}}
              title={saveTitle}
              aria-label={saveTitle}
              onClick={() => void saveCurrent()}
              disabled={saving}
            >
              <SaveIcon />
            </button>
          )}
          <button
            type="button"
            style={headerIconBtn}
            title="刷新叙事引擎数据"
            aria-label="刷新叙事引擎数据"
            onClick={() => void reload()}
          >
            <RefreshIcon />
          </button>
        </div>
      </div>
      <p style={{color: '#aaa', fontSize: 13, marginTop: -12, marginBottom: 12}}>
        真相层：滚动大纲、伏笔池、Canon 快照。生成轨迹只读（DEV 自动写入，不进 zip）。
      </p>
      <div style={{display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap'}}>
        {tabBtn('outline', '滚动大纲')}
        {tabBtn('foreshadowing', '伏笔池')}
        {tabBtn('canon', 'Canon')}
        {tabBtn('traces', '生成轨迹')}
      </div>
      {error && <p style={{color: '#f88'}}>{error}</p>}

      {tab === 'outline' && (
        <OutlineTabEditor
          fw={fw}
          outline={outline}
          scenes={scenes}
          canon={canon}
          onOutlineChange={setOutline}
        />
      )}

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
                    <span style={{marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400}}>
                      {foreshadowStatusLabel(th.status)}
                    </span>
                  ) : null}
                </span>
                <ListOpsCell>
                  <span onClick={(e) => e.stopPropagation()} style={{display: 'contents'}}>
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
                          i === ti ? {...t, status: e.target.value as ForeshadowThread['status']} : t
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
                    placeholder="逗号分隔；用于生成块锚点匹配与自动埋设"
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
        <CanonTabEditor canon={canon} scenes={scenes} onCanonChange={setCanon} />
      )}

      {tab === 'traces' && <TracesTabEditor traces={traces} scenes={scenes} />}
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

function ZoneSectionHead({title, trailing}: {title: string; trailing?: React.ReactNode}) {
  return (
    <div
      style={{
        ...zoneHead,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span>{title}</span>
      {trailing}
    </div>
  );
}

function OutlineTabEditor({
  fw,
  outline,
  scenes,
  canon,
  onOutlineChange,
}: {
  fw: StoryFramework | null;
  outline: StoryOutline;
  scenes: GameScene[];
  canon: StoryCanon;
  onOutlineChange: React.Dispatch<React.SetStateAction<StoryOutline>>;
}) {
  const [archiveConfirm, setArchiveConfirm] = useState<{
    newAnchorId: string;
    items: Array<{title: string; canonScenes: number}>;
  } | null>(null);
  const [chapterOpenState, setChapterOpenState] = useState<Record<string, boolean>>({});

  const sceneMap = useMemo(
    () => new Map(scenes.map((s) => [s.id, s])),
    [scenes]
  );
  const split = useMemo(
    () => (fw ? splitOutlineByRollingWindow(fw, outline) : null),
    [fw, outline]
  );
  const suggestedAnchor = useMemo(
    () => (fw && scenes.length ? inferProgressAnchorFromScenes(fw, scenes) : undefined),
    [fw, scenes]
  );

  const sceneLabel = (sceneId: string) => sceneMap.get(sceneId)?.name ?? sceneId;

  const updateChapterGoal = (chapterId: string, narrativeGoal: string) => {
    onOutlineChange((o) => ({
      ...o,
      chapters: o.chapters.map((c) => (c.chapterId === chapterId ? {...c, narrativeGoal} : c)),
    }));
  };

  const requestAnchorChange = (newAnchorId: string) => {
    if (!fw || !newAnchorId) return;
    const oldIdx = getAnchorChapterIndex(fw, outline);
    const newIdx = (fw.chapters ?? []).findIndex((c) => c.id === newAnchorId);
    if (newIdx < 0) return;
    if (newIdx > oldIdx) {
      const items = (fw.chapters ?? []).slice(oldIdx, newIdx).map((c) => ({
        title: c.title || c.id,
        canonScenes: getChapterAvailableSceneIds(c).filter((sid) => canon.scenes[sid]).length,
      }));
      setArchiveConfirm({newAnchorId, items});
      return;
    }
    onOutlineChange(applyProgressAnchor(fw, outline, newAnchorId, {archiveSkipped: true}));
  };

  const confirmArchiveAndAnchor = () => {
    if (!fw || !archiveConfirm) return;
    onOutlineChange(applyProgressAnchor(fw, outline, archiveConfirm.newAnchorId));
    setArchiveConfirm(null);
  };

  const isChapterOpen = (chapterId: string, zone: OutlineChapterZone) => {
    if (chapterId in chapterOpenState) return chapterOpenState[chapterId];
    return zone === 'active';
  };

  const toggleChapterOpen = (chapterId: string, zone: OutlineChapterZone) => {
    const open = isChapterOpen(chapterId, zone);
    setChapterOpenState((prev) => ({...prev, [chapterId]: !open}));
  };

  const canonSceneCountForChapter = (chapterId: string) => {
    if (!fw) return 0;
    const fmCh = findFmChapter(fw, chapterId);
    if (!fmCh) return 0;
    return getChapterAvailableSceneIds(fmCh).filter((sid) => canon.scenes[sid]).length;
  };

  const renderChapterCard = (
    ch: StoryOutline['chapters'][number],
    ci: number,
    zone: OutlineChapterZone
  ) => {
    const fmCh = findFmChapter(fw, ch.chapterId);
    const displayTitle = fmCh?.title ?? ch.title ?? ch.chapterId;
    const isAnchor = ch.chapterId === outline.progressAnchorChapterId;
    const markedArchived = isChapterMarkedArchived(outline, ch.chapterId);
    const canonCount = canonSceneCountForChapter(ch.chapterId);
    const beatsEditable = zone === 'active';
    const goalEditable = zone === 'active' || zone === 'stub';
    const open = isChapterOpen(ch.chapterId, zone);

    const beatSceneOptions = (beat: OutlineBeat) =>
      sceneIdsAvailableForBeat(fmCh, ch.beats ?? [], beat.sceneId);
    const unusedScenes = sceneIdsAvailableForBeat(fmCh, ch.beats ?? []);

    return (
      <div
        key={ch.chapterId || ci}
        style={{
          ...card,
          ...(isAnchor ? {borderColor: '#5b4a8a'} : {}),
          ...(zone === 'archived' ? {opacity: 0.92} : {}),
        }}
      >
        <div
          style={cardHead}
          onClick={() => toggleChapterOpen(ch.chapterId, zone)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleChapterOpen(ch.chapterId, zone);
            }
          }}
        >
          <span>
            {open ? '▼' : '▶'} {displayTitle}
            {isAnchor ? (
              <span style={{marginLeft: 8, fontSize: 12, color: '#a78bfa', fontWeight: 400}}>
                进度锚点
              </span>
            ) : null}
            {markedArchived ? (
              <span style={{marginLeft: 8, fontSize: 12, color: '#6b7280', fontWeight: 400}}>
                已归档
              </span>
            ) : null}
          </span>
          <ListOpsCell>
            <span onClick={(e) => e.stopPropagation()} style={{display: 'contents'}}>
            {fw && ch.chapterId !== outline.progressAnchorChapterId && (
              <button
                type="button"
                style={tabBtnBase}
                onClick={(e) => {
                  e.stopPropagation();
                  requestAnchorChange(ch.chapterId);
                }}
                title="将此章设为叙事进度锚点"
              >
                设为进度
              </button>
            )}
            </span>
          </ListOpsCell>
        </div>
        {open ? (
          <div style={cardBody}>
            {zone === 'archived' && canonCount > 0 && (
              <p style={{...hintText, color: '#7dd3a8', marginTop: 0}}>
                Canon 已记录本章 {canonCount} 个场景快照；归档后生成依赖 Canon，不再注入场景任务。
              </p>
            )}
            {fmCh?.theme ? (
              <div style={styles.row}>
                <label style={styles.label}>主题（story-fm）</label>
                <div style={styles.readOnlyValue}>{fmCh.theme}</div>
              </div>
            ) : null}
            <div style={styles.row}>
              <label style={styles.label}>narrativeGoal</label>
              {goalEditable ? (
                <textarea
                  value={ch.narrativeGoal}
                  onChange={(e) => updateChapterGoal(ch.chapterId, e.target.value)}
                  style={{...styles.input, ...styles.textarea, minHeight: zone === 'stub' ? 40 : 48}}
                  placeholder={
                    zone === 'stub' ? '远期粗纲（可选一句）' : '本章不可协商的叙事目标'
                  }
                />
              ) : (
                <div style={styles.readOnlyValue}>{ch.narrativeGoal || '—'}</div>
              )}
            </div>
            {beatsEditable && (
              <>
                <ListSectionHead
                  title={<span style={{...sectionTitle, fontSize: 13}}>场景任务</span>}
                  addTitle={
                    unusedScenes.length === 0
                      ? '本章场景已全部纳入任务'
                      : '添加场景任务'
                  }
                  onAdd={() => {
                    const sid = unusedScenes[0];
                    if (!sid) return;
                    onOutlineChange((o) => ({
                      ...o,
                      chapters: o.chapters.map((c) =>
                        c.chapterId === ch.chapterId
                          ? {
                              ...c,
                              beats: [
                                ...c.beats,
                                {sceneId: sid, summary: sceneMap.get(sid)?.name ?? ''},
                              ],
                            }
                          : c
                      ),
                    }));
                  }}
                  addDisabled={unusedScenes.length === 0}
                />
                {(ch.beats ?? []).length > 0 && (
                  <div>
                    <ListTableHeader grid={outlineBeatGrid}>
                      <span>场景</span>
                      <span>任务</span>
                      <span style={listStyles.cellOps}>操作</span>
                    </ListTableHeader>
                    {(ch.beats ?? []).map((beat, bi) => {
                      const options = beatSceneOptions(beat);
                      return (
                        <ListTableRow key={bi} grid={outlineBeatGrid}>
                          <select
                            value={beat.sceneId ?? ''}
                            onChange={(e) =>
                              onOutlineChange((o) => ({
                                ...o,
                                chapters: o.chapters.map((c) =>
                                  c.chapterId === ch.chapterId
                                    ? {
                                        ...c,
                                        beats: c.beats.map((b, j) =>
                                          j === bi
                                            ? {...b, sceneId: e.target.value || undefined}
                                            : b
                                        ),
                                      }
                                    : c
                                ),
                              }))
                            }
                            style={styles.input}
                          >
                            {!beat.sceneId && <option value="">选择场景</option>}
                            {(beat.sceneId && !options.includes(beat.sceneId)
                              ? [beat.sceneId, ...options]
                              : options
                            ).map((sid) => (
                              <option key={sid} value={sid}>
                                {sceneLabel(sid)}
                              </option>
                            ))}
                          </select>
                          <input
                            value={beat.summary}
                            onChange={(e) =>
                              onOutlineChange((o) => ({
                                ...o,
                                chapters: o.chapters.map((c) =>
                                  c.chapterId === ch.chapterId
                                    ? {
                                        ...c,
                                        beats: c.beats.map((b, j) =>
                                          j === bi ? {...b, summary: e.target.value} : b
                                        ),
                                      }
                                    : c
                                ),
                              }))
                            }
                            style={styles.input}
                            placeholder="本场景叙事任务"
                          />
                          <ListOpsCell>
                            <ListDeleteButton
                              title="删除场景任务"
                              onClick={() =>
                                onOutlineChange((o) => ({
                                  ...o,
                                  chapters: o.chapters.map((c) =>
                                    c.chapterId === ch.chapterId
                                      ? {...c, beats: c.beats.filter((_, j) => j !== bi)}
                                      : c
                                  ),
                                }))
                              }
                            />
                          </ListOpsCell>
                        </ListTableRow>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {zone === 'archived' && (ch.beats ?? []).length > 0 && (
              <p style={{...hintText, marginBottom: 0}}>
                {ch.beats.length} 个场景任务已归档（只读）。展开可查看 narrativeGoal。
              </p>
            )}
          </div>
        ) : (
          <div style={{...cardBody, paddingTop: 8, paddingBottom: 8}}>
            <div style={{fontSize: 13, color: '#aaa'}}>
              {ch.narrativeGoal ? truncateLine(ch.narrativeGoal, 120) : '（无 narrativeGoal）'}
              {canonCount > 0 ? ` · Canon ${canonCount} 场` : ''}
              {zone === 'active' && (ch.beats ?? []).length > 0
                ? ` · ${ch.beats.length} 个场景任务`
                : ''}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <p style={hintText}>
        滚动大纲与 story-fm 章节 1:1 同步。以进度锚点为起点，详细维护其后{' '}
        {outline.rollingHorizonChapters} 章的 narrativeGoal 与场景任务；已完成章归档，远期仅保留粗纲。结构章请在「章节」页创建。
      </p>
      {!fw && (
        <p style={{...hintText, color: '#f88'}}>无法加载 story-fm，请先确认游戏数据可用。</p>
      )}
      <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12}}>
        <div style={styles.row}>
          <label style={styles.label}>进度锚点</label>
          <select
            style={{...styles.input, minWidth: 220}}
            value={outline.progressAnchorChapterId ?? ''}
            disabled={!fw}
            onChange={(e) => requestAnchorChange(e.target.value)}
          >
            {(fw?.chapters ?? []).map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.title || ch.id}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.row}>
          <label style={styles.label}>详细维护窗口（章）</label>
          <input
            type="number"
            min={1}
            max={20}
            value={outline.rollingHorizonChapters}
            onChange={(e) =>
              onOutlineChange((o) => ({
                ...o,
                rollingHorizonChapters: Number(e.target.value) || 5,
              }))
            }
            style={{...styles.input, width: 80}}
          />
        </div>
      </div>
      {split && (
        <p style={{...hintText, marginBottom: 12}}>
          章节区 {split.active.length} 章可编辑场景任务 · 已完成 {split.archived.length} 章 · 远期{' '}
          {split.stub.length} 章
        </p>
      )}
      {(outline.chapters ?? []).length === 0 && fw && (
        <p style={hintText}>story-fm 暂无章节。请先在「章节」页创建。</p>
      )}
      <ConfirmModal
        open={!!archiveConfirm}
        title="前移进度锚点"
        confirmLabel="归档并前移"
        message={
          archiveConfirm ? (
            <>
              <p style={{margin: '0 0 8px'}}>
                将进度锚点前移后，下列章节将标记为已归档：场景任务不再参与生成，请依赖 Canon 快照与场景摘要。
              </p>
              <ul style={{margin: 0, paddingLeft: 18}}>
                {archiveConfirm.items.map((item) => (
                  <li key={item.title}>
                    {item.title}
                    {item.canonScenes > 0 ? `（Canon 已记录 ${item.canonScenes} 场）` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            ''
          )
        }
        onConfirm={confirmArchiveAndAnchor}
        onClose={() => setArchiveConfirm(null)}
      />
      {split && split.archived.length > 0 && (
        <>
          <ZoneSectionHead title="已完成章节" />
          {split.archived.map(({chapter, index}) =>
            renderChapterCard(chapter, index, 'archived')
          )}
        </>
      )}
      {fw && (outline.chapters ?? []).length > 0 && (
        <>
          <ZoneSectionHead
            title="章节"
            trailing={
              <button
                type="button"
                style={{
                  ...tabBtnBase,
                  opacity:
                    !fw ||
                    !suggestedAnchor ||
                    suggestedAnchor === outline.progressAnchorChapterId
                      ? 0.45
                      : 1,
                }}
                disabled={
                  !fw ||
                  !suggestedAnchor ||
                  suggestedAnchor === outline.progressAnchorChapterId
                }
                title={
                  !suggestedAnchor
                    ? '尚无生成进度（需场景 AI 块含 generatedText）'
                    : suggestedAnchor === outline.progressAnchorChapterId
                      ? '已与生成进度一致'
                      : `将进度锚点设为：${findFmChapter(fw, suggestedAnchor)?.title ?? suggestedAnchor}`
                }
                onClick={() => suggestedAnchor && requestAnchorChange(suggestedAnchor)}
              >
                采用生成进度建议
              </button>
            }
          />
          {split && split.active.length > 0 ? (
            split.active.map(({chapter, index}) => renderChapterCard(chapter, index, 'active'))
          ) : (
            <p style={hintText}>当前锚点与维护窗口下，暂无处于详细规划中的章节。</p>
          )}
        </>
      )}
      {split && split.stub.length > 0 && (
        <>
          <ZoneSectionHead title="远期章节" />
          {split.stub.map(({chapter, index}) => renderChapterCard(chapter, index, 'stub'))}
        </>
      )}
    </div>
  );
}

function truncateLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function CanonTabEditor({
  canon,
  scenes,
  onCanonChange,
}: {
  canon: StoryCanon;
  scenes: GameScene[];
  onCanonChange: React.Dispatch<React.SetStateAction<StoryCanon>>;
}) {
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
        title={<span style={sectionTitle}>场景快照</span>}
        addTitle="添加场景快照"
        onAdd={() => {
          const id = prompt('场景 id');
          if (!id?.trim()) return;
          onCanonChange((c) => ({
            ...c,
            scenes: {...c.scenes, [id.trim()]: {lastUpdatedAt: new Date().toISOString()}},
          }));
        }}
      />
      {Object.keys(canon.scenes).length === 0 && (
        <p style={{color: '#888', fontSize: 12, margin: '0 0 8px'}}>暂无场景快照，点击 + 添加。</p>
      )}
      {Object.entries(canon.scenes).map(([sceneId, st]) => (
        <CanonSceneEditor
          key={sceneId}
          displayName={sceneDisplayName(scenes, sceneId)}
          state={st}
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
      ))}
    </div>
  );
}

function TracesTabEditor({traces, scenes}: {traces: StoryGenerationTraces; scenes: GameScene[]}) {
  return (
    <div style={{fontSize: 12, fontFamily: 'monospace', color: '#e8e8e8'}}>
      {(traces.entries ?? []).length === 0 ? (
        <p style={{color: '#888'}}>暂无轨迹</p>
      ) : (
        [...traces.entries].reverse().slice(0, 50).map((e) => (
          <details key={e.id} style={{marginBottom: 8, border: '1px solid #333', padding: 8}}>
            <summary>
              {e.at} · {e.kind} · {e.sceneName ?? sceneDisplayName(scenes, e.sceneId)}
              {e.blockIndex != null ? `#${e.blockIndex}` : ''} · {e.model}
            </summary>
            <pre style={{whiteSpace: 'pre-wrap', color: '#ccc'}}>
              {formatJsonCompact(e.phases)}
            </pre>
          </details>
        ))
      )}
    </div>
  );
}

function CanonSceneEditor({
  displayName,
  state,
  onChange,
  onRemove,
}: {
  displayName: string;
  state: CanonSceneState;
  onChange: (s: CanonSceneState) => void;
  onRemove: () => void;
}) {
  return (
    <div style={card}>
      <div style={cardHead}>
        <span>{displayName}</span>
        <ListOpsCell>
          <ListDeleteButton
            title="删除场景快照"
            confirmMessage={`确认删除场景快照「${displayName}」？`}
            onClick={onRemove}
          />
        </ListOpsCell>
      </div>
      <div style={cardBody}>
        <div style={styles.row}>
          <label style={styles.label}>facts（每行一条）</label>
          <textarea
            value={(state.facts ?? []).join('\n')}
            onChange={(e) =>
              onChange({
                ...state,
                facts: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
              })
            }
            style={{...styles.input, ...styles.textarea, minHeight: 48, width: '100%'}}
            placeholder="facts（每行一条）"
          />
        </div>
        <div style={styles.row}>
          <label style={styles.label}>openQuestions</label>
          <textarea
            value={(state.openQuestions ?? []).join('\n')}
            onChange={(e) =>
              onChange({
                ...state,
                openQuestions: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
              })
            }
            style={{...styles.input, ...styles.textarea, minHeight: 40, width: '100%'}}
            placeholder="openQuestions"
          />
        </div>
      </div>
    </div>
  );
}
