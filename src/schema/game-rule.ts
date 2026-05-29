/**
 * 游戏规则 Schema - 注解式规则
 * 实体引用规则，条件表达式为真时执行被修饰对象，失败则提前结束，否则执行回写表达式
 */

/** 仅一次准入规则 id（约定大于实现，上游必须按此 id 导出） */
export const ONLY_ONCE_RULE_ID = 'rule_0001';

/** 规则定义 */
export interface GameRule {
  id: string;
  name: string;
  /** 条件表达式 */
  judgeExpr: string;
  /** 回写表达式 */
  writebackExpr: string;
}
