/**
 * 游戏规则 Schema - 注解式规则
 * 实体引用规则，条件表达式为真时执行被修饰对象，失败则提前结束，否则执行回写表达式
 */

import type {ActionRefMatcher} from './action-ref';

/** 仅一次准入规则 id（约定大于实现，上游必须按此 id 导出） */
export const ONLY_ONCE_RULE_ID = 'rule_0001';
/** 通用 setOn 规则 id（可选约定） */
export const SET_ON_RULE_ID = 'rule_0002';

type Primitive = string | number | boolean;

export interface JournalAppendTemplate {
  /** 条目 id（用于展示与排重） */
  id: string;
  /** 条目标题 */
  title: string;
  /** 条目正文 */
  content: string;
  /** 可选标签 */
  tags?: string[];
  /** 可选幂等键；同键只会追加一次 */
  onceKey?: string;
}

export interface RuleSetOnConfig {
  /** 触发动作（支持单个或多个） */
  when: ActionRefMatcher | ActionRefMatcher[];
  /** 命中后直接设置变量值（等价于批量 set） */
  set?: Record<string, Primitive>;
  /** 命中后追加心迹条目 */
  journalAppend?: JournalAppendTemplate | JournalAppendTemplate[];
}

/** 规则定义 */
export interface GameRule {
  id: string;
  name: string;
  /** 条件表达式 */
  judgeExpr: string;
  /** 回写表达式 */
  writebackExpr: string;
  /** 可选：动作触发规则（setOn） */
  setOn?: RuleSetOnConfig | RuleSetOnConfig[];
}
