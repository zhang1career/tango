/**
 * 游戏规则 Schema - 单一规则模型
 * Rule = 可选动作触发(when) + 可选条件表达式(judgeExpr) + 执行动作(effects)
 */

import type {ActionRefMatcher} from './action-ref';
import type {RuleExecutionMeta} from './rule-execution';
import type {Primitive, RuleEffect} from './rule-effect';

export type {RuleExecutionKind, RuleExecutionMeta} from './rule-execution';

export type {Primitive} from './rule-effect';

/** 仅一次准入规则 id（约定大于实现，上游必须按此 id 导出） */
export const ONLY_ONCE_RULE_ID = 'rule_0001';
/** 通用动作触发规则 id（可选约定） */
export const ACTION_RULE_ID = 'rule_0002';

export interface RuleEntry {
  /** @deprecated 请用 judgeExpr + $action.*；编辑器仅内部保留用于定位条目 */
  when?: ActionRefMatcher | ActionRefMatcher[];
  /** 本条命中条件；为空时回退规则级 judgeExpr */
  judgeExpr?: string;
  /** 命中后执行的动作 */
  effects?: RuleEffect | RuleEffect[];
}

/** 规则定义 */
export interface GameRule {
  id: string;
  name: string;
  /** @deprecated 请用 judgeExpr + $action.*；仅遗留数据 */
  when?: ActionRefMatcher | ActionRefMatcher[];
  /** 规则默认条件表达式（entry 未配置 judgeExpr 时回退） */
  judgeExpr?: string;
  /** 执行元信息：决定使用处是否可注入、可注入哪些执行类型 */
  execution?: RuleExecutionMeta;
  /** 内建执行（execution.kind === builtin） */
  effects?: RuleEffect | RuleEffect[];
  /** 使用处注入条目（execution.kind === injectable） */
  entries?: RuleEntry[];
}
