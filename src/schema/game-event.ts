/**
 * 游戏事件 Schema - 触发条件与计算规则
 * 事件通过规则引擎对玩家施加作用（变量、物品、声誉等）
 */

import type { FrameworkStateActions } from './state-actions';

export type EventTriggerType = 'unconditional' | 'conditional';

/** 事件定义 */
export interface GameEvent {
  id: string;
  name: string;
  /** 触发类型：无条件触发 或 条件触发 */
  trigger: EventTriggerType;
  /** 条件表达式（当 trigger 为 conditional 时必填） */
  condition?: string;
  /** 计算规则：满足触发条件时对玩家的状态变更 */
  actions?: FrameworkStateActions;
}
