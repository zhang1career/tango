/**
 * 剧情时间线编辑界面
 */

import React, { useState, useCallback } from 'react';
import type {
  StoryFramework,
  FrameworkChapter,
  FrameworkScene,
  FrameworkLink,
} from '../schema/story-framework';
import { validateFramework, flattenScenes } from '../schema/story-framework';
import { AttributesEditorCard } from './cards/AttributesEditorCard';
import { ItemsEditorCard } from './cards/ItemsEditorCard';
import { getAIGCApiKey, getAIGCApiUrl } from '../config';
import { parseTwee, serializeStory } from '../engine';

import exampleFramework from '../../assets/story-framework.example.json';
import storyMaps from '../../assets/story-maps.json';

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function generateScenePassageText(
  fw: StoryFramework,
  scene: FrameworkScene,
  apiKey: string,
  apiUrl: string
): Promise<string> {
  const rules = (fw.rules ?? []).map((r) => `- ${r}`).join('\n');
  const system = `你是一名文字冒险游戏编剧。根据「剧情概要」生成一段可读的剧情正文（旁白+对话），直接输出正文，不要解释。

规则：${rules || '- 简洁有力，适合文字冒险'}

输出要求：纯正文，不要包含 [[链接]]，链接由系统自动添加。`;

  const ctx = fw.background ? `背景：${fw.background}\n\n` : '';
  const user = `${ctx}场景：${scene.id}
概要：${scene.summary}
${scene.hints ? `写作提示：${scene.hints}` : ''}

请生成该场景的剧情正文：`;

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
  const [expandedCh, setExpandedCh] = useState<Set<string>>(new Set(['ch0']));
  const [expandedScene, setExpandedScene] = useState<Set<string>>(new Set());
  const apiKey = getAIGCApiKey();
  const [generatingCh, setGeneratingCh] = useState<string | null>(null);
  const apiUrl = getAIGCApiUrl();
  const [twFileHandle, setTwFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

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

  const toggleScene = (id: string) => {
    setExpandedScene((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sceneIds = new Set(flattenScenes(fw).map((s) => s.id));
  const mapNodeIds: Array<{ id: string; name: string; mapName: string }> = [];
  for (const map of fw.maps ?? []) {
    for (const n of map.nodes) mapNodeIds.push({ id: n.id, name: n.name, mapName: map.name });
  }
  const npcIds = (fw.characters ?? []).filter((c) => c.type === 'npc').map((c) => ({ id: c.id, name: c.name }));
  const eventIds = (fw.events ?? []).map((e) => ({ id: e.id, name: e.name }));
  const attributeDefs = fw.metadata?.characterAttributes ?? [];
  const items = fw.items ?? [];
  const { valid, errors } = validateFramework(fw);

  const handleImport = (): boolean => {
    try {
      const parsed = JSON.parse(jsonInput || '{}') as StoryFramework;
      if (!parsed.title) parsed.title = '未命名故事';
      if (!parsed.chapters?.length) parsed.chapters = [{ id: 'ch0', title: '第一章', scenes: [] }];
      updateFw(() => parsed);
      setJsonError(null);
      setJsonInput('');
      return true;
    } catch (e) {
      setJsonError((e as Error).message);
      return false;
    }
  };

  const handleExport = () => downloadJson(fw, 'story-framework.json');

  const handleLoadExample = () => {
    const base = exampleFramework as StoryFramework;
    const maps = Array.isArray(storyMaps) && storyMaps.length > 0 ? storyMaps : base.maps;
    updateFw(() => ({ ...base, maps: maps ?? [] }));
    setJsonError(null);
  };

  const handleSelectTwFile = useCallback(async () => {
    try {
      const [handle] = await (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker?.({
        types: [{ accept: { 'text/plain': ['.tw', '.twee'] }, description: 'Twee 故事文件' }],
        multiple: false,
        mode: 'readwrite',
      }) ?? [];
      if (handle) setTwFileHandle(handle);
    } catch {
      setJsonError('无法选择文件（需要支持 File System Access API 的浏览器）');
    }
  }, []);

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
          alert('请先点击「选择剧情文件」指定要覆盖的目标文件（需支持 File System Access API 的浏览器）');
          return;
        }
      }
      setGeneratingCh(ch.id);
      setJsonError(null);
      try {
        const textMap = new Map<string, string>();
        for (const scene of ch.scenes) {
          const text = await generateScenePassageText(fw, scene, key, apiUrl);
          textMap.set(scene.id, text);
        }
        const file = await handle.getFile();
        let raw = await file.text();
        const story = parseTwee(raw);
        const sceneIds = new Set(ch.scenes.map((s) => s.id));
        for (const [, p] of story.passages) {
          if (sceneIds.has(p.id)) {
            const newText = textMap.get(p.id);
            if (newText != null) {
              p.text = newText;
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
        <h1 style={styles.title}>剧情时间线编辑</h1>
        <div style={styles.actions}>
          <button type="button" style={styles.btn} onClick={handleLoadExample}>
            加载示例
          </button>
          <button type="button" style={styles.btn} onClick={() => setShowImportModal(true)}>
            导入 JSON
          </button>
          <button type="button" style={styles.btn} onClick={handleExport}>
            导出 JSON
          </button>
        </div>
      </header>

      <section style={styles.twPathSection}>
        <div style={styles.twPathRow}>
          <button type="button" style={styles.btn} onClick={handleSelectTwFile}>
            选择剧情文件
          </button>
          {twFileHandle && <span style={styles.hint}>已选择，生成时将覆盖此文件</span>}
        </div>
      </section>

      {!valid && (
        <div style={styles.errors}>
          {errors.map((e, i) => (
            <div key={i} style={styles.errorItem}>{e}</div>
          ))}
        </div>
      )}

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
            npcIds={npcIds}
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

      {showImportModal && (
        <div style={styles.modalOverlay} onClick={() => setShowImportModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>导入 JSON</h2>
              <button type="button" style={styles.modalClose} onClick={() => setShowImportModal(false)}>×</button>
            </div>
            <textarea
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                setJsonError(null);
              }}
              style={{ ...styles.input, ...styles.textarea, minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
              placeholder='粘贴 story-framework.json 内容...'
            />
            {jsonError && <div style={styles.errorItem}>{jsonError}</div>}
            <div style={styles.modalActions}>
              <button type="button" style={styles.btn} onClick={() => { if (handleImport()) setShowImportModal(false); }}>
                导入
              </button>
              <button type="button" style={styles.btn} onClick={() => setShowImportModal(false)}>
                取消
              </button>
            </div>
          </div>
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
  npcIds,
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
  npcIds: Array<{ id: string; name: string }>;
  eventIds: Array<{ id: string; name: string }>;
  attributeDefs: import('../schema/metadata').CharacterAttributeDef[];
  items: import('../schema/game-item').GameItem[];
  expandedCh: Set<string>;
  expandedScene: Set<string>;
  toggleCh: (id: string) => void;
  toggleScene: (id: string) => void;
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
              key={scene.id}
              scene={scene}
              chi={chi}
              si={si}
              sceneIds={sceneIds}
              mapNodeIds={mapNodeIds}
              npcIds={npcIds}
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
  npcIds,
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
  npcIds: Array<{ id: string; name: string }>;
  eventIds: Array<{ id: string; name: string }>;
  attributeDefs: import('../schema/metadata').CharacterAttributeDef[];
  items: import('../schema/game-item').GameItem[];
  expandedScene: Set<string>;
  toggleScene: (id: string) => void;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const isExpanded = expandedScene.has(scene.id);

  const updateScene = (fn: (s: FrameworkScene) => FrameworkScene) =>
    updateFw((d) => ({
      ...d,
      chapters: d.chapters.map((c, i) =>
        i === chi ? { ...c, scenes: c.scenes.map((s, j) => (j === si ? fn(s) : s)) } : c
      ),
    }));

  return (
    <div style={styles.scene}>
      <div style={styles.sceneHead} onClick={() => toggleScene(scene.id)}>
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
            <label style={styles.label}>出场人物（NPC）</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {npcIds.map((npc) => {
                const selected = (scene.characterIds ?? []).includes(npc.id);
                return (
                  <label key={npc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) =>
                        updateScene((s) => {
                          const ids = s.characterIds ?? [];
                          const next = e.target.checked
                            ? [...ids, npc.id]
                            : ids.filter((x) => x !== npc.id);
                          return { ...s, characterIds: next.length ? next : undefined };
                        })
                      }
                    />
                    {npc.name}
                  </label>
                );
              })}
              {npcIds.length === 0 && <span style={{ color: '#888', fontSize: 13 }}>暂无 NPC，请在「编辑人物」中添加</span>}
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
  twPathSection: { marginBottom: 24 },
  twPathRow: { display: 'flex', gap: 10, alignItems: 'center' },
  hint: { fontSize: 12, color: '#888' },
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
  chapter: {
    marginBottom: 12,
    backgroundColor: '#1e1e32',
    borderRadius: 8,
    overflow: 'hidden',
  },
  chapterHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    cursor: 'pointer',
    backgroundColor: '#252540',
  },
  chapterHeadRight: { display: 'flex', alignItems: 'center', gap: 8 },
  chapterTitle: { fontWeight: 600, fontSize: 15 },
  chapterBody: { padding: 16 },
  row: { marginBottom: 12 },
  scenesHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 10 },
  scene: {
    marginBottom: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 6,
    overflow: 'hidden',
    border: '1px solid #333',
  },
  sceneHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    cursor: 'pointer',
    backgroundColor: '#252540',
  },
  sceneTitle: { fontSize: 14 },
  sceneBody: { padding: 12 },
  linksHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  linkRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
};
