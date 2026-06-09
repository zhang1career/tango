/**
 * 章节编辑：场景列表、叙事图边、跨章过渡、连通态
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import type {
  ChapterTransition,
  FrameworkChapter,
  StoryFramework,
} from '../schema/story-framework';
import {
  getChapterAvailableSceneIds,
  inferChapterEndSceneIds,
  isNarrativeGraph,
} from '../utils/chapter-scene';
import {validateFramework} from '../schema/story-framework';
import {useGameId} from '../context/GameIdContext';
import {useNotification} from '../context/NotificationContext';
import {getStoryFmFetchUrl} from '@/config';
import {preloadFrameworkListData} from '../services/framework-list-data';
import {fromPersistedFramework, migrateFramework, toPersistedFramework} from '../schema/story-framework';
import {formatJsonCompact} from '../utils/json-format';
import {
  collectRoutingStaleScenes,
} from '../utils/scene-routing-sync';
import {
  loadStoryFromGame,
  lookupKeysForSceneEntry,
  saveStoryTw,
  syncRoutingLinksForGame,
} from '../services/scene-routing-sync-service';
import {parseTwee} from '@/engine';
import {getAIGCApiKey} from '@/config';
import {useAuth} from '../context/AuthContext';
import {ChapterGraphCanvas} from './ChapterGraphCanvas';
import {DetailEditModal} from './ui/DetailEditModal';
import {compileChapterScene} from '../services/chapter-scene-compile';
import {collectStaleCompiledScenes} from '../utils/chapter-compile-helpers';
import {getChapterSceneMeta} from '../utils/chapter-scene';

const COMPILE_STALE_HINT = '正文待汇编：场景 passageBlocks 已变更，尚未写入 story.tw';

function CompileHammerIcon({style}: {style?: React.CSSProperties}) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{display: 'block', flexShrink: 0, ...style}}
      aria-hidden
    >
      <path d="M15.5 2.5 21.5 8.5 20 10 14 4 15.5 2.5ZM4 20l1.2-4.8 13.6-9.2 3.6 3.6-8.4 8.4L4 20Z" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {maxWidth: 960, margin: '0 auto', padding: 20, color: '#e8e8e8'},
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid #333',
    paddingBottom: 12,
  },
  btn: {
    padding: '6px 14px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    cursor: 'pointer',
    fontSize: 13,
  },
  card: {
    marginBottom: 16,
    border: '1px solid #333',
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardHead: {
    padding: '10px 14px',
    backgroundColor: '#252540',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
  },
  cardBody: {padding: 14},
  row: {marginBottom: 12},
  label: {display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4},
  input: {
    width: '100%',
    padding: '6px 10px',
    backgroundColor: '#1a1a2e',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#e8e8e8',
    fontSize: 13,
  },
  table: {width: '100%', borderCollapse: 'collapse', fontSize: 12},
  th: {textAlign: 'left', padding: 6, borderBottom: '1px solid #444', color: '#9ca3af'},
  td: {padding: 6, borderBottom: '1px solid #333', verticalAlign: 'top'},
  hint: {fontSize: 12, color: '#888', marginBottom: 12},
  sectionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  compileIconFresh: {color: '#e8e8e8'},
  compileIconStale: {color: '#ffd54f'},
  btnIcon: {
    padding: '2px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 16,
  },
};

export function ChapterEditor({
  fw,
  updateFw,
  onOpenScene,
}: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
  onOpenScene?: (sceneId: string) => void;
}) {
  const {gameId} = useGameId();
  const {addNotification} = useNotification();
  const {checkAuthForSave} = useAuth();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [parsedStory, setParsedStory] = useState<ReturnType<typeof parseTwee> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState<{current: number; total: number; scene?: string} | null>(null);

  useEffect(() => {
    void preloadFrameworkListData(updateFw, gameId);
  }, [gameId, updateFw]);

  useEffect(() => {
    void loadStoryFromGame(gameId).then(setParsedStory);
  }, [gameId, fw]);

  const lookupKeys = useCallback(
    (chi: number, sid: string) => lookupKeysForSceneEntry(fw, chi, sid),
    [fw]
  );

  const routingStale = useMemo(() => {
    if (!parsedStory) return [];
    try {
      return collectRoutingStaleScenes(fw, parsedStory, lookupKeys);
    } catch {
      return [];
    }
  }, [fw, parsedStory, lookupKeys]);

  const validation = useMemo(() => validateFramework(fw), [fw]);

  const staleScenes = useMemo(() => collectStaleCompiledScenes(fw), [fw]);
  const staleByChapter = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of staleScenes) {
      const ch = fw.chapters.find((c) => (c.title || c.id) === s.chapterTitle || c.id === s.chapterTitle);
      if (!ch) continue;
      const set = map.get(ch.id) ?? new Set();
      set.add(s.sceneId);
      map.set(ch.id, set);
    }
    return map;
  }, [staleScenes, fw.chapters]);

  const saveFm = async () => {
    const res = await fetch(getStoryFmFetchUrl(gameId), {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: formatJsonCompact(toPersistedFramework(fw)),
    });
    const data = (await res.json()) as {ok?: boolean; error?: string};
    if (!res.ok || !data.ok) throw new Error(data.error || '保存失败');
  };

  const handleSave = async () => {
    try {
      await saveFm();
      addNotification('info', '章节已保存');
    } catch (e) {
      addNotification('error', (e as Error).message);
    }
  };

  const handleCompileScene = async (chapterIndex: number, sceneId: string) => {
    if (!getAIGCApiKey()?.trim()) {
      addNotification('error', '未配置 AIGC API Key，无法汇编');
      return;
    }
    let story = parsedStory ?? (await loadStoryFromGame(gameId));
    if (!story) {
      addNotification('error', '无法读取 story.tw');
      return;
    }
    setCompiling(true);
    try {
      const result = await compileChapterScene(fw, story, chapterIndex, sceneId, gameId);
      updateFw(() => result.fw);
      await saveStoryTw(gameId, result.story);
      await saveFm();
      setParsedStory(result.story);
      addNotification('info', `已汇编 ${sceneMap.get(sceneId)?.name ?? sceneId}`);
    } catch (e) {
      addNotification('error', (e as Error).message);
    } finally {
      setCompiling(false);
    }
  };

  const handleCompileAllStale = async () => {
    if (staleScenes.length === 0) {
      addNotification('info', '无待汇编场景');
      return;
    }
    if (!getAIGCApiKey()?.trim()) {
      addNotification('error', '未配置 AIGC API Key，无法汇编');
      return;
    }
    let story = parsedStory ?? (await loadStoryFromGame(gameId));
    if (!story) {
      addNotification('error', '无法读取 story.tw');
      return;
    }
    setCompiling(true);
    let nextFw = fw;
    const failures: string[] = [];
    try {
      for (let i = 0; i < staleScenes.length; i++) {
        const s = staleScenes[i]!;
        const chi = fw.chapters.findIndex((c) => c.title === s.chapterTitle || c.id === s.chapterTitle);
        if (chi < 0) continue;
        setCompileProgress({current: i + 1, total: staleScenes.length, scene: s.sceneName});
        try {
          const result = await compileChapterScene(nextFw, story, chi, s.sceneId, gameId);
          nextFw = result.fw;
          story = result.story;
        } catch (e) {
          failures.push(`${s.sceneName}（${(e as Error).message}）`);
        }
      }
      updateFw(() => nextFw);
      await saveStoryTw(gameId, story);
      await saveFm();
      setParsedStory(story);
      if (failures.length) {
        addNotification('error', `汇编完成，${failures.length} 个失败：${failures.slice(0, 3).join('；')}`);
      } else {
        addNotification('info', `已汇编 ${staleScenes.length} 个待更新场景`);
      }
    } finally {
      setCompiling(false);
      setCompileProgress(null);
    }
  };

  const handleSyncRouting = async () => {
    if (routingStale.length === 0) {
      addNotification('info', '路由已与框架一致');
      return;
    }
    setSyncing(true);
    try {
      const result = await syncRoutingLinksForGame(
        gameId,
        fw,
        routingStale.map((s) => s.sceneId)
      );
      updateFw(() => result.fw);
      await saveFm();
      setParsedStory(result.story);
      addNotification('info', `已同步 ${result.syncedCount} 个场景链接`);
    } catch (e) {
      addNotification('error', (e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const updateChapter = (chi: number, fn: (c: FrameworkChapter) => FrameworkChapter) => {
    updateFw((d) => ({
      ...d,
      chapters: d.chapters.map((c, i) => (i === chi ? fn(c) : c)),
    }));
  };

  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={{margin: 0, fontSize: 20}}>章节</h1>
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
          <button
            type="button"
            style={{...styles.btn, display: 'inline-flex', alignItems: 'center', gap: 4}}
            title={staleScenes.length > 0 ? COMPILE_STALE_HINT : '全部场景汇编已是最新'}
            onClick={() => checkAuthForSave(() => void handleCompileAllStale())}
            disabled={compiling || staleScenes.length === 0}
          >
            {compiling ? (
              '汇编中…'
            ) : staleScenes.length > 0 ? (
              <>
                <CompileHammerIcon style={styles.compileIconStale} />
                <span style={styles.compileIconFresh}>汇编(</span>
                <span style={styles.compileIconStale}>待更新{staleScenes.length}</span>
                <span style={styles.compileIconFresh}>)</span>
              </>
            ) : (
              <>
                <CompileHammerIcon style={styles.compileIconFresh} />
                <span style={styles.compileIconFresh}>汇编</span>
              </>
            )}
          </button>
          <button type="button" style={styles.btn} onClick={() => void handleSyncRouting()} disabled={syncing}>
            {syncing ? '同步中…' : `同步路由${routingStale.length ? ` (${routingStale.length})` : ''}`}
          </button>
          <button type="button" style={styles.btn} onClick={() => void handleSave()}>
            保存
          </button>
          <button
            type="button"
            style={styles.btn}
            onClick={() =>
              updateFw((d) => ({
                ...d,
                chapters: [
                  ...d.chapters,
                  {
                    id: `ch_${d.chapters.length}`,
                    title: `章节 ${d.chapters.length + 1}`,
                    availableSceneIds: [],
                    narrativeEdges: [],
                    transitions: [],
                  },
                ],
              }))
            }
          >
            + 章节
          </button>
        </div>
      </div>

      {!validation.valid && (
        <div style={{color: '#e74c3c', fontSize: 13, marginBottom: 12}}>
          {validation.errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      {compileProgress && (
        <p style={{fontSize: 13, color: '#90caf9', marginBottom: 8}}>
          汇编进度：{compileProgress.current}/{compileProgress.total}
          {compileProgress.scene ? ` · ${compileProgress.scene}` : ''}
        </p>
      )}

      <p style={styles.hint}>
        叙事态：在叙事图中拖拽节点、拖线连边，选中边可编辑属性。开放世界态：场景 + 地图一步连通（见各场景 mapNodeId）。
        双击节点可跳转「场景」页。汇编将 passageBlocks 写入 story.tw。
      </p>

      {fw.chapters.map((ch, chi) => {
        const open = expanded.has(ch.id);
        const pool = getChapterAvailableSceneIds(ch);
        return (
          <div key={ch.id} style={styles.card}>
            <div
              style={styles.cardHead}
              onClick={() =>
                setExpanded((s) => {
                  const n = new Set(s);
                  if (n.has(ch.id)) n.delete(ch.id);
                  else n.add(ch.id);
                  return n;
                })
              }
            >
              <span>
                {open ? '▼' : '▶'} {ch.title} <span style={{color: '#888'}}>({ch.id})</span>
              </span>
              <button
                type="button"
                style={{...styles.btn, padding: '2px 8px'}}
                onClick={(e) => {
                  e.stopPropagation();
                  updateFw((d) => ({...d, chapters: d.chapters.filter((_, i) => i !== chi)}));
                }}
              >
                删除
              </button>
            </div>
            {open && (
              <div style={styles.cardBody}>
                <div style={styles.row}>
                  <label style={styles.label}>标题</label>
                  <input
                    style={styles.input}
                    value={ch.title}
                    onChange={(e) => updateChapter(chi, (c) => ({...c, title: e.target.value}))}
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.label}>叙事入口 startSceneId</label>
                  <select
                    style={styles.input}
                    value={ch.startSceneId ?? ''}
                    onChange={(e) =>
                      updateChapter(chi, (c) => ({
                        ...c,
                        startSceneId: e.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">（未指定）</option>
                    {pool.map((id) => (
                      <option key={id} value={id}>
                        {sceneMap.get(id)?.name ?? id}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{marginBottom: 24}}>
                  <div style={styles.label}>叙事图</div>
                  <ChapterGraphCanvas
                    ch={ch}
                    pool={pool}
                    sceneMap={sceneMap}
                    onOpenScene={onOpenScene}
                    onUpdate={(patch) =>
                      updateChapter(chi, (c) => ({
                        ...c,
                        narrativeEdges: patch.narrativeEdges,
                        graphLayout: patch.graphLayout,
                      }))
                    }
                  />
                </div>

                <ChapterSceneList
                  chi={chi}
                  ch={ch}
                  pool={pool}
                  scenes={fw.scenes ?? []}
                  sceneMap={sceneMap}
                  staleByChapter={staleByChapter}
                  compiling={compiling}
                  updateChapter={updateChapter}
                  onCompileScene={(sid) => checkAuthForSave(() => void handleCompileScene(chi, sid))}
                />

                <TransitionsEditor
                  chi={chi}
                  ch={ch}
                  endScenes={inferChapterEndSceneIds(ch)}
                  chapters={fw.chapters}
                  sceneMap={sceneMap}
                  updateChapter={updateChapter}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChapterSceneList({
  chi,
  ch,
  pool,
  scenes,
  sceneMap,
  staleByChapter,
  compiling,
  updateChapter,
  onCompileScene,
}: {
  chi: number;
  ch: FrameworkChapter;
  pool: string[];
  scenes: import('../schema/game-scene').GameScene[];
  sceneMap: Map<string, import('../schema/game-scene').GameScene>;
  staleByChapter: Map<string, Set<string>>;
  compiling: boolean;
  updateChapter: (chi: number, fn: (c: FrameworkChapter) => FrameworkChapter) => void;
  onCompileScene: (sceneId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const available = scenes.filter((s) => !pool.includes(s.id));
  const [pickId, setPickId] = useState(() => available[0]?.id ?? '');

  const openPicker = () => {
    const nextAvailable = scenes.filter((s) => !pool.includes(s.id));
    setPickId(nextAvailable[0]?.id ?? '');
    setPickerOpen(true);
  };

  const confirmIntroduce = async () => {
    if (!pickId || pool.includes(pickId)) return;
    updateChapter(chi, (c) => ({
      ...c,
      availableSceneIds: [...getChapterAvailableSceneIds(c), pickId],
    }));
    setPickerOpen(false);
  };

  return (
    <div>
      <div style={styles.sectionHead}>
        <strong>场景</strong>
        <button
          type="button"
          style={styles.btn}
          onClick={openPicker}
          disabled={available.length === 0}
          title={available.length === 0 ? '所有场景已引入本章' : undefined}
        >
          引入
        </button>
      </div>
      {pool.length === 0 && (
        <p style={{color: '#888', fontSize: 12, margin: '0 0 8px'}}>暂无场景，点击「引入」将已有场景关联到本章。</p>
      )}
      <DetailEditModal
        title="引入场景"
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        editable
        onSave={confirmIntroduce}
      >
        <label style={styles.label}>选择场景</label>
        <select style={styles.input} value={pickId} onChange={(e) => setPickId(e.target.value)}>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </DetailEditModal>
      {pool.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>名称</th>
              <th style={styles.th}>是否开放世界</th>
              <th style={styles.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {pool.map((sid) => {
              const isStale = staleByChapter.get(ch.id)?.has(sid);
              const hasCompiled = !!getChapterSceneMeta(ch, sid)?.compiledFingerprint;
              return (
                <tr key={sid}>
                  <td style={styles.td}>{sceneMap.get(sid)?.name ?? sid}</td>
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={!isNarrativeGraph(ch, sid)}
                      onChange={(e) =>
                        updateChapter(chi, (c) => {
                          const next = {...(c.narrativeGraph ?? {})};
                          if (e.target.checked) delete next[sid];
                          else next[sid] = true;
                          return {
                            ...c,
                            narrativeGraph: Object.keys(next).length ? next : undefined,
                          };
                        })
                      }
                    />
                  </td>
                  <td style={styles.td}>
                    <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
                      <button
                        type="button"
                        style={{
                          ...styles.btnIcon,
                          display: 'flex',
                          alignItems: 'center',
                          ...(isStale ? styles.compileIconStale : styles.compileIconFresh),
                        }}
                        disabled={compiling}
                        onClick={() => onCompileScene(sid)}
                        title={
                          isStale
                            ? COMPILE_STALE_HINT
                            : hasCompiled
                              ? '汇编：将 passageBlocks 写入 story.tw'
                              : '汇编：首次将 passageBlocks 写入 story.tw'
                        }
                      >
                        <CompileHammerIcon />
                      </button>
                      <button
                        type="button"
                        style={styles.btnIcon}
                        title="移出"
                        onClick={() =>
                          updateChapter(chi, (c) => {
                            const nextGraph = Object.fromEntries(
                              Object.entries(c.narrativeGraph ?? {}).filter(([k]) => k !== sid)
                            );
                            const nextLayout = Object.fromEntries(
                              Object.entries(c.graphLayout ?? {}).filter(([k]) => k !== sid)
                            );
                            return {
                              ...c,
                              availableSceneIds: getChapterAvailableSceneIds(c).filter((x) => x !== sid),
                              narrativeEdges: (c.narrativeEdges ?? []).filter(
                                (e) => e.fromSceneId !== sid && e.toSceneId !== sid
                              ),
                              transitions: (c.transitions ?? []).filter((t) => t.fromSceneId !== sid),
                              graphLayout: Object.keys(nextLayout).length ? nextLayout : undefined,
                              narrativeGraph: Object.keys(nextGraph).length ? nextGraph : undefined,
                            };
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TransitionsEditor({
  chi,
  ch,
  endScenes,
  chapters,
  sceneMap,
  updateChapter,
}: {
  chi: number;
  ch: FrameworkChapter;
  endScenes: string[];
  chapters: FrameworkChapter[];
  sceneMap: Map<string, import('../schema/game-scene').GameScene>;
  updateChapter: (chi: number, fn: (c: FrameworkChapter) => FrameworkChapter) => void;
}) {
  const transitions = ch.transitions ?? [];
  const patch = (next: ChapterTransition[]) =>
    updateChapter(chi, (c) => ({...c, transitions: next}));

  return (
    <div style={{marginTop: 20}}>
      <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
        <strong>跨章过渡</strong>
        <button
          type="button"
          style={styles.btn}
          onClick={() =>
            patch([
              ...transitions,
              {
                fromSceneId: endScenes[0] ?? '',
                toChapterId: chapters[chi + 1]?.id ?? '',
                displayText: '下一章',
              },
            ])
          }
          disabled={endScenes.length === 0}
          title={endScenes.length === 0 ? '当前无章末场景，请检查叙事图' : undefined}
        >
          + 过渡
        </button>
      </div>
      <p style={{fontSize: 12, color: '#888', margin: '0 0 8px'}}>
        起跳场景为程序根据叙事图推断的章末场景
        {endScenes.length > 0
          ? `（${endScenes.map((id) => sceneMap.get(id)?.name ?? id).join('、')}）`
          : '（当前无）'}
        ；落地场景由目标章「叙事入口」决定。
      </p>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>起跳场景</th>
            <th style={styles.th}>目标章</th>
            <th style={styles.th}>文案</th>
            <th style={styles.th}>操作</th>
          </tr>
        </thead>
        <tbody>
          {transitions.map((tr, ti) => (
              <tr key={`${tr.fromSceneId}-${tr.toChapterId}-${ti}`}>
                <td style={styles.td}>
                  <select
                    style={styles.input}
                    value={tr.fromSceneId}
                    onChange={(e) =>
                      patch(transitions.map((x, i) => (i === ti ? {...x, fromSceneId: e.target.value} : x)))
                    }
                  >
                    {endScenes.map((id) => (
                      <option key={id} value={id}>
                        {sceneMap.get(id)?.name ?? id}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={styles.td}>
                  <select
                    style={styles.input}
                    value={tr.toChapterId}
                    onChange={(e) =>
                      patch(transitions.map((x, i) => (i === ti ? {...x, toChapterId: e.target.value} : x)))
                    }
                  >
                    {chapters
                      .filter((c) => c.id !== ch.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                  </select>
                </td>
                <td style={styles.td}>
                  <input
                    style={styles.input}
                    value={tr.displayText}
                    onChange={(e) =>
                      patch(transitions.map((x, i) => (i === ti ? {...x, displayText: e.target.value} : x)))
                    }
                  />
                </td>
                <td style={styles.td}>
                  <button
                    type="button"
                    style={styles.btnIcon}
                    title="删除"
                    onClick={() => patch(transitions.filter((_, i) => i !== ti))}
                  >
                    ×
                  </button>
                </td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function loadStoryFmForChapters(gameId: string): Promise<StoryFramework> {
  const res = await fetch(getStoryFmFetchUrl(gameId));
  if (!res.ok) throw new Error(`加载 story-fm 失败: ${res.status}`);
  const parsed = (await res.json()) as Record<string, unknown>;
  migrateFramework(parsed as unknown as StoryFramework);
  return fromPersistedFramework(parsed);
}
