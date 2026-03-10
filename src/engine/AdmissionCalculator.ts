/**
 * 准入计算 - 统一准入预计算（test=true）与准入计算（test=false）
 * 顺序：准入条件 judgeExpr -> 准入规则 ruleIds
 * test=true 时仅评估，不执行回写；test=false 且通过时执行回写
 */

import type {RuntimeState} from '@/types';
import {evaluateCondition, type EntityLike} from './ConditionEvaluator';
import {parseWritebackToActions, hasEntityIsUsedWriteback} from './WritebackExecutor';

export interface AdmissionParams {
  judgeExpr?: string;
  ruleIds?: string[];
  ruleMap: Map<string, { judgeExpr?: string; writebackExpr?: string }>;
  entity: EntityLike;
  visitedIds: Set<string>;
  ctx: RuntimeState;
  /** true=准入预计算（不执行回写）；false=准入计算（通过时执行回写） */
  test: boolean;
  writebackExpr?: string;
  onEntityUsed?: (entityId: string) => void;
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
    writebackExpr,
    onEntityUsed,
    applyActions,
  } = params;

  const entityCtx = { entity, visitedIds };

  if (judgeExpr?.trim()) {
    if (!evaluateCondition(judgeExpr.trim(), ctx, entityCtx)) return false;
  }

  const onlyOnceRule = ruleMap.get('rule_0001');
  const orderedRuleIds = onlyOnceRule ? ['rule_0001', ...ruleIds.filter((r) => r !== 'rule_0001')] : ruleIds;

  for (const rid of orderedRuleIds) {
    const rule = ruleMap.get(rid);
    if (!rule?.judgeExpr?.trim()) continue;
    if (!evaluateCondition(rule.judgeExpr.trim(), ctx, entityCtx)) return false;
  }

  if (test) return true;

  if (writebackExpr?.trim()) {
    if (hasEntityIsUsedWriteback(writebackExpr) && onEntityUsed) {
      onEntityUsed(entity.id);
    }
    const actions = parseWritebackToActions(writebackExpr, ctx);
    if (actions && applyActions) applyActions(actions);
  }

  for (const rid of orderedRuleIds) {
    const rule = ruleMap.get(rid);
    if (!rule?.writebackExpr?.trim()) continue;
    if (hasEntityIsUsedWriteback(rule.writebackExpr) && onEntityUsed) {
      onEntityUsed(entity.id);
    }
    const actions = parseWritebackToActions(rule.writebackExpr, ctx);
    if (actions && applyActions) applyActions(actions);
  }

  return true;
}
