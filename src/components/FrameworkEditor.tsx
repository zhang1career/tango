/**
 * 剧情界面（原时间线）
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import JSZip from 'jszip';
import type {FrameworkChapter, SceneEntry, StoryFramework} from '../schema/story-framework';
import {flattenSceneEntries, fromPersistedFramework, migrateFramework, toPersistedFramework, toPassageId, validateFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {GameCharacter} from '../schema/game-character';
import type {GameMap} from '../schema/game-map';
import type {GameEvent} from '../schema/game-event';
import type {GameItem} from '../schema/game-item';
import type {GameMetadata} from '../schema/metadata';
import {getAIGCApiKey, getAIGCApiUrl, getCharactersFetchUrl, getScenesFetchUrl, getMapsFetchUrl, getEventsFetchUrl, getItemsFetchUrl, getMetadataFetchUrl, getRulesFetchUrl, getStoryFmFetchUrl, getStoryBundleFetchUrl, getGameContentUrl, getPassagePageCharsMin, getPassagePageCharsMax} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useNotification} from '@/context/NotificationContext';
import {useAuth} from '@/context/AuthContext';
import {frameworkToStory, parseTwee, serializeStorySugarcube, storyToBundle} from '@/engine';

import {formatJsonCompact} from '../utils/json-format';
import {paginatePassageText, removeSceneSubPassages} from '../utils/paginate-passage';
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
 * openingAnimation、images、backgroundMusic、characterIds 等由场景决定的字段，空时设为 undefined 以移除
 */
function sceneAuthoritativeMetadata(scene: GameScene, fw: StoryFramework): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  const ids = scene.characterIds?.filter((id) => id !== fw.playerCharacterId);
  m.characterIds = ids?.length ? ids : undefined;
  m.openingAnimation = scene.openingAnimation || undefined;
  const validImages = scene.images?.filter((u) => u?.trim());
  m.images = validImages?.length ? validImages.map((u) => u.trim()) : undefined;
  m.backgroundMusic = scene.backgroundMusic || undefined;
  return m;
}

function truncatePathForDisplay(name: string, maxLen = 28): string {
  if (!name) return '';
  if (name.length <= maxLen) return name;
  return '…' + name.slice(-maxLen + 1);
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
  ];
  const keys: (keyof StoryFramework)[] = ['characters', 'scenes', 'maps', 'events', 'items', 'metadata', 'gameRules'];
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

function buildChapterContext(
  fw: StoryFramework,
  ch: FrameworkChapter,
  sceneIndex: number,
  sceneMap: Map<string, GameScene>
): string {
  const parts: string[] = [];
  parts.push(`章节标题：${ch.title}`);
  if (ch.theme) parts.push(`章节主题：${ch.theme}`);
  const entries = ch.sceneEntries ?? [];
  const prev = entries.slice(0, sceneIndex);
  if (prev.length > 0) {
    parts.push(
      '前序场景概要：',
      ...prev.map((e) => {
        const s = sceneMap.get(e.sceneId);
        return `  - ${e.sceneId}：${s?.summary ?? ''}`;
      })
    );
  }
  const charIds = new Set<string>();
  for (const e of entries) {
    const s = sceneMap.get(e.sceneId);
    for (const id of s?.characterIds ?? []) charIds.add(id);
  }
  const chars = (fw.characters ?? []).filter((c) => charIds.has(c.id));
  if (chars.length > 0) {
    parts.push(
      '人物介绍：',
      ...chars.map((c) => `  - ${c.id}（${c.name}）：${c.description ?? '无描述'}`)
    );
  }
  const eventIds = new Set<string>();
  for (const e of entries) {
    const s = sceneMap.get(e.sceneId);
    for (const id of s?.eventIds ?? []) eventIds.add(id);
  }
  const events = (fw.events ?? []).filter((e) => eventIds.has(e.id));
  if (events.length > 0) {
    parts.push(
      '当前事件：',
      ...events.map((ev) => `  - ${ev.id}：${ev.name}${ev.description ? '；描述：' + ev.description : ''}`)
    );
  }
  return parts.join('\n');
}

async function generateScenePassageText(
  fw: StoryFramework,
  scene: GameScene,
  ch: FrameworkChapter,
  sceneIndex: number,
  sceneMap: Map<string, GameScene>,
  apiKey: string,
  apiUrl: string,
  wordCount?: number
): Promise<string> {
  const rules = (fw.rules ?? []).map((r) => `- ${r}`).join('\n');
  const system = `你是一名文字冒险游戏编剧。请基于「场景概要（summary）」做“有限演义”扩写，生成可读的剧情正文。

输出必须包含三类内容：
1. 人物对话：角色之间的对白，用引号标出
2. 旁白：叙述者视角的交代与说明
3. 描写性文字：场景、动作、心理等细节描写

硬性约束（必须遵守）：
- 以 summary 的事实为主干，只能在其范围内做细节补全，不得改写核心事实。
- 不得新增 summary 未出现且上下文也未出现的关键设定（新人物、新地点、新组织、新事件主线、新世界观规则）。
- 允许补充少量过渡句、动作细节、情绪描写，但不得引入会改变剧情走向的新信息。
- 若 summary 信息不足，优先保守表达，不要臆造。

写作规则：${rules || '- 简洁有力，适合文字冒险'}

输出要求：纯正文，不要包含 [[链接]]，链接由系统自动添加。`;

  const ctx = fw.background ? `故事背景：${fw.background}\n\n` : '';
  const chapterCtx = buildChapterContext(fw, ch, sceneIndex, sceneMap);
  const user = `${ctx}${chapterCtx}

---

场景：${scene.id}（${scene.name}）
场景概要（最高优先级，必须严格围绕此内容扩写）：${scene.summary}
${scene.hints ? `写作提示：${scene.hints}` : ''}
${wordCount != null && wordCount > 0 ? `字数要求：约${wordCount}字` : ''}

请生成该场景的剧情正文（须包含人物对话、旁白、描写性文字；且仅做有限演义扩写）：`;

  const res = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {role: 'system', content: system},
        {role: 'user', content: user},
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 错误 ${res.status}: ${err}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('API 未返回正文');
  return content;
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
  const chapters = fw.chapters ?? [];
  if (chapters.length === 0) return null;
  const first = chapters[0];
  const firstChapterScenes = (first.sceneEntries ?? [])
    .map((entry) => (fw.scenes ?? []).find((s) => s.id === entry.sceneId))
    .filter((s): s is GameScene => !!s);
  if (firstChapterScenes.length === 0) return null;
  if (first.startMapNodeId) {
    const matched = firstChapterScenes.find((s) => s.mapNodeId === first.startMapNodeId);
    if (matched?.name) return matched.name;
  }
  return firstChapterScenes[0].name ?? null;
}

function getScenePassageLookupKeys(
  fw: StoryFramework,
  chapterIndex: number,
  sceneId: string
): string[] {
  const pid = toPassageId(chapterIndex, sceneId);
  const keys = [pid];
  const template = frameworkToStory(fw).passages.get(pid);
  if (template?.name) {
    const byName = normalizePassageKey(template.name);
    if (!keys.includes(byName)) keys.push(byName);
  }
  return keys;
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
      wordCount: entry.wordCount ?? null,
      sceneIndex,
    },
    scene: {
      id: scene.id,
      name: scene.name,
      summary: scene.summary,
      hints: scene.hints ?? '',
      mapNodeId: scene.mapNodeId ?? '',
      characterIds: scene.characterIds ?? [],
      eventIds: scene.eventIds ?? [],
      openingAnimation: scene.openingAnimation ?? '',
      backgroundMusic: scene.backgroundMusic ?? '',
      images: scene.images ?? [],
    },
    chapterContext: buildChapterContext(fw, ch, sceneIndex, sceneMap),
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
  removeSceneSubPassages(story, pid);
  const template = fullStory.passages.get(pid);
  if (!template) throw new Error(`未找到 passage 模板: ${pid}`);

  const meta = {...(template.metadata ?? {}), ...sceneAuthoritativeMetadata(scene, fw)};
  story.passages.set(pid, {
    ...template,
    id: pid,
    name: template.name ?? scene.name ?? pid,
    metadata: Object.keys(meta).length ? meta : undefined,
  });
  paginatePassageText(story, pid, sceneText, getPassagePageCharsMin(), getPassagePageCharsMax());

  story.metadata = {...(story.metadata ?? {}), ...(fullStory.metadata ?? {})};
  const startName = resolveStoryStartPassageName(fw);
  if (startName) story.startPassageId = startName;
}

async function compileSceneEntry(
  fw: StoryFramework,
  story: ReturnType<typeof parseTwee>,
  target: SceneCompileTarget,
  apiKey: string,
  apiUrl: string
): Promise<{ fw: StoryFramework; story: ReturnType<typeof parseTwee> }> {
  const {chapterIndex, sceneIndex} = target;
  const ch = fw.chapters[chapterIndex];
  const entry = ch.sceneEntries[sceneIndex];
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const scene = sceneMap.get(entry.sceneId);
  if (!scene) throw new Error(`未找到场景 ${entry.sceneId}`);

  const fp = getSceneEntryFingerprint(fw, ch, sceneIndex, sceneMap);
  if (!fp) throw new Error('无法计算版本指纹');

  const text = await generateScenePassageText(fw, scene, ch, sceneIndex, sceneMap, apiKey, apiUrl, entry.wordCount);
  applySceneTextToStory(story, frameworkToStory(fw), fw, scene, chapterIndex, text);
  return {
    fw: patchSceneEntry(fw, chapterIndex, sceneIndex, (e) => ({...e, compiledFingerprint: fp})),
    story,
  };
}

async function saveStoryTw(gameId: string, story: ReturnType<typeof parseTwee>): Promise<void> {
  const res = await fetch(getGameContentUrl(gameId), {
    method: 'PUT',
    headers: {'Content-Type': 'text/plain; charset=utf-8'},
    body: serializeStorySugarcube(story),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({error: res.statusText}));
    throw new Error((err as { error?: string }).error ?? '保存 story.tw 失败');
  }
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
  const [importCompileEnabled, setImportCompileEnabled] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [compileProgress, setCompileProgress] = useState<{ current: number; total: number; scene?: string } | null>(null);
  const importFileInputRef = React.useRef<HTMLInputElement>(null);
  const apiKey = getAIGCApiKey();
  const [generatingSceneKey, setGeneratingSceneKey] = useState<string | null>(null);
  const [editingSceneText, setEditingSceneText] = useState<Record<string, string>>({});
  const [loadingSceneTextKey, setLoadingSceneTextKey] = useState<string | null>(null);
  const [savingSceneTextKey, setSavingSceneTextKey] = useState<string | null>(null);
  const apiUrl = getAIGCApiUrl();
  const [frameworkFileHandle] = useState<FileSystemFileHandle | null>(null);

  useEffect(() => {
    preloadListData(updateFw, gameId);
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

  const toggleScene = (key: string) => {
    setExpandedScene((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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

  const handleSave = useCallback(async () => {
    try {
      await saveFrameworkToStorage(gameId, fw);
      setJsonError(null);
      addNotification('info', '保存成功');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setJsonError((e as Error).message);
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
    setIsImporting(true);
    setCompileProgress(null);
    try {
      if (!import.meta.env.DEV) throw new Error('导入游戏文件仅支持开发模式');
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
              const result = await compileSceneEntry(nextFw, story, t, key, apiUrl);
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
        }
      } else {
        setJsonError(null);
        if (importCompileEnabled) addNotification('info', '导入成功；未检测到需要编译的变更场景');
        else addNotification('info', '导入成功');
      }

      updateFw(() => nextFw);
      setImportConfirmOpen(false);
      setImportPendingData(null);
      setImportCompileEnabled(true);
      setCompileProgress(null);
    } catch (e) {
      setJsonError((e as Error).message);
    } finally {
      setCompileProgress(null);
      setIsImporting(false);
    }
  }, [apiKey, apiUrl, importPendingData, importGameIdInput, importCompileEnabled, updateFw, addNotification, refetchGameIds, setGameId]);

  const handleImportCancel = useCallback(() => {
    if (isImporting) return;
    setImportConfirmOpen(false);
    setImportPendingData(null);
    setImportGameIdInput('');
    setImportGameIdError(null);
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

  const handleExportBundle = useCallback(async () => {
    try {
      const contentUrl = getGameContentUrl(gameId);
      const res = await fetch(contentUrl);
      if (!res.ok) throw new Error(`读取剧情失败: ${res.status}`);
      const raw = await res.text();
      const story = parseTwee(raw);
      const bundle = storyToBundle(story, {storyId: gameId});
      const text = formatJsonCompact(bundle);

      const putRes = await fetch(getStoryBundleFetchUrl(gameId), {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: text,
      });
      const putData = (await putRes.json()) as { ok?: boolean; error?: string };
      if (!putRes.ok || !putData.ok) {
        throw new Error(putData.error || `保存 Bundle 失败: ${putRes.status}`);
      }

      const blob = new Blob([text], {type: 'application/json'});
      const filename = 'story_bundle.json';
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
      setJsonError(null);
      addNotification('info', 'Bundle 导出成功');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setJsonError((e as Error).message);
    }
  }, [gameId, addNotification]);

  const handleGenerateScene = useCallback(
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
      const key = apiKey?.trim();
      if (!key) {
        alert('请配置 VITE_AIGC_API_KEY 或 VITE_OPENAI_API_KEY');
        return;
      }
      if (!import.meta.env.DEV) {
        alert('生成游戏需要开发模式，当前为生产环境。');
        return;
      }
      const sk = `${chi}-${si}`;
      setGeneratingSceneKey(sk);
      setJsonError(null);
      const contentUrl = getGameContentUrl(gameId);
      try {
        const res = await fetch(contentUrl);
        const raw = res.ok ? await res.text() : '';
        let story = parseTwee(raw);
        const result = await compileSceneEntry(fw, story, {chapterIndex: chi, sceneIndex: si}, key, apiUrl);
        await saveStoryTw(gameId, result.story);
        updateFw(() => result.fw);
        await saveFrameworkToStorage(gameId, result.fw);
      } catch (e) {
        setJsonError((e as Error).message);
      } finally {
        setGeneratingSceneKey(null);
      }
    },
    [fw, apiKey, apiUrl, gameId, sceneMap, updateFw]
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
        const passage = lookupKeys.map((k) => story.passages.get(k)).find((p) => !!p);
        const fallback = sceneMap.get(entry.sceneId)?.summary ?? '';
        setEditingSceneText((prev) => ({
          ...prev,
          [entryKey]: passage?.text ?? fallback,
        }));
        if (!passage) addNotification('info', '未找到已有正文，已载入该场景 summary 作为编辑初稿');
      } catch (e) {
        setJsonError((e as Error).message || '读取正文失败');
      } finally {
        setLoadingSceneTextKey(null);
      }
    },
    [fw, gameId, sceneMap, addNotification]
  );

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
        const existingKey = lookupKeys.find((k) => story.passages.has(k));
        const existing = existingKey ? story.passages.get(existingKey) : undefined;
        if (existing && existingKey) {
          story.passages.set(existingKey, {...existing, text});
        } else {
          const template = frameworkToStory(fw).passages.get(pid);
          if (!template) throw new Error(`未找到场景 passage 模板: ${pid}`);
          const canonicalKey = normalizePassageKey(template.name || pid);
          story.passages.set(canonicalKey, {
            ...template,
            id: canonicalKey,
            name: template.name ?? scene?.name ?? pid,
            text,
          });
        }
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
          <button type="button" style={styles.btn} onClick={handleImportClick}>
            导入
          </button>
          <button type="button" style={styles.btn} onClick={handleExport}>
            导出
          </button>
          <button type="button" style={styles.btn} onClick={handleExportBundle}>
            导出 Bundle
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
              识别到压缩包顶层目录为 {importPendingData?.sourceGameId}。你可以修改导入目标游戏ID（保存目录名），导入时会重建目标目录（共 {importPendingData?.files.length ?? 0} 个文件）。
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
            scenes={fw.scenes ?? []}
            mapNodeIds={mapNodeIds}
            ruleList={(fw.gameRules ?? []).map((r) => ({id: r.id, name: r.name}))}
            expandedCh={expandedCh}
            expandedEntry={expandedScene}
            toggleCh={toggleCh}
            toggleEntry={toggleScene}
            updateFw={updateFwWithErrorReset}
            onGenerateScene={(si) => handleGenerateScene(chi, si)}
            generatingEntry={generatingSceneKey}
            sceneTextDrafts={editingSceneText}
            loadingSceneTextKey={loadingSceneTextKey}
            savingSceneTextKey={savingSceneTextKey}
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
  scenes,
  mapNodeIds,
  ruleList,
  expandedCh,
  expandedEntry,
  toggleCh,
  toggleEntry,
  updateFw,
  onGenerateScene,
  generatingEntry,
  sceneTextDrafts,
  loadingSceneTextKey,
  savingSceneTextKey,
  onSceneTextDraftChange,
  onLoadSceneText,
  onSaveSceneText,
}: {
  ch: FrameworkChapter;
  chi: number;
  scenes: GameScene[];
  mapNodeIds: Array<{ id: string; name: string; mapName: string }>;
  ruleList: Array<{ id: string; name: string }>;
  expandedCh: Set<string>;
  expandedEntry: Set<string>;
  toggleCh: (id: string) => void;
  toggleEntry: (key: string) => void;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
  onGenerateScene: (si: number) => void;
  generatingEntry: string | null;
  sceneTextDrafts: Record<string, string>;
  loadingSceneTextKey: string | null;
  savingSceneTextKey: string | null;
  onSceneTextDraftChange: (entryKey: string, value: string) => void;
  onLoadSceneText: (si: number) => void;
  onSaveSceneText: (si: number) => void;
}) {
  const isExpanded = expandedCh.has(ch.id);
  const entries = ch.sceneEntries ?? [];
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));

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

  const updateScene = (sceneId: string, fn: (s: GameScene) => GameScene) => {
    updateFw((d) => ({
      ...d,
      scenes: (d.scenes ?? []).map((s) => (s.id === sceneId ? fn(s) : s)),
    }));
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
            <label style={styles.label}>标题</label>
            <input
              type="text"
              value={ch.title}
              onChange={(e) =>
                updateChapter((c) => ({...c, title: e.target.value}))
              }
              style={{...styles.input, flex: 1}}
              placeholder="章节标题"
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
            <label style={styles.label}>起点（地图节点）</label>
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
          </div>
          <div style={styles.row}>
            <label style={styles.label}>终点（地图节点）</label>
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
            const entryKey = `${chi}-${si}`;
            const isEntryExpanded = expandedEntry.has(entryKey);
            const isGenerating = generatingEntry === entryKey;
            const isLoadingText = loadingSceneTextKey === entryKey;
            const isSavingText = savingSceneTextKey === entryKey;
            const textDraft = sceneTextDrafts[entryKey] ?? scene?.summary ?? '';
            return (
              <div key={entryKey} style={styles.scene}>
                <div
                  style={styles.sceneHead}
                  onClick={() => toggleEntry(entryKey)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && toggleEntry(entryKey)}
                >
                  <span style={styles.sceneTitle}>
                    {isEntryExpanded ? '▼' : '▶'} {scene?.name ?? entry.sceneId}
                  </span>
                  <div onClick={(ev) => ev.stopPropagation()} style={{display: 'flex', gap: 4}}>
                    <button
                      type="button"
                      style={{
                        ...styles.btnSmall,
                        ...(isGenerating ? {opacity: 0.6} : {}),
                      }}
                      onClick={() => onGenerateScene(si)}
                      disabled={isGenerating}
                      title="生成该场景的剧情正文"
                    >
                      {isGenerating ? '生成中...' : '生成游戏'}
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
                    <div style={styles.row}>
                      <label style={styles.label}>场景 summary（存于 story-scenes.json）</label>
                      <textarea
                        value={scene?.summary ?? ''}
                        onChange={(e) => {
                          if (!scene) return;
                          updateScene(scene.id, (s0) => ({...s0, summary: e.target.value}));
                        }}
                        placeholder="该场景的事实性概要（人物、地点、事件、情绪、关键台词）"
                        style={{...styles.input, ...styles.textarea, minHeight: 90}}
                      />
                    </div>
                    <div style={styles.row}>
                      <label style={styles.label}>生成正文（story.tw passage，可手动覆盖）</label>
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
                        placeholder="可手动编辑该场景在 story.tw 中的正文内容"
                        style={{...styles.input, ...styles.textarea, minHeight: 170}}
                      />
                    </div>
                    <div style={styles.row}>
                      <label style={styles.label}>字数</label>
                      <input
                        type="number"
                        min={1}
                        value={entry.wordCount ?? ''}
                        onChange={(e) => {
                          const v = e.target.valueAsNumber;
                          updateEntry(si, (e0) => ({
                            ...e0,
                            wordCount: Number.isFinite(v) && v > 0 ? v : undefined,
                          }));
                        }}
                        placeholder="如：500（留空则不限制）"
                        style={{...styles.input, flex: 1}}
                      />
                    </div>
                    <RuleIdsSelector
                      ruleList={ruleList}
                      value={entry.ruleIds ?? []}
                      onChange={(ids) =>
                        updateEntry(si, (e0) => ({
                          ...e0,
                          ruleIds: ids.length ? ids : undefined,
                        }))
                      }
                      label="规则"
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
    maxWidth: 520,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    cursor: 'pointer',
    fontSize: 13,
    color: '#a78bfa',
  },
  sceneTitle: {fontSize: 14},
  sceneBody: {padding: '8px 0 0 0'},
  linksHead: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8},
  linkRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
};
