/**
 * 场景编辑界面
 */

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {getAIGCApiKey, getScenesFetchUrl, getMapsFetchUrl, getCharactersFetchUrl, getEventsFetchUrl, getItemsFetchUrl, getMetadataFetchUrl, getRulesFetchUrl, getFeaturesFetchUrl} from '@/config';
import {runGenerateAiBlock} from '@/services/scene-block-generation';
import type {AiBlockPriority, ScenePassageAiBlock} from '../schema/game-scene';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import type {StoryFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {GameBehavior} from '../schema/game-behavior';
import {ItemsEditorCard} from './cards/ItemsEditorCard';
import {AttributeValuesCard} from './cards/AttributeValuesCard';
import {InventoryValuesCard} from './cards/InventoryValuesCard';
import {MediaUrlField} from './ui/MediaFields';
import {normalizeStringList, StringListField} from './ui/StringListField';
import {defaultSceneImageSavePath} from '@/config/media-paths';
import {BgmSynthesisField} from './ui/BgmSynthesisField';
import {formatJsonCompact} from '../utils/json-format';
import {DetailEditModal} from './ui/DetailEditModal';
import {RuleIdsSelector} from './ui/RuleIdsSelector';
import {editorStyles as styles} from '../styles/editorStyles';
import type {GameRule} from '../schema/game-rule';
import {normalizeGameRule, normalizeGameRules} from '../utils/normalize-game-rules';
import {
  AI_WORD_COUNT_MAX,
  AI_WORD_COUNT_MIN,
  DEFAULT_AI_WORD_COUNT,
  addAiBlock,
  aiIndexToPassageBlockIndex,
  defaultPassageBlocks,
  getAiBlocks,
  getLeadingRawBlock,
  removeAiBlock,
  upsertAiBlock,
  upsertLeadingRaw,
} from '../utils/passage-blocks';
import {SceneRoutingFields} from './SceneRoutingFields';
import {SingleSelectField} from './ui/SingleSelectField';
import {MultiSelectField} from './ui/MultiSelectField';
import {resolveSceneBackgroundMusic, sceneMediaDefaultsOnBranchFailureToggle} from '../utils/scene-media';
import {normalizeFeaturesConfig} from '../utils/normalize-features';
import type {FeaturesConfig} from '../schema/features';

const collapsibleStyles: Record<string, React.CSSProperties> = {
  section: {marginBottom: 12, padding: 10, border: '1px solid #444', borderRadius: 6},
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    fontSize: 13,
    color: '#bbb',
    userSelect: 'none',
  },
  title: {flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'},
  body: {paddingTop: 8},
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
    <div style={collapsibleStyles.section}>
      <div
        style={collapsibleStyles.head}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
      >
        <span style={collapsibleStyles.title}>{title}</span>
        <span style={{display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0}}>
          {rightAction && <span onClick={(e) => e.stopPropagation()}>{rightAction}</span>}
          <span>{expanded ? '▼' : '▶'}</span>
        </span>
      </div>
      {expanded && <div style={collapsibleStyles.body}>{children}</div>}
    </div>
  );
}

function aiBlockCollapseTitle(block: ScenePassageAiBlock, aiIndex: number): string {
  const summary = block.summary?.trim();
  const hint = summary
    ? summary.length > 40
      ? `${summary.slice(0, 40)}…`
      : summary
    : '（未填 summary）';
  return `AI 块 ${aiIndex + 1} · ${hint}`;
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

async function saveScenesToPreset(scenes: unknown, gameId: string): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getScenesFetchUrl(gameId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(scenes),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(scenes)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-scenes.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
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

type SceneFormProps = {
  scene: GameScene;
  editable: boolean;
  attributeDefs: import('../schema/metadata').CharacterAttributeDef[];
  items: import('../schema/game-item').GameItem[];
  mapNodeIds: Array<{ id: string; name: string; mapName: string }>;
  characterIds: Array<{ id: string; name: string }>;
  eventIds: Array<{ id: string; name: string; backgroundMusic?: string }>;
  gameId: string;
  ruleIds: Array<{ id: string; name: string }>;
  gameRules: GameRule[];
  onUpdateRule?: (ruleId: string, fn: (r: GameRule) => GameRule) => void;
  onSaveRules?: () => void;
  onUpdate?: (fn: (s: GameScene) => GameScene) => void;
  collapsibleDefaultExpanded?: boolean;
  fw?: StoryFramework;
  onScenePatched?: (scene: GameScene) => void;
  onSaveScene?: () => void | Promise<void>;
};

function parseLines(text: string): string[] | undefined {
  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.length ? lines : undefined;
}

function sortedIds(ids: string[]): string[] {
  return [...ids].sort();
}

function idsEqual(a: string[], b: string[]): boolean {
  const sa = sortedIds(a);
  const sb = sortedIds(b);
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

function AiBlockFields({
  block,
  aiIndex,
  editable,
  generating,
  sceneCharacterIds,
  characterOptions,
  onUpdate,
  onGenerate,
  onSave,
}: {
  block: ScenePassageAiBlock;
  aiIndex: number;
  editable: boolean;
  generating: boolean;
  sceneCharacterIds: string[];
  characterOptions: Array<{id: string; name: string}>;
  onUpdate?: (fn: (b: ScenePassageAiBlock) => ScenePassageAiBlock) => void;
  onGenerate?: () => void;
  onSave?: () => void | Promise<void>;
}) {
  const patch = (p: Partial<ScenePassageAiBlock>) =>
    onUpdate?.((b) => ({...b, ...p}));

  const pool = characterOptions.filter((c) => sceneCharacterIds.includes(c.id));
  const selectedIds = block.characterIds !== undefined ? block.characterIds : sceneCharacterIds;
  const inheritsScene = block.characterIds === undefined;
  const displayValue = selectedIds.length
    ? selectedIds.map((id) => pool.find((c) => c.id === id)?.name ?? id).join(', ')
    : inheritsScene
      ? '（继承场景出场人物，当前无）'
      : '（本块无对白角色）';

  return (
    <>
      <FieldRow label="summary *" value={block.summary} editable={editable && !!onUpdate}>
        <textarea
          value={block.summary ?? ''}
          onChange={(e) => patch({summary: e.target.value})}
          style={{...styles.input, ...styles.textarea, minHeight: 56}}
        />
      </FieldRow>
      <FieldRow label="wordCount *" value={String(block.wordCount ?? DEFAULT_AI_WORD_COUNT)} editable={editable && !!onUpdate}>
        <input
          type="number"
          min={AI_WORD_COUNT_MIN}
          max={AI_WORD_COUNT_MAX}
          value={block.wordCount ?? DEFAULT_AI_WORD_COUNT}
          onChange={(e) => {
            const n = Number(e.target.value);
            patch({wordCount: Number.isNaN(n) ? DEFAULT_AI_WORD_COUNT : n});
          }}
          style={{...styles.input, width: 120}}
        />
      </FieldRow>
      <FieldRow label="emotion" value={block.emotion ?? ''} editable={editable && !!onUpdate}>
        <input value={block.emotion ?? ''} onChange={(e) => patch({emotion: e.target.value || undefined})} style={styles.input} />
      </FieldRow>
      <FieldRow label="perspective" value={block.perspective ?? ''} editable={editable && !!onUpdate}>
        <input value={block.perspective ?? ''} onChange={(e) => patch({perspective: e.target.value || undefined})} style={styles.input} />
      </FieldRow>
      <FieldRow label="priority" value={block.priority ?? 'medium'} editable={editable && !!onUpdate}>
        {editable && onUpdate ? (
          <select
            value={block.priority ?? 'medium'}
            onChange={(e) => patch({priority: e.target.value as AiBlockPriority})}
            style={styles.input}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        ) : (
          <div style={styles.readOnlyValue}>{block.priority ?? 'medium'}</div>
        )}
      </FieldRow>
      <FieldRow label="style" value={block.style ?? ''} editable={editable && !!onUpdate}>
        <input value={block.style ?? ''} onChange={(e) => patch({style: e.target.value || undefined})} style={styles.input} placeholder="白描为主" />
      </FieldRow>
      <FieldRow label="pacing" value={block.pacing ?? ''} editable={editable && !!onUpdate}>
        <input value={block.pacing ?? ''} onChange={(e) => patch({pacing: e.target.value || undefined})} style={styles.input} />
      </FieldRow>
      <FieldRow label="voice" value={block.voice ?? ''} editable={editable && !!onUpdate}>
        <input value={block.voice ?? ''} onChange={(e) => patch({voice: e.target.value || undefined})} style={styles.input} placeholder="第一人称限知" />
      </FieldRow>
      {editable && onUpdate ? (
        pool.length > 0 ? (
          <MultiSelectField
            label="本块可发言人物"
            hint="仅限场景「出场人物」；不自定义时与出场人物一致，可缩小本块可发言范围。"
            options={pool}
            value={selectedIds}
            addPlaceholder="添加可发言人物…"
            emptyHint="（本块无对白角色）"
            onChange={(ids) => {
              if (idsEqual(ids, sceneCharacterIds)) {
                patch({characterIds: undefined});
              } else {
                patch({characterIds: ids.length ? ids : []});
              }
            }}
          />
        ) : (
          <div style={styles.row}>
            <label style={styles.label}>本块可发言人物</label>
            <p style={{fontSize: 12, color: '#888'}}>请先在下方添加场景「出场人物」。</p>
          </div>
        )
      ) : (
        <FieldRow label="本块可发言人物" value={displayValue} editable={false} />
      )}
      {editable && onUpdate && !inheritsScene && pool.length > 0 && (
        <button
          type="button"
          style={{...styles.btnSmall, marginBottom: 12}}
          onClick={() => patch({characterIds: undefined})}
        >
          恢复继承场景人物
        </button>
      )}
      <FieldRow label="anchors（每行一条）" value={(block.anchors ?? []).join('\n')} editable={editable && !!onUpdate}>
        <textarea
          value={(block.anchors ?? []).join('\n')}
          onChange={(e) => patch({anchors: parseLines(e.target.value)})}
          style={{...styles.input, ...styles.textarea, minHeight: 48}}
        />
      </FieldRow>
      <FieldRow label="forbidden（每行一条）" value={(block.forbidden ?? []).join('\n')} editable={editable && !!onUpdate}>
        <textarea
          value={(block.forbidden ?? []).join('\n')}
          onChange={(e) => patch({forbidden: parseLines(e.target.value)})}
          style={{...styles.input, ...styles.textarea, minHeight: 40}}
        />
      </FieldRow>
      <FieldRow label="constraints" value={block.constraints ?? ''} editable={editable && !!onUpdate}>
        <textarea
          value={block.constraints ?? ''}
          onChange={(e) => patch({constraints: e.target.value || undefined})}
          style={{...styles.input, ...styles.textarea, minHeight: 48}}
          placeholder="勿复述 raw；对白格式等"
        />
      </FieldRow>
      <div style={styles.row}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <label style={{...styles.label, marginBottom: 0}}>generatedText</label>
          {editable && (onGenerate || onSave) && (
            <div style={{display: 'flex', gap: 8, flexShrink: 0}}>
              {onGenerate && (
                <button
                  type="button"
                  style={{...styles.btnSmall, opacity: generating ? 0.6 : 1}}
                  disabled={generating || !block.summary?.trim()}
                  onClick={onGenerate}
                >
                  {generating ? '生成中…' : '生成内容'}
                </button>
              )}
              {onSave && (
                <button type="button" style={styles.btnSmall} onClick={() => void onSave()}>
                  保存
                </button>
              )}
            </div>
          )}
        </div>
        {editable && onUpdate ? (
          <textarea
            value={block.generatedText ?? ''}
            onChange={(e) => patch({generatedText: e.target.value || undefined})}
            rows={8}
            style={{...styles.input, ...styles.textarea, minHeight: 160, whiteSpace: 'pre-wrap', lineHeight: 1.55}}
            placeholder="（未生成，可手动编辑或点击「生成内容」；对白宜每句单独一行）"
          />
        ) : block.generatedText ? (
          <textarea
            readOnly
            value={block.generatedText}
            rows={8}
            style={{...styles.input, ...styles.textarea, minHeight: 160, whiteSpace: 'pre-wrap', lineHeight: 1.55, opacity: 0.9}}
          />
        ) : (
          <div style={styles.readOnlyValue}>（未生成）</div>
        )}
      </div>
    </>
  );
}

function SceneFormContent({
                            scene,
                            editable,
                            attributeDefs,
                            items,
                            mapNodeIds,
                            characterIds,
                            eventIds,
                            ruleIds: ruleList,
                            gameRules,
                            onUpdateRule,
                            onSaveRules,
                            onUpdate,
                            collapsibleDefaultExpanded = false,
                            fw,
                            gameId: formGameId,
                            onScenePatched,
                            onSaveScene,
                          }: SceneFormProps) {
  const linkedEventId = scene.eventIds?.[0];
  const linkedEventBgm = linkedEventId
    ? eventIds.find((e) => e.id === linkedEventId)?.backgroundMusic
    : undefined;
  const effectiveSceneBgm = resolveSceneBackgroundMusic(scene, fw?.features);
  const [generatingAiIndex, setGeneratingAiIndex] = useState<number | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const handleGenerateBlock = async (aiIndex: number) => {
    const block = aiBlocks[aiIndex];
    if (!block?.summary?.trim()) {
      alert('请先填写 summary');
      return;
    }
    if (block.generatedText?.trim() && !window.confirm('该 AI 块已有生成正文，确认覆盖？')) return;
    if (!getAIGCApiKey()?.trim()) {
      alert('请配置 VITE_AIGC_API_KEY');
      return;
    }
    if (!import.meta.env.DEV) {
      alert('生成内容仅支持开发模式');
      return;
    }
    if (!fw || !formGameId || !onScenePatched) {
      alert('生成上下文未就绪');
      return;
    }
    const passageIdx = aiIndexToPassageBlockIndex(scene, aiIndex);
    if (passageIdx == null) return;
    setExpandedAiBlocks((prev) => new Set([...prev, aiIndex]));
    setGeneratingAiIndex(aiIndex);
    setGenError(null);
    try {
      const {scene: next} = await runGenerateAiBlock(formGameId, fw, scene, passageIdx);
      onScenePatched(next);
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGeneratingAiIndex(null);
    }
  };
  const leadingRaw = getLeadingRawBlock(scene);
  const aiBlocks = getAiBlocks(scene);
  const [expandedAiBlocks, setExpandedAiBlocks] = useState<Set<number>>(() =>
    collapsibleDefaultExpanded ? new Set(aiBlocks.map((_, i) => i)) : new Set()
  );
  const prevAiBlockCount = useRef(aiBlocks.length);

  useEffect(() => {
    if (aiBlocks.length > prevAiBlockCount.current) {
      setExpandedAiBlocks((prev) => new Set([...prev, aiBlocks.length - 1]));
    }
    prevAiBlockCount.current = aiBlocks.length;
  }, [aiBlocks.length]);

  const toggleAiBlock = (aiIndex: number) => {
    setExpandedAiBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(aiIndex)) next.delete(aiIndex);
      else next.add(aiIndex);
      return next;
    });
  };
  const overrideMap = scene.characterOverrides ?? {};
  const overrideCharacterIds = Object.keys(overrideMap);
  const toBehaviorId = (charId: string) =>
    `ovr_${charId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const updateOverride = (
    charId: string,
    patch: (current: NonNullable<GameScene['characterOverrides']>[string]) => NonNullable<GameScene['characterOverrides']>[string]
  ) => {
    if (!onUpdate) return;
    onUpdate((s) => {
      const currentMap = s.characterOverrides ?? {};
      const nextMap = {...currentMap, [charId]: patch(currentMap[charId] ?? {})};
      return {...s, characterOverrides: Object.keys(nextMap).length ? nextMap : undefined};
    });
  };
  const removeOverride = (charId: string) => {
    if (!onUpdate) return;
    onUpdate((s) => {
      const currentMap = {...(s.characterOverrides ?? {})};
      delete currentMap[charId];
      return {...s, characterOverrides: Object.keys(currentMap).length ? currentMap : undefined};
    });
  };
  return (
    <div>
      <FieldRow label="ID" value={scene.id} editable={editable && !!onUpdate}>
        <input
          value={scene.id}
          onChange={(e) => onUpdate!((s) => ({...s, id: e.target.value}))}
          style={styles.input}
          placeholder="scene_xxx"
        />
      </FieldRow>
      <FieldRow label="名称" value={scene.name} editable={editable && !!onUpdate}>
        <input
          value={scene.name}
          onChange={(e) => onUpdate!((s) => ({...s, name: e.target.value}))}
          style={styles.input}
          placeholder="市集"
        />
      </FieldRow>
      <FieldRow
        label="定调 / 史料（leading raw）"
        value={leadingRaw?.text ?? ''}
        editable={editable && !!onUpdate}
      >
        <textarea
          value={leadingRaw?.text ?? ''}
          onChange={(e) => onUpdate!((s) => upsertLeadingRaw(s, e.target.value))}
          style={{...styles.input, ...styles.textarea, minHeight: 72}}
          placeholder="本场景唯一 raw 块"
        />
      </FieldRow>

      {genError && <p style={{color: '#f88', fontSize: 13}}>{genError}</p>}
      {aiBlocks.map((block, aiIndex) => (
        <CollapsibleSection
          key={`ai-${aiIndex}`}
          title={aiBlockCollapseTitle(block, aiIndex)}
          expanded={expandedAiBlocks.has(aiIndex)}
          onToggle={() => toggleAiBlock(aiIndex)}
          rightAction={
            editable && onUpdate ? (
              <button
                type="button"
                style={{
                  ...styles.btnIcon,
                  ...(aiBlocks.length <= 1 ? {opacity: 0.45, cursor: 'not-allowed'} : {}),
                }}
                disabled={aiBlocks.length <= 1}
                title={aiBlocks.length <= 1 ? '至少保留一个 AI 块' : '删除此 AI 块'}
                onClick={() => onUpdate((s) => removeAiBlock(s, aiIndex))}
              >
                ×
              </button>
            ) : undefined
          }
        >
          <AiBlockFields
            block={block}
            aiIndex={aiIndex}
            editable={editable}
            generating={generatingAiIndex === aiIndex}
            sceneCharacterIds={scene.characterIds ?? []}
            characterOptions={characterIds}
            onUpdate={onUpdate ? (fn) => onUpdate((s) => upsertAiBlock(s, aiIndex, fn)) : undefined}
            onGenerate={() => void handleGenerateBlock(aiIndex)}
            onSave={editable && onSaveScene ? () => onSaveScene() : undefined}
          />
        </CollapsibleSection>
      ))}
      {editable && onUpdate && (
        <button type="button" style={{...styles.btnSmall, marginBottom: 12}} onClick={() => onUpdate(addAiBlock)}>
          + 添加 AI 块
        </button>
      )}

      <SingleSelectField
        label="关联地图节点"
        options={mapNodeIds.map((n) => ({id: n.id, name: `${n.mapName} / ${n.name}`}))}
        value={scene.mapNodeId}
        onChange={
          editable && onUpdate
            ? (id) => onUpdate((s) => ({...s, mapNodeId: id}))
            : undefined
        }
        readOnly={!editable || !onUpdate}
      />

      <MultiSelectField
        label="出场人物"
        options={characterIds}
        value={scene.characterIds ?? []}
        addPlaceholder="添加出场人物…"
        onChange={
          editable && onUpdate
            ? (ids) => onUpdate((s) => ({...s, characterIds: ids.length ? ids : undefined}))
            : undefined
        }
        readOnly={!editable || !onUpdate}
      />

      <MultiSelectField
        label="对手戏人物集（counterpartCharacterIds）"
        options={characterIds}
        value={scene.counterpartCharacterIds ?? []}
        addPlaceholder="添加对手戏人物…"
        onChange={
          editable && onUpdate
            ? (ids) => onUpdate((s) => ({...s, counterpartCharacterIds: ids.length ? ids : undefined}))
            : undefined
        }
        readOnly={!editable || !onUpdate}
      />

      <SingleSelectField
        label="关联事件"
        options={eventIds}
        value={linkedEventId}
        onChange={
          editable && onUpdate
            ? (id) => onUpdate((s) => ({...s, eventIds: id ? [id] : undefined}))
            : undefined
        }
        readOnly={!editable || !onUpdate}
      />

      <div style={styles.row}>
        <label style={styles.label}>角色覆写（characterOverrides）</label>
        {editable && onUpdate ? (
          <>
            <MultiSelectField
              label=""
              options={characterIds}
              value={overrideCharacterIds}
              addPlaceholder="添加覆写角色…"
              emptyHint="未启用角色覆写"
              onChange={(ids) => {
                const prev = new Set(overrideCharacterIds);
                const next = new Set(ids);
                for (const id of prev) {
                  if (!next.has(id)) removeOverride(id);
                }
                for (const id of ids) {
                  if (!prev.has(id)) updateOverride(id, (x) => x);
                }
              }}
            />
            {overrideCharacterIds.length === 0 ? (
              <div style={styles.readOnlyValue}>未启用角色覆写</div>
            ) : (
              overrideCharacterIds.map((charId) => {
                const char = characterIds.find((c) => c.id === charId);
                const ovr = overrideMap[charId] ?? {};
                const lib = ovr.behaviorLibrary ?? [];
                return (
                  <div key={`ovr-${charId}`} style={{...styles.card, marginBottom: 12}}>
                    <div style={styles.cardHead}>
                      <span>{char?.name ?? charId}（{charId}）</span>
                      <button type="button" style={styles.btnSmall} onClick={() => removeOverride(charId)}>
                        移除覆写
                      </button>
                    </div>
                    <div style={{padding: 12}}>
                      <div style={styles.row}>
                        <label style={styles.label}>描述覆写</label>
                        <textarea
                          value={ovr.description ?? ''}
                          onChange={(e) =>
                            updateOverride(charId, (x) => ({...x, description: e.target.value || undefined}))
                          }
                          style={{...styles.input, ...styles.textarea, minHeight: 60}}
                          placeholder="留空表示不覆写人物描述"
                        />
                      </div>
                      <AttributeValuesCard
                        attributeDefs={attributeDefs}
                        values={ovr.attributes}
                        onChange={(v) =>
                          updateOverride(charId, (x) => ({
                            ...x,
                            attributes: Object.keys(v).length ? v : undefined,
                          }))
                        }
                        title="属性覆写（整对象替换）"
                        readOnly={false}
                      />
                      <InventoryValuesCard
                        items={items}
                        inventory={ovr.inventory ?? []}
                        onChange={(ids) =>
                          updateOverride(charId, (x) => ({
                            ...x,
                            inventory: ids.length ? ids : undefined,
                          }))
                        }
                        title="背包覆写（数组 replace）"
                        readOnly={false}
                      />
                      <div style={styles.row}>
                        <label style={styles.label}>行为库覆写（数组 replace）</label>
                        {lib.map((b, i) => (
                          <div key={`${charId}-${b.id}-${i}`} style={{...styles.card, marginBottom: 8}}>
                            <div style={{padding: 10}}>
                              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
                                <span style={{fontSize: 12, color: '#aaa'}}>行为 #{i + 1}</span>
                                <button
                                  type="button"
                                  style={styles.btnSmall}
                                  onClick={() =>
                                    updateOverride(charId, (x) => ({
                                      ...x,
                                      behaviorLibrary: (x.behaviorLibrary ?? []).filter((_, idx) => idx !== i),
                                    }))
                                  }
                                >
                                  删除
                                </button>
                              </div>
                              <input
                                value={b.id}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, id: e.target.value} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="行为 id"
                              />
                              <input
                                value={b.q}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, q: e.target.value} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="请求 q"
                              />
                              <input
                                value={b.a}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, a: e.target.value} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="响应 a"
                              />
                              <select
                                value={b.t ?? 'dialog'}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, t: e.target.value as GameBehavior['t']} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                              >
                                <option value="dialog">dialog</option>
                                <option value="action">action</option>
                              </select>
                              <input
                                value={b.actionKind ?? ''}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, actionKind: e.target.value || undefined} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="actionKind（可选）"
                              />
                              <input
                                value={(b.sceneIds ?? []).join(',')}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i
                                        ? {
                                          ...it,
                                          sceneIds: e.target.value
                                            .split(',')
                                            .map((s) => s.trim())
                                            .filter(Boolean).length
                                            ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                                            : undefined,
                                        }
                                        : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="sceneIds（逗号分隔，可选）"
                              />
                              <input
                                value={b.judgeExpr ?? ''}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, judgeExpr: e.target.value || undefined} : it
                                    ),
                                  }))
                                }
                                style={{...styles.input, marginBottom: 8}}
                                placeholder="judgeExpr（可选）"
                              />
                              <input
                                value={b.writebackExpr ?? ''}
                                onChange={(e) =>
                                  updateOverride(charId, (x) => ({
                                    ...x,
                                    behaviorLibrary: (x.behaviorLibrary ?? []).map((it, idx) =>
                                      idx === i ? {...it, writebackExpr: e.target.value || undefined} : it
                                    ),
                                  }))
                                }
                                style={styles.input}
                                placeholder="writebackExpr（可选）"
                              />
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          style={styles.btnSmall}
                          onClick={() =>
                            updateOverride(charId, (x) => ({
                              ...x,
                              behaviorLibrary: [
                                ...(x.behaviorLibrary ?? []),
                                {id: toBehaviorId(charId), q: '', a: '', t: 'dialog'},
                              ],
                            }))
                          }
                        >
                          + 添加覆写行为
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        ) : (
          <div style={styles.readOnlyValue}>
            {overrideCharacterIds.length
              ? overrideCharacterIds.map((id) => characterIds.find((c) => c.id === id)?.name ?? id).join(', ')
              : '-'}
          </div>
        )}
      </div>

      <RuleIdsSelector
        ruleList={ruleList}
        value={scene.ruleIds ?? []}
        onChange={(ids) => onUpdate?.((s) => ({...s, ruleIds: ids.length ? ids : undefined}))}
        readOnly={!editable || !onUpdate}
        label="规则"
        gameRules={gameRules}
        usageContext={{sceneId: scene.id}}
        onUpdateRule={onUpdateRule}
        onSaveRules={onSaveRules}
      />
      <FieldRow label="条件表达式" value={scene.conditions ?? ''} editable={editable && !!onUpdate}>
        <input
          value={scene.conditions ?? ''}
          onChange={(e) => onUpdate!((s) => ({...s, conditions: e.target.value || undefined}))}
          style={styles.input}
          placeholder="$time == 'day'"
        />
      </FieldRow>

      <ItemsEditorCard
        items={items}
        give={Array.isArray(scene.stateActions?.give) ? scene.stateActions.give : scene.stateActions?.give ? [scene.stateActions.give] : []}
        take={Array.isArray(scene.stateActions?.take) ? scene.stateActions.take : scene.stateActions?.take ? [scene.stateActions.take] : []}
        onChange={
          onUpdate
            ? (give, take) =>
              onUpdate((s) => ({
                ...s,
                stateActions: {
                  ...s.stateActions,
                  give: give.length ? give : undefined,
                  take: take.length ? take : undefined,
                },
              }))
            : undefined
        }
        title="物品"
        readOnly={!editable || !onUpdate}
      />

      <StringListField
        label="消息列表"
        hint="无关联事件时，游戏标题区滚动展示；场景已关联事件时由事件消息接管。"
        value={scene.messages}
        onChange={(messages) =>
          onUpdate?.((s) => ({...s, messages: messages.length === 0 ? undefined : messages}))
        }
        editable={editable && !!onUpdate}
        placeholder="滚动消息"
      />

      {fw ? (
        <SceneRoutingFields fw={fw} scene={scene} editable={editable && !!onUpdate} onUpdate={onUpdate} />
      ) : null}

      <SingleSelectField
        label="支线失败结局"
        options={[
          {id: 'yes', name: '是'},
          {id: 'no', name: '否'},
        ]}
        value={scene.branchFailureEnding ? 'yes' : 'no'}
        allowEmpty={false}
        hint="选「是」且 BGM/配图为空时，汇编与运行将回落「功能」页的统一失败结局预设。"
        readOnly={!editable || !onUpdate}
        onChange={
          onUpdate
            ? (id) => {
                const yes = id === 'yes';
                onUpdate((s) => ({
                  ...s,
                  branchFailureEnding: yes,
                  ...sceneMediaDefaultsOnBranchFailureToggle(),
                }));
              }
            : undefined
        }
      />
      {scene.branchFailureEnding ? (
        <FieldRow
          label="失败结局说明"
          value={scene.branchFailureEndingText ?? ''}
          editable={editable && !!onUpdate}
        >
          <input
            value={scene.branchFailureEndingText ?? ''}
            onChange={(e) =>
              onUpdate!((s) => ({
                ...s,
                branchFailureEndingText: e.target.value || undefined,
              }))
            }
            style={styles.input}
            placeholder="汇编模板占位符 {{failureEnding}}"
          />
        </FieldRow>
      ) : null}

      <FieldRow
        label="主线出口文案"
        value={scene.mainlineLinkDisplayText ?? ''}
        editable={editable && !!onUpdate}
      >
        <input
          value={scene.mainlineLinkDisplayText ?? ''}
          onChange={(e) =>
            onUpdate!((s) => ({
              ...s,
              mainlineLinkDisplayText: e.target.value.trim() || undefined,
            }))
          }
          style={styles.input}
          placeholder="同章有后续主线且配置了 branchOptions 时必填，如：誓行严禁"
        />
      </FieldRow>

      <MediaUrlField
        label="开场动画"
        value={scene.openingAnimation}
        onChange={(v) => onUpdate?.((s) => ({...s, openingAnimation: v}))}
        editable={editable && !!onUpdate}
      />
      <MediaUrlField
        label="配图"
        value={scene.images?.[0] ?? ''}
        onChange={(v) =>
          onUpdate?.((s) => ({
            ...s,
            images: v === undefined ? undefined : [v ?? ''],
          }))
        }
        placeholder={defaultSceneImageSavePath(scene.id)}
        editable={editable && !!onUpdate}
        preserveEmptyString
      />
      <MediaUrlField
        label="背景音乐"
        value={scene.backgroundMusic ?? ''}
        onChange={(v) => onUpdate?.((s) => ({...s, backgroundMusic: v}))}
        placeholder={`media_custom/bgm/${scene.id}.wav`}
        editable={editable && !!onUpdate}
        preserveEmptyString
      />
      <BgmSynthesisField
        gameId={formGameId}
        sceneId={scene.id}
        sceneBgm={effectiveSceneBgm}
        eventBgm={linkedEventBgm}
        synthesizedBgm={scene.synthesizedBgm}
        onSynthesizedBgmChange={
          editable && onUpdate
            ? (v) => onUpdate((s) => ({...s, synthesizedBgm: v}))
            : undefined
        }
        editable={editable && !!onUpdate}
      />
    </div>
  );
}

async function preloadForScenes(updateFw: (fn: (d: StoryFramework) => StoryFramework) => void, gameId: string) {
  const apis: Array<{ url: string; key: keyof StoryFramework }> = [
    {url: getMapsFetchUrl(gameId), key: 'maps'},
    {url: getCharactersFetchUrl(gameId), key: 'characters'},
    {url: getEventsFetchUrl(gameId), key: 'events'},
    {url: getItemsFetchUrl(gameId), key: 'items'},
    {url: getMetadataFetchUrl(gameId), key: 'metadata'},
    {url: getRulesFetchUrl(gameId), key: 'gameRules'},
  ];
  for (const {url, key} of apis) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const parsed = key === 'metadata'
          ? (data?.characterAttributes ? {characterAttributes: data.characterAttributes} : null)
          : (Array.isArray(data) ? data : null);
        if (parsed) {
          const value = key === 'gameRules' ? normalizeGameRules(parsed as GameRule[]) : parsed;
          updateFw((d) => ({...d, [key]: value}));
        }
      }
    } catch {
      // ignore
    }
  }
  try {
    const res = await fetch(getFeaturesFetchUrl(gameId));
    if (res.ok) {
      const data = (await res.json()) as FeaturesConfig;
      updateFw((d) => ({...d, features: normalizeFeaturesConfig(data)}));
    }
  } catch {
    // ignore
  }
}

export function SceneEditor({
                              fw,
                              updateFw,
                            }: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const {gameId} = useGameId();
  const {checkAuthForSave} = useAuth();
  useEffect(() => {
    preloadForScenes(updateFw, gameId);
  }, [updateFw, gameId]);

  useEffect(() => {
    fetch(getRulesFetchUrl(gameId))
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? normalizeGameRules(data as GameRule[]) : [];
        if (list.length) updateFw((d) => ({...d, gameRules: list}));
      })
      .catch(() => {});
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

  const scenes = fw.scenes ?? [];
  const setScenes = (fn: (s: GameScene[]) => GameScene[]) =>
    updateFw((d) => ({...d, scenes: fn(d.scenes ?? [])}));

  const items = fw.items ?? [];
  const attributeDefs = fw.metadata?.characterAttributes ?? [];
  const mapNodeIds: Array<{ id: string; name: string; mapName: string }> = [];
  for (const map of fw.maps ?? []) {
    for (const n of map.nodes) mapNodeIds.push({id: n.id, name: n.name, mapName: map.name});
  }
  const characterIds = (fw.characters ?? []).map((c) => ({id: c.id, name: c.name}));
  const eventIds = (fw.events ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    backgroundMusic: e.backgroundMusic,
  }));
  const gameRules = useMemo(() => normalizeGameRules(fw.gameRules ?? []), [fw.gameRules]);
  const ruleIds = gameRules.map((r) => ({id: r.id, name: r.name}));

  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newScene, setNewScene] = useState<GameScene>(() => ({
    id: `scene_${Date.now()}`,
    name: '新场景',
    passageBlocks: defaultPassageBlocks(),
  }));

  const openAddModal = () => {
    setNewScene({id: `scene_${Date.now()}`, name: '新场景', passageBlocks: defaultPassageBlocks()});
    setAddModalOpen(true);
  };

  const confirmAddScene = async () => {
    const next = [...scenes, {...newScene, messages: normalizeStringList(newScene.messages)}];
    setScenes(() => next);
    const result = await saveScenesToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  const updateScene = (index: number, fn: (s: GameScene) => GameScene) =>
    setScenes((s) => s.map((x, i) => (i === index ? fn(x) : x)));

  const removeScene = async (index: number) => {
    const next = scenes.filter((_, i) => i !== index);
    setScenes(() => next);
    const result = await saveScenesToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };
  const removeSceneWithAuth = (index: number) => checkAuthForSave(() => removeScene(index));

  const saveScenes = async () => {
    const normalized = scenes.map((s) => ({...s, messages: normalizeStringList(s.messages)}));
    setScenes(() => normalized);
    const result = await saveScenesToPreset(normalized, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setEditIndex(null);
  };

  const persistScenes = async () => {
    const normalized = scenes.map((s) => ({...s, messages: normalizeStringList(s.messages)}));
    setScenes(() => normalized);
    const result = await saveScenesToPreset(normalized, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };

  const updateRule = (ruleId: string, fn: (r: GameRule) => GameRule) =>
    updateFw((d) => {
      const rules = normalizeGameRules(d.gameRules ?? []);
      const idx = rules.findIndex((r) => r.id === ruleId);
      if (idx < 0) return d;
      return {
        ...d,
        gameRules: rules.map((r, i) => (i === idx ? normalizeGameRule(fn(r)) : r)),
      };
    });

  const saveRules = async () => {
    const result = await saveRulesToPreset(fw.gameRules ?? [], gameId);
    if (!result.ok) alert(`保存规则失败: ${result.error}`);
  };

  const narrativeFormProps = {
    fw,
    onScenePatched: (patched: GameScene) => {
      if (editIndex === null) return;
      const next = scenes.map((s, i) => (i === editIndex ? patched : s));
      setScenes(() => next);
      void checkAuthForSave(async () => {
        const normalized = next.map((s) => ({...s, messages: normalizeStringList(s.messages)}));
        setScenes(() => normalized);
        const result = await saveScenesToPreset(normalized, gameId);
        if (!result.ok) alert(`保存失败: ${result.error}`);
      });
    },
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>场景</h1>
        <button type="button" style={styles.btn} onClick={openAddModal}>
          + 添加场景
        </button>
      </header>

      <section style={styles.section}>
        {scenes.length === 0 && (
          <p style={{color: '#888', fontSize: 14}}>暂无场景，点击「添加场景」创建。</p>
        )}

        {scenes.map((scene, ci) => (
          <div key={`scene-${ci}`} style={styles.card}>
            <div style={styles.cardHead}>
              <span
                style={{fontWeight: 600, flex: 1, cursor: 'pointer'}}
                onClick={() => setDetailIndex(ci)}
              >
                {scene.name}
                <span style={{marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400}}>
                  {scene.id}
                </span>
              </span>
              <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <button type="button" style={styles.btnIcon} onClick={() => setEditIndex(ci)} title="编辑">
                  ✎
                </button>
                <button type="button" style={styles.btnIcon} onClick={() => removeSceneWithAuth(ci)} title="删除">
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {detailIndex !== null && scenes[detailIndex] && (
        <DetailEditModal
          title="场景详情"
          open={true}
          onClose={() => setDetailIndex(null)}
          editable={false}>
          <SceneFormContent
            scene={scenes[detailIndex]}
            editable={false}
            attributeDefs={attributeDefs}
            items={items}
            mapNodeIds={mapNodeIds}
            characterIds={characterIds}
            eventIds={eventIds}
            gameId={gameId}
            ruleIds={ruleIds}
            gameRules={gameRules}
            collapsibleDefaultExpanded
          />
        </DetailEditModal>
      )}

      {editIndex !== null && scenes[editIndex] && (
        <DetailEditModal
          title="编辑场景"
          open={true}
          onClose={() => setEditIndex(null)}
          editable={true}
          onSave={() => checkAuthForSave(saveScenes)}>
          <SceneFormContent
            scene={scenes[editIndex]}
            editable={true}
            attributeDefs={attributeDefs}
            items={items}
            mapNodeIds={mapNodeIds}
            characterIds={characterIds}
            eventIds={eventIds}
            gameId={gameId}
            ruleIds={ruleIds}
            gameRules={gameRules}
            onUpdateRule={updateRule}
            onSaveRules={() => checkAuthForSave(saveRules)}
            onUpdate={(fn) => updateScene(editIndex, fn)}
            onSaveScene={() => checkAuthForSave(persistScenes)}
            {...narrativeFormProps}
          />
        </DetailEditModal>
      )}

      {addModalOpen && (
        <DetailEditModal
          title="添加场景"
          open={true}
          onClose={() => setAddModalOpen(false)}
          editable={true}
          onSave={() => checkAuthForSave(confirmAddScene)}
        >
          <SceneFormContent
            scene={newScene}
            editable={true}
            attributeDefs={attributeDefs}
            items={items}
            mapNodeIds={mapNodeIds}
            characterIds={characterIds}
            eventIds={eventIds}
            gameId={gameId}
            ruleIds={ruleIds}
            gameRules={gameRules}
            onUpdateRule={updateRule}
            onSaveRules={() => checkAuthForSave(saveRules)}
            onUpdate={(fn) => setNewScene(fn(newScene))}
          />
        </DetailEditModal>
      )}
    </div>
  );
}
