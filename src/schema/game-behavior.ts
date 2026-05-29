/**
 * 行为 Schema - 对话/动作的基本交互单元
 */

/** 动作类型：t=action 时使用，对应功能模块(story-features.json)中的 key，如 battle=战斗 */
export type ActionKind = string;

/** 行为定义 */
export interface GameBehavior {
  /** 持久 id，用于 usedBehaviorIds 等，不同人物需差异化 */
  id: string;
  /** 请求（交互发起内容） */
  q: string;
  /** 响应（交互结果内容） */
  a: string;
  /** 交互类型：对话 | 动作，默认 dialog */
  t?: 'dialog' | 'action';
  /** 动作类型：t=action 时使用。attack=攻击，触发回合制战斗 */
  actionKind?: ActionKind;
  /** 准入规则 id（onlyOnce 固定为 rule_0001，由程序自动前置） */
  ruleIds?: string[];
  /** 准入条件表达式 */
  judgeExpr?: string;
  /** 回写表达式 */
  writebackExpr?: string;
  /** 限定可见/可执行的场景 id 列表；省略或空数组表示所有场景均可用 */
  sceneIds?: string[];
}
