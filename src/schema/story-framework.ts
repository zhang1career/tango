/**
 * 剧情框架 Schema - 人工编辑的结构化剧情定义
 * AI 根据此框架生成 Twee 格式的剧情内容
 */

import type { GameMap } from './game-map';
import type { GameCharacter } from './game-character';
import type { GameEvent } from './game-event';
import type { GameMetadata } from './metadata';
import type { GameItem } from './game-item';
export type { FrameworkStateActions } from './state-actions';
export type { FrameworkStateActions as StateActions } from './state-actions';

/** 链接/决策：玩家可选的跳转 */
export interface FrameworkLink {
  /** 选项展示文案（可留空，由 AI 生成） */
  displayText?: string;
  /** 目标 passage 名称或 id */
  target: string;
  /** 显示此选项的条件表达式，如 $items has "令牌"、$rep.尔朱荣 >= 5 */
  condition?: string;
}

/** 场景节点：对应一个 passage */
export interface FrameworkScene {
  /** 唯一 id，用作 passage 名 */
  id: string;
  /** 节点标题（可选，用于展示） */
  title?: string;
  /** 剧情概要：发生了什么、氛围、关键台词（AI 据此生成正文） */
  summary: string;
  /** 可选的详细提示，指导 AI 写作风格 */
  hints?: string;
  /** 玩家可选的链接 */
  links: FrameworkLink[];
  /** 进入该节点时的状态变更 */
  stateActions?: import('./state-actions').FrameworkStateActions;
  /** 关联的地图节点 id（进入场景时触发该节点的规则/onEnter） */
  mapNodeId?: string;
  /** 该场景出场的 NPC id 列表 */
  characterIds?: string[];
  /** 该场景关联的事件 id 列表（进入/满足条件时触发） */
  eventIds?: string[];
}

/** 章节：可选的逻辑分组 */
export interface FrameworkChapter {
  id: string;
  title: string;
  /** 章节主题/核心 */
  theme?: string;
  /** 该章节下的场景 */
  scenes: FrameworkScene[];
}

/** 完整剧情框架 */
export interface StoryFramework {
  /** 故事标题 */
  title: string;
  /** 可选：背景设定（传给 AI 作为上下文） */
  background?: string;
  /** 可选：写作规则/风格约束 */
  rules?: string[];
  /** 章节列表（扁平化为 scenes 时保持顺序） */
  chapters: FrameworkChapter[];
  /** 可选：StoryData 初始状态（属性、物品） */
  initialState?: {
    variables?: Record<string, string | number | boolean>;
    inventory?: string[];
  };
  /** 可选：地图列表 */
  maps?: GameMap[];
  /** 可选：人物列表（玩家 + NPC） */
  characters?: GameCharacter[];
  /** 可选：事件列表 */
  events?: GameEvent[];
  /** 可选：元信息（人物属性定义），保存到预设位置 */
  metadata?: GameMetadata;
  /** 可选：物品列表 */
  items?: GameItem[];
  /** 当前玩家角色 id（用户操作的角色），在时间线中选定 */
  playerCharacterId?: string;
}

/** 扁平化所有场景（用于生成） */
export function flattenScenes(fw: StoryFramework): FrameworkScene[] {
  const scenes: FrameworkScene[] = [];
  for (const ch of fw.chapters) {
    for (const s of ch.scenes) {
      scenes.push(s);
    }
  }
  return scenes;
}

/** 校验框架：检查链接 target 是否都存在 */
export function validateFramework(fw: StoryFramework): { valid: boolean; errors: string[] } {
  const ids = new Set<string>();
  for (const ch of fw.chapters) {
    for (const s of ch.scenes) {
      ids.add(s.id);
    }
  }

  const errors: string[] = [];
  for (const ch of fw.chapters) {
    for (const s of ch.scenes) {
      for (const link of s.links) {
        const targetId = link.target.trim().replace(/\s+/g, '_');
        if (!ids.has(targetId) && !ids.has(link.target)) {
          errors.push(`场景 "${s.id}" 的链接指向不存在的目标: ${link.target}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
