/**
 * 游戏事件 Schema - 行为序列
 */

import type {GameBehavior} from './game-behavior';

/** 行为序列项：主体对客体执行一组行为（内容列表） */
export interface EventBehaviorSequenceItem {
  /** 主体：行为执行者，characterId 或 "player" */
  subject: string;
  /** 客体：行为承受者，可选；characterId 或 "player"；"" 表示无 */
  object?: string;
  /** 内容列表：顺序执行的行为（复用 GameBehavior） */
  contents: GameBehavior[];
}

/** 事件定义 */
export interface GameEvent {
  id: string;
  name: string;
  /** 描述：传给 AI 生成剧情时的上下文 */
  description?: string;
  /** 行为序列：按时间顺序执行 */
  behaviorSequence?: EventBehaviorSequenceItem[];
  /** 是否已使用（通用字段） */
  is_used?: boolean;
  /** 开场动画 URL */
  openingAnimation?: string;
  /** 终场动画 URL */
  endingAnimation?: string;
  /** 背景音乐 URL */
  backgroundMusic?: string;
}
