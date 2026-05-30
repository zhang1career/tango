/**
 * 游戏人物 Schema - 统一人物
 * 人物不再区分玩家/NPC，玩家由时间线的 playerCharacterId 指定
 * 非用户操作的人物按脚本（时间线偶发行为、人物详情规律行为）行动
 */

import type {FrameworkStateActions} from './state-actions';
import type {GameBehavior} from './game-behavior';

/** @deprecated 人物不再区分类型，保留仅为兼容旧数据 */
export type CharacterType = 'player' | 'npc';

/** 人物姓名结构化字段（可选） */
export interface CharacterNameProfile {
  /** 姓（如 费） */
  familyName?: string;
  /** 名（如 穆） */
  givenName?: string;
  /** 字（如 远刚） */
  courtesyName?: string;
  /** 号（如 半山） */
  artName?: string;
  /** 封号/爵位（如 高阳王） */
  title?: string;
}

/** 对该人物的称呼约定（可选） */
export interface CharacterAddressingProfile {
  /**
   * 平辈/晚辈应优先使用的称呼键（按顺序尝试）
   * 例如: ["courtesyName", "artName", "title", "name"]
   */
  peerOrJuniorPrefer?: Array<'courtesyName' | 'artName' | 'title' | 'name' | 'givenName'>;
  /** 长辈应优先使用的称呼键（按顺序尝试） */
  elderPrefer?: Array<'title' | 'courtesyName' | 'name' | 'givenName'>;
  /** 是否避免直呼其名（givenName） */
  avoidGivenName?: boolean;
  /** 生效语境标签（如 ancient_china） */
  contextTags?: string[];
}

/** 人物定义 */
export interface GameCharacter {
  id: string;
  /** @deprecated 保留兼容，玩家由 StoryFramework.playerCharacterId 指定 */
  type?: CharacterType;
  name: string;
  /** 结构化姓名（用于称呼规则、文案生成、展示） */
  nameProfile?: CharacterNameProfile;
  /** 称呼规则（用于约束如何称呼该人物） */
  addressingProfile?: CharacterAddressingProfile;
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
  /** 人物专属背景音乐 URL */
  backgroundMusic?: string;
}
