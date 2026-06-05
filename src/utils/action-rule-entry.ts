import type {ActionRefMatcher} from '@/schema/action-ref';
import type {GameRule, RuleEntry} from '@/schema/game-rule';
import {asEffectArray} from '@/schema/rule-effect';

function firstWhen(when: ActionRefMatcher | ActionRefMatcher[] | undefined): ActionRefMatcher | undefined {
  if (!when) return undefined;
  return Array.isArray(when) ? when[0] : when;
}

function whenKey(when: ActionRefMatcher): string {
  return JSON.stringify({
    type: when.type,
    sceneId: when.sceneId ?? '',
    eventId: when.eventId ?? '',
    behaviorId: when.behaviorId ?? '',
    itemId: when.itemId ?? '',
  });
}

function entryMatchesWhen(entry: RuleEntry, target: ActionRefMatcher): boolean {
  const w = firstWhen(entry.when);
  if (!w || w.type !== target.type) return false;
  if (target.sceneId && w.sceneId !== target.sceneId) return false;
  if (target.eventId && w.eventId !== target.eventId) return false;
  if (target.behaviorId && w.behaviorId !== target.behaviorId) return false;
  if (target.itemId && w.itemId !== target.itemId) return false;
  return true;
}

export function findEntryForWhen(rule: GameRule | undefined, when: ActionRefMatcher): RuleEntry | undefined {
  return (rule?.entries ?? []).find((e) => entryMatchesWhen(e, when));
}

export function effectsForWhen(rule: GameRule | undefined, when: ActionRefMatcher) {
  return asEffectArray(findEntryForWhen(rule, when)?.effects);
}

/** 使用处默认条件：用约定变量 $action.* 描述触发上下文 */
export function defaultJudgeExprForWhen(when: ActionRefMatcher): string {
  const parts = [`$action.type == '${when.type}'`];
  if (when.sceneId) parts.push(`$action.sceneId == '${when.sceneId}'`);
  if (when.eventId) parts.push(`$action.eventId == '${when.eventId}'`);
  if (when.behaviorId) parts.push(`$action.behaviorId == '${when.behaviorId}'`);
  if (when.itemId) parts.push(`$action.itemId == '${when.itemId}'`);
  return parts.join(' && ');
}

export function judgeExprForWhen(rule: GameRule | undefined, when: ActionRefMatcher): string {
  const entry = findEntryForWhen(rule, when);
  return entry?.judgeExpr?.trim() || defaultJudgeExprForWhen(when);
}

export function upsertEntryForWhen(
  rule: GameRule,
  when: ActionRefMatcher,
  patch: Pick<RuleEntry, 'effects' | 'judgeExpr'>
): GameRule {
  const entries = [...(rule.entries ?? [])];
  const idx = entries.findIndex((e) => entryMatchesWhen(e, when));
  const nextEntry: RuleEntry = {
    when,
    judgeExpr: patch.judgeExpr ?? (idx >= 0 ? entries[idx].judgeExpr : undefined) ?? defaultJudgeExprForWhen(when),
    effects: patch.effects,
  };
  if (idx >= 0) entries[idx] = {...entries[idx], ...nextEntry};
  else entries.push(nextEntry);
  entries.sort((a, b) => whenKey(firstWhen(a.when) ?? when).localeCompare(whenKey(firstWhen(b.when) ?? when)));
  return {...rule, entries, effects: undefined};
}

export function removeEntryForWhen(rule: GameRule, when: ActionRefMatcher): GameRule {
  const entries = (rule.entries ?? []).filter((e) => !entryMatchesWhen(e, when));
  return {...rule, entries: entries.length ? entries : undefined};
}
