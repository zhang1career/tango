/**
 * 人物编辑界面
 */

import React, {useCallback, useEffect, useState} from 'react';
import {useStoryMetadata} from '../hooks/useStoryMetadata';
import {getAIGCApiKey, getAIGCApiUrl, getCharactersFetchUrl, getScenesFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import type {StoryFramework} from '../schema/story-framework';
import type {GameCharacter, CharacterPersonalityTrait, CharacterLimitation} from '../schema/game-character';
import type {GameBehavior} from '../schema/game-behavior';
import type {GameScene} from '../schema/game-scene';
import {AttributeValuesCard} from './cards/AttributeValuesCard';
import {InventoryValuesCard} from './cards/InventoryValuesCard';
import {AttributesEditorCard} from './cards/AttributesEditorCard';
import {ItemsEditorCard} from './cards/ItemsEditorCard';
import {formatJsonCompact} from '../utils/json-format';
import {assignBehaviorIds} from '../utils/behavior-ids';
import {MultiSelectField} from './ui/MultiSelectField';
import {DetailEditModal} from './ui/DetailEditModal';
import {MediaUrlField} from './ui/MediaFields';
import {EntityFlatList} from './ui/EntityFlatList';
import {ListAddButton, ListDeleteButton, ListOpsCell, ListSectionHead} from './ui/ListPrimitives';
import {editorStyles as baseEditorStyles} from '@/styles/editorStyles';

const styles: Record<string, React.CSSProperties> = {
  ...baseEditorStyles,
  collapsible: {marginBottom: 12},
  collapsibleHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    cursor: 'pointer',
    fontSize: 12,
    color: '#9ca3af',
  },
  collapsibleBody: {padding: '8px 0 0 0'},
  dialogueItem: {marginBottom: 16, padding: 12, backgroundColor: '#1e1e32', borderRadius: 8, border: '1px solid #333'},
};

function CollapsibleSection({
                              title,
                              expanded,
                              onToggle,
                              rightAction,
                              children,
                            }: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.collapsible}>
      <div style={styles.collapsibleHead} onClick={onToggle} role="button" tabIndex={0}
           onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <span>{title}</span>
        <span style={{display: 'flex', alignItems: 'center', gap: 8}}>
          {rightAction && <span onClick={(e) => e.stopPropagation()}>{rightAction}</span>}
          <span>{expanded ? '▼' : '▶'}</span>
        </span>
      </div>
      {expanded && <div style={styles.collapsibleBody}>{children}</div>}
    </div>
  );
}

/** 保存人物到预设路径 assets/games/{gameId}/story-characters.json */
async function saveCharactersToPreset(characters: unknown, gameId: string): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getCharactersFetchUrl(gameId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(characters),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(characters)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-characters.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
}

const COLLAPSE_KEYS = ['attr', 'inv', 'personality', 'limitations', 'dialogueLib', 'onMeetAttr', 'onMeetItems'] as const;

/** 基于人物描述，调用 AI 生成多条对话行为 */
async function generateBehaviorsFromAI(
  description: string,
  apiKey: string,
  apiUrl: string
): Promise<GameBehavior[]> {
  const system = `你是一名文字冒险游戏编剧。根据人物描述，生成多条对话行为。
每条行为包含：q（玩家可能说的话/提问）、a（该人物的回答）。
输出纯 JSON 数组，不要包含 markdown 代码块或其它文字。格式：[{"q":"...","a":"..."},{"q":"...","a":"..."},...]
生成 5-8 条，风格契合人物设定。`;
  const user = `人物描述：${description || '（未填写）'}\n\n请生成对话行为 JSON 数组：`;

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
  if (!content) throw new Error('API 未返回内容');

  let raw = content;
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) raw = codeBlockMatch[1].trim();

  const parsed = JSON.parse(raw) as Array<{ q?: string; a?: string }>;
  if (!Array.isArray(parsed)) throw new Error('解析结果非数组');

  return parsed
    .filter((x) => x && (typeof x.q === 'string' || typeof x.a === 'string'))
    .map((x) => ({
      id: uuid(),
      q: String(x.q ?? ''),
      a: String(x.a ?? ''),
      t: 'dialog' as const,
    }));
}

function uuid(): string {
  return crypto.randomUUID?.() ?? `b_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function DialogueLibrarySection({
  ownerId,
  lib,
  scenes,
  editable,
  onUpdate,
}: {
  ownerId: string;
  lib: GameBehavior[];
  scenes: Array<{ id: string; name: string }>;
  editable: boolean;
  onUpdate?: (lib: GameBehavior[]) => void;
}) {
  if (!editable || !onUpdate) {
    return (
      <div style={styles.row}>
        {lib.length === 0 ? (
          <div style={styles.readOnlyValue}>暂无对话</div>
        ) : (
          <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
            {lib.map((b, i) => (
              <li key={b.id} style={{marginBottom: 12, padding: 10, backgroundColor: '#1e1e32', borderRadius: 6}}>
                <div style={{fontSize: 13, color: '#d1d5db'}}>请求：{b.t === 'action' ? `(${b.q})` : b.q}</div>
                <div style={{fontSize: 14, color: '#c4b5fd', marginTop: 4}}>响应：{b.a}</div>
                {b.judgeExpr && <div style={{fontSize: 12, color: '#888', marginTop: 4}}>条件：{b.judgeExpr}</div>}
                {b.sceneIds?.length ? (
                  <div style={{fontSize: 12, color: '#888', marginTop: 4}}>
                    场景：{b.sceneIds.map((id) => scenes.find((s) => s.id === id)?.name ?? id).join('、')}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const add = () => {
    const [id] = assignBehaviorIds(ownerId, lib, 1);
    onUpdate([...lib, {id, q: '', a: '', t: 'dialog'}]);
  };
  const remove = (i: number) => {
    onUpdate(lib.filter((_, idx) => idx !== i));
  };
  const update = (i: number, fn: (b: GameBehavior) => GameBehavior) => {
    onUpdate(lib.map((b, idx) => (idx === i ? fn(b) : b)));
  };
  return (
    <div style={styles.row}>
      <ListSectionHead title={<span style={{fontSize: 12, color: '#888'}}>行为库</span>} addTitle="添加行为" onAdd={add} />
      {lib.map((b, i) => (
        <div key={b.id} style={styles.dialogueItem}>
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center'}}>
            <span style={{fontSize: 12, color: '#888'}}>行为 #{i + 1}</span>
            <ListOpsCell>
              <ListDeleteButton onClick={() => remove(i)} />
            </ListOpsCell>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>请求</label>
            <input
              value={b.q}
              onChange={(e) => update(i, (x) => ({...x, q: e.target.value}))}
              style={styles.input}
              placeholder="对话或动作的发起内容"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>响应</label>
            <input
              value={b.a}
              onChange={(e) => update(i, (x) => ({...x, a: e.target.value}))}
              style={styles.input}
              placeholder="交互结果内容"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>类型</label>
            <select
              value={b.t ?? 'dialog'}
              onChange={(e) => update(i, (x) => ({...x, t: e.target.value as 'dialog' | 'action'}))}
              style={styles.input}
            >
              <option value="dialog">对话</option>
              <option value="action">动作</option>
            </select>
          </div>
          {(b.t ?? 'dialog') === 'action' && (
            <div style={styles.row}>
              <label style={styles.label}>动作类型</label>
              <select
                value={b.actionKind ?? ''}
                onChange={(e) =>
                  update(i, (x) => ({
                    ...x,
                    actionKind: (e.target.value || undefined) as import('../schema/game-behavior').ActionKind | undefined,
                  }))
                }
                style={styles.input}
              >
                <option value="">—</option>
                <option value="battle">战斗</option>
              </select>
            </div>
          )}
          {scenes.length === 0 ? (
            <div style={styles.row}>
              <label style={styles.label}>限定场景 sceneIds</label>
              <div style={styles.readOnlyValue}>请先在「场景」页添加场景</div>
            </div>
          ) : (
            <MultiSelectField
              label="限定场景 sceneIds"
              hint="不选择表示所有场景均可用"
              options={scenes}
              value={b.sceneIds ?? []}
              addPlaceholder="添加限定场景…"
              emptyHint="（所有场景均可用）"
              onChange={(ids) => update(i, (x) => ({...x, sceneIds: ids.length ? ids : undefined}))}
            />
          )}
          <div style={styles.row}>
            <label style={styles.label}>条件表达式</label>
            <input
              value={b.judgeExpr ?? ''}
              onChange={(e) => update(i, (x) => ({...x, judgeExpr: e.target.value || undefined}))}
              style={styles.input}
              placeholder="例如 $rep.费穆 >= 5"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>回写 writebackExpr</label>
            <input
              value={b.writebackExpr ?? ''}
              onChange={(e) => update(i, (x) => ({...x, writebackExpr: e.target.value || undefined}))}
              style={styles.input}
              placeholder='例如 $rep.费穆 = ($rep.费穆||0)+1'
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldRow({
                    label,
                    value,
                    editable: isEditable,
                    children,
                  }: {
  label: string;
  value?: string;
  editable: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={styles.row}>
      <label style={styles.label}>{label}</label>
      {isEditable && children ? children : <div style={styles.readOnlyValue}>{value ?? '-'}</div>}
    </div>
  );
}

type CharFormProps = {
  char: GameCharacter;
  editable: boolean;
  attributeDefs: import('../schema/metadata').CharacterAttributeDef[];
  items: import('../schema/game-item').GameItem[];
  scenes: Array<{ id: string; name: string }>;
  onUpdate?: (fn: (c: GameCharacter) => GameCharacter) => void;
  /** 折叠区域默认是否展开，详情弹窗为 true，编辑弹窗为 false */
  collapsibleDefaultExpanded?: boolean;
};

function CharacterFormContent({
                                char,
                                editable,
                                attributeDefs,
                                items,
                                scenes,
                                onUpdate,
                                collapsibleDefaultExpanded = false,
                              }: CharFormProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    collapsibleDefaultExpanded ? new Set(COLLAPSE_KEYS) : new Set()
  );
  const [isGeneratingBehaviors, setIsGeneratingBehaviors] = useState(false);

  const handleGenerateBehaviors = useCallback(async () => {
    const apiKey = getAIGCApiKey();
    const apiUrl = getAIGCApiUrl();
    if (!apiKey) {
      alert('请配置 VITE_AIGC_API_KEY 或 VITE_OPENAI_API_KEY');
      return;
    }
    if (!onUpdate) return;
    setIsGeneratingBehaviors(true);
    try {
      const raw = await generateBehaviorsFromAI(char.description ?? '', apiKey, apiUrl);
      onUpdate((c) => {
        const existing = c.behaviorLibrary ?? [];
        const ids = assignBehaviorIds(c.id, existing, raw.length);
        const behaviors: GameBehavior[] = raw.map((r, i) => ({
          ...r,
          id: ids[i],
        }));
        return {
          ...c,
          behaviorLibrary: [...existing, ...behaviors],
        };
      });
      setExpanded((s) => new Set(s).add('dialogueLib'));
    } catch (e) {
      alert(`生成失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsGeneratingBehaviors(false);
    }
  }, [char.description, onUpdate]);

  const toggle = (key: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      <FieldRow
        label="ID"
        value={char.id}
        editable={editable && !!onUpdate}
      >
        <input
          value={char.id}
          onChange={(e) => onUpdate!((c) => ({...c, id: e.target.value}))}
          style={styles.input}
          placeholder="char_xxx"
        />
      </FieldRow>
      <FieldRow
        label="名称"
        value={char.name}
        editable={editable && !!onUpdate}
      >
        <input
          value={char.name}
          onChange={(e) => onUpdate!((c) => ({...c, name: e.target.value}))}
          style={styles.input}
          placeholder="尔朱荣"
        />
      </FieldRow>
      <FieldRow
        label="描述"
        value={char.description ?? ''}
        editable={editable && !!onUpdate}
      >
        <textarea
          value={char.description ?? ''}
          onChange={(e) => onUpdate!((c) => ({...c, description: e.target.value || undefined}))}
          style={{...styles.input, ...styles.textarea, minHeight: 40}}
          placeholder="权臣，北魏将领..."
        />
      </FieldRow>
      <CollapsibleSection
        title="性格特质"
        expanded={expanded.has('personality')}
        onToggle={() => toggle('personality')}
      >
        {(char.personality ?? []).map((trait, idx) => (
          <div key={trait.id || idx} style={styles.dialogueItem}>
            {editable && onUpdate ? (
              <>
                <FieldRow label="ID" value={trait.id} editable>
                  <input
                    value={trait.id}
                    onChange={(e) =>
                      onUpdate((c) => {
                        const list = [...(c.personality ?? [])];
                        list[idx] = {...list[idx], id: e.target.value};
                        return {...c, personality: list};
                      })
                    }
                    style={styles.input}
                  />
                </FieldRow>
                <FieldRow label="标签" value={trait.label} editable>
                  <input
                    value={trait.label}
                    onChange={(e) =>
                      onUpdate((c) => {
                        const list = [...(c.personality ?? [])];
                        list[idx] = {...list[idx], label: e.target.value};
                        return {...c, personality: list};
                      })
                    }
                    style={styles.input}
                  />
                </FieldRow>
                <FieldRow label="程度" value={trait.level} editable>
                  <input
                    value={trait.level}
                    onChange={(e) =>
                      onUpdate((c) => {
                        const list = [...(c.personality ?? [])];
                        list[idx] = {...list[idx], level: e.target.value};
                        return {...c, personality: list};
                      })
                    }
                    style={styles.input}
                  />
                </FieldRow>
                <button
                  type="button"
                  style={styles.btnSmall}
                  onClick={() =>
                    onUpdate((c) => ({
                      ...c,
                      personality: (c.personality ?? []).filter((_, i) => i !== idx),
                    }))
                  }
                >
                  删除
                </button>
              </>
            ) : (
              <div style={styles.readOnlyValue}>{trait.label}：{trait.level}</div>
            )}
          </div>
        ))}
        {editable && onUpdate && (
          <button
            type="button"
            style={styles.btnSmall}
            onClick={() =>
              onUpdate((c) => ({
                ...c,
                personality: [
                  ...(c.personality ?? []),
                  {id: `trait_${Date.now()}`, label: '', level: ''} satisfies CharacterPersonalityTrait,
                ],
              }))
            }
          >
            + 添加特质
          </button>
        )}
      </CollapsibleSection>
      <CollapsibleSection
        title="认知局限"
        expanded={expanded.has('limitations')}
        onToggle={() => toggle('limitations')}
      >
        {(char.limitations ?? []).map((lim, idx) => (
          <div key={lim.id || idx} style={styles.dialogueItem}>
            {editable && onUpdate ? (
              <>
                <FieldRow label="ID" value={lim.id} editable>
                  <input
                    value={lim.id}
                    onChange={(e) =>
                      onUpdate((c) => {
                        const list = [...(c.limitations ?? [])];
                        list[idx] = {...list[idx], id: e.target.value};
                        return {...c, limitations: list};
                      })
                    }
                    style={styles.input}
                  />
                </FieldRow>
                <FieldRow label="标题" value={lim.title} editable>
                  <input
                    value={lim.title}
                    onChange={(e) =>
                      onUpdate((c) => {
                        const list = [...(c.limitations ?? [])];
                        list[idx] = {...list[idx], title: e.target.value};
                        return {...c, limitations: list};
                      })
                    }
                    style={styles.input}
                  />
                </FieldRow>
                <FieldRow label="说明" value={lim.summary} editable>
                  <textarea
                    value={lim.summary}
                    onChange={(e) =>
                      onUpdate((c) => {
                        const list = [...(c.limitations ?? [])];
                        list[idx] = {...list[idx], summary: e.target.value};
                        return {...c, limitations: list};
                      })
                    }
                    style={{...styles.input, ...styles.textarea, minHeight: 72}}
                  />
                </FieldRow>
                <button
                  type="button"
                  style={styles.btnSmall}
                  onClick={() =>
                    onUpdate((c) => ({
                      ...c,
                      limitations: (c.limitations ?? []).filter((_, i) => i !== idx),
                    }))
                  }
                >
                  删除
                </button>
              </>
            ) : (
              <>
                <div style={{...styles.readOnlyValue, fontWeight: 600}}>{lim.title}</div>
                <div style={styles.readOnlyValue}>{lim.summary}</div>
              </>
            )}
          </div>
        ))}
        {editable && onUpdate && (
          <button
            type="button"
            style={styles.btnSmall}
            onClick={() =>
              onUpdate((c) => ({
                ...c,
                limitations: [
                  ...(c.limitations ?? []),
                  {id: `lim_${Date.now()}`, title: '', summary: ''} satisfies CharacterLimitation,
                ],
              }))
            }
          >
            + 添加局限
          </button>
        )}
      </CollapsibleSection>
      <MediaUrlField
        label="头像"
        value={char.avatar}
        onChange={(v) => onUpdate?.((c) => ({...c, avatar: v}))}
        editable={editable && !!onUpdate}
      />
      <MediaUrlField
        label="背景音乐"
        value={char.backgroundMusic}
        onChange={(v) => onUpdate?.((c) => ({...c, backgroundMusic: v}))}
        editable={editable && !!onUpdate}
      />
      <CollapsibleSection title="属性" expanded={expanded.has('attr')} onToggle={() => toggle('attr')}>
        <AttributeValuesCard
          attributeDefs={attributeDefs}
          values={char.attributes}
          onChange={onUpdate ? (v) => onUpdate((c) => ({
            ...c,
            attributes: Object.keys(v).length ? v : undefined
          })) : undefined}
          title=""
          readOnly={!editable || !onUpdate}
        />
      </CollapsibleSection>
      <CollapsibleSection title="物品" expanded={expanded.has('inv')} onToggle={() => toggle('inv')}>
        <InventoryValuesCard
          items={items}
          inventory={char.inventory ?? []}
          onChange={onUpdate ? (ids) => onUpdate((c) => ({...c, inventory: ids.length ? ids : undefined})) : undefined}
          title=""
          readOnly={!editable || !onUpdate}
        />
      </CollapsibleSection>
      <CollapsibleSection
        title="行为库"
        expanded={expanded.has('dialogueLib')}
        onToggle={() => toggle('dialogueLib')}
        rightAction={
          editable && onUpdate ? (
            <button
              type="button"
              style={styles.btnSmall}
              onClick={handleGenerateBehaviors}
              disabled={isGeneratingBehaviors}
              title="基于描述调用 AI 生成多条对话行为"
            >
              {isGeneratingBehaviors ? '生成中...' : '生成行为'}
            </button>
          ) : undefined
        }
      >
        <DialogueLibrarySection
          ownerId={char.id}
          lib={char.behaviorLibrary ?? []}
          scenes={scenes}
          editable={editable && !!onUpdate}
          onUpdate={onUpdate ? (lib) => onUpdate((c) => ({...c, behaviorLibrary: lib.length ? lib : undefined})) : undefined}
        />
      </CollapsibleSection>
      <CollapsibleSection title="onMeet 属性变更" expanded={expanded.has('onMeetAttr')}
                          onToggle={() => toggle('onMeetAttr')}>
        <AttributesEditorCard
          attributeDefs={attributeDefs}
          actions={char.onMeet}
          onChange={onUpdate ? (a) => onUpdate((c) => ({...c, onMeet: a})) : undefined}
          title=""
          readOnly={!editable || !onUpdate}
        />
      </CollapsibleSection>
      <CollapsibleSection title="onMeet 物品变更" expanded={expanded.has('onMeetItems')}
                          onToggle={() => toggle('onMeetItems')}>
        <ItemsEditorCard
          items={items}
          give={Array.isArray(char.onMeet?.give) ? char.onMeet.give : char.onMeet?.give ? [char.onMeet.give] : []}
          take={Array.isArray(char.onMeet?.take) ? char.onMeet.take : char.onMeet?.take ? [char.onMeet.take] : []}
          onChange={
            onUpdate
              ? (give, take) =>
                onUpdate((c) => ({
                  ...c,
                  onMeet: {...c.onMeet, give: give.length ? give : undefined, take: take.length ? take : undefined},
                }))
              : undefined
          }
          title=""
          readOnly={!editable || !onUpdate}
        />
      </CollapsibleSection>
    </div>
  );
}

export function CharacterEditor({fw, updateFw}: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void
}) {
  const {gameId} = useGameId();
  const {checkAuthForSave} = useAuth();
  useEffect(() => {
    fetch(getCharactersFetchUrl(gameId))
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        updateFw((d) => ({...d, characters: list as GameCharacter[]}));
      })
      .catch(() => {
      });
  }, [updateFw, gameId]);

  useEffect(() => {
    fetch(getScenesFetchUrl(gameId))
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        updateFw((d) => ({...d, scenes: list as GameScene[]}));
      })
      .catch(() => {
      });
  }, [updateFw, gameId]);

  useStoryMetadata(updateFw);

  const characters = fw.characters ?? [];
  const scenes = (fw.scenes ?? []).map((s) => ({id: s.id, name: s.name}));
  const setCharacters = (fn: (c: GameCharacter[]) => GameCharacter[]) =>
    updateFw((d) => ({...d, characters: fn(d.characters ?? [])}));

  const attributeDefs = fw.metadata?.characterAttributes ?? [];
  const items = fw.items ?? [];
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newChar, setNewChar] = useState<GameCharacter>(() => ({id: `char_${Date.now()}`, name: '新人物'}));

  const openAddModal = () => {
    setNewChar({id: `char_${Date.now()}`, name: '新人物'});
    setAddModalOpen(true);
  };

  const confirmAddChar = async () => {
    const next = [...characters, newChar];
    setCharacters(() => next);
    const result = await saveCharactersToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  const updateCharacter = (index: number, fn: (c: GameCharacter) => GameCharacter) =>
    setCharacters((c) => c.map((x, i) => (i === index ? fn(x) : x)));

  const removeCharacter = async (index: number) => {
    const next = characters.filter((_, i) => i !== index);
    setCharacters(() => next);
    const result = await saveCharactersToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };
  const removeCharacterWithAuth = (index: number) => checkAuthForSave(() => removeCharacter(index));

  const saveChars = async () => {
    const result = await saveCharactersToPreset(characters, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setEditIndex(null);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>人物</h1>
        <ListAddButton title="添加人物" onClick={openAddModal} />
      </header>

      <section style={styles.section}>
        <EntityFlatList
          count={characters.length}
          emptyHint="暂无人物，点击 + 创建。"
          getKey={(ci) => `char-${ci}`}
          getPrimary={(ci) => characters[ci]!.name}
          getMeta={(ci) => characters[ci]!.id}
          onOpen={setDetailIndex}
          onEdit={setEditIndex}
          onDelete={removeCharacterWithAuth}
        />
      </section>

      {detailIndex !== null && characters[detailIndex] && (
        <DetailEditModal
          title="人物详情"
          open={true}
          onClose={() => setDetailIndex(null)}
          editable={false}
        >
          <CharacterFormContent
            char={characters[detailIndex]}
            editable={false}
            attributeDefs={attributeDefs}
            items={items}
            scenes={scenes}
            collapsibleDefaultExpanded
          />
        </DetailEditModal>
      )}

      {editIndex !== null && characters[editIndex] && (
        <DetailEditModal
          title="编辑人物"
          open={true}
          onClose={() => setEditIndex(null)}
          editable={true}
          onSave={() => checkAuthForSave(saveChars)}
        >
          <CharacterFormContent
            char={characters[editIndex]}
            editable={true}
            attributeDefs={attributeDefs}
            items={items}
            scenes={scenes}
            onUpdate={(fn) => updateCharacter(editIndex, fn)}
          />
        </DetailEditModal>
      )}

      {addModalOpen && (
        <DetailEditModal
          title="添加人物"
          open={true}
          onClose={() => setAddModalOpen(false)}
          editable={true}
          onSave={() => checkAuthForSave(confirmAddChar)}
        >
          <CharacterFormContent
            char={newChar}
            editable={true}
            attributeDefs={attributeDefs}
            items={items}
            scenes={scenes}
            onUpdate={(fn) => setNewChar(fn(newChar))}
          />
        </DetailEditModal>
      )}
    </div>
  );
}
