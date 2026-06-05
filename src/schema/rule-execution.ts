/**
 * 规则执行元信息：仅声明使用处是否需要配置执行内容
 */

/** builtin：执行内建在规则定义中；injectable：使用处注入执行对象与数值 */
export type RuleExecutionKind = 'builtin' | 'injectable';

export interface RuleExecutionMeta {
  kind: RuleExecutionKind;
}
