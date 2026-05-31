/**
 * 统一动作引用（actionRef）
 * 用于 setOn 规则与运行时事件追踪
 */

export type GameActionType =
  | 'scene.enter'
  | 'event.complete'
  | 'behavior.execute'
  | 'item.obtain';

export interface GameActionRef {
  type: GameActionType;
  sceneId?: string;
  eventId?: string;
  behaviorId?: string;
  itemId?: string;
}

export type ActionRefMatcher = GameActionRef;
