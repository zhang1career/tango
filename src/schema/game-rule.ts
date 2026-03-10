/**
 * 游戏规则 Schema - 注解式规则
 * 实体引用规则，准入表达式为真时执行被修饰对象，失败则提前结束，否则执行回写表达式
 */

/** 规则定义 */
export interface GameRule {
  id: string;
  name: string;
  /** 准入表达式 */
  judgeExpr: string;
  /** 回写表达式 */
  writebackExpr: string;
}
