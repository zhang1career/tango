import type {RuntimeState} from '@/types';
import type {ActionRefMatcher, GameActionRef} from '@/schema/action-ref';
import type {GameRule, RuleEntry} from '@/schema/game-rule';
import {evaluateCondition} from './ConditionEvaluator';
import {executeRuleEffects} from './RuleEffectExecutor';

function matchesActionRef(matcher: ActionRefMatcher, action: GameActionRef): boolean {
  if (matcher.type !== action.type) return false;
  if (matcher.sceneId && matcher.sceneId !== action.sceneId) return false;
  if (matcher.eventId && matcher.eventId !== action.eventId) return false;
  if (matcher.behaviorId && matcher.behaviorId !== action.behaviorId) return false;
  if (matcher.itemId && matcher.itemId !== action.itemId) return false;
  return true;
}

function asArray<T>(input: T | T[] | undefined): T[] {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
}

function passesJudge(
  expr: string | undefined,
  state: RuntimeState,
  actionRef: GameActionRef
): boolean {
  const trimmed = expr?.trim();
  if (!trimmed) return true;
  return evaluateCondition(trimmed, state, undefined, {
    type: actionRef.type,
    sceneId: actionRef.sceneId,
    eventId: actionRef.eventId,
    behaviorId: actionRef.behaviorId,
    itemId: actionRef.itemId,
  });
}

function entryMatchesAction(
  rule: Pick<GameRule, 'when' | 'judgeExpr'>,
  entry: RuleEntry,
  actionRef: GameActionRef,
  state: RuntimeState
): boolean {
  const expr = (entry.judgeExpr ?? rule.judgeExpr)?.trim();
  const whenList = asArray(entry.when ?? rule.when);

  if (expr && expr.includes('$action.')) {
    return passesJudge(expr, state, actionRef);
  }
  if (whenList.length > 0) {
    if (!whenList.some((matcher) => matchesActionRef(matcher, actionRef))) return false;
    return !expr || expr === 'true' || passesJudge(expr, state, actionRef);
  }
  return passesJudge(expr, state, actionRef);
}

interface TriggerSetOnRulesParams {
  actionRef: GameActionRef;
  rules: GameRule[];
  state: RuntimeState;
  applyActions: (actions: {
    set?: Record<string, string | number | boolean>;
    give?: string | string[];
    take?: string | string[];
    rep?: Record<string, number>;
  }) => void;
}

function applyActionRule(
  rule: Pick<GameRule, 'when' | 'judgeExpr' | 'effects'>,
  entry: RuleEntry,
  actionRef: GameActionRef,
  state: RuntimeState,
  applyActions: TriggerSetOnRulesParams['applyActions']
): void {
  if (!entryMatchesAction(rule, entry, actionRef, state)) return;
  executeRuleEffects(entry.effects ?? rule.effects, {applyActions});
}

export function triggerSetOnRules(params: TriggerSetOnRulesParams): void {
  const {actionRef, rules, state, applyActions} = params;

  for (const rule of rules) {
    const entries = (rule.entries ?? []).filter(Boolean);
    for (const entry of entries) {
      applyActionRule(rule, entry, actionRef, state, applyActions);
    }
  }
}
