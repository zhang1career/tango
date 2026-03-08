/**
 * 时间线界面
 */

import React, { useState, useCallback, useEffect } from 'react';
import type {
  StoryFramework,
  FrameworkChapter,
  FrameworkScene,
  FrameworkLink,
} from '../schema/story-framework';
import type { GameCharacter } from '../schema/game-character';
import type { GameMap } from '../schema/game-map';
import type { GameEvent } from '../schema/game-event';
import type { GameItem } from '../schema/game-item';
import type { GameMetadata } from '../schema/metadata';
import { validateFramework, flattenScenes } from '../schema/story-framework';
import { AttributesEditorCard } from './cards/AttributesEditorCard';
import { ItemsEditorCard } from './cards/ItemsEditorCard';
import { getAIGCApiKey, getAIGCApiUrl } from '../config';
import { parseTwee, serializeStory, frameworkToStory } from '../engine';

import { formatJsonCompact } from '../utils/json-format';

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
    <button type="button" style={{ ...baseStyle, ...styles.fileHandleBtn }} onClick={onClick}>
      <span>{label}</span>
      {fileHandle && (
        <span style={styles.fileHandleBtnPath}>{truncatePathForDisplay(fileHandle.name)}</span>
      )}
    </button>
  );
}

async function preloadListData(
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void
): Promise<void> {
  const updates: Array<(d: StoryFramework) => StoryFramework> = [];
  const apis = [
    { url: '/api/story-characters', parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameCharacter[] },
    { url: '/api/save-story-maps', parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameMap[] },
    { url: '/api/story-events', parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameEvent[] },
    { url: '/api/story-items', parse: (d: unknown) => (Array.isArray(d) ? d : []) as GameItem[] },
    { url: '/api/story-metadata', parse: (d: unknown) => { const m = d as { characterAttributes?: unknown }; return m?.characterAttributes ? ({ characterAttributes: m.characterAttributes } as GameMetadata) : undefined; } },
  ];
  const keys: (keyof StoryFramework)[] = ['characters', 'maps', 'events', 'items', 'metadata'];
  for (let i = 0; i < apis.length; i++) {
    const { url, parse } = apis[i];
    const key = keys[i];
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const parsed = parse(data);
        if (parsed !== undefined && parsed !== null) {
          updates.push((d) => ({ ...d, [key]: parsed }));
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

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([formatJsonCompact(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildChapterContext(
  fw: StoryFramework,
  ch: FrameworkChapter,
  sceneIndex: number
): string {
  const parts: string[] = [];
  parts.push(`章节标题：${ch.title}`);
  if (ch.theme) parts.push(`章节主题：${ch.theme}`);
  const prev = ch.scenes.slice(0, sceneIndex);
  if (prev.length > 0) {
    parts.push(
      '前序场景概要：',
      ...prev.map((s) => `  - ${s.id}：${s.summary}`)
    );
  }
  const charIds = new Set<string>();
  for (const s of ch.scenes) {
    for (const id of s.characterIds ?? []) charIds.add(id);
  }
  const chars = (fw.characters ?? []).filter((c) => charIds.has(c.id));
  if (chars.length > 0) {
    parts.push(
      '人物介绍：',
      ...chars.map((c) => `  - ${c.id}（${c.name}）：${c.description ?? '无描述'}`)
    );
  }
  const eventIds = new Set<string>();
  for (const s of ch.scenes) {
    for (const id of s.eventIds ?? []) eventIds.add(id);
  }
  const events = (fw.events ?? []).filter((e) => eventIds.has(e.id));
  if (events.length > 0) {
    parts.push(
      '当前事件：',
      ...events.map((e) => `  - ${e.id}：${e.name}`)
    );
  }
  return parts.join('\n');
}

async function generateScenePassageText(
  fw: StoryFramework,
  scene: FrameworkScene,
  ch: FrameworkChapter,
  sceneIndex: number,
  apiKey: string,
  apiUrl: string
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
  const chapterCtx = buildChapterContext(fw, ch, sceneIndex);
  const user = `${ctx}${chapterCtx}

---

场景：${scene.id}
概要：${scene.summary}
${scene.hints ? `写作提示：${scene.hints}` : ''}

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
        { role: 'system', content: system },
        { role: 'user', content: user },
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
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [expandedCh, setExpandedCh] = useState<Set<string>>(new Set());
  const [expandedScene, setExpandedScene] = useState<Set<string>>(new Set());
  const apiKey = getAIGCApiKey();
  const [generatingCh, setGeneratingCh] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const apiUrl = getAIGCApiUrl();
  const [twFileHandle, setTwFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [frameworkFileHandle, setFrameworkFileHandle] = useState<FileSystemFileHandle | null>(null);

  useEffect(() => {
    preloadListData(updateFw);
  }, [updateFw]);

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

  const sceneIds = new Set(flattenScenes(fw).map((s) => s.id));
  const mapNodeIds: Array<{ id: string; name: string; mapName: string }> = [];
  for (const map of fw.maps ?? []) {
    for (const n of map.nodes) mapNodeIds.push({ id: n.id, name: n.name, mapName: map.name });
  }
  const characterIds = (fw.characters ?? []).map((c) => ({ id: c.id, name: c.name }));
  const eventIds = (fw.events ?? []).map((e) => ({ id: e.id, name: e.name }));
  const attributeDefs = fw.metadata?.characterAttributes ?? [];
  const items = fw.items ?? [];
  const { valid, errors } = validateFramework(fw);

  const getFilePicker = () =>
    (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>; showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> });

  const handleNew = useCallback(() => {
    updateFw(() => ({
      title: '未命名故事',
      chapters: [{ id: 'ch0', title: '第一章', scenes: [] }],
    }));
    setFrameworkFileHandle(null);
    setJsonError(null);
  }, [updateFw]);

  const handleOpen = useCallback(async () => {
    try {
      const [handle] = (await getFilePicker().showOpenFilePicker?.({
        types: [{ accept: { 'application/json': ['.json'] }, description: 'JSON 文件' }],
        multiple: false,
      }) ?? []) as FileSystemFileHandle[];
      if (!handle) return;
      const file = await handle.getFile();
      const text = await file.text();
      const parsed = JSON.parse(text) as StoryFramework;
      if (!parsed.title) parsed.title = '未命名故事';
      if (!parsed.chapters?.length) parsed.chapters = [{ id: 'ch0', title: '第一章', scenes: [] }];
      updateFw(() => parsed);
      setFrameworkFileHandle(handle);
      setJsonError(null);
      await preloadListData(updateFw);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setJsonError((e as Error).message);
    }
  }, [updateFw]);

  const handleSave = useCallback(async () => {
    try {
      let handle = frameworkFileHandle;
      if (!handle) {
        const h = await getFilePicker().showSaveFilePicker?.({
          suggestedName: 'story-framework.json',
          types: [{ accept: { 'application/json': ['.json'] }, description: 'JSON 文件' }],
        });
        if (!h) return;
        handle = h as FileSystemFileHandle;
        setFrameworkFileHandle(handle);
      }
      const w = await handle.createWritable();
      await w.write(formatJsonCompact(fw));
      await w.close();
      setJsonError(null);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setJsonError((e as Error).message);
    }
  }, [fw, frameworkFileHandle]);

  const handleGenerateAllChapters = useCallback(async () => {
    const key = apiKey?.trim();
    if (!key) {
      alert('请配置 VITE_AIGC_API_KEY 或 VITE_OPENAI_API_KEY');
      return;
    }
    const scenes = flattenScenes(fw);
    if (!scenes.length) {
      alert('当前没有任何场景');
      return;
    }
    let handle = twFileHandle;
    if (!handle) {
      try {
        const [h] = (await (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker?.({
          types: [{ accept: { 'text/plain': ['.tw', '.twee'] }, description: 'Twee 故事文件' }],
          multiple: false,
          mode: 'readwrite',
        }) ?? []) as FileSystemFileHandle[];
        if (!h) {
          alert('请选择要写入的 .tw 文件');
          return;
        }
        handle = h;
        setTwFileHandle(h);
      } catch {
        setJsonError('无法选择文件（需要支持 File System Access API 的浏览器）');
        return;
      }
    }
    setGeneratingAll(true);
    setJsonError(null);
    try {
      const textMap = new Map<string, string>();
      for (const ch of fw.chapters) {
        for (let si = 0; si < ch.scenes.length; si++) {
          const scene = ch.scenes[si];
          const text = await generateScenePassageText(fw, scene, ch, si, key, apiUrl);
          textMap.set(scene.id, text);
        }
      }
      const story = frameworkToStory(fw);
      for (const [, p] of story.passages) {
        const newText = textMap.get(p.id) ?? textMap.get(p.name);
        if (newText != null) p.text = newText;
      }
      const twee = serializeStory(story);
      const w = await handle.createWritable();
      await w.write(twee);
      await w.close();
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    } finally {
      setGeneratingAll(false);
    }
  }, [fw, apiKey, apiUrl, twFileHandle]);

  const handleGenerateChapter = useCallback(
    async (chi: number) => {
      const ch = fw.chapters[chi];
      if (!ch?.scenes?.length) {
        alert('该章节没有场景');
        return;
      }
      const key = apiKey?.trim();
      if (!key) {
        alert('请配置 VITE_AIGC_API_KEY 或 VITE_OPENAI_API_KEY');
        return;
      }
      let handle = twFileHandle;
      if (!handle) {
        try {
          const [h] = await (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker?.({
            types: [{ accept: { 'text/plain': ['.tw', '.twee'] }, description: 'Twee 故事文件' }],
            multiple: false,
            mode: 'readwrite',
          }) ?? [];
          if (!h) {
            alert('请选择要覆盖的 .tw 文件');
            return;
          }
          handle = h;
          setTwFileHandle(h);
        } catch {
          alert('请先选择要覆盖的 .tw 文件（需支持 File System Access API 的浏览器）');
          return;
        }
      }
      setGeneratingCh(ch.id);
      setJsonError(null);
      try {
        const textMap = new Map<string, string>();
        for (let si = 0; si < ch.scenes.length; si++) {
          const scene = ch.scenes[si];
          const text = await generateScenePassageText(fw, scene, ch, si, key, apiUrl);
          textMap.set(scene.id, text);
        }
        const fullStory = frameworkToStory(fw);
        const file = await handle.getFile();
        const raw = await file.text();
        const story = parseTwee(raw);
        const normalizedSceneIds = new Set(
          ch.scenes.map((s) => s.id.trim().replace(/\s+/g, '_'))
        );
        for (const [, p] of story.passages) {
          if (normalizedSceneIds.has(p.id) || normalizedSceneIds.has(p.name)) {
            const newText = textMap.get(p.id) ?? textMap.get(p.name);
            if (newText != null) p.text = newText;
            const canon = fullStory.passages.get(p.id) ?? fullStory.passages.get(p.name);
            if (canon?.links?.length) p.links = canon.links;
          }
        }
        for (const scene of ch.scenes) {
          const nid = scene.id.trim().replace(/\s+/g, '_');
          if (!story.passages.has(nid)) {
            const newP = fullStory.passages.get(nid);
            if (newP) {
              newP.text = textMap.get(scene.id) ?? scene.summary;
              story.passages.set(nid, newP);
            }
          }
        }
        const twee = serializeStory(story);
        const w = await handle.createWritable();
        await w.write(twee);
        await w.close();
      } catch (e) {
        setJsonError((e as Error).message);
      } finally {
        setGeneratingCh(null);
      }
    },
    [fw, apiKey, apiUrl, twFileHandle]
  );

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>时间线</h1>
        <div style={styles.actions}>
          <button type="button" style={styles.btn} onClick={handleNew}>
            新建
          </button>
          <FileHandleButton label="打开" fileHandle={frameworkFileHandle} onClick={handleOpen} />
          <FileHandleButton label="保存" fileHandle={frameworkFileHandle} onClick={handleSave} />
          <button
            type="button"
            style={{
              ...styles.btnGenerate,
              ...(generatingAll || !flattenScenes(fw).length ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
            onClick={handleGenerateAllChapters}
            disabled={generatingAll || !flattenScenes(fw).length}
            title="AI 生成全部章节的剧情正文并写入 .tw 文件"
          >
            {generatingAll ? '生成中...' : '生成全部剧情'}
          </button>
          {twFileHandle && (
            <span style={styles.fileHandleBtnPath}>{truncatePathForDisplay(twFileHandle.name)}</span>
          )}
        </div>
      </header>

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
          onChange={(e) => updateFwWithErrorReset((d) => ({ ...d, playerCharacterId: e.target.value || undefined }))}
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
          onChange={(e) => updateFwWithErrorReset((d) => ({ ...d, title: e.target.value }))}
          style={styles.input}
          placeholder="河阴的余晖"
        />
      </section>

      <section style={styles.section}>
        <label style={styles.label}>背景设定</label>
        <textarea
          value={fw.background ?? ''}
          onChange={(e) => updateFwWithErrorReset((d) => ({ ...d, background: e.target.value || undefined }))}
          style={{ ...styles.input, ...styles.textarea, minHeight: 60 }}
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
          style={{ ...styles.input, ...styles.textarea, minHeight: 60 }}
          placeholder="使用第二人称..."
        />
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHead}>
          <label style={styles.label}>章节</label>
          <button
            type="button"
            style={styles.btnSmall}
            onClick={() =>
              updateFwWithErrorReset((d) => ({
                ...d,
                chapters: [
                  ...d.chapters,
                  { id: `ch${d.chapters.length}`, title: `第${d.chapters.length + 1}章`, scenes: [] },
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
            sceneIds={sceneIds}
            mapNodeIds={mapNodeIds}
            characterIds={characterIds}
            eventIds={eventIds}
            attributeDefs={attributeDefs}
            items={items}
            expandedCh={expandedCh}
            expandedScene={expandedScene}
            toggleCh={toggleCh}
            toggleScene={toggleScene}
            updateFw={updateFwWithErrorReset}
            onGenerate={() => handleGenerateChapter(chi)}
            isGenerating={generatingCh === ch.id}
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
  sceneIds,
  mapNodeIds,
  characterIds,
  eventIds,
  attributeDefs,
  items,
  expandedCh,
  expandedScene,
  toggleCh,
  toggleScene,
  updateFw,
  onGenerate,
  isGenerating,
}: {
  ch: FrameworkChapter;
  chi: number;
  sceneIds: Set<string>;
  mapNodeIds: Array<{ id: string; name: string; mapName: string }>;
  characterIds: Array<{ id: string; name: string }>;
  eventIds: Array<{ id: string; name: string }>;
  attributeDefs: import('../schema/metadata').CharacterAttributeDef[];
  items: import('../schema/game-item').GameItem[];
  expandedCh: Set<string>;
  expandedScene: Set<string>;
  toggleCh: (id: string) => void;
  toggleScene: (key: string) => void;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  const isExpanded = expandedCh.has(ch.id);

  return (
    <div style={styles.chapter}>
      <div style={styles.chapterHead} onClick={() => toggleCh(ch.id)}>
        <span style={styles.chapterTitle}>
          {isExpanded ? '▼' : '▶'} {ch.id}
        </span>
        <div style={styles.chapterHeadRight} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            style={{
              ...styles.btnGenerate,
              ...(isGenerating || !ch.scenes.length ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
            onClick={onGenerate}
            disabled={isGenerating || !ch.scenes.length}
            title="AI 生成该章节各场景的剧情正文到 .tw 文件"
          >
            {isGenerating ? '生成中...' : '生成剧情'}
          </button>
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
                updateFw((d) => ({
                  ...d,
                  chapters: d.chapters.map((c, i) =>
                    i === chi ? { ...c, title: e.target.value } : c
                  ),
                }))
              }
              style={{ ...styles.input, flex: 1 }}
              placeholder="章节标题"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>主题</label>
            <input
              type="text"
              value={ch.theme ?? ''}
              onChange={(e) =>
                updateFw((d) => ({
                  ...d,
                  chapters: d.chapters.map((c, i) =>
                    i === chi ? { ...c, theme: e.target.value || undefined } : c
                  ),
                }))
              }
              style={{ ...styles.input, flex: 1 }}
              placeholder="章节主题"
            />
          </div>

          <div style={styles.scenesHead}>
            <span>场景</span>
            <button
              type="button"
              style={styles.btnSmall}
              onClick={() =>
                updateFw((d) => ({
                  ...d,
                  chapters: d.chapters.map((c, i) =>
                    i === chi
                      ? {
                          ...c,
                          scenes: [
                            ...c.scenes,
                            {
                              id: `scene_${Date.now()}`,
                              summary: '',
                              links: [],
                            },
                          ],
                        }
                      : c
                  ),
                }))
              }
            >
              + 添加场景
            </button>
          </div>

          {ch.scenes.map((scene, si) => (
            <SceneBlock
              key={`${chi}-${si}`}
              scene={scene}
              chi={chi}
              si={si}
              sceneIds={sceneIds}
              mapNodeIds={mapNodeIds}
              characterIds={characterIds}
              eventIds={eventIds}
              attributeDefs={attributeDefs}
              items={items}
              expandedScene={expandedScene}
              toggleScene={toggleScene}
              updateFw={updateFw}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SceneBlock({
  scene,
  chi,
  si,
  sceneIds,
  mapNodeIds,
  characterIds,
  eventIds,
  attributeDefs,
  items,
  expandedScene,
  toggleScene,
  updateFw,
}: {
  scene: FrameworkScene;
  chi: number;
  si: number;
  sceneIds: Set<string>;
  mapNodeIds: Array<{ id: string; name: string; mapName: string }>;
  characterIds: Array<{ id: string; name: string }>;
  eventIds: Array<{ id: string; name: string }>;
  attributeDefs: import('../schema/metadata').CharacterAttributeDef[];
  items: import('../schema/game-item').GameItem[];
  expandedScene: Set<string>;
  toggleScene: (key: string) => void;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const sceneKey = `${chi}-${si}`;
  const isExpanded = expandedScene.has(sceneKey);

  const updateScene = (fn: (s: FrameworkScene) => FrameworkScene) =>
    updateFw((d) => ({
      ...d,
      chapters: d.chapters.map((c, i) =>
        i === chi ? { ...c, scenes: c.scenes.map((s, j) => (j === si ? fn(s) : s)) } : c
      ),
    }));

  return (
    <div style={styles.scene}>
      <div style={styles.sceneHead} onClick={() => toggleScene(sceneKey)}>
        <span style={styles.sceneTitle}>{isExpanded ? '▼' : '▶'} {scene.id}</span>
        <button
          type="button"
          style={styles.btnIcon}
          onClick={(e) => {
            e.stopPropagation();
            updateFw((d) => ({
              ...d,
              chapters: d.chapters.map((c, i) =>
                i === chi ? { ...c, scenes: c.scenes.filter((_, j) => j !== si) } : c
              ),
            }));
          }}
          title="删除场景"
        >
          ×
        </button>
      </div>

      {isExpanded && (
        <div style={styles.sceneBody}>
          <div style={styles.row}>
            <label>ID</label>
            <input
              type="text"
              value={scene.id}
              onChange={(e) => updateScene((s) => ({ ...s, id: e.target.value }))}
              style={styles.input}
              placeholder="唯一 id，用作 passage 名"
            />
          </div>
          <div style={styles.row}>
            <label>概要</label>
            <textarea
              value={scene.summary}
              onChange={(e) => updateScene((s) => ({ ...s, summary: e.target.value }))}
              style={{ ...styles.input, ...styles.textarea, minHeight: 60 }}
              placeholder="剧情概要，AI 据此生成正文"
            />
          </div>
          <div style={styles.row}>
            <label>写作提示</label>
            <input
              type="text"
              value={scene.hints ?? ''}
              onChange={(e) => updateScene((s) => ({ ...s, hints: e.target.value || undefined }))}
              style={styles.input}
              placeholder="可选"
            />
          </div>

          <AttributesEditorCard
            attributeDefs={attributeDefs}
            actions={scene.stateActions}
            onChange={(a) => updateScene((s) => ({ ...s, stateActions: a }))}
            title="属性"
          />
          <ItemsEditorCard
            items={items}
            give={Array.isArray(scene.stateActions?.give) ? scene.stateActions.give : scene.stateActions?.give ? [scene.stateActions.give] : []}
            take={Array.isArray(scene.stateActions?.take) ? scene.stateActions.take : scene.stateActions?.take ? [scene.stateActions.take] : []}
            onChange={(give, take) =>
              updateScene((s) => ({
                ...s,
                stateActions: {
                  ...s.stateActions,
                  give: give.length ? give : undefined,
                  take: take.length ? take : undefined,
                },
              }))
            }
            title="物品"
          />

          <div style={styles.row}>
            <label style={styles.label}>关联地图节点</label>
            <select
              value={scene.mapNodeId ?? ''}
              onChange={(e) => updateScene((s) => ({ ...s, mapNodeId: e.target.value || undefined }))}
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
            <label style={styles.label}>出场人物</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {characterIds.map((c) => {
                const selected = (scene.characterIds ?? []).includes(c.id);
                return (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) =>
                        updateScene((s) => {
                          const ids = s.characterIds ?? [];
                          const next = e.target.checked
                            ? [...ids, c.id]
                            : ids.filter((x) => x !== c.id);
                          return { ...s, characterIds: next.length ? next : undefined };
                        })
                      }
                    />
                    {c.name}
                  </label>
                );
              })}
              {characterIds.length === 0 && <span style={{ color: '#888', fontSize: 13 }}>暂无人物，请在「人物」页添加</span>}
            </div>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>关联事件</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {eventIds.map((evt) => {
                const selected = (scene.eventIds ?? []).includes(evt.id);
                return (
                  <label key={evt.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) =>
                        updateScene((s) => {
                          const ids = s.eventIds ?? [];
                          const next = e.target.checked
                            ? [...ids, evt.id]
                            : ids.filter((x) => x !== evt.id);
                          return { ...s, eventIds: next.length ? next : undefined };
                        })
                      }
                    />
                    {evt.name}
                  </label>
                );
              })}
              {eventIds.length === 0 && <span style={{ color: '#888', fontSize: 13 }}>暂无事件，请在「编辑事件」中添加</span>}
            </div>
          </div>

          <div style={styles.linksHead}>
            <span>链接</span>
            <button
              type="button"
              style={styles.btnSmall}
              onClick={() => updateScene((s) => ({ ...s, links: [...s.links, { target: '' }] }))}
            >
              + 添加
            </button>
          </div>
          {scene.links.map((link, li) => (
            <LinkRow
              key={li}
              link={link}
              sceneIds={sceneIds}
              onUpdate={(l) =>
                updateScene((s) => ({
                  ...s,
                  links: s.links.map((x, j) => (j === li ? l : x)),
                }))
              }
              onRemove={() =>
                updateScene((s) => ({ ...s, links: s.links.filter((_, j) => j !== li) }))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkRow({
  link,
  sceneIds,
  onUpdate,
  onRemove,
}: {
  link: FrameworkLink;
  sceneIds: Set<string>;
  onUpdate: (l: FrameworkLink) => void;
  onRemove: () => void;
}) {
  const targetValid = sceneIds.has(link.target) || sceneIds.has(link.target.trim().replace(/\s+/g, '_'));

  return (
    <div style={styles.linkRow}>
      <input
        type="text"
        value={link.displayText ?? ''}
        onChange={(e) => onUpdate({ ...link, displayText: e.target.value || undefined })}
        style={{ ...styles.input, width: 120 }}
        placeholder="选项文案"
      />
      <select
        value={link.target}
        onChange={(e) => onUpdate({ ...link, target: e.target.value })}
        style={{
          ...styles.input,
          flex: 1,
          borderColor: targetValid ? undefined : '#e74c3c',
        }}
      >
        <option value="">选择目标</option>
        {Array.from(sceneIds).map((id) => (
          <option key={id} value={id}>{id}</option>
        ))}
      </select>
      <input
        type="text"
        value={link.condition ?? ''}
        onChange={(e) => onUpdate({ ...link, condition: e.target.value || undefined })}
        style={{ ...styles.input, width: 140, fontFamily: 'monospace', fontSize: 12 }}
        placeholder='$items has "令牌"'
      />
      <button type="button" style={styles.btnIcon} onClick={onRemove} title="删除">×</button>
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
  title: { fontSize: 20, fontWeight: 600, margin: 0 },
  actions: { display: 'flex', gap: 10 },
  btn: {
    padding: '8px 16px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    cursor: 'pointer',
    fontSize: 14,
  },
  btnGenerate: {
    padding: '8px 16px',
    backgroundColor: '#3d2d64',
    border: '1px solid #6c5ce7',
    borderRadius: 6,
    color: '#c4b5fd',
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
  errorItem: { marginBottom: 4 },
  section: { marginBottom: 24 },
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
  modalTitle: { fontSize: 18, fontWeight: 600, margin: 0 },
  modalClose: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    lineHeight: 1,
  },
  modalActions: { display: 'flex', gap: 10, marginTop: 16 },
  fileHandleBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  fileHandleBtnPath: { fontSize: 10, color: '#888', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  label: { display: 'block', marginBottom: 6, fontSize: 13, color: '#a78bfa' },
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
  chapter: { marginBottom: 12 },
  chapterHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    cursor: 'pointer',
    fontSize: 13,
    color: '#a78bfa',
  },
  chapterHeadRight: { display: 'flex', alignItems: 'center', gap: 8 },
  chapterTitle: { fontWeight: 600, fontSize: 15 },
  chapterBody: { padding: '8px 0 0 0' },
  row: { marginBottom: 12 },
  scenesHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 10 },
  scene: { marginBottom: 12 },
  sceneHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    cursor: 'pointer',
    fontSize: 13,
    color: '#a78bfa',
  },
  sceneTitle: { fontSize: 14 },
  sceneBody: { padding: '8px 0 0 0' },
  linksHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  linkRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
};
