/**
 * 游戏人物 Schema - 统一人物
 * 人物不再区分玩家/NPC，玩家由时间线的 playerCharacterId 指定
 * 非用户操作的人物按脚本（时间线偶发行为、人物详情规律行为）行动
 */

import type {FrameworkStateActions} from './state-actions';
import type {GameBehavior} from './game-behavior';

/** @deprecated 人物不再区分类型，保留仅为兼容旧数据 */
export type CharacterType = 'player' | 'npc';

/** 人物定义 */
export interface GameCharacter {
  id: string;
  /** @deprecated 保留兼容，玩家由 StoryFramework.playerCharacterId 指定 */
  type?: CharacterType;
  name: string;
  /** 人物描述 */
  description?: string;
  /** 属性值（来自 metadata 人物属性） */
  attributes?: Record<string, string | number | boolean>;
  /** 物品 id 列表 */
  inventory?: string[];
  /** 人物专属行为库：行为列表 */
  behaviorLibrary?: GameBehavior[];
  /** 是否已使用（通用字段） */
  is_used?: boolean;
  /** 首次遇见时的状态变更（属性+物品） */
  onMeet?: FrameworkStateActions;
  /** @deprecated 人物-地点关系在时间线场景中设定（scene.characterIds），保留仅为兼容旧数据 */
  inLocations?: string[];
  /** 头像 URL */
  avatar?: string;
}
