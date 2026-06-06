/**
 * 剧情界面（原时间线）
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import JSZip from 'jszip';
import type {FrameworkChapter, SceneEntry, StoryFramework} from '../schema/story-framework';
import {flattenSceneEntries, fromPersistedFramework, migrateFramework, toPersistedFramework, toPassageId, validateFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {GameCharacter} from '../schema/game-character';
import type {GameBehavior} from '../schema/game-behavior';
import type {GameMap} from '../schema/game-map';
import type {GameEvent} from '../schema/game-event';
import type {GameItem} from '../schema/game-item';
import type {GameMetadata} from '../schema/metadata';
import type {GameRule} from '../schema/game-rule';
import {ONLY_ONCE_RULE_ID} from '../schema/game-rule';
import {getAIGCApiKey, getCharactersFetchUrl, getScenesFetchUrl, getMapsFetchUrl, getEventsFetchUrl, getItemsFetchUrl, getMetadataFetchUrl, getRulesFetchUrl, getFeaturesFetchUrl, getStoryFmFetchUrl, getGameContentUrl, getPassagePageCharsMin, getPassagePageCharsMax} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useNotification} from '@/context/NotificationContext';
import {useAuth} from '@/context/AuthContext';
import {frameworkToStory, parseTwee, syncStoryTitleFromFramework} from '@/engine';

import {EDIT_MODAL_MAX_WIDTH} from '../styles/editorStyles';
import {formatJsonCompact} from '../utils/json-format';
import {
  applyScenePassageFullText,
  collectSceneFullText,
} from '../utils/scene-passage-text';
import {getAiBlocks, getScenePassageBlocks} from '../utils/passage-blocks';
import {resolveSceneBackgroundMusic, resolvedSceneImagesArray} from '../utils/scene-media';
import {normalizeFeaturesConfig} from '../utils/normalize-features';
import {runAssembleScene} from '@/services/scene-block-generation';
import {
  loadStoryFromGame,
  lookupKeysForSceneEntry,
  saveStoryTw,
  syncRoutingLinksForGame,
} from '@/services/scene-routing-sync-service';
import {
  collectRoutingStaleScenes,
  getSceneEntryRoutingFingerprint,
  patchRoutingFingerprints,
  syncPassageLinksInStory,
  type RoutingStaleEntry,
} from '../utils/scene-routing-sync';
import {InventoryValuesCard} from './cards/InventoryValuesCard';
import {RuleIdsSelector} from './ui/RuleIdsSelector';

type ImportZipFile = {path: string; contentBase64: string};
type ImportPendingData = {
  sourceGameId: string;
  files: ImportZipFile[];
};

type SceneCompileTarget = { chapterIndex: number; sceneIndex: number };

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
  if (scene.branchFailureEnding) m.branchTerminal = true;
  return m;
}

function truncatePathForDisplay(name: string, maxLen = 28): string {
  if (!name) return '';
  if (name.length <= maxLen) return name;
  return '…' + name.slice(-maxLen + 1);
}

function sceneContextSummary(scene: GameScene): string {
  const aiSummaries = getAiBlocks(scene).map((b) => b.summary?.trim()).filter(Boolean);
  if (aiSummaries.length > 0) return aiSummaries.join(' ');
  const raw = getScenePassageBlocks(scene).find((b) => b.type === 'raw');
  if (raw?.type === 'raw' && raw.text?.trim()) {
    const t = raw.text.trim();
    return t.length > 40 ? `${t.slice(0, 40)}...` : t;
  }
  return '';
}

function FileHandleButton({
                            label,
                            fileHandle,
                            onClick,
                            baseStyle = styles.btn,
                          }: {
  label: string;
  fileHandle: FileSystemFileHandle | null;
  onClick: () => void;
  baseStyle?: React.CSSProperties;
}) {
  return (
    <button type="button" style={{...baseStyle, ...styles.fileHandleBtn}} onClick={onClick}>
      <span>{label}</span>
      {fileHandle && (
        <span style={styles.fileHandleBtnPath}>{truncatePathForDisplay(fileHandle.name)}</span>
      )}
    </button>
  );
}

async function fetchListData(gameId: string): Promise<Partial<StoryFramework>> {
  const merged: Partial<StoryFramework> = {};
  const apis = [
    {url: getCharactersFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameCharacter[]},
    {url: getScenesFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameScene[]},
    {url: getMapsFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameMap[]},
    {url: getEventsFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameEvent[]},
    {url: getItemsFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameItem[]},
    {
      url: getMetadataFetchUrl(gameId), parse: (d: unknown) => {
        const m = d as { characterAttributes?: unknown };
        return m?.characterAttributes ? ({characterAttributes: m.characterAttributes} as GameMetadata) : undefined;
      }
    },
    {url: getRulesFetchUrl(gameId), parse: (d: unknown) => (Array.isArray(d) ? d : []) as import('../schema/game-rule').GameRule[]},
    {
      url: getFeaturesFetchUrl(gameId),
      parse: (d: unknown) =>
        d && typeof d === 'object' && !Array.isArray(d)
          ? normalizeFeaturesConfig(d as import('../schema/features').FeaturesConfig)
          : undefined,
    },
  ];
  const keys: (keyof StoryFramework)[] = ['characters', 'scenes', 'maps', 'events', 'items', 'metadata', 'gameRules', 'features'];
  for (let i = 0; i < apis.length; i++) {
    const {url, parse} = apis[i];
    const key = keys[i];
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const parsed = parse(data);
        if (parsed !== undefined && parsed !== null) {
          (merged as Record<string, unknown>)[key] = parsed;
        }
      }
    } catch {
      // 忽略加载失败
    }
  }
  return merged;
}

async function preloadListData(
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void,
  gameId: string
): Promise<void> {
  const merged = await fetchListData(gameId);
  if (Object.keys(merged).length > 0) {
    updateFw((d) => ({...d, ...merged}));
  }
}

async function loadFrameworkWithListData(gameId: string): Promise<StoryFramework | null> {
  const storyRes = await fetch(getStoryFmFetchUrl(gameId));
  if (!storyRes.ok) {
    if (storyRes.status === 404) return null;
    throw new Error(`读取剧情框架失败: ${storyRes.status}`);
  }
  const parsed = (await storyRes.json()) as Record<string, unknown>;
  if (!isRecord(parsed)) throw new Error('剧情框架格式错误');
  if (!parsed.title) parsed.title = '未命名故事';
  if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
    parsed.chapters = [{id: 'ch0', title: '第一章', sceneEntries: []}];
  }
  migrateFramework(parsed as unknown as StoryFramework);
  const fw = fromPersistedFramework(parsed);
  const listData = await fetchListData(gameId);
  return {...fw, ...listData};
}

async function saveFrameworkToStorage(gameId: string, fw: StoryFramework): Promise<void> {
  const res = await fetch(getStoryFmFetchUrl(gameId), {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: formatJsonCompact(toPersistedFramework(fw)),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error || `保存剧情框架失败: ${res.status}`);
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sceneEntryKey(chapterIndex: number, sceneIndex: number): string {
  return `${chapterIndex}:${sceneIndex}`;
}

function normalizePassageKey(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

function resolveStoryStartPassageName(fw: StoryFramework): string | null {
  try {
    const story = frameworkToStory(fw);
    const startPassage = story.passages.get(story.startPassageId);
    return startPassage?.name ?? null;
  } catch {
    return null;
  }
}

function getScenePassageLookupKeys(
  fw: StoryFramework,
  chapterIndex: number,
  sceneId: string
): string[] {
  return lookupKeysForSceneEntry(fw, chapterIndex, sceneId);
}

function getSceneEntryFingerprint(
  fw: StoryFramework,
  ch: FrameworkChapter,
  sceneIndex: number,
  sceneMap: Map<string, GameScene>
): string | null {
  const entry = ch.sceneEntries[sceneIndex];
  if (!entry) return null;
  const scene = sceneMap.get(entry.sceneId);
  if (!scene) return null;
  return hashString(JSON.stringify({
    title: fw.title,
    background: fw.background ?? '',
    rules: fw.rules ?? [],
    chapter: {
      id: ch.id,
      title: ch.title,
      theme: ch.theme ?? '',
      startMapNodeId: ch.startMapNodeId ?? '',
      endMapNodeId: ch.endMapNodeId ?? '',
    },
    entry: {
      sceneId: entry.sceneId,
      ruleIds: entry.ruleIds ?? [],
      sceneIndex,
    },
    scene: {
      id: scene.id,
      name: scene.name,
      passageBlocks: getScenePassageBlocks(scene),
      mapNodeId: scene.mapNodeId ?? '',
      characterIds: scene.characterIds ?? [],
      counterpartCharacterIds: scene.counterpartCharacterIds ?? [],
      characterOverrides: scene.characterOverrides ?? {},
      eventIds: scene.eventIds ?? [],
      openingAnimation: scene.openingAnimation ?? '',
      backgroundMusic: scene.backgroundMusic ?? '',
      images: scene.images ?? [],
    },
  }));
}

function collectSceneFingerprintMap(fw: StoryFramework): Map<string, string> {
  const map = new Map<string, string>();
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  for (let chi = 0; chi < fw.chapters.length; chi++) {
    const ch = fw.chapters[chi];
    for (let si = 0; si < ch.sceneEntries.length; si++) {
      const fp = getSceneEntryFingerprint(fw, ch, si, sceneMap);
      if (fp) map.set(sceneEntryKey(chi, si), fp);
    }
  }
  return map;
}

function patchSceneEntry(
  fw: StoryFramework,
  chapterIndex: number,
  sceneIndex: number,
  patch: (entry: SceneEntry) => SceneEntry
): StoryFramework {
  return {
    ...fw,
    chapters: fw.chapters.map((ch, chi) =>
      chi === chapterIndex
        ? {...ch, sceneEntries: ch.sceneEntries.map((entry, si) => (si === sceneIndex ? patch(entry) : entry))}
        : ch
    ),
  };
}

function collectChangedSceneTargets(newFw: StoryFramework, oldFingerprintMap: Map<string, string>): SceneCompileTarget[] {
  const targets: SceneCompileTarget[] = [];
  const sceneMap = new Map((newFw.scenes ?? []).map((s) => [s.id, s]));
  for (let chi = 0; chi < newFw.chapters.length; chi++) {
    const ch = newFw.chapters[chi];
    for (let si = 0; si < ch.sceneEntries.length; si++) {
      const fp = getSceneEntryFingerprint(newFw, ch, si, sceneMap);
      if (!fp || oldFingerprintMap.get(sceneEntryKey(chi, si)) === fp) continue;
      targets.push({chapterIndex: chi, sceneIndex: si});
    }
  }
  return targets;
}

function applySceneTextToStory(
  story: ReturnType<typeof parseTwee>,
  fullStory: ReturnType<typeof frameworkToStory>,
  fw: StoryFramework,
  scene: GameScene,
  chapterIndex: number,
  sceneText: string
): void {
  const pid = toPassageId(chapterIndex, scene.id);
  const template = fullStory.passages.get(pid);
  if (!template) throw new Error(`未找到 passage 模板: ${pid}`);

  // 场景正文模板可能注入了“支线失败结局统一媒体预设”；模板元数据优先，避免被场景默认媒体覆盖。
  const meta = {...sceneAuthoritativeMetadata(scene, fw), ...(template.metadata ?? {})};
  const lookupKeys = getScenePassageLookupKeys(fw, chapterIndex, scene.id);
  applyScenePassageFullText(story, {
    sceneId: scene.id,
    paginationBaseId: pid,
    lookupKeys,
    rootPassage: {
      ...template,
      name: template.name ?? scene.name ?? pid,
      metadata: Object.keys(meta).length ? meta : undefined,
    },
    fullText: sceneText,
    minChars: getPassagePageCharsMin(),
    maxChars: getPassagePageCharsMax(),
  });

  story.metadata = {...(story.metadata ?? {}), ...(fullStory.metadata ?? {})};
  syncStoryTitleFromFramework(story, fw);
  const startName = resolveStoryStartPassageName(fw);
  if (startName) story.startPassageId = startName;
}

async function compileSceneEntry(
  fw: StoryFramework,
  story: ReturnType<typeof parseTwee>,
  target: SceneCompileTarget,
  gameId: string
): Promise<{ fw: StoryFramework; story: ReturnType<typeof parseTwee> }> {
  const {chapterIndex, sceneIndex} = target;
  const ch = fw.chapters[chapterIndex];
  const entry = ch.sceneEntries[sceneIndex];
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const scene = sceneMap.get(entry.sceneId);
  if (!scene) throw new Error(`未找到场景 ${entry.sceneId}`);

  const fp = getSceneEntryFingerprint(fw, ch, sceneIndex, sceneMap);
  if (!fp) throw new Error('无法计算版本指纹');

  const {passageText} = await runAssembleScene(gameId, scene, ch.id);
  applySceneTextToStory(story, frameworkToStory(fw), fw, scene, chapterIndex, passageText);
  return {
    fw: patchSceneEntry(fw, chapterIndex, sceneIndex, (e) => {
      const routingFp = getSceneEntryRoutingFingerprint(fw, ch, sceneIndex, sceneMap);
      return {
        ...e,
        compiledFingerprint: fp,
        ...(routingFp ? {routingFingerprint: routingFp} : {}),
      };
    }),
    story,
  };
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

async function saveRulesToPreset(rules: unknown, gameId: string): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getRulesFetchUrl(gameId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(rules),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(rules)], {type: 'application/json'});
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
  const [frameworkFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [parsedStory, setParsedStory] = useState<ReturnType<typeof parseTwee> | null>(null);
  const [syncingRouting, setSyncingRouting] = useState(false);
  const [syncingSceneRoutingKey, setSyncingSceneRoutingKey] = useState<string | null>(null);

  const reloadParsedStory = useCallback(async () => {
    try {
      const story = await loadStoryFromGame(gameId);
      setParsedStory(story);
    } catch {
      setParsedStory(null);
    }
  }, [gameId]);

  useEffect(() => {
    void reloadParsedStory();
  }, [reloadParsedStory, fw]);

  useEffect(() => {
    preloadListData(updateFw, gameId);
  }, [updateFw, gameId]);

  const lookupKeysCallback = useCallback(
    (chapterIndex: number, sceneId: string) => lookupKeysForSceneEntry(fw, chapterIndex, sceneId),
    [fw]
  );

  const routingStaleEntries = useMemo(() => {
    if (!parsedStory) return [];
    try {
      return collectRoutingStaleScenes(fw, parsedStory, lookupKeysCallback);
    } catch {
      return [];
    }
  }, [fw, parsedStory, lookupKeysCallback]);

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
  const staleSceneEntries = useMemo(() => {
    const stale: Array<{ chapterTitle: string; sceneName: string; sceneId: string }> = [];
    for (let chi = 0; chi < fw.chapters.length; chi++) {
      const ch = fw.chapters[chi];
      for (let si = 0; si < (ch.sceneEntries ?? []).length; si++) {
        const entry = ch.sceneEntries[si];
        const fp = getSceneEntryFingerprint(fw, ch, si, sceneMap);
        if (!fp) continue;
        if (entry.compiledFingerprint !== fp) {
          stale.push({
            chapterTitle: ch.title || ch.id,
            sceneName: sceneMap.get(entry.sceneId)?.name ?? entry.sceneId,
            sceneId: entry.sceneId,
          });
        }
      }
    }
    return stale;
  }, [fw, sceneMap]);
  flattenSceneEntries(fw);
  const mapNodeIds: Array<{ id: string; name: string; mapName: string }> = [];
  for (const map of fw.maps ?? []) {
    for (const n of map.nodes) mapNodeIds.push({id: n.id, name: n.name, mapName: map.name});
  }
  const characterIds = (fw.characters ?? []).map((c) => ({id: c.id, name: c.name}));
  const catalogItems = fw.items ?? [];
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
    const result = await saveRulesToPreset(fw.gameRules ?? [], gameId);
    if (!result.ok) addNotification('error', `规则保存失败: ${result.error}`);
  }, [fw.gameRules, gameId, addNotification]);

  const handleSave = useCallback(async () => {
    try {
      await saveFrameworkToStorage(gameId, fw);
      await persistStoryTitleToTw(gameId, fw);

      let nextFw = fw;
      if (parsedStory && routingStaleEntries.length > 0) {
        const syncResult = await syncRoutingLinksForGame(
          gameId,
          fw,
          routingStaleEntries.map((s) => s.sceneId)
        );
        nextFw = syncResult.fw;
        await saveFrameworkToStorage(gameId, nextFw);
        updateFw(() => nextFw);
        await reloadParsedStory();
        addNotification(
          'info',
          `保存成功；已同步 ${syncResult.syncedCount} 个场景的路由链接`
        );
      } else {
        addNotification('info', '保存成功');
      }
      setJsonError(null);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setJsonError((e as Error).message);
    }
  }, [fw, gameId, addNotification, parsedStory, routingStaleEntries, updateFw, reloadParsedStory]);

  const handleSyncAllRoutingLinks = useCallback(async () => {
    if (routingStaleEntries.length === 0) {
      addNotification('info', '路由链接已与框架一致');
      return;
    }
    setSyncingRouting(true);
    setJsonError(null);
    try {
      const syncResult = await syncRoutingLinksForGame(
        gameId,
        fw,
        routingStaleEntries.map((s) => s.sceneId)
      );
      await saveFrameworkToStorage(gameId, syncResult.fw);
      updateFw(() => syncResult.fw);
      await reloadParsedStory();
      addNotification(
        'info',
        `已同步 ${syncResult.syncedCount} 个场景的路由链接` +
          (syncResult.skippedCount > 0 ? `（${syncResult.skippedCount} 个跳过）` : '')
      );
    } catch (e) {
      setJsonError((e as Error).message || '同步路由链接失败');
    } finally {
      setSyncingRouting(false);
    }
  }, [fw, gameId, routingStaleEntries, updateFw, addNotification, reloadParsedStory]);

  const handleSyncSceneRouting = useCallback(
    async (chi: number, si: number) => {
      const ch = fw.chapters[chi];
      const entry = ch?.sceneEntries?.[si];
      if (!entry) return;
      const sk = `${chi}-${si}`;
      setSyncingSceneRoutingKey(sk);
      setJsonError(null);
      try {
        const syncResult = await syncRoutingLinksForGame(gameId, fw, [entry.sceneId]);
        await saveFrameworkToStorage(gameId, syncResult.fw);
        updateFw(() => syncResult.fw);
        await reloadParsedStory();
        addNotification(
          'info',
          `已同步场景路由链接：${(fw.scenes ?? []).find((s) => s.id === entry.sceneId)?.name ?? entry.sceneId}`
        );
      } catch (e) {
        setJsonError((e as Error).message || '同步路由链接失败');
      } finally {
        setSyncingSceneRoutingKey(null);
      }
    },
    [fw, gameId, updateFw, addNotification, reloadParsedStory]
  );

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
            const entry = ch.sceneEntries[t.sceneIndex];
            const scene = nextFw.scenes?.find((s) => s.id === entry.sceneId);
            const sceneLabel = `${ch.title || ch.id} / ${scene?.name ?? entry.sceneId}`;
            setCompileProgress({current: i + 1, total: changedTargets.length, scene: sceneLabel});
            try {
              const result = await compileSceneEntry(nextFw, story, t, targetGameId);
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
              addNotification('info', `已同步 ${routeSync.synced.length} 个场景的路由链接`);
            }
          } catch (routeErr) {
            addNotification('error', `路由链接同步失败：${(routeErr as Error).message}`);
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

  const handleAssembleScene = useCallback(
    async (chi: number, si: number) => {
      const ch = fw.chapters[chi];
      const entry = ch?.sceneEntries?.[si];
      if (!entry) {
        alert('未找到该场景条目，请刷新后重试。');
        return;
      }
      const scene = sceneMap.get(entry.sceneId);
      if (!scene) {
        alert(`未找到场景「${entry.sceneId}」。请先在「场景」页添加该场景，并确保剧情页已加载场景数据。`);
        return;
      }
      if (!apiKey?.trim()) {
        alert('请配置 VITE_AIGC_API_KEY');
        return;
      }
      if (!import.meta.env.DEV) {
        alert('汇编内容需要开发模式，当前为生产环境。');
        return;
      }
      const sk = `${chi}-${si}`;
      setGeneratingSceneKey(sk);
      setJsonError(null);
      try {
        const res = await fetch(getGameContentUrl(gameId));
        const raw = res.ok ? await res.text() : '';
        let story = parseTwee(raw);
        const result = await compileSceneEntry(fw, story, {chapterIndex: chi, sceneIndex: si}, gameId);
        await saveStoryTw(gameId, result.story);
        updateFw(() => result.fw);
        await saveFrameworkToStorage(gameId, result.fw);
        addNotification('info', `已汇编场景：${scene.name}`);
      } catch (e) {
        setJsonError((e as Error).message);
      } finally {
        setGeneratingSceneKey(null);
      }
    },
    [fw, apiKey, gameId, sceneMap, updateFw, addNotification]
  );

  const handleLoadSceneText = useCallback(
    async (chi: number, si: number) => {
      const ch = fw.chapters[chi];
      const entry = ch?.sceneEntries?.[si];
      if (!entry) return;
      const entryKey = `${chi}-${si}`;
      const lookupKeys = getScenePassageLookupKeys(fw, chi, entry.sceneId);
      setLoadingSceneTextKey(entryKey);
      try {
        const contentUrl = getGameContentUrl(gameId);
        const res = await fetch(contentUrl);
        const raw = res.ok ? await res.text() : '';
        const story = parseTwee(raw);
        const pid = toPassageId(chi, entry.sceneId);
        const fullText = collectSceneFullText(story, entry.sceneId, pid, lookupKeys);
        const fallbackScene = sceneMap.get(entry.sceneId);
        const fallback = fallbackScene ? sceneContextSummary(fallbackScene) : '';
        setEditingSceneText((prev) => ({
          ...prev,
          [entryKey]: fullText || fallback,
        }));
        if (!fullText) addNotification('info', '未找到已有正文，已载入场景正文块摘要作为编辑初稿');
      } catch (e) {
        setJsonError((e as Error).message || '读取正文失败');
      } finally {
        setLoadingSceneTextKey(null);
      }
    },
    [fw, gameId, sceneMap, addNotification]
  );

  const toggleScene = useCallback((chi: number, si: number) => {
    const entryKey = `${chi}-${si}`;
    setExpandedScene((prev) => {
      const expanding = !prev.has(entryKey);
      const next = new Set(prev);
      if (prev.has(entryKey)) next.delete(entryKey);
      else next.add(entryKey);
      if (expanding && editingSceneTextRef.current[entryKey] === undefined) {
        void handleLoadSceneText(chi, si);
      }
      return next;
    });
  }, [handleLoadSceneText]);

  const handleSaveSceneText = useCallback(
    async (chi: number, si: number) => {
      const ch = fw.chapters[chi];
      const entry = ch?.sceneEntries?.[si];
      if (!entry) return;
      const scene = sceneMap.get(entry.sceneId);
      const entryKey = `${chi}-${si}`;
      const text = editingSceneText[entryKey] ?? '';
      const pid = toPassageId(chi, entry.sceneId);
      const lookupKeys = getScenePassageLookupKeys(fw, chi, entry.sceneId);
      setSavingSceneTextKey(entryKey);
      setJsonError(null);
      try {
        const contentUrl = getGameContentUrl(gameId);
        const res = await fetch(contentUrl);
        const raw = res.ok ? await res.text() : '';
        const story = parseTwee(raw);
        const fullStory = frameworkToStory(fw);
        const template = fullStory.passages.get(pid);
        if (!template) throw new Error(`未找到场景 passage 模板: ${pid}`);
        if (!scene) throw new Error(`未找到场景 ${entry.sceneId}`);
        const meta = {...sceneAuthoritativeMetadata(scene, fw), ...(template.metadata ?? {})};
        applyScenePassageFullText(story, {
          sceneId: entry.sceneId,
          paginationBaseId: pid,
          lookupKeys,
          rootPassage: {
            ...template,
            name: template.name ?? scene.name ?? pid,
            metadata: Object.keys(meta).length ? meta : undefined,
          },
          fullText: text,
          minChars: getPassagePageCharsMin(),
          maxChars: getPassagePageCharsMax(),
        });
        syncStoryTitleFromFramework(story, fw);
        await saveStoryTw(gameId, story);
        addNotification('info', '场景正文已保存到 story.tw');
      } catch (e) {
        setJsonError((e as Error).message || '保存正文失败');
      } finally {
        setSavingSceneTextKey(null);
      }
    },
    [fw, gameId, sceneMap, editingSceneText, addNotification]
  );

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
          <FileHandleButton label="保存" fileHandle={frameworkFileHandle} onClick={() => checkAuthForSave(handleSave)}/>
          <button
            type="button"
            style={styles.btn}
            disabled={syncingRouting || routingStaleEntries.length === 0}
            onClick={() => checkAuthForSave(handleSyncAllRoutingLinks)}
            title="仅更新 story.tw 中的 passage 链接，不改正文、不调用 AI"
          >
            {syncingRouting ? '同步路由中…' : `同步路由链接${routingStaleEntries.length > 0 ? ` (${routingStaleEntries.length})` : ''}`}
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
      {routingStaleEntries.length > 0 && (
        <div style={{...styles.errors, backgroundColor: 'rgba(255,152,0,0.12)', color: '#ffb74d'}}>
          <div style={{fontWeight: 600, marginBottom: 6}}>
            检测到 {routingStaleEntries.length} 个场景路由过期（story.tw 链接与框架不一致）
          </div>
          {routingStaleEntries.slice(0, 12).map((it, idx) => (
            <div key={`route-${it.sceneId}-${idx}`} style={styles.errorItem}>
              {it.chapterTitle} / {it.sceneName}（{it.sceneId}）
            </div>
          ))}
          {routingStaleEntries.length > 12 && (
            <div style={styles.errorItem}>... 还有 {routingStaleEntries.length - 12} 个</div>
          )}
          <button
            type="button"
            style={{...styles.btnSmall, marginTop: 8}}
            disabled={syncingRouting}
            onClick={() => checkAuthForSave(handleSyncAllRoutingLinks)}
          >
            {syncingRouting ? '同步中…' : '一键同步全部路由链接'}
          </button>
        </div>
      )}

      {staleSceneEntries.length > 0 && (
        <div style={{...styles.errors, backgroundColor: 'rgba(255,193,7,0.12)', color: '#ffd54f'}}>
          <div style={{fontWeight: 600, marginBottom: 6}}>
            检测到 {staleSceneEntries.length} 个场景正文过期（story-fm 与 story.tw 版本不一致）
          </div>
          {staleSceneEntries.slice(0, 12).map((it, idx) => (
            <div key={`${it.chapterTitle}-${it.sceneId}-${idx}`} style={styles.errorItem}>
              {it.chapterTitle} / {it.sceneName}（{it.sceneId}）
            </div>
          ))}
          {staleSceneEntries.length > 12 && (
            <div style={styles.errorItem}>... 还有 {staleSceneEntries.length - 12} 个</div>
          )}
        </div>
      )}

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
        <InventoryValuesCard
          items={catalogItems}
          inventory={fw.initialState?.inventory ?? []}
          onChange={(ids) =>
            updateFwWithErrorReset((d) => {
              const inventory = ids.length ? ids : undefined;
              const variables = d.initialState?.variables;
              const hasVariables = variables && Object.keys(variables).length > 0;
              if (!inventory && !hasVariables) {
                return {...d, initialState: undefined};
              }
              return {
                ...d,
                initialState: {
                  ...d.initialState,
                  variables: hasVariables ? variables : undefined,
                  inventory,
                },
              };
            })
          }
          title="开局背包（initialState.inventory）"
          readOnly={false}
        />
        <p style={{fontSize: 12, color: '#888', marginTop: 8, marginBottom: 0}}>
          游戏启动时玩家已持有的物品 id；写入 story-fm.json，编译 story.tw 后生效。与场景「进入时 give/take」不同。
        </p>
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
        <div style={styles.sectionHead}>
          <span>章节</span>
          <button
            type="button"
            style={styles.btnSmall}
            onClick={() =>
              updateFwWithErrorReset((d) => ({
                ...d,
                chapters: [
                  ...d.chapters,
                  {id: `ch${d.chapters.length}`, title: `第${d.chapters.length + 1}章`, sceneEntries: []},
                ],
              }))
            }
          >
            + 添加章节
          </button>
        </div>

        {fw.chapters.map((ch, chi) => (
          <ChapterBlock
            key={ch.id}
            ch={ch}
            chi={chi}
            startSceneName={chi === 0 ? resolveStoryStartPassageName(fw) : undefined}
            scenes={fw.scenes ?? []}
            mapNodeIds={mapNodeIds}
            ruleList={(fw.gameRules ?? []).map((r) => ({id: r.id, name: r.name}))}
            expandedCh={expandedCh}
            expandedEntry={expandedScene}
            toggleCh={toggleCh}
            onToggleEntry={(si) => toggleScene(chi, si)}
            updateFw={updateFwWithErrorReset}
            onAssembleScene={(si) => handleAssembleScene(chi, si)}
            onSyncSceneRouting={(si) => handleSyncSceneRouting(chi, si)}
            routingStaleBySceneIndex={new Map(
              routingStaleEntries
                .filter((s) => s.chapterIndex === chi)
                .map((s) => [s.sceneIndex, s])
            )}
            syncingSceneRoutingKey={syncingSceneRoutingKey}
            generatingEntry={generatingSceneKey}
            sceneTextDrafts={editingSceneText}
            loadingSceneTextKey={loadingSceneTextKey}
            savingSceneTextKey={savingSceneTextKey}
            gameRules={gameRules}
            onUpdateRule={updateRule}
            onSaveRules={() => checkAuthForSave(saveRules)}
            onSceneTextDraftChange={(entryKey, value) =>
              setEditingSceneText((prev) => ({...prev, [entryKey]: value}))
            }
            onLoadSceneText={(si) => handleLoadSceneText(chi, si)}
            onSaveSceneText={(si) => handleSaveSceneText(chi, si)}
          />
        ))}
      </section>
    </div>
  );
}

function ChapterBlock({
  ch,
  chi,
  startSceneName,
  scenes,
  mapNodeIds,
  ruleList,
  expandedCh,
  expandedEntry,
  toggleCh,
  onToggleEntry,
  updateFw,
  onAssembleScene,
  onSyncSceneRouting,
  routingStaleBySceneIndex,
  syncingSceneRoutingKey,
  generatingEntry,
  sceneTextDrafts,
  loadingSceneTextKey,
  savingSceneTextKey,
  gameRules,
  onUpdateRule,
  onSaveRules,
  onSceneTextDraftChange,
  onLoadSceneText,
  onSaveSceneText,
}: {
  ch: FrameworkChapter;
  chi: number;
  /** 首章解析出的游戏起始场景名（只读提示） */
  startSceneName?: string | null;
  scenes: GameScene[];
  mapNodeIds: Array<{ id: string; name: string; mapName: string }>;
  ruleList: Array<{ id: string; name: string }>;
  expandedCh: Set<string>;
  expandedEntry: Set<string>;
  toggleCh: (id: string) => void;
  onToggleEntry: (si: number) => void;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
  onAssembleScene: (si: number) => void;
  onSyncSceneRouting: (si: number) => void;
  routingStaleBySceneIndex: Map<number, RoutingStaleEntry>;
  syncingSceneRoutingKey: string | null;
  generatingEntry: string | null;
  sceneTextDrafts: Record<string, string>;
  loadingSceneTextKey: string | null;
  savingSceneTextKey: string | null;
  gameRules: GameRule[];
  onUpdateRule?: (ruleId: string, fn: (r: GameRule) => GameRule) => void;
  onSaveRules?: () => void;
  onSceneTextDraftChange: (entryKey: string, value: string) => void;
  onLoadSceneText: (si: number) => void;
  onSaveSceneText: (si: number) => void;
}) {
  const isExpanded = expandedCh.has(ch.id);
  const entries = ch.sceneEntries ?? [];
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  const [draggingSceneIndex, setDraggingSceneIndex] = useState<number | null>(null);

  const updateChapter = (fn: (c: FrameworkChapter) => FrameworkChapter) =>
    updateFw((d) => ({
      ...d,
      chapters: d.chapters.map((c, i) => (i === chi ? fn(c) : c)),
    }));

  const addSceneEntry = (sceneId: string) => {
    if (entries.some((e) => e.sceneId === sceneId)) {
      alert('该场景已在本章节中，一个章节与一个场景只能有唯一关系，不能重复添加。');
      return;
    }
    updateChapter((c) => ({
      ...c,
      sceneEntries: [...(c.sceneEntries ?? []), {sceneId}],
    }));
  };

  const removeSceneEntry = (si: number) => {
    updateChapter((c) => ({
      ...c,
      sceneEntries: c.sceneEntries.filter((_, j) => j !== si),
    }));
  };

  const updateEntry = (si: number, fn: (e: SceneEntry) => SceneEntry) => {
    updateChapter((c) => ({
      ...c,
      sceneEntries: c.sceneEntries.map((e, j) => (j === si ? fn(e) : e)),
    }));
  };

  const reorderSceneEntry = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= entries.length) return;
    updateChapter((c) => {
      const list = [...c.sceneEntries];
      const [item] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, item);
      return {...c, sceneEntries: list};
    });
  };

  const handleSceneDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setDraggingSceneIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleSceneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleSceneDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!Number.isNaN(fromIndex) && fromIndex !== toIndex) {
      reorderSceneEntry(fromIndex, toIndex);
    }
    setDraggingSceneIndex(null);
  };

  const handleSceneDragEnd = () => {
    setDraggingSceneIndex(null);
  };

  return (
    <div style={styles.chapter}>
      <div style={styles.chapterHead} onClick={() => toggleCh(ch.id)}>
        <span style={styles.chapterTitle}>{isExpanded ? '▼' : '▶'} {ch.title || ch.id}</span>
        <div style={styles.chapterHeadRight} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            style={styles.btnIcon}
            onClick={() =>
              updateFw((d) => ({
                ...d,
                chapters: d.chapters.filter((_, i) => i !== chi),
              }))
            }
            title="删除章节"
          >
            ×
          </button>
        </div>
      </div>

      {isExpanded && (
        <div style={styles.chapterBody}>
          <div style={styles.row}>
            <label style={styles.label}>治理标题（仅编辑/治理用，建议与地图节点 name 一致）</label>
            <input
              type="text"
              value={ch.title}
              onChange={(e) =>
                updateChapter((c) => ({...c, title: e.target.value}))
              }
              style={{...styles.input, flex: 1}}
              placeholder="如：福州·夜雨（勿写「第一章：…」长标题）"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>主题</label>
            <input
              type="text"
              value={ch.theme ?? ''}
              onChange={(e) =>
                updateChapter((c) => ({...c, theme: e.target.value || undefined}))
              }
              style={{...styles.input, flex: 1}}
              placeholder="章节主题"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>起始地图节点（本章剧情发生地）</label>
            <select
              value={ch.startMapNodeId ?? ''}
              onChange={(e) =>
                updateChapter((c) => ({...c, startMapNodeId: e.target.value || undefined}))
              }
              style={styles.input}
            >
              <option value="">无</option>
              {mapNodeIds.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.mapName} / {n.name}
                </option>
              ))}
            </select>
            {startSceneName != null && (
              <p style={{margin: '6px 0 0', fontSize: 12, color: '#9ca3af'}}>
                游戏起始场景：<strong style={{color: '#e8e8e8'}}>{startSceneName}</strong>
                （首章该节点上的<strong>主线</strong>场景；支线不参与）
              </p>
            )}
          </div>
          <div style={styles.row}>
            <label style={styles.label}>终止地图节点（本章结束后玩家可前往）</label>
            <select
              value={ch.endMapNodeId ?? ''}
              onChange={(e) =>
                updateChapter((c) => ({...c, endMapNodeId: e.target.value || undefined}))
              }
              style={styles.input}
            >
              <option value="">无</option>
              {mapNodeIds.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.mapName} / {n.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.scenesHead}>
            <span>场景</span>
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                e.target.value = '';
                if (v) addSceneEntry(v);
              }}
              style={{...styles.input, width: 200}}
            >
              <option value="">+ 添加场景</option>
              {scenes
                .filter((s) => !entries.some((e) => e.sceneId === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.id}）
                  </option>
                ))}
            </select>
          </div>

          {entries.map((entry, si) => {
            const scene = sceneMap.get(entry.sceneId);
            const branchRootScene = (scene?.branchOptions ?? []).filter(Boolean).length > 0;
            const entryKey = `${chi}-${si}`;
            const isEntryExpanded = expandedEntry.has(entryKey);
            const isGenerating = generatingEntry === entryKey;
            const isSyncingRouting = syncingSceneRoutingKey === entryKey;
            const routingStale = routingStaleBySceneIndex.get(si);
            const isLoadingText = loadingSceneTextKey === entryKey;
            const isSavingText = savingSceneTextKey === entryKey;
            const textDraft = sceneTextDrafts[entryKey] ?? '';
            return (
              <div key={entryKey} style={styles.scene}>
                <div
                  style={{
                    ...styles.sceneHead,
                    ...(draggingSceneIndex === si ? styles.sceneHeadDragging : {}),
                  }}
                  onClick={() => onToggleEntry(si)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onToggleEntry(si)}
                  onDragOver={handleSceneDragOver}
                  onDrop={(e) => handleSceneDrop(e, si)}
                >
                  <div style={styles.sceneHeadLeft}>
                    <span
                      draggable
                      onDragStart={(e) => handleSceneDragStart(e, si)}
                      onDragEnd={handleSceneDragEnd}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={styles.sceneDragHandle}
                      title="拖拽调整章内顺序（影响主线链）"
                    >
                      ⋮⋮
                    </span>
                    <span style={styles.sceneTitle}>
                      {isEntryExpanded ? '▼' : '▶'} {scene?.name ?? entry.sceneId}
                      {routingStale ? (
                        <span style={{marginLeft: 8, fontSize: 11, color: '#ffb74d'}} title="路由链接过期">
                          路由过期
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div
                    onClick={(ev) => ev.stopPropagation()}
                    style={styles.sceneHeadActions}
                  >
                    <button
                      type="button"
                      style={{
                        ...styles.btnSmall,
                        ...(isSyncingRouting ? {opacity: 0.6} : {}),
                        ...(routingStale ? {borderColor: '#ffb74d', color: '#ffb74d'} : {}),
                      }}
                      onClick={() => onSyncSceneRouting(si)}
                      disabled={isSyncingRouting || !routingStale}
                      title="仅更新 story.tw 中的 passage 链接，不改正文"
                    >
                      {isSyncingRouting ? '同步中...' : '同步链接'}
                    </button>
                    <button
                      type="button"
                      style={{
                        ...styles.btnSmall,
                        ...(isGenerating ? {opacity: 0.6} : {}),
                      }}
                      onClick={() => onAssembleScene(si)}
                      disabled={isGenerating}
                      title="将各 AI 块 generatedText 汇编写入 story.tw"
                    >
                      {isGenerating ? '汇编中...' : '汇编内容'}
                    </button>
                    <button
                      type="button"
                      style={styles.btnIcon}
                      onClick={() => removeSceneEntry(si)}
                      title="移出本章节"
                    >
                      ×
                    </button>
                  </div>
                </div>
                {isEntryExpanded && (
                  <div style={styles.sceneBody}>
                    <p style={styles.sceneEditHint}>
                      请在「场景」菜单为各 AI 块填写规格并「生成内容」；汇编前请先保存 story-scenes.json。
                    </p>
                    <div style={styles.row}>
                      <label style={styles.label}>生成正文（story.tw，多页自动合并编辑，保存时重新分页）</label>
                      <div style={{display: 'flex', gap: 8, marginBottom: 8}}>
                        <button
                          type="button"
                          style={styles.btnSmall}
                          onClick={() => onLoadSceneText(si)}
                          disabled={isLoadingText || isSavingText}
                        >
                          {isLoadingText ? '读取中...' : '读取正文'}
                        </button>
                        <button
                          type="button"
                          style={styles.btnSmall}
                          onClick={() => onSaveSceneText(si)}
                          disabled={isLoadingText || isSavingText}
                        >
                          {isSavingText ? '保存中...' : '保存正文'}
                        </button>
                      </div>
                      <textarea
                        value={textDraft}
                        onChange={(e) => onSceneTextDraftChange(entryKey, e.target.value)}
                        placeholder="该场景在 story.tw 中的完整正文（含全部分页，保存时自动拆分）"
                        style={{...styles.input, ...styles.textarea, minHeight: 170}}
                      />
                    </div>
                    <RuleIdsSelector
                      ruleList={ruleList}
                      value={entry.ruleIds ?? []}
                      onChange={(ids) => {
                        updateEntry(si, (e0) => ({
                          ...e0,
                          ruleIds: ids.length ? ids : undefined,
                        }));
                      }}
                      label="规则"
                      gameRules={gameRules}
                      usageContext={{sceneId: entry.sceneId}}
                      onUpdateRule={onUpdateRule}
                      onSaveRules={onSaveRules}
                      disabledAddOptions={
                        branchRootScene
                          ? [
                              {
                                id: ONLY_ONCE_RULE_ID,
                                reason:
                                  '该场景含 branchOptions，本章规则不能使用 onlyOnce。支线场景的 onlyOnce 请在「场景」页写入 scene.ruleIds。',
                              },
                            ]
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
  title: {fontSize: 20, fontWeight: 600, margin: 0},
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
  modalTitle: {fontSize: 18, fontWeight: 600, margin: 0},
  modalClose: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    lineHeight: 1,
  },
  modalActions: {display: 'flex', gap: 10, marginTop: 16},
  fileHandleBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  fileHandleBtnPath: {
    fontSize: 10,
    color: '#888',
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
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
