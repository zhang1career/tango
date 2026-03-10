/**
 * 行为 Schema - 对话/动作的基本交互单元
 */

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
  /** 准入规则 id（onlyOnce 固定在前，程序写死） */
  ruleIds?: string[];
  /** 准入条件表达式 */
  judgeExpr?: string;
  /** 回写表达式 */
  writebackExpr?: string;
}
