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
import {getScenesFetchUrl, getStoryFmFetchUrl} from '@/config';
import {preloadFrameworkListData} from '../services/framework-list-data';
import {fromPersistedFramework, migrateFramework, toPersistedFramework} from '../schema/story-framework';
import {formatJsonCompact} from '../utils/json-format';
import {
  loadStoryFromGame,
  lookupKeysForSceneEntry,
  persistFrameworkRoutingToStory,
  saveStoryTw,
} from '../services/scene-routing-sync-service';
import {parseTwee} from '@/engine';
import {getAIGCApiKey} from '@/config';
import {useAuth} from '../context/AuthContext';
import {ChapterGraphCanvas} from './ChapterGraphCanvas';
import {DetailEditModal} from './ui/DetailEditModal';
import {compileChapterScene} from '../services/chapter-scene-compile';
import {saveScenePassageManualEdit} from '../services/scene-passage-edit';
import {collectStaleCompiledScenes} from '../utils/chapter-compile-helpers';
import {
  collectManuallyEditedPassageTargets,
  compileOverwriteConfirmMessage,
  readScenePassageFullText,
} from '../utils/compiled-text-fingerprint';
import {getChapterSceneMeta} from '../utils/chapter-scene';
import {passageBlocksToEditSegments, type PassageBlockSegment} from '../utils/passage-block-segments';
import {semanticColors} from '../theme/semantic-colors';
import {listBtnIcon, listGrids, listStyles} from '../styles/listStyles';
import {
  ListAddButton,
  ListDeleteButton,
  ListOpsCell,
  ListSectionHead,
  ListTableHeader,
  ListTableRow,
} from './ui/ListPrimitives';

const COMPILE_STALE_HINT = '正文待汇编：场景 passageBlocks 已变更，尚未写入 story.tw';

function EditPassageIcon({style, size = 18}: {style?: React.CSSProperties; size?: number}) {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CompileHammerIcon({
  style,
  size = 18,
  stale = false,
}: {
  style?: React.CSSProperties;
  size?: number;
  stale?: boolean;
}) {
  const icon = (
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
      <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9" />
      <path d="m18 15 4-4" />
      <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756l-.455.453" />
    </svg>
  );
  if (!stale) return icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
        borderRadius: 4,
        backgroundColor: semanticColors.warning.bg,
      }}
    >
      {icon}
    </span>
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
  sectionTitle: {
    display: 'block',
    fontSize: 14,
    fontWeight: 600,
    color: '#d1d5db',
    marginBottom: 8,
  },
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
  hint: {fontSize: 12, color: '#888', marginBottom: 12},
  compileIconFresh: {color: '#e8e8e8'},
  compileIconStale: {color: semanticColors.warning.fg},
  textarea: {
    minHeight: 320,
    whiteSpace: 'pre-wrap',
    lineHeight: 1.55,
    fontFamily: 'inherit',
    resize: 'vertical',
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
  const [compiling, setCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState<{current: number; total: number; scene?: string} | null>(null);
  const [passageEdit, setPassageEdit] = useState<{
    chapterIndex: number;
    sceneId: string;
    segments: PassageBlockSegment[];
  } | null>(null);

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

  const saveFm = async (data: StoryFramework = fw) => {
    const res = await fetch(getStoryFmFetchUrl(gameId), {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: formatJsonCompact(toPersistedFramework(data)),
    });
    const body = (await res.json()) as {ok?: boolean; error?: string};
    if (!res.ok || !body.ok) throw new Error(body.error || '保存失败');
  };

  const confirmCompileOverwrite = (
    story: NonNullable<typeof parsedStory>,
    targets: Array<{chapterIndex: number; sceneId: string}>
  ): boolean => {
    const edited = collectManuallyEditedPassageTargets(fw, story, targets, lookupKeys);
    if (edited.length === 0) return true;
    return window.confirm(compileOverwriteConfirmMessage(edited.map((e) => e.sceneName)));
  };

  const handleSave = async () => {
    try {
      const story = parsedStory ?? (await loadStoryFromGame(gameId));
      if (!story) {
        await saveFm();
        addNotification('info', '章节已保存（无 story.tw，跳过路由同步）');
        return;
      }
      const syncResult = await persistFrameworkRoutingToStory(gameId, fw, {story});
      updateFw(() => syncResult.fw);
      await saveFm(syncResult.fw);
      setParsedStory(syncResult.story);
      const skippedHint =
        syncResult.skippedCount > 0 ? `（${syncResult.skippedCount} 个场景尚无 passage，已跳过）` : '';
      addNotification(
        'info',
        syncResult.syncedCount > 0
          ? `章节已保存；已同步 ${syncResult.syncedCount} 个场景的路由链接${skippedHint}`
          : `章节已保存${skippedHint || '；story.tw 路由已是最新'}`
      );
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
    if (!confirmCompileOverwrite(story, [{chapterIndex, sceneId}])) return;
    setCompiling(true);
    try {
      const result = await compileChapterScene(fw, story, chapterIndex, sceneId, gameId);
      updateFw(() => result.fw);
      await saveStoryTw(gameId, result.story);
      await saveFm(result.fw);
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
    const batchTargets = staleScenes.flatMap((s) => {
      const chi = fw.chapters.findIndex((c) => c.title === s.chapterTitle || c.id === s.chapterTitle);
      return chi < 0 ? [] : [{chapterIndex: chi, sceneId: s.sceneId}];
    });
    if (!confirmCompileOverwrite(story, batchTargets)) return;
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
      await saveFm(nextFw);
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

  const updateChapter = (chi: number, fn: (c: FrameworkChapter) => FrameworkChapter) => {
    updateFw((d) => ({
      ...d,
      chapters: d.chapters.map((c, i) => (i === chi ? fn(c) : c)),
    }));
  };

  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));

  const canEditScenePassage = (chapterIndex: number, sceneId: string): boolean => {
    const ch = fw.chapters[chapterIndex];
    if (!ch) return false;
    if (getChapterSceneMeta(ch, sceneId)?.compiledTextFingerprint) return true;
    if (!parsedStory) return false;
    return !!readScenePassageFullText(
      parsedStory,
      sceneId,
      chapterIndex,
      lookupKeys(chapterIndex, sceneId)
    ).trim();
  };

  const openPassageEdit = async (chapterIndex: number, sceneId: string) => {
    const story = parsedStory ?? (await loadStoryFromGame(gameId));
    if (!story) {
      addNotification('error', '无法读取 story.tw');
      return;
    }
    const scene = sceneMap.get(sceneId);
    if (!scene) {
      addNotification('error', `未找到场景 ${sceneId}`);
      return;
    }
    const fullText = readScenePassageFullText(
      story,
      sceneId,
      chapterIndex,
      lookupKeys(chapterIndex, sceneId)
    );
    setPassageEdit({
      chapterIndex,
      sceneId,
      segments: passageBlocksToEditSegments(fullText, scene),
    });
  };

  const handleSavePassageEdit = async () => {
    if (!passageEdit) return;
    const story = parsedStory ?? (await loadStoryFromGame(gameId));
    if (!story) {
      addNotification('error', '无法读取 story.tw');
      return;
    }
    try {
      const result = saveScenePassageManualEdit(
        fw,
        story,
        passageEdit.chapterIndex,
        passageEdit.sceneId,
        passageEdit.segments
      );
      updateFw(() => result.fw);
      await saveStoryTw(gameId, result.story);
      await saveFm(result.fw);
      if (result.fw.scenes?.length) {
        const scenesRes = await fetch(getScenesFetchUrl(gameId), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: formatJsonCompact(result.fw.scenes),
        });
        const scenesBody = (await scenesRes.json()) as {ok?: boolean; error?: string};
        if (!scenesRes.ok || !scenesBody.ok) {
          throw new Error(scenesBody.error || '保存 story-scenes.json 失败');
        }
      }
      setParsedStory(result.story);
      setPassageEdit(null);
      addNotification('info', `已保存 ${sceneMap.get(passageEdit.sceneId)?.name ?? passageEdit.sceneId} 正文`);
    } catch (e) {
      addNotification('error', (e as Error).message);
    }
  };

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
                <CompileHammerIcon style={styles.compileIconStale} stale />
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
          <button type="button" style={styles.btn} onClick={() => checkAuthForSave(() => void handleSave())}>
            保存
          </button>
          <ListAddButton
            title="添加章节"
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
          />
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
        双击节点可跳转「场景」页。保存会将叙事图、跨章过渡、叙事入口等路由写入 story.tw；汇编将 passageBlocks 写入 story.tw；铅笔图标可编辑 story.tw 成稿。
      </p>

      {passageEdit && (
        <DetailEditModal
          title={`编辑正文 · ${sceneMap.get(passageEdit.sceneId)?.name ?? passageEdit.sceneId}`}
          open
          onClose={() => setPassageEdit(null)}
          editable
          onSave={() => checkAuthForSave(() => void handleSavePassageEdit())}
        >
          <p style={{fontSize: 12, color: '#888', margin: '0 0 8px'}}>
            按 passageBlocks 分段展示：RAW 为史料/定调，AI 为生成正文。保存后将按配置重新分页写入 story.tw。
          </p>
          {passageEdit.segments.map((seg, segIndex) => (
            <div key={`${seg.blockIndex}-${seg.type}-${segIndex}`} style={{marginBottom: 12}}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 4,
                  color: seg.type === 'raw' ? '#d4a574' : '#90caf9',
                }}
              >
                {seg.label}
              </label>
              <textarea
                style={{
                  ...styles.input,
                  ...styles.textarea,
                  ...(seg.type === 'raw'
                    ? {borderLeft: '3px solid #d4a574', backgroundColor: 'rgba(212, 165, 116, 0.06)'}
                    : {borderLeft: '3px solid #90caf9', backgroundColor: 'rgba(144, 202, 249, 0.06)'}),
                }}
                value={seg.text}
                onChange={(e) =>
                  setPassageEdit((prev) =>
                    prev
                      ? {
                          ...prev,
                          segments: prev.segments.map((s, i) =>
                            i === segIndex ? {...s, text: e.target.value} : s
                          ),
                        }
                      : prev
                  )
                }
                rows={seg.type === 'raw' ? 5 : 8}
              />
            </div>
          ))}
        </DetailEditModal>
      )}

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
                {open ? '▼' : '▶'} {ch.title}
              </span>
              <ListDeleteButton
                stopPropagation
                confirmMessage={`确认删除章节「${ch.title}」？`}
                onClick={() => updateFw((d) => ({...d, chapters: d.chapters.filter((_, i) => i !== chi)}))}
              />
            </div>
            {open && (
              <div style={styles.cardBody}>
                <div style={styles.row}>
                  <label style={styles.sectionTitle}>标题</label>
                  <input
                    style={styles.input}
                    value={ch.title}
                    onChange={(e) => updateChapter(chi, (c) => ({...c, title: e.target.value}))}
                  />
                </div>
                <div style={styles.row}>
                  <label style={styles.sectionTitle}>
                    叙事入口{chi === 0 ? '（游戏起始场景）' : ''}
                  </label>
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
                  {chi === 0 && ch.startSceneId ? (
                    <p style={{fontSize: 12, color: '#888', margin: '4px 0 0'}}>
                      「游戏」页首屏由第一章叙事入口决定；保存章节后会写入 story.tw 的 start。
                    </p>
                  ) : null}
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
                  canEditPassage={(sid) => canEditScenePassage(chi, sid)}
                  onCompileScene={(sid) => checkAuthForSave(() => void handleCompileScene(chi, sid))}
                  onEditPassage={(sid) => checkAuthForSave(() => void openPassageEdit(chi, sid))}
                />

                <div style={{marginBottom: 24}}>
                  <div style={styles.sectionTitle}>叙事图</div>
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
  canEditPassage,
  onCompileScene,
  onEditPassage,
}: {
  chi: number;
  ch: FrameworkChapter;
  pool: string[];
  scenes: import('../schema/game-scene').GameScene[];
  sceneMap: Map<string, import('../schema/game-scene').GameScene>;
  staleByChapter: Map<string, Set<string>>;
  compiling: boolean;
  updateChapter: (chi: number, fn: (c: FrameworkChapter) => FrameworkChapter) => void;
  canEditPassage: (sceneId: string) => boolean;
  onCompileScene: (sceneId: string) => void;
  onEditPassage: (sceneId: string) => void;
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
    <div style={{marginBottom: 24}}>
      <ListSectionHead
        title={<span style={{...styles.sectionTitle, marginBottom: 0}}>场景</span>}
        addTitle={available.length === 0 ? '所有场景已引入本章' : '引入场景'}
        onAdd={openPicker}
        addDisabled={available.length === 0}
      />
      {pool.length === 0 && (
        <p style={{color: '#888', fontSize: 12, margin: '0 0 8px'}}>暂无场景，点击 + 将已有场景关联到本章。</p>
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
        <div>
          <ListTableHeader grid={listGrids.scenePool}>
            <span>名称</span>
            <span>是否开放世界</span>
            <span style={listStyles.cellOps}>操作</span>
          </ListTableHeader>
          {pool.map((sid) => {
            const isStale = staleByChapter.get(ch.id)?.has(sid);
            const hasCompiled = !!getChapterSceneMeta(ch, sid)?.compiledFingerprint;
            return (
              <ListTableRow key={sid} grid={listGrids.scenePool}>
                <span>{sceneMap.get(sid)?.name ?? sid}</span>
                <span>
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
                </span>
                <ListOpsCell>
                  <button
                    type="button"
                    style={{
                      ...listBtnIcon,
                      display: 'flex',
                      alignItems: 'center',
                      ...(isStale ? {padding: '4px 8px'} : {}),
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
                    <CompileHammerIcon
                      stale={!!isStale}
                      style={isStale ? styles.compileIconStale : styles.compileIconFresh}
                    />
                  </button>
                  <button
                    type="button"
                    style={{...listBtnIcon, display: 'flex', alignItems: 'center'}}
                    disabled={compiling || !canEditPassage(sid)}
                    onClick={() => onEditPassage(sid)}
                    title={
                      canEditPassage(sid)
                        ? '编辑 story.tw 成稿正文'
                        : '请先汇编，或确保 story.tw 中已有该场景正文'
                    }
                  >
                    <EditPassageIcon style={styles.compileIconFresh} />
                  </button>
                  <ListDeleteButton
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
                  />
                </ListOpsCell>
              </ListTableRow>
            );
          })}
        </div>
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
      <ListSectionHead
        title={<span style={{...styles.sectionTitle, marginBottom: 0}}>跨章过渡</span>}
        addTitle={endScenes.length === 0 ? '当前无章末场景，请检查叙事图' : '添加过渡'}
        addDisabled={endScenes.length === 0}
        onAdd={() =>
          patch([
            ...transitions,
            {
              fromSceneId: endScenes[0] ?? '',
              toChapterId: chapters[chi + 1]?.id ?? '',
              displayText: '下一章',
            },
          ])
        }
      />
      <p style={{fontSize: 12, color: '#888', margin: '0 0 8px'}}>
        起跳场景为程序根据叙事图推断的章末场景
        {endScenes.length > 0
          ? `（${endScenes.map((id) => sceneMap.get(id)?.name ?? id).join('、')}）`
          : '（当前无）'}
        ；落地场景由目标章「叙事入口」决定。
      </p>
      <div>
        <ListTableHeader grid={listGrids.transition}>
          <span>起跳场景</span>
          <span>目标章</span>
          <span>文案</span>
          <span style={listStyles.cellOps}>操作</span>
        </ListTableHeader>
        {transitions.map((tr, ti) => (
          <ListTableRow key={`${tr.fromSceneId}-${tr.toChapterId}-${ti}`} grid={listGrids.transition}>
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
            <input
              style={styles.input}
              value={tr.displayText}
              onChange={(e) =>
                patch(transitions.map((x, i) => (i === ti ? {...x, displayText: e.target.value} : x)))
              }
            />
            <ListOpsCell>
              <ListDeleteButton onClick={() => patch(transitions.filter((_, i) => i !== ti))} />
            </ListOpsCell>
          </ListTableRow>
        ))}
      </div>
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
