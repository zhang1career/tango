/**
 * 剧情界面（原时间线）
 */

import React, {useCallback, useEffect, useState} from 'react';
import JSZip from 'jszip';
import type {StoryFramework} from '../schema/story-framework';
import {flattenSceneEntries, fromPersistedFramework, migrateFramework, toPersistedFramework, toPassageId, validateFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {GameCharacter} from '../schema/game-character';
import type {GameBehavior} from '../schema/game-behavior';
import type {GameMap} from '../schema/game-map';
import type {GameEvent} from '../schema/game-event';
import type {GameItem} from '../schema/game-item';
import type {GameMetadata} from '../schema/metadata';
import type {GameRule} from '../schema/game-rule';
import {parseStoryRulesFile, serializeStoryRulesBundle} from '../utils/parse-story-rules';
import {
  collectChangedSceneTargets,
  collectSceneFingerprintMap,
  type SceneCompileTarget,
} from '../utils/chapter-compile-helpers';
import {compileChapterScene, sceneContextSummary} from '../services/chapter-scene-compile';
import {getChapterAvailableSceneIds} from '../utils/chapter-scene';
import {getIncomingNarrativeEdges} from '../utils/scene-passage-links';
import {getAIGCApiKey, getCharactersFetchUrl, getScenesFetchUrl, getMapsFetchUrl, getEventsFetchUrl, getItemsFetchUrl, getMetadataFetchUrl, getRulesFetchUrl, getFeaturesFetchUrl, getStoryFmFetchUrl, getGameContentUrl, getPassagePageCharsMin, getPassagePageCharsMax} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useNotification} from '@/context/NotificationContext';
import {useAuth} from '@/context/AuthContext';
import {frameworkToStory, parseTwee, syncStoryTitleFromFramework} from '@/engine';

import {EDIT_MODAL_MAX_WIDTH} from '../styles/editorStyles';
import {modalTitleStyle, pageTitleStyle} from '@/styles/appTheme';
import {formatJsonCompact} from '../utils/json-format';
import {
  applyScenePassageFullText,
  collectSceneFullText,
} from '../utils/scene-passage-text';
import {getAiBlocks, getScenePassageBlocks} from '../utils/passage-blocks';
import {resolveSceneBackgroundMusic, resolvedSceneImagesArray} from '../utils/scene-media';
import {normalizeFeaturesConfig} from '../utils/normalize-features';
import {runAssembleScene} from '@/services/scene-block-generation';
import {loadFrameworkWithListData, preloadFrameworkListData} from '../services/framework-list-data';
import {
  lookupKeysForSceneEntry,
  saveStoryTw,
} from '@/services/scene-routing-sync-service';
import {
  collectRoutingStaleScenes,
  patchRoutingFingerprints,
  syncPassageLinksInStory,
} from '../utils/scene-routing-sync';
import {NarrativeTruthEditors} from './NarrativeTruthEditors';
import {SaveIcon} from './ui/SaveIcon';
import {editorStyles} from '../styles/editorStyles';

type FrameworkTab = 'meta' | 'foreshadowing' | 'canon';

type ImportZipFile = {path: string; contentBase64: string};
type ImportPendingData = {
  sourceGameId: string;
  files: ImportZipFile[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function normalizeZipPath(input: string): string {
  const unified = input.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = unified.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === '.' || p === '..')) throw new Error(`非法路径: ${input}`);
  return parts.join('/');
}

function isValidGameId(v: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(v);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function parseZipImport(file: File): Promise<ImportPendingData> {
  const zip = await JSZip.loadAsync(file);
  const entries: Array<{entry: JSZip.JSZipObject; path: string}> = [];
  for (const [rawPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    entries.push({entry, path: normalizeZipPath(rawPath)});
  }
  if (entries.length === 0) throw new Error('压缩包中没有可导入文件');
  const normalizedEntries: Array<{entry: JSZip.JSZipObject; relativePath: string}> = [];
  const topLevelDirs = new Set<string>();
  for (const item of entries) {
    const parts = item.path.split('/');
    if (parts.length < 2) {
      throw new Error(`压缩包必须使用 <gameId>/... 结构，缺少游戏目录: ${item.path}`);
    }
    const gid = parts[0];
    const relativePath = parts.slice(1).join('/');
    if (!relativePath) throw new Error(`非法路径: ${item.path}`);
    topLevelDirs.add(gid);
    normalizedEntries.push({entry: item.entry, relativePath});
  }
  if (topLevelDirs.size !== 1) {
    throw new Error(`压缩包必须且仅能包含一个顶层游戏目录，当前为: ${Array.from(topLevelDirs).join(', ')}`);
  }
  const sourceGameId = Array.from(topLevelDirs)[0];

  const files: ImportZipFile[] = [];
  for (const item of normalizedEntries) {
    const bytes = await item.entry.async('uint8array');
    files.push({path: item.relativePath, contentBase64: bytesToBase64(bytes)});
  }
  return {sourceGameId, files};
}

/**
 * 从当前场景构建 passage 的权威元数据（与 characterIds 逻辑一致：始终以场景当前值为准，删除则覆盖掉旧值）
 * openingAnimation、images、backgroundMusic、characterIds、counterpartCharacterIds、characterOverrides 等由场景决定的字段，空时设为 undefined 以移除
 */
function sceneAuthoritativeMetadata(scene: GameScene, fw: StoryFramework): Record<string, unknown> {
  const m: Record<string, unknown> = { sceneId: scene.id };
  const ids = scene.characterIds?.filter((id) => id !== fw.playerCharacterId);
  m.characterIds = ids?.length ? ids : undefined;
  const counterpartIds = scene.counterpartCharacterIds?.filter(Boolean);
  m.counterpartCharacterIds = counterpartIds?.length ? counterpartIds : undefined;
  m.characterOverrides = scene.characterOverrides && Object.keys(scene.characterOverrides).length
    ? scene.characterOverrides
    : undefined;
  m.openingAnimation = scene.openingAnimation || undefined;
  const resolvedImages = resolvedSceneImagesArray(scene, fw.features);
  m.images = resolvedImages;
  const resolvedBgm = resolveSceneBackgroundMusic(scene, fw.features);
  m.backgroundMusic = resolvedBgm;
  m.synthesizedBgm = scene.synthesizedBgm || undefined;
  return m;
}

const headerIconBtn: React.CSSProperties = {
  ...editorStyles.btnIcon,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 6,
  borderRadius: 6,
};

async function saveFrameworkToStorage(gameId: string, fw: StoryFramework): Promise<void> {
  const res = await fetch(getStoryFmFetchUrl(gameId), {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: formatJsonCompact(toPersistedFramework(fw)),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error || `保存剧情框架失败: ${res.status}`);
}

/** 若 story.tw 标题与 story-fm 不一致，则仅同步 StoryTitle 并写回 */
async function persistStoryTitleToTw(gameId: string, fw: StoryFramework): Promise<void> {
  const title = fw.title?.trim();
  if (!title) return;
  const res = await fetch(getGameContentUrl(gameId));
  if (!res.ok) return;
  const story = parseTwee(await res.text());
  if (story.title.trim() === title) return;
  syncStoryTitleFromFramework(story, fw);
  await saveStoryTw(gameId, story);
}

async function saveRulesToPreset(fw: StoryFramework, gameId: string): Promise<{ ok: boolean; error?: string }> {
  const payload = serializeStoryRulesBundle({
    rules: fw.gameRules ?? [],
    sceneBindings: fw.sceneBindings ?? [],
  });
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getRulesFetchUrl(gameId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(payload)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-rules.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
}

export function FrameworkEditor({
                                  fw,
                                  updateFw,
                                }: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const {gameId, setGameId, refetchGameIds} = useGameId();
  const {addNotification} = useNotification();
  const {checkAuthForSave} = useAuth();
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [expandedCh, setExpandedCh] = useState<Set<string>>(new Set());
  const [expandedScene, setExpandedScene] = useState<Set<string>>(new Set());
  const [newGameModalOpen, setNewGameModalOpen] = useState(false);
  const [newGameIdInput, setNewGameIdInput] = useState('');
  const [newGameError, setNewGameError] = useState<string | null>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importPendingData, setImportPendingData] = useState<ImportPendingData | null>(null);
  const [importGameIdInput, setImportGameIdInput] = useState('');
  const [importGameIdError, setImportGameIdError] = useState<string | null>(null);
  const [importActionError, setImportActionError] = useState<string | null>(null);
  const [importCompileEnabled, setImportCompileEnabled] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [compileProgress, setCompileProgress] = useState<{ current: number; total: number; scene?: string } | null>(null);
  const importFileInputRef = React.useRef<HTMLInputElement>(null);
  const apiKey = getAIGCApiKey();
  const [generatingSceneKey, setGeneratingSceneKey] = useState<string | null>(null);
  const [editingSceneText, setEditingSceneText] = useState<Record<string, string>>({});
  const editingSceneTextRef = React.useRef(editingSceneText);
  editingSceneTextRef.current = editingSceneText;
  const [loadingSceneTextKey, setLoadingSceneTextKey] = useState<string | null>(null);
  const [savingSceneTextKey, setSavingSceneTextKey] = useState<string | null>(null);
  const [frameworkTab, setFrameworkTab] = useState<FrameworkTab>('meta');
  const [savingFramework, setSavingFramework] = useState(false);

  useEffect(() => {
    preloadFrameworkListData(updateFw, gameId);
  }, [updateFw, gameId]);

  const updateFwWithErrorReset = useCallback(
    (fn: (d: StoryFramework) => StoryFramework) => {
      updateFw(fn);
      setJsonError(null);
    },
    [updateFw]
  );

  const toggleCh = (id: string) => {
    setExpandedCh((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sceneMap = new Map<string, GameScene>();
  for (const s of fw.scenes ?? []) sceneMap.set(s.id, s);
  const characterIds = (fw.characters ?? []).map((c) => ({id: c.id, name: c.name}));
  const gameRules = fw.gameRules ?? [];
  const {valid, errors} = validateFramework(fw);
  const handleNew = useCallback(() => {
    setNewGameModalOpen(true);
    setNewGameIdInput('');
    setNewGameError(null);
  }, []);

  const handleNewGameSave = useCallback(async () => {
    const id = newGameIdInput.trim();
    if (!id) {
      setNewGameError('请输入游戏ID');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      setNewGameError('游戏ID只能包含字母、数字、下划线、横线');
      return;
    }
    setNewGameError(null);
    try {
      const res = await fetch('/api/games/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: id }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setNewGameError(data.error || '创建失败');
        return;
      }
      setGameId(id);
      await refetchGameIds();
      setNewGameModalOpen(false);
    } catch (e) {
      setNewGameError((e as Error).message || '创建失败');
    }
  }, [newGameIdInput, setGameId, refetchGameIds]);

  const handleNewGameCancel = useCallback(() => {
    setNewGameModalOpen(false);
    setNewGameIdInput('');
    setNewGameError(null);
  }, []);

  const updateRule = useCallback((ruleId: string, fn: (r: GameRule) => GameRule) => {
    updateFwWithErrorReset((d) => ({
      ...d,
      gameRules: (d.gameRules ?? []).map((r) => (r.id === ruleId ? fn(r) : r)),
    }));
  }, [updateFwWithErrorReset]);

  const saveRules = useCallback(async () => {
    const result = await saveRulesToPreset(fw, gameId);
    if (!result.ok) addNotification('error', `规则保存失败: ${result.error}`);
  }, [fw, gameId, addNotification]);

  const handleSave = useCallback(async () => {
    setSavingFramework(true);
    try {
      await saveFrameworkToStorage(gameId, fw);
      await persistStoryTitleToTw(gameId, fw);
      addNotification('info', '框架已保存');
      setJsonError(null);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setJsonError((e as Error).message);
    } finally {
      setSavingFramework(false);
    }
  }, [fw, gameId, addNotification]);

  const handleImportClick = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const pending = await parseZipImport(file);
        setImportPendingData(pending);
        setImportGameIdInput(pending.sourceGameId);
        setImportGameIdError(null);
        setImportActionError(null);
        setImportCompileEnabled(true);
        setCompileProgress(null);
        setImportConfirmOpen(true);
      } catch (err) {
        setJsonError((err as Error).message ?? '解析压缩包失败');
      }
    },
    []
  );

  const handleImportConfirm = useCallback(async () => {
    if (!importPendingData) return;
    const targetGameId = importGameIdInput.trim();
    if (!targetGameId) {
      setImportGameIdError('请输入游戏ID');
      return;
    }
    if (!isValidGameId(targetGameId)) {
      setImportGameIdError('游戏ID只能包含字母、数字、下划线、横线');
      return;
    }
    setImportGameIdError(null);
    setImportActionError(null);
    setIsImporting(true);
    setCompileProgress(null);
    try {
      if (!import.meta.env.DEV) {
        throw new Error('导入仅支持 `npm run dev`。当前看起来是预览/生产模式（`import.meta.env.DEV=false`）。');
      }
      let oldFingerprintMap = new Map<string, string>();
      if (importCompileEnabled) {
        const oldFw = await loadFrameworkWithListData(targetGameId);
        if (oldFw) oldFingerprintMap = collectSceneFingerprintMap(oldFw);
      }
      const res = await fetch('/api/games/import-zip', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact({
          gameId: targetGameId,
          files: importPendingData.files,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `导入失败: ${res.status}`);

      await refetchGameIds();
      setGameId(targetGameId);
      const loadedFw = await loadFrameworkWithListData(targetGameId);
      if (!loadedFw) throw new Error('导入成功，但未找到 story-fm.json');
      let nextFw: StoryFramework = loadedFw;
      const changedTargets = importCompileEnabled
        ? collectChangedSceneTargets(nextFw, oldFingerprintMap)
        : [];

      if (importCompileEnabled && changedTargets.length > 0) {
        const key = apiKey?.trim();
        if (!key) {
          setJsonError('导入完成，但未配置 AIGC API Key，变更场景尚未编译。');
          addNotification('error', `导入成功；待编译 ${changedTargets.length} 个变更场景`);
        } else {
          const contentRes = await fetch(getGameContentUrl(targetGameId));
          const raw = contentRes.ok ? await contentRes.text() : '';
          let story = parseTwee(raw);
          const failures: string[] = [];
          for (let i = 0; i < changedTargets.length; i++) {
            const t = changedTargets[i];
            const ch = nextFw.chapters[t.chapterIndex];
            const scene = nextFw.scenes?.find((s) => s.id === t.sceneId);
            const sceneLabel = `${ch.title || ch.id} / ${scene?.name ?? t.sceneId}`;
            setCompileProgress({current: i + 1, total: changedTargets.length, scene: sceneLabel});
            try {
              const result = await compileChapterScene(nextFw, story, t.chapterIndex, t.sceneId, targetGameId);
              nextFw = result.fw;
              story = result.story;
              await saveStoryTw(targetGameId, story);
              updateFw(() => nextFw);
            } catch (err) {
              failures.push(`${sceneLabel}（${(err as Error).message}）`);
            }
          }
          await saveFrameworkToStorage(targetGameId, nextFw);
          if (failures.length > 0) {
            setJsonError(`导入完成，编译失败 ${failures.length}/${changedTargets.length}：${failures.join('；')}`);
            addNotification('error', `导入成功；编译失败 ${failures.length}/${changedTargets.length}`);
          } else {
            setJsonError(null);
            addNotification('info', `导入成功；已编译 ${changedTargets.length} 个变更场景`);
          }
          try {
            const routingStale = collectRoutingStaleScenes(
              nextFw,
              story,
              (chi, sid) => lookupKeysForSceneEntry(nextFw, chi, sid)
            );
            if (routingStale.length > 0) {
              const routeSync = syncPassageLinksInStory(story, nextFw, {
                sceneIds: routingStale.map((s) => s.sceneId),
                lookupKeysForScene: (chi, sid) => lookupKeysForSceneEntry(nextFw, chi, sid),
              });
              nextFw = patchRoutingFingerprints(nextFw, routeSync.synced);
              await saveStoryTw(targetGameId, story);
              await saveFrameworkToStorage(targetGameId, nextFw);
              updateFw(() => nextFw);
            }
          } catch (routeErr) {
            addNotification('error', `导入后路由同步失败：${(routeErr as Error).message}`);
          }
        }
      } else {
        setJsonError(null);
        if (importCompileEnabled) addNotification('info', '导入成功；未检测到需要编译的变更场景');
        else addNotification('info', '导入成功');
      }

      updateFw(() => nextFw);
      await persistStoryTitleToTw(targetGameId, nextFw);
      setImportConfirmOpen(false);
      setImportPendingData(null);
      setImportCompileEnabled(true);
      setImportActionError(null);
      setCompileProgress(null);
    } catch (e) {
      const message = (e as Error).message;
      setJsonError(message);
      setImportActionError(message);
    } finally {
      setCompileProgress(null);
      setIsImporting(false);
    }
  }, [apiKey, importPendingData, importGameIdInput, importCompileEnabled, updateFw, addNotification, refetchGameIds, setGameId]);

  const handleImportCancel = useCallback(() => {
    if (isImporting) return;
    setImportConfirmOpen(false);
    setImportPendingData(null);
    setImportGameIdInput('');
    setImportGameIdError(null);
    setImportActionError(null);
    setImportCompileEnabled(true);
    setCompileProgress(null);
  }, [isImporting]);

  const handleExport = useCallback(async () => {
    try {
      const url = getStoryFmFetchUrl(gameId);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`导出失败: ${res.status}`);
      const json = await res.json();
      const text = typeof json === 'string' ? json : formatJsonCompact(json);
      const blob = new Blob([text], {type: 'application/json'});
      const filename = `story-fm.json`;
      if ('showSaveFilePicker' in window) {
        const handle = await (window as Window & { showSaveFilePicker?: (opts?: { suggestedName?: string }) => Promise<FileSystemFileHandle> }).showSaveFilePicker!({suggestedName: filename});
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      addNotification('info', '导出成功');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setJsonError((e as Error).message);
    }
  }, [gameId, addNotification]);

  return (
    <div style={styles.container}>
      {newGameModalOpen && (
        <div style={styles.modalOverlay as React.CSSProperties} onClick={handleNewGameCancel}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>新建游戏</h2>
            </div>
            <div style={styles.section}>
              <label style={styles.label}>游戏ID</label>
              <input
                type="text"
                value={newGameIdInput}
                onChange={(e) => setNewGameIdInput(e.target.value)}
                placeholder="仅限字母、数字、下划线、横线"
                style={styles.input}
                autoFocus
              />
              {newGameError && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#e57373' }}>{newGameError}</div>
              )}
            </div>
            <div style={styles.modalActions}>
              <button type="button" style={styles.btn} onClick={() => checkAuthForSave(handleNewGameSave)}>
                确定
              </button>
              <button type="button" style={styles.btn} onClick={handleNewGameCancel}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      <header style={styles.header}>
        <h1 style={styles.title}>剧情</h1>
        <div style={styles.actions}>
          <button type="button" style={styles.btn} onClick={handleNew}>
            新建
          </button>
          <button type="button" style={styles.btn} onClick={handleImportClick}>
            导入
          </button>
          <button type="button" style={styles.btn} onClick={handleExport}>
            导出
          </button>
        </div>
      </header>
      <input
        ref={importFileInputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        style={{display: 'none'}}
        onChange={handleImportFileChange}
      />
      {importConfirmOpen && (
        <div style={styles.modalOverlay as React.CSSProperties} onClick={handleImportCancel}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>确认导入</h2>
            </div>
            <p style={{margin: '0 0 16px', fontSize: 14, color: '#e8e8e8'}}>
              识别到压缩包顶层目录为 {importPendingData?.sourceGameId}。你可以修改导入目标游戏ID（保存目录名），导入时会重建目标目录（共 {importPendingData?.files.length ?? 0} 个文件）。项目级自定义媒体目录 assets/media_custom 不受导入影响。
            </p>
            <div style={styles.section}>
              <label style={styles.label}>目标游戏ID（保存目录名）</label>
              <input
                type="text"
                value={importGameIdInput}
                onChange={(e) => setImportGameIdInput(e.target.value)}
                placeholder="仅限字母、数字、下划线、横线"
                style={styles.input}
                autoFocus
              />
              {importGameIdError && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#e57373' }}>{importGameIdError}</div>
              )}
            </div>
            <div style={styles.row}>
              <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: isImporting ? 'not-allowed' : 'pointer'}}>
                <input
                  type="checkbox"
                  checked={importCompileEnabled}
                  disabled={isImporting}
                  onChange={(e) => setImportCompileEnabled(e.target.checked)}
                />
                <span style={{fontSize: 13, color: '#d0d0d0'}}>导入后编译（仅编译变更场景，生成 story.tw）</span>
              </label>
            </div>
            {compileProgress && (
              <div style={{marginTop: 4, fontSize: 13, color: '#90caf9'}}>
                编译进度：{compileProgress.current}/{compileProgress.total}
                {compileProgress.scene ? ` · ${compileProgress.scene}` : ''}
              </div>
            )}
            {importActionError && (
              <div style={{marginTop: 8, fontSize: 13, color: '#e57373'}}>
                {importActionError}
              </div>
            )}
            <div style={styles.modalActions}>
              <button type="button" style={styles.btn} onClick={() => checkAuthForSave(handleImportConfirm)} disabled={isImporting}>
                {isImporting ? '处理中...' : '确认'}
              </button>
              <button type="button" style={styles.btn} onClick={handleImportCancel} disabled={isImporting}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {(!valid || jsonError) && (
        <div style={styles.errors}>
          {errors.map((e, i) => (
            <div key={`v-${i}`} style={styles.errorItem}>{e}</div>
          ))}
          {jsonError && <div style={styles.errorItem}>{jsonError}</div>}
        </div>
      )}

      <div style={{display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap'}}>
        {(['meta', 'foreshadowing', 'canon'] as const).map((id) => (
          <button
            key={id}
            type="button"
            style={{
              padding: '6px 12px',
              backgroundColor: frameworkTab === id ? '#4a3a6a' : '#2d2d44',
              border: '1px solid #444',
              borderRadius: 6,
              color: '#e8e8e8',
              cursor: 'pointer',
              fontSize: 13,
            }}
            onClick={() => setFrameworkTab(id)}
          >
            {id === 'meta' ? '框架' : id === 'foreshadowing' ? '伏笔池' : 'Canon'}
          </button>
        ))}
      </div>

      {frameworkTab === 'foreshadowing' && (
        <NarrativeTruthEditors scenes={fw.scenes ?? []} fixedTab="foreshadowing" hideTabBar />
      )}
      {frameworkTab === 'canon' && (
        <NarrativeTruthEditors scenes={fw.scenes ?? []} fixedTab="canon" hideTabBar />
      )}

      {frameworkTab === 'meta' && (
        <>
      <div style={{display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end'}}>
        <button
          type="button"
          style={{...headerIconBtn, opacity: savingFramework ? 0.5 : 1}}
          title="保存框架（玩家角色、故事标题、背景设定、写作规则）"
          aria-label={savingFramework ? '保存中…' : '保存框架（玩家角色、故事标题、背景设定、写作规则）'}
          onClick={() => checkAuthForSave(handleSave)}
          disabled={savingFramework}
        >
          <SaveIcon />
        </button>
      </div>
      <section style={styles.section}>
        <label style={styles.label}>当前玩家角色</label>
        <select
          value={fw.playerCharacterId ?? ''}
          onChange={(e) => updateFwWithErrorReset((d) => ({...d, playerCharacterId: e.target.value || undefined}))}
          style={styles.input}
        >
          <option value="">请选择（在时间线中指定玩家）</option>
          {characterIds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}（{c.id}）
            </option>
          ))}
          {characterIds.length === 0 && <option value="" disabled>暂无人物，请在「人物」页添加</option>}
        </select>
      </section>

      <section style={styles.section}>
        <label style={styles.label}>故事标题</label>
        <input
          type="text"
          value={fw.title}
          onChange={(e) => updateFwWithErrorReset((d) => ({...d, title: e.target.value}))}
          style={styles.input}
          placeholder="河阴的余晖"
        />
      </section>

      <section style={styles.section}>
        <label style={styles.label}>背景设定</label>
        <textarea
          value={fw.background ?? ''}
          onChange={(e) => updateFwWithErrorReset((d) => ({...d, background: e.target.value || undefined}))}
          style={{...styles.input, ...styles.textarea, minHeight: 60}}
          placeholder="传给 AI 的上下文..."
        />
      </section>

      <section style={styles.section}>
        <label style={styles.label}>写作规则（每行一条）</label>
        <textarea
          value={(fw.rules ?? []).join('\n')}
          onChange={(e) =>
            updateFwWithErrorReset((d) => ({
              ...d,
              rules: e.target.value.split('\n').filter(Boolean) || undefined,
            }))
          }
          style={{...styles.input, ...styles.textarea, minHeight: 60}}
          placeholder="使用第二人称..."
        />
      </section>

      <section style={styles.section}>
        <p style={{fontSize: 13, color: '#9ca3af', margin: 0}}>
          章节场景池、叙事图、跨章过渡与连通态请在顶部导航「章节」页编辑。本页负责故事元数据与全局导入/导出。
        </p>
      </section>
        </>
      )}
    </div>
  );
}


const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 720,
    margin: '0 auto',
    padding: 20,
    color: '#e8e8e8',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #333',
  },
  title: pageTitleStyle,
  actions: {display: 'flex', gap: 10},
  btn: {
    padding: '8px 16px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    cursor: 'pointer',
    fontSize: 14,
  },
  btnSmall: {
    padding: '4px 10px',
    backgroundColor: '#333',
    border: 'none',
    borderRadius: 4,
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 12,
  },
  btnIcon: {
    padding: '2px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 16,
  },
  errors: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(231,76,60,0.15)',
    borderRadius: 8,
    color: '#e74c3c',
    fontSize: 13,
  },
  errorItem: {marginBottom: 4},
  section: {marginBottom: 24},
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1e1e32',
    borderRadius: 12,
    padding: 24,
    maxWidth: EDIT_MODAL_MAX_WIDTH,
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: modalTitleStyle,
  modalClose: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    lineHeight: 1,
  },
  modalActions: {display: 'flex', gap: 10, marginTop: 16},
  sectionHead: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10},
  label: {display: 'block', marginBottom: 6, fontSize: 13, color: '#a78bfa'},
  input: {
    width: '100%',
    padding: 10,
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 6,
    color: '#e8e8e8',
    fontSize: 14,
  },
  textarea: {
    width: '100%',
    minWidth: 0,
    resize: 'vertical' as const,
    boxSizing: 'border-box',
  },
  chapter: {marginBottom: 12},
  chapterHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    cursor: 'pointer',
    fontSize: 13,
    color: '#a78bfa',
  },
  chapterHeadRight: {display: 'flex', alignItems: 'center', gap: 8},
  chapterTitle: {fontWeight: 600, fontSize: 15},
  chapterBody: {padding: '8px 0 0 0'},
  row: {marginBottom: 12},
  scenesHead: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 10},
  scene: {marginBottom: 12},
  sceneHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    cursor: 'pointer',
    fontSize: 13,
    color: '#a78bfa',
  },
  sceneHeadDragging: {opacity: 0.55},
  sceneHeadLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
  },
  sceneHeadActions: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  sceneDragHandle: {
    color: '#888',
    fontSize: 14,
    userSelect: 'none',
    cursor: 'grab',
    flexShrink: 0,
    padding: '0 2px',
  },
  sceneTitle: {fontSize: 14, flex: 1, minWidth: 0, textAlign: 'left'},
  sceneBody: {padding: '8px 0 0 0'},
  sceneEditHint: {fontSize: 12, color: '#888', margin: '0 0 12px', lineHeight: 1.5},
  linksHead: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8},
  linkRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
};
