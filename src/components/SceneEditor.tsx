/**
 * 场景编辑界面
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {getAIGCApiKey, getScenesFetchUrl, getRulesFetchUrl, getStoryFmFetchUrl} from '@/config';
import {runGenerateAiBlock} from '@/services/scene-block-generation';
import {saveStoryScenes} from '@/services/story-scenes-persist';
import {
  loadStoryFromGame,
  lookupKeysForSceneEntry,
  syncRoutingLinksForGame,
} from '@/services/scene-routing-sync-service';
import {collectRoutingStaleScenes} from '../utils/scene-routing-sync';
import {getChapterAvailableSceneIds} from '../utils/chapter-scene';
import {toPersistedFramework} from '../schema/story-framework';
import {loadFrameworkWithListData, mergeRuntimeFrameworkListData} from '../services/framework-list-data';
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
import {InlineSpinner} from './ui/InlineSpinner';
import {RuleIdsSelector} from './ui/RuleIdsSelector';
import {editorStyles as styles} from '../styles/editorStyles';
import {EntityFlatList} from './ui/EntityFlatList';
import {ListAddButton, ListDeleteButton, ListOpsCell} from './ui/ListPrimitives';
import {listBtnIcon} from '../styles/listStyles';
import type {GameRule} from '../schema/game-rule';
import {normalizeGameRule, normalizeGameRules} from '../utils/normalize-game-rules';
import {serializeStoryRulesBundle} from '../utils/parse-story-rules';
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
import {resolveSceneBackgroundMusic} from '../utils/scene-media';
import {useNarrativeTruth} from '../context/NarrativeTruthContext';
import {fetchStoryCanon, fetchStoryForeshadowing} from '@/utils/story-engine-files';
import {EMPTY_STORY_CANON, normalizeStoryCanon, type StoryCanon} from '@/schema/story-canon';
import {
  EMPTY_STORY_FORESHADOWING,
  normalizeStoryForeshadowing,
  type StoryForeshadowing,
} from '@/schema/story-foreshadowing';
import {SceneNarrativePanel} from './SceneNarrativePanel';

const collapsibleStyles: Record<string, React.CSSProperties> = {
  section: {marginBottom: 12, padding: 10, border: '1px solid #444', borderRadius: 6},
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    fontSize: 12,
    color: '#9ca3af',
    userSelect: 'none',
  },
  title: {flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'},
  body: {paddingTop: 8},
};

function SaveIcon({size = 16, style}: {size?: number; style?: React.CSSProperties}) {
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function GenerateHammerIcon({size = 16, style}: {size?: number; style?: React.CSSProperties}) {
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
      <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9" />
      <path d="m18 15 4-4" />
      <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756l-.455.453" />
    </svg>
  );
}

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  headActions,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  headActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={collapsibleStyles.section}>
      <div
        style={collapsibleStyles.head}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span style={{display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0}}>
          <span style={{flexShrink: 0}}>{expanded ? '▼' : '▶'}</span>
          <span style={collapsibleStyles.title}>{title}</span>
        </span>
        {headActions ? (
          <ListOpsCell>
            <span onClick={(e) => e.stopPropagation()} style={{display: 'contents'}}>
              {headActions}
            </span>
          </ListOpsCell>
        ) : null}
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
  return saveStoryScenes(gameId, scenes);
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
  routingStaleEntry?: import('../utils/scene-routing-sync').RoutingStaleEntry;
  onSyncSceneRouting?: () => void | Promise<void>;
  syncingSceneRouting?: boolean;
  foreshadowing?: StoryForeshadowing;
  canon?: StoryCanon;
  allScenes?: GameScene[];
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
  sceneCharacterIds,
  characterOptions,
  onUpdate,
}: {
  block: ScenePassageAiBlock;
  aiIndex: number;
  editable: boolean;
  sceneCharacterIds: string[];
  characterOptions: Array<{id: string; name: string}>;
  onUpdate?: (fn: (b: ScenePassageAiBlock) => ScenePassageAiBlock) => void;
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
        <label style={styles.label}>generatedText</label>
        {editable && onUpdate ? (
          <textarea
            value={block.generatedText ?? ''}
            onChange={(e) => patch({generatedText: e.target.value || undefined})}
            rows={8}
            style={{...styles.input, ...styles.textarea, minHeight: 160, whiteSpace: 'pre-wrap', lineHeight: 1.55}}
            placeholder="（未生成，可手动编辑或点击标题栏锤子图标生成；对白宜每句单独一行）"
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
                            routingStaleEntry,
                            onSyncSceneRouting,
                            syncingSceneRouting,
                            foreshadowing,
                            canon,
                            allScenes,
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

      {foreshadowing && canon && allScenes && (
        <SceneNarrativePanel
          sceneId={scene.id}
          scenes={allScenes}
          foreshadowing={foreshadowing}
          canon={canon}
          characterIds={characterIds}
        />
      )}

      {genError && <p style={{color: '#f88', fontSize: 13}}>{genError}</p>}
      {aiBlocks.map((block, aiIndex) => (
        <CollapsibleSection
          key={`ai-${aiIndex}`}
          title={aiBlockCollapseTitle(block, aiIndex)}
          expanded={expandedAiBlocks.has(aiIndex)}
          onToggle={() => toggleAiBlock(aiIndex)}
          headActions={
            editable && onUpdate ? (
              <>
                <button
                  type="button"
                  style={{...listBtnIcon, display: 'flex', alignItems: 'center'}}
                  disabled={generatingAiIndex === aiIndex || !block.summary?.trim()}
                  title={
                    generatingAiIndex === aiIndex
                      ? '生成中…'
                      : !block.summary?.trim()
                        ? '请先填写 summary'
                        : '生成内容'
                  }
                  onClick={() => void handleGenerateBlock(aiIndex)}
                >
                  {generatingAiIndex === aiIndex ? <InlineSpinner /> : <GenerateHammerIcon />}
                </button>
                {onSaveScene ? (
                  <button
                    type="button"
                    style={{...listBtnIcon, display: 'flex', alignItems: 'center'}}
                    title="保存场景"
                    onClick={() => void onSaveScene()}
                  >
                    <SaveIcon />
                  </button>
                ) : null}
                <ListDeleteButton
                  title="删除此 AI 块"
                  confirmMessage={`确认删除「${aiBlockCollapseTitle(block, aiIndex)}」？`}
                  disabled={aiBlocks.length <= 1}
                  stopPropagation
                  onClick={() => onUpdate((s) => removeAiBlock(s, aiIndex))}
                />
              </>
            ) : undefined
          }
        >
          <AiBlockFields
            block={block}
            aiIndex={aiIndex}
            editable={editable}
            sceneCharacterIds={scene.characterIds ?? []}
            characterOptions={characterIds}
            onUpdate={onUpdate ? (fn) => onUpdate((s) => upsertAiBlock(s, aiIndex, fn)) : undefined}
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

      <FieldRow label="失败支线" value={scene.isFailure ? '是' : '否'} editable={editable && !!onUpdate}>
        <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d1d5db'}}>
          <input
            type="checkbox"
            checked={!!scene.isFailure}
            onChange={(e) =>
              onUpdate!((s) => ({
                ...s,
                isFailure: e.target.checked || undefined,
                ...(!e.target.checked
                  ? {failureEnding: undefined, branchEndingText: undefined}
                  : {}),
              }))
            }
          />
          本场景为失败支线结局
        </label>
      </FieldRow>
      {scene.isFailure ? (
        <>
          <FieldRow label="failureEnding" value={scene.failureEnding ?? ''} editable={editable && !!onUpdate}>
            <input
              value={scene.failureEnding ?? ''}
              onChange={(e) => onUpdate!((s) => ({...s, failureEnding: e.target.value || undefined}))}
              style={styles.input}
              placeholder="失败结局描述（套入功能面板模板）"
            />
          </FieldRow>
          <FieldRow label="branchEndingText" value={scene.branchEndingText ?? ''} editable={editable && !!onUpdate}>
            <textarea
              value={scene.branchEndingText ?? ''}
              onChange={(e) => onUpdate!((s) => ({...s, branchEndingText: e.target.value || undefined}))}
              style={{...styles.input, minHeight: 64}}
              placeholder="可选，覆盖末端附加文案"
            />
          </FieldRow>
        </>
      ) : null}

      {fw ? (
        <SceneRoutingFields
          fw={fw}
          scene={scene}
          routingStale={!!routingStaleEntry}
          expectedLinks={routingStaleEntry?.expectedLinks}
        />
      ) : null}

      <MediaUrlField
        label="开场动画"
        value={scene.openingAnimation}
        onChange={(v) => onUpdate?.((s) => ({...s, openingAnimation: v}))}
        editable={editable && !!onUpdate}
      />
      <FieldRow
        label="过场动画提示词"
        value={scene.openingAnimationPrompt ?? ''}
        editable={editable && !!onUpdate}
      >
        <textarea
          value={scene.openingAnimationPrompt ?? ''}
          onChange={(e) =>
            onUpdate?.((s) => ({...s, openingAnimationPrompt: e.target.value || undefined}))
          }
          style={{...styles.input, minHeight: 64}}
          placeholder="创作过场动画时的参考提示词（章节保存时由 AI 根据跨章过渡生成）"
        />
      </FieldRow>
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

export function SceneEditor({
                              fw,
                              updateFw,
                              initialSceneId,
                              onInitialSceneConsumed,
                            }: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
  initialSceneId?: string | null;
  onInitialSceneConsumed?: () => void;
}) {
  const {gameId} = useGameId();
  const {checkAuthForSave} = useAuth();
  const {revision: narrativeTruthRevision} = useNarrativeTruth();
  const [foreshadowing, setForeshadowing] = useState<StoryForeshadowing>(EMPTY_STORY_FORESHADOWING);
  const [canon, setCanon] = useState<StoryCanon>(EMPTY_STORY_CANON);
  const [parsedStory, setParsedStory] = useState<Awaited<ReturnType<typeof loadStoryFromGame>>>(null);
  const [syncingSceneRoutingId, setSyncingSceneRoutingId] = useState<string | null>(null);

  const reloadParsedStory = useCallback(async () => {
    try {
      setParsedStory(await loadStoryFromGame(gameId));
    } catch {
      setParsedStory(null);
    }
  }, [gameId]);

  useEffect(() => {
    void reloadParsedStory();
  }, [reloadParsedStory]);

  useEffect(() => {
    void (async () => {
      const [fs, c] = await Promise.all([fetchStoryForeshadowing(gameId), fetchStoryCanon(gameId)]);
      setForeshadowing(normalizeStoryForeshadowing(fs));
      setCanon(normalizeStoryCanon(c));
    })();
  }, [gameId, narrativeTruthRevision]);

  const persistFrameworkRouting = useCallback(
    async (nextFw: StoryFramework) => {
      const res = await fetch(getStoryFmFetchUrl(gameId), {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(toPersistedFramework(nextFw)),
      });
      const data = (await res.json().catch(() => ({}))) as {ok?: boolean; error?: string};
      if (!res.ok || !data.ok) throw new Error(data.error || `保存剧情框架失败: ${res.status}`);
    },
    [gameId]
  );

  const syncSceneRouting = useCallback(
    async (sceneId: string) => {
      setSyncingSceneRoutingId(sceneId);
      try {
        const loaded = await loadFrameworkWithListData(gameId);
        if (!loaded) throw new Error('无法加载 story-fm，已取消路由同步以免覆盖章节数据');
        const fwForSync = mergeRuntimeFrameworkListData(loaded, fw);
        const result = await syncRoutingLinksForGame(gameId, fwForSync, [sceneId]);
        const nextFw = mergeRuntimeFrameworkListData(result.fw, fw);
        updateFw(() => nextFw);
        await persistFrameworkRouting(result.fw);
        await reloadParsedStory();
      } finally {
        setSyncingSceneRoutingId(null);
      }
    },
    [fw, gameId, updateFw, persistFrameworkRouting, reloadParsedStory]
  );

  const routingStaleForScene = useCallback(
    (sceneId: string) => {
      if (!parsedStory) return undefined;
      try {
        return collectRoutingStaleScenes(fw, parsedStory, (chi, sid) =>
          lookupKeysForSceneEntry(fw, chi, sid)
        ).find((s) => s.sceneId === sceneId);
      } catch {
        return undefined;
      }
    },
    [fw, parsedStory]
  );

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
  const eventNameMap = useMemo(() => new Map(eventIds.map((e) => [e.id, e.name])), [eventIds]);
  const sceneChapterTitles = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ch of fw.chapters ?? []) {
      const title = ch.title || ch.id;
      for (const sid of getChapterAvailableSceneIds(ch)) {
        const list = map.get(sid) ?? [];
        list.push(title);
        map.set(sid, list);
      }
    }
    return map;
  }, [fw.chapters]);
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

  useEffect(() => {
    if (!initialSceneId) return;
    const index = scenes.findIndex((s) => s.id === initialSceneId);
    if (index < 0) return;
    setEditIndex(index);
    onInitialSceneConsumed?.();
  }, [initialSceneId, scenes, onInitialSceneConsumed]);

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
    if (!result.ok) {
      alert(`保存失败: ${result.error}`);
      return;
    }
    const editingScene = editIndex != null ? normalized[editIndex] : undefined;
    if (editingScene) {
      try {
        await syncSceneRouting(editingScene.id);
      } catch (e) {
        alert(`场景已保存，但路由链接同步失败：${(e as Error).message}`);
      }
    }
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
    const result = await saveRulesToPreset(fw, gameId);
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
        <ListAddButton title="添加场景" onClick={openAddModal} />
      </header>

      <section style={styles.section}>
        <EntityFlatList
          count={scenes.length}
          emptyHint="暂无场景，点击 + 创建。"
          getKey={(ci) => `scene-${ci}`}
          getPrimary={(ci) => scenes[ci]!.name}
          getMeta={(ci) => scenes[ci]!.id}
          extraColumns={[
            {
              label: '章节',
              getValue: (ci) => (sceneChapterTitles.get(scenes[ci]!.id) ?? []).join('，'),
            },
            {
              label: '事件',
              getValue: (ci) =>
                (scenes[ci]!.eventIds ?? [])
                  .map((id) => eventNameMap.get(id) ?? id)
                  .join('、'),
            },
          ]}
          onOpen={setDetailIndex}
          onEdit={setEditIndex}
          onDelete={removeSceneWithAuth}
        />
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
            fw={fw}
            routingStaleEntry={routingStaleForScene(scenes[detailIndex].id)}
            foreshadowing={foreshadowing}
            canon={canon}
            allScenes={scenes}
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
            routingStaleEntry={routingStaleForScene(scenes[editIndex].id)}
            onSyncSceneRouting={() => checkAuthForSave(() => syncSceneRouting(scenes[editIndex].id))}
            syncingSceneRouting={syncingSceneRoutingId === scenes[editIndex].id}
            foreshadowing={foreshadowing}
            canon={canon}
            allScenes={scenes}
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
