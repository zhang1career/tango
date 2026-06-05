/**
 * 准入计算 - 统一准入预计算（test=true）与准入计算（test=false）
 * 顺序：实体准入 judgeExpr -> 规则(ruleIds)准入与执行
 * test=true 时仅评估，不执行 effects；test=false 且通过时执行 effects
 */

import type {RuntimeState} from '@/types';
import {ONLY_ONCE_RULE_ID} from '../schema/game-rule';
import {evaluateCondition, type EntityLike} from './ConditionEvaluator';
import {executeRuleEffects} from './RuleEffectExecutor';
import type {RuleEffect} from '@/schema/rule-effect';

export interface AdmissionParams {
  judgeExpr?: string;
  ruleIds?: string[];
  ruleMap: Map<string, { judgeExpr?: string; effects?: RuleEffect | RuleEffect[] }>;
  entity: EntityLike;
  visitedIds: Set<string>;
  ctx: RuntimeState;
  /** true=准入预计算（不执行回写）；false=准入计算（通过时执行回写） */
  test: boolean;
  applyActions?: (actions: { set?: Record<string, string | number | boolean>; give?: string | string[]; take?: string | string[]; rep?: Record<string, number> }) => void;
}

export function admissionCalc(params: AdmissionParams): boolean {
  const {
    judgeExpr,
    ruleIds = [],
    ruleMap,
    entity,
    visitedIds,
    ctx,
    test,
    applyActions,
  } = params;

  const entityCtx = { entity, visitedIds };

  if (judgeExpr?.trim()) {
    if (!evaluateCondition(judgeExpr.trim(), ctx, entityCtx)) return false;
  }

  const onlyOnceRule = ruleMap.get(ONLY_ONCE_RULE_ID);
  const orderedRuleIds = onlyOnceRule
    ? [ONLY_ONCE_RULE_ID, ...ruleIds.filter((r) => r !== ONLY_ONCE_RULE_ID)]
    : ruleIds;

  for (const rid of orderedRuleIds) {
    const rule = ruleMap.get(rid);
    if (!rule?.judgeExpr?.trim()) continue;
    if (!evaluateCondition(rule.judgeExpr.trim(), ctx, entityCtx)) return false;
  }

  if (test) return true;
  if (!applyActions) return true;

  for (const rid of orderedRuleIds) {
    const rule = ruleMap.get(rid);
    if (rid === ONLY_ONCE_RULE_ID) visitedIds.add(entity.id);
    if (!rule) continue;
    executeRuleEffects(rule.effects, {
      applyActions,
      markEntityUsed: () => visitedIds.add(entity.id),
    });
  }

  return true;
}
