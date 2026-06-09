/**
 * 剧情框架 Schema - 人工编辑的结构化剧情定义
 */

import type {GameMap} from './game-map';
import type {GameCharacter} from './game-character';
import type {GameEvent} from './game-event';
import type {GameMetadata} from './metadata';
import type {GameItem} from './game-item';
import type {GameScene} from './game-scene';
import type {GameRule} from './game-rule';
import type {FeaturesConfig} from './features';
import type {SceneRuleBinding} from './story-rules-bundle';
import {
  getChapterAvailableSceneIds,
  inferChapterEndSceneIds,
  type ChapterSceneMeta,
} from '../utils/chapter-scene';
import {migrateChapterFromLegacy} from '../utils/chapter-migration';
import {migrateFrameworkBranchModel} from '../utils/branch-model';

export type {FrameworkStateActions} from './state-actions';
export type {FrameworkStateActions as StateActions} from './state-actions';
export type {ChapterSceneMeta};

/** @deprecated 旧版场景条目，迁移后由 availableSceneIds + sceneMeta 替代 */
export interface SceneEntry {
  sceneId: string;
  ruleIds?: string[];
  compiledFingerprint?: string;
  routingFingerprint?: string;
}

/** 叙事态章节图边 */
export interface ChapterNarrativeEdge {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  displayText: string;
  /** 文案沿连线方向的位置，0=起点、1=终点；默认约 30% */
  labelPosition?: number;
  /** 起点连接方位：source-top | source-bottom | source-left | source-right（仅 handlesPinned 时持久化） */
  sourceHandle?: string;
  /** 终点连接方位：target-top | target-bottom | target-left | target-right（仅 handlesPinned 时持久化） */
  targetHandle?: string;
  /** 用户拖过连线端点时为 true；否则按主线/支线默认方位 */
  handlesPinned?: boolean;
  condition?: string;
  /** true 表示支线边（章节只定义结构，是否失败由目标场景定义） */
  isBranch?: boolean;
}

/** 跨章过渡（落地场景由目标章 startSceneId 决定） */
export interface ChapterTransition {
  fromSceneId: string;
  toChapterId: string;
  displayText: string;
  condition?: string;
}

/** 章节：场景池 + 叙事图 + 跨章定义 */
export interface FrameworkChapter {
  id: string;
  title: string;
  theme?: string;
  /** 本章可用场景池（无序） */
  availableSceneIds: string[];
  /** 是否开放世界：narrativeGraph 为 true 表示否（走叙事图）；省略表示是 */
  narrativeGraph?: Record<string, boolean>;
  /** @deprecated 已由 narrativeGraph 替代 */
  openWorld?: Record<string, boolean>;
  /** @deprecated */
  narrativeRouting?: Record<string, boolean>;
  /** @deprecated */
  sceneModes?: Record<string, 'narrative' | 'open_world'>;
  /** 叙事态推荐入口 */
  startSceneId?: string;
  /** @deprecated 章末场景改由叙事图推断，见 inferChapterEndSceneIds */
  endSceneIds?: string[];
  /** 叙事态有向图边 */
  narrativeEdges?: ChapterNarrativeEdge[];
  /** 跨章跳转 */
  transitions?: ChapterTransition[];
  /** 叙事图编辑器节点坐标（sceneId → position） */
  graphLayout?: Record<string, {x: number; y: number}>;
  /** 每场景汇编/路由指纹 */
  sceneMeta?: Record<string, ChapterSceneMeta>;
  /** @deprecated 迁移前旧字段 */
  sceneEntries?: SceneEntry[];
  /** @deprecated 已废弃 */
  startMapNodeId?: string;
  /** @deprecated 已废弃 */
  endMapNodeId?: string;
}

export const PERSISTED_FRAMEWORK_KEYS: (keyof StoryFramework)[] = [
  'title',
  'background',
  'rules',
  'chapters',
  'initialState',
  'playerCharacterId',
];

export interface StoryFramework {
  title: string;
  background?: string;
  rules?: string[];
  chapters: FrameworkChapter[];
  initialState?: {
    variables?: Record<string, string | number | boolean>;
    inventory?: string[];
  };
  playerCharacterId?: string;
  maps?: GameMap[];
  characters?: GameCharacter[];
  events?: GameEvent[];
  metadata?: GameMetadata;
  items?: GameItem[];
  scenes?: GameScene[];
  gameRules?: GameRule[];
  /** 自 story-rules.json sceneBindings 加载 */
  sceneBindings?: SceneRuleBinding[];
  features?: FeaturesConfig;
}

/** 内存迁移：旧 sceneEntries → 章节图；不修改 scenes 表（由迁移脚本处理） */
export function migrateFramework(parsed: StoryFramework): void {
  const chapters = parsed.chapters ?? [];
  const scenes = parsed.scenes ?? [];
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));

  for (const ch of chapters) {
    const legacy = ch as FrameworkChapter;
    if (!legacy.availableSceneIds?.length && (legacy.sceneEntries?.length ?? 0) > 0) {
      const {chapter, sceneBindings} = migrateChapterFromLegacy(legacy, scenes);
      const idx = chapters.indexOf(ch);
      chapters[idx] = chapter;
      if (sceneBindings.length) {
        parsed.sceneBindings = [...(parsed.sceneBindings ?? []), ...sceneBindings];
      }
    } else if (!legacy.availableSceneIds) {
      legacy.availableSceneIds = [];
    }
    migrateChapterNarrativeGraph(legacy);
    migrateChapterEndSceneIds(legacy);
  }
  migrateChapterTransitions(chapters);
  parsed.chapters = chapters;
  migrateFrameworkBranchModel(parsed);
}

function migrateChapterEndSceneIds(ch: FrameworkChapter): void {
  delete ch.endSceneIds;
}

/** 移除 transitions.toSceneId；若目标章无叙事入口则沿用旧落地场景 */
function migrateChapterTransitions(chapters: FrameworkChapter[]): void {
  for (const ch of chapters) {
    for (const tr of ch.transitions ?? []) {
      const legacy = tr as ChapterTransition & {toSceneId?: string};
      const landing = legacy.toSceneId;
      if (!landing) continue;
      const targetCh = chapters.find((c) => c.id === tr.toChapterId);
      if (targetCh && !targetCh.startSceneId) {
        targetCh.startSceneId = landing;
      }
      delete legacy.toSceneId;
    }
  }
}

/** 旧字段 → narrativeGraph（true=叙事图） */
export function migrateChapterNarrativeGraph(ch: FrameworkChapter): FrameworkChapter {
  if (ch.narrativeGraph) {
    const {sceneModes: _sm, narrativeRouting: _nr, openWorld: _ow, ...rest} = ch;
    return rest;
  }

  const narrativeGraph: Record<string, boolean> = {};
  const pool = getChapterAvailableSceneIds(ch);

  if (ch.openWorld) {
    for (const sid of pool) {
      if (ch.openWorld[sid] !== true) narrativeGraph[sid] = true;
    }
  } else if (ch.narrativeRouting) {
    for (const sid of pool) {
      if (ch.narrativeRouting[sid] === true) narrativeGraph[sid] = true;
    }
  } else if (ch.sceneModes) {
    for (const [sid, mode] of Object.entries(ch.sceneModes)) {
      if (mode === 'narrative') narrativeGraph[sid] = true;
    }
  }

  const {sceneModes: _sm, narrativeRouting: _nr, openWorld: _ow, ...rest} = ch;
  const sparse = Object.fromEntries(Object.entries(narrativeGraph).filter(([, v]) => v === true));
  return {
    ...rest,
    ...(Object.keys(sparse).length ? {narrativeGraph: sparse} : {}),
  };
}

export function toPersistedFramework(fw: StoryFramework): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PERSISTED_FRAMEWORK_KEYS) {
    const v = fw[k];
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  const chapters = (out.chapters as FrameworkChapter[] | undefined)?.map(stripDeprecatedChapterFields);
  if (chapters) out.chapters = chapters;
  return out;
}

function stripDeprecatedChapterFields(ch: FrameworkChapter): FrameworkChapter {
  const migrated = migrateChapterNarrativeGraph(ch);
  const {
    sceneEntries: _se,
    startMapNodeId: _s,
    endMapNodeId: _e,
    endSceneIds: _end,
    sceneModes: _sm,
    narrativeRouting: _nr,
    openWorld: _ow,
    ...rest
  } = migrated;
  const ng = migrated.narrativeGraph;
  const sparseNg = ng
    ? Object.fromEntries(Object.entries(ng).filter(([, v]) => v === true))
    : undefined;
  return {
    ...rest,
    ...(sparseNg && Object.keys(sparseNg).length ? {narrativeGraph: sparseNg} : {}),
  };
}

export function fromPersistedFramework(parsed: Record<string, unknown>): StoryFramework {
  const fw = {} as StoryFramework;
  for (const k of PERSISTED_FRAMEWORK_KEYS) {
    const v = parsed[k];
    if (v !== undefined) (fw as unknown as Record<string, unknown>)[k] = v;
  }
  return fw;
}

export function flattenSceneEntries(
  fw: StoryFramework
): Array<{scene: GameScene; chapterIndex: number; sceneId: string}> {
  const sceneMap = new Map<string, GameScene>();
  for (const s of fw.scenes ?? []) sceneMap.set(s.id, s);

  const result: Array<{scene: GameScene; chapterIndex: number; sceneId: string}> = [];
  for (let ci = 0; ci < (fw.chapters ?? []).length; ci++) {
    const ch = fw.chapters![ci];
    for (const sceneId of getChapterAvailableSceneIds(ch)) {
      const scene = sceneMap.get(sceneId);
      if (scene) result.push({scene, chapterIndex: ci, sceneId});
    }
  }
  return result;
}

export function toPassageId(chapterIndex: number, sceneId: string): string {
  return `ch${chapterIndex}.${sceneId}`.trim().replace(/\s+/g, '_');
}

export function validateFramework(fw: StoryFramework): {valid: boolean; errors: string[]} {
  const sceneIds = new Set((fw.scenes ?? []).map((s) => s.id));
  const chapterIds = new Set((fw.chapters ?? []).map((c) => c.id));
  const errors: string[] = [];

  for (const ch of fw.chapters ?? []) {
    const pool = new Set(getChapterAvailableSceneIds(ch));
    for (const sid of pool) {
      if (!sceneIds.has(sid)) {
        errors.push(`章节 "${ch.title}" 引用了不存在的场景: ${sid}`);
      }
    }

    for (const edge of ch.narrativeEdges ?? []) {
      if (!pool.has(edge.fromSceneId) || !pool.has(edge.toSceneId)) {
        errors.push(`章节 "${ch.title}" 边 ${edge.id} 端点不在场景池内`);
      }
    }

    const endSceneIds = inferChapterEndSceneIds(ch);

    for (const tr of ch.transitions ?? []) {
      if (!pool.has(tr.fromSceneId)) {
        errors.push(`章节 "${ch.title}" 跨章过渡起跳场景 ${tr.fromSceneId} 不在池内`);
      } else if (!endSceneIds.includes(tr.fromSceneId)) {
        errors.push(
          `章节 "${ch.title}" 跨章起跳场景 ${tr.fromSceneId} 不是推断的章末场景（${endSceneIds.join('、') || '无'}）`
        );
      }
      if (!chapterIds.has(tr.toChapterId)) {
        errors.push(`章节 "${ch.title}" 跨章目标章节 ${tr.toChapterId} 不存在`);
      }
      const targetCh = fw.chapters.find((c) => c.id === tr.toChapterId);
      if (targetCh) {
        const entryId = targetCh.startSceneId;
        if (!entryId) {
          errors.push(
            `章节 "${ch.title}" 跨章至 "${targetCh.title}" 须先配置叙事入口 startSceneId`
          );
        } else if (!getChapterAvailableSceneIds(targetCh).includes(entryId)) {
          errors.push(`章节 "${targetCh.title}" 叙事入口 ${entryId} 不在场景池内`);
        }
      }
    }

  }

  return {valid: errors.length === 0, errors};
}
