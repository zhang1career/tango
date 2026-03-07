/**
 * 游戏人物 Schema - 玩家与 NPC
 * 人物带规则，通过规则引擎对玩家施加作用
 */

import type { FrameworkStateActions } from './state-actions';

export type CharacterType = 'player' | 'npc';

/** 人物定义 */
export interface GameCharacter {
  id: string;
  type: CharacterType;
  name: string;
  /** 人物描述 */
  description?: string;
  /** 属性值（来自 metadata 人物属性） */
  attributes?: Record<string, string | number | boolean>;
  /** 物品 id 列表 */
  inventory?: string[];
  /** 规则：条件满足时生效 */
  rules?: string[];
  /** 首次遇见时的状态变更（属性+物品） */
  onMeet?: FrameworkStateActions;
  /** 该人物可能出现的场景/地点 id 列表 */
  inLocations?: string[];
}
