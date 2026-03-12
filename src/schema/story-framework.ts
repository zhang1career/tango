/**
 * 剧情框架 Schema - 人工编辑的结构化剧情定义
 * AI 根据此框架生成 Twee 格式的剧情内容
 */

import type {GameMap} from './game-map';
import type {GameCharacter} from './game-character';
import type {GameEvent} from './game-event';
import type {GameMetadata} from './metadata';
import type {GameItem} from './game-item';
import type {GameScene} from './game-scene';
import type {GameRule} from './game-rule';

export type {FrameworkStateActions} from './state-actions';
export type {FrameworkStateActions as StateActions} from './state-actions';

/** 链接/决策：玩家可选的跳转（用于 map 边或生成） */
export interface FrameworkLink {
  displayText?: string;
  target: string;
  condition?: string;
}

/** 章节中的场景引用（章节与场景多对多） */
export interface SceneEntry {
  sceneId: string;
  /** 本章节采用该场景时的规则 id 列表（有序，准入时按顺序嵌套执行） */
  ruleIds?: string[];
}

/** 章节：可选的逻辑分组 */
export interface FrameworkChapter {
  id: string;
  title: string;
  theme?: string;
  /** 章节起点的地图节点 id */
  startMapNodeId?: string;
  /** 章节终点的地图节点 id */
  endMapNodeId?: string;
  /** 本章节采用的场景（多选，每项可配准入规则和规则引用） */
  sceneEntries: SceneEntry[];
}

/** 仅持久化在剧情文件中的字段（不包含专有数据表：maps, characters, metadata, scenes, gameRules, items, events） */
export const PERSISTED_FRAMEWORK_KEYS: (keyof StoryFramework)[] = [
  'title',
  'background',
  'rules',
  'chapters',
  'initialState',
  'playerCharacterId',
];

/** 完整剧情框架（内存/运行时形态）
 * - 持久化字段：仅 PERSISTED_FRAMEWORK_KEYS，写入剧情 JSON 文件
 * - maps / characters / metadata / scenes / gameRules / items / events 来自专有数据表（JSON 或 API），不写入剧情文件、不随剧情加载
 */
export interface StoryFramework {
  /** 故事标题 */
  title: string;
  /** 可选：背景设定（传给 AI 作为上下文） */
  background?: string;
  /** 可选：写作规则/风格约束 */
  rules?: string[];
  /** 章节列表 */
  chapters: FrameworkChapter[];
  /** 可选：StoryData 初始状态（属性、物品） */
  initialState?: {
    variables?: Record<string, string | number | boolean>;
    inventory?: string[];
  };
  /** 当前玩家角色 id */
  playerCharacterId?: string;
  // ---------- 以下为运行时从专有数据表加载，不持久化在剧情文件中 ----------
  /** 可选：地图列表（专有数据表） */
  maps?: GameMap[];
  /** 可选：人物列表（专有数据表） */
  characters?: GameCharacter[];
  /** 可选：事件列表（专有数据表） */
  events?: GameEvent[];
  /** 可选：元信息（专有数据表） */
  metadata?: GameMetadata;
  /** 可选：物品列表（专有数据表） */
  items?: GameItem[];
  /** 可选：场景列表（专有数据表） */
  scenes?: GameScene[];
  /** 可选：游戏规则（专有数据表） */
  gameRules?: GameRule[];
}

/** 迁移旧版剧情框架结构（如 scenes 数组改为 sceneEntries） */
export function migrateFramework(parsed: StoryFramework): void {
  const chapters = parsed.chapters ?? [];
  const scenes = parsed.scenes ?? [];
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  for (const ch of chapters) {
    const old = ch as unknown as { scenes?: Array<{ id: string; summary?: string; name?: string }> };
    if (Array.isArray(old.scenes) && !ch.sceneEntries) {
      ch.sceneEntries = old.scenes.map((s) => ({sceneId: s.id}));
      for (const s of old.scenes) {
        if (!sceneMap.has(s.id)) {
          scenes.push({
            id: s.id,
            name: s.name ?? s.id,
            summary: s.summary ?? '',
          });
          sceneMap.set(s.id, scenes[scenes.length - 1]);
        }
      }
      delete old.scenes;
    }
    if (!ch.sceneEntries) ch.sceneEntries = [];
    const seen = new Set<string>();
    ch.sceneEntries = ch.sceneEntries.filter((e) => {
      if (seen.has(e.sceneId)) return false;
      seen.add(e.sceneId);
      return true;
    });
  }
  parsed.scenes = scenes;
}

/** 从完整框架中取出仅用于持久化的部分（保存剧情文件时使用） */
export function toPersistedFramework(fw: StoryFramework): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PERSISTED_FRAMEWORK_KEYS) {
    const v = fw[k];
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** 从已解析的剧情文件内容恢复为 StoryFramework，仅包含持久化字段；专有数据由调用方通过 preload 等从数据表加载 */
export function fromPersistedFramework(parsed: Record<string, unknown>): StoryFramework {
  const fw = {} as StoryFramework;
  for (const k of PERSISTED_FRAMEWORK_KEYS) {
    const v = parsed[k];
    if (v !== undefined) (fw as unknown as Record<string, unknown>)[k] = v;
  }
  return fw;
}

/** 扁平化章节中的场景引用，按 (chapterIndex, sceneId) 解析为 passage 所需数据 */
export function flattenSceneEntries(
  fw: StoryFramework
): Array<{ scene: GameScene; chapterIndex: number; entry: SceneEntry }> {
  const sceneMap = new Map<string, GameScene>();
  for (const s of fw.scenes ?? []) {
    sceneMap.set(s.id, s);
  }
  const result: Array<{ scene: GameScene; chapterIndex: number; entry: SceneEntry }> = [];
  for (let ci = 0; ci < (fw.chapters ?? []).length; ci++) {
    const ch = fw.chapters![ci];
    for (const entry of ch.sceneEntries ?? []) {
      const scene = sceneMap.get(entry.sceneId);
      if (scene) result.push({scene, chapterIndex: ci, entry});
    }
  }
  return result;
}

/** 获取 passage 名：章节 index + 场景 id */
export function toPassageId(chapterIndex: number, sceneId: string): string {
  return `ch${chapterIndex}_${sceneId}`.trim().replace(/\s+/g, '_');
}

/** 校验框架：检查 sceneEntries 中的 sceneId 是否都存在 */
export function validateFramework(fw: StoryFramework): { valid: boolean; errors: string[] } {
  const sceneIds = new Set((fw.scenes ?? []).map((s) => s.id));
  const errors: string[] = [];
  for (const ch of fw.chapters ?? []) {
    for (const entry of ch.sceneEntries ?? []) {
      if (!sceneIds.has(entry.sceneId)) {
        errors.push(`章节 "${ch.title}" 引用了不存在的场景: ${entry.sceneId}`);
      }
    }
  }
  return {valid: errors.length === 0, errors};
}
