/**
 * 剧情界面（原时间线）
 */

import React, {useCallback, useEffect, useState} from 'react';
import type {FrameworkChapter, SceneEntry, StoryFramework} from '../schema/story-framework';
import {flattenSceneEntries, fromPersistedFramework, migrateFramework, toPersistedFramework, toPassageId, validateFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {GameCharacter} from '../schema/game-character';
import type {GameMap} from '../schema/game-map';
import type {GameEvent} from '../schema/game-event';
import type {GameItem} from '../schema/game-item';
import type {GameMetadata} from '../schema/metadata';
import {getAIGCApiKey, getAIGCApiUrl, getCharactersFetchUrl, getScenesFetchUrl, getMapsFetchUrl, getEventsFetchUrl, getItemsFetchUrl, getMetadataFetchUrl, getRulesFetchUrl, getStoryFmFetchUrl, getGameContentUrl, getPassagePageCharsMin, getPassagePageCharsMax} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useNotification} from '@/context/NotificationContext';
import {useAuth} from '@/context/AuthContext';
import {frameworkToStory, parseTwee, serializeStorySugarcube} from '@/engine';

import {formatJsonCompact} from '../utils/json-format';
import {paginatePassageText, removeSceneSubPassages} from '../utils/paginate-passage';
import {RuleIdsSelector} from './ui/RuleIdsSelector';

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

async function preloadListData(
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void,
  gameId: string
): Promise<void> {
  const updates: Array<(d: StoryFramework) => StoryFramework> = [];
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
          updates.push((d) => ({...d, [key]: parsed}));
        }
      }
    } catch {
      // 忽略加载失败
    }
  }
  if (updates.length > 0) {
    updateFw((d) => updates.reduce((acc, fn) => fn(acc), d));
  }
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
  const system = `你是一名文字冒险游戏编剧。根据「剧情概要」与上下文生成一段可读的剧情正文。

输出必须包含三类内容：
1. 人物对话：角色之间的对白，用引号标出
2. 旁白：叙述者视角的交代与说明
3. 描写性文字：场景、动作、心理等细节描写

规则：${rules || '- 简洁有力，适合文字冒险'}

输出要求：纯正文，不要包含 [[链接]]，链接由系统自动添加。`;

  const ctx = fw.background ? `故事背景：${fw.background}\n\n` : '';
  const chapterCtx = buildChapterContext(fw, ch, sceneIndex, sceneMap);
  const user = `${ctx}${chapterCtx}

---

场景：${scene.id}（${scene.name}）
概要：${scene.summary}
${scene.hints ? `写作提示：${scene.hints}` : ''}
${wordCount != null && wordCount > 0 ? `字数要求：约${wordCount}字` : ''}

请生成该场景的剧情正文（须包含人物对话、旁白、描写性文字）：`;

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
      temperature: 0.7,
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
  const [importPendingData, setImportPendingData] = useState<Record<string, unknown> | null>(null);
  const importFileInputRef = React.useRef<HTMLInputElement>(null);
  const apiKey = getAIGCApiKey();
  const [generatingSceneKey, setGeneratingSceneKey] = useState<string | null>(null);
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
  flattenSceneEntries(fw);
  const mapNodeIds: Array<{ id: string; name: string; mapName: string }> = [];
  for (const map of fw.maps ?? []) {
    for (const n of map.nodes) mapNodeIds.push({id: n.id, name: n.name, mapName: map.name});
  }
  const characterIds = (fw.characters ?? []).map((c) => ({id: c.id, name: c.name}));
  const eventIds = (fw.events ?? []).map((e) => ({id: e.id, name: e.name}));
  const items = fw.items ?? [];
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
      const url = getStoryFmFetchUrl(gameId);
      const res = await fetch(url, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(toPersistedFramework(fw)),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setJsonError(data.error || `保存失败: ${res.status}`);
        return;
      }
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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          const parsed = JSON.parse(text) as Record<string, unknown>;
          if (!parsed || typeof parsed !== 'object') throw new Error('无效的 JSON');
          setImportPendingData(parsed);
          setImportConfirmOpen(true);
        } catch (err) {
          setJsonError((err as Error).message ?? '解析文件失败');
        }
      };
      reader.onerror = () => setJsonError('读取文件失败');
      reader.readAsText(file);
    },
    []
  );

  const handleImportConfirm = useCallback(async () => {
    if (!importPendingData) return;
    try {
      const url = getStoryFmFetchUrl(gameId);
      const body = formatJsonCompact(importPendingData);
      const res = await fetch(url, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setJsonError(data.error || `导入失败: ${res.status}`);
        return;
      }
      migrateFramework(importPendingData as unknown as StoryFramework);
      updateFw((d) => ({...d, ...fromPersistedFramework(importPendingData)}));
      setJsonError(null);
      setImportConfirmOpen(false);
      setImportPendingData(null);
      addNotification('info', '导入成功');
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, [gameId, importPendingData, updateFw, addNotification]);

  const handleImportCancel = useCallback(() => {
    setImportConfirmOpen(false);
    setImportPendingData(null);
  }, []);

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
        const text = await generateScenePassageText(fw, scene, ch, si, sceneMap, key, apiUrl, entry.wordCount);
        const fullStory = frameworkToStory(fw);
        const story = parseTwee(raw);
        const pid = toPassageId(chi, entry.sceneId);
        const oldPid = `ch${chi}_${entry.sceneId}`;
        removeSceneSubPassages(story, pid);
        removeSceneSubPassages(story, oldPid);
        const template = fullStory.passages.get(pid);
        const nameId = scene.name.trim().replace(/\s+/g, '_');
        const minC = getPassagePageCharsMin();
        const maxC = getPassagePageCharsMax();
        let existing = story.passages.get(pid) ?? story.passages.get(oldPid) ?? story.passages.get(nameId);
        if (existing) {
          existing.links = template?.links ?? existing.links;
          const baseMeta = { ...existing.metadata } as Record<string, unknown>;
          if (template?.metadata) Object.assign(baseMeta, template.metadata);
          Object.assign(baseMeta, sceneAuthoritativeMetadata(scene, fw));
          existing.metadata = Object.keys(baseMeta).length ? baseMeta : undefined;
          existing = { ...existing, id: pid, name: template?.name ?? scene.name ?? pid };
          story.passages.set(pid, existing);
          story.passages.delete(oldPid);
          if (nameId !== pid) story.passages.delete(nameId);
          paginatePassageText(story, pid, text, minC, maxC);
        } else if (template) {
          template.text = text;
          const baseMeta = { ...(template.metadata ?? {}) } as Record<string, unknown>;
          Object.assign(baseMeta, sceneAuthoritativeMetadata(scene, fw));
          template.metadata = Object.keys(baseMeta).length ? baseMeta : undefined;
          story.passages.set(pid, template);
          paginatePassageText(story, pid, text, minC, maxC);
        }
        story.metadata = { ...(story.metadata ?? {}), ...(fullStory.metadata ?? {}) };
        // StoryData start：本章「起点（地图节点）」对应的场景名称
        const startMapNodeId = ch.startMapNodeId;
        if (startMapNodeId) {
          for (const e of ch.sceneEntries ?? []) {
            const sc = sceneMap.get(e.sceneId);
            if (sc?.mapNodeId === startMapNodeId) {
              story.startPassageId = sc.name;
              break;
            }
          }
        }
        const twee = serializeStorySugarcube(story);
        const putRes = await fetch(contentUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body: twee,
        });
        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({ error: putRes.statusText }));
          throw new Error((err as { error?: string }).error ?? '保存失败');
        }
      } catch (e) {
        setJsonError((e as Error).message);
      } finally {
        setGeneratingSceneKey(null);
      }
    },
    [fw, apiKey, apiUrl, gameId, sceneMap]
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
        </div>
      </header>
      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
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
              确认覆盖已有游戏{gameId}吗？
            </p>
            <div style={styles.modalActions}>
              <button type="button" style={styles.btn} onClick={() => checkAuthForSave(handleImportConfirm)}>
                确认
              </button>
              <button type="button" style={styles.btn} onClick={handleImportCancel}>
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
          />
        ))}
      </section>

      {jsonError && (
        <div style={styles.errors}>
          <div style={styles.errorItem}>{jsonError}</div>
        </div>
      )}
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
