import type {ActionRefMatcher} from '@/schema/action-ref';
import type {GameRule} from '@/schema/game-rule';
import type {RuleExecutionKind} from '@/schema/rule-execution';
import {normalizeGameRule, normalizeGameRules} from './normalize-game-rules';

export interface RuleUsageContext {
  sceneId?: string;
}

export const RULE_EXECUTION_KIND_OPTIONS: {value: RuleExecutionKind; label: string}[] = [
  {value: 'builtin', label: '内建（使用处无需配置）'},
  {value: 'injectable', label: '可注入（使用处配置执行对象与数值）'},
];

export function ruleNeedsUsageInjection(rule: GameRule | undefined): boolean {
  if (!rule) return false;
  return normalizeGameRule(rule).execution?.kind === 'injectable';
}

/** 由使用处页面上下文决定条目定位，不由规则元信息限制动作类型 */
export function usageWhenFromContext(ctx: RuleUsageContext): ActionRefMatcher | undefined {
  if (ctx.sceneId) return {type: 'scene.enter', sceneId: ctx.sceneId};
  return undefined;
}

export function linkedInjectableRules(
  ruleIds: string[] | undefined,
  gameRules: GameRule[]
): GameRule[] {
  const byId = new Map(normalizeGameRules(gameRules).map((r) => [r.id, r]));
  return (ruleIds ?? [])
    .map((id) => byId.get(id))
    .filter((r): r is GameRule => !!r && ruleNeedsUsageInjection(r));
}
