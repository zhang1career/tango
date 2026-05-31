import type {RuntimeState, JournalEntry} from '@/types';
import type {ActionRefMatcher, GameActionRef} from '@/schema/action-ref';
import type {GameRule, JournalAppendTemplate} from '@/schema/game-rule';
import {evaluateCondition} from './ConditionEvaluator';
import {parseWritebackToActions} from './WritebackExecutor';

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
  appendJournal: (entry: JournalEntry, onceKey?: string) => void;
}

export function triggerSetOnRules(params: TriggerSetOnRulesParams): void {
  const {actionRef, rules, state, applyActions, appendJournal} = params;

  for (const rule of rules) {
    const setOnList = asArray(rule.setOn);
    for (const setOn of setOnList) {
      const whenList = asArray(setOn.when);
      if (whenList.length === 0) continue;
      const hit = whenList.some((matcher) => matchesActionRef(matcher, actionRef));
      if (!hit) continue;

      if (rule.judgeExpr?.trim()) {
        if (!evaluateCondition(rule.judgeExpr.trim(), state)) continue;
      }

      if (setOn.set && Object.keys(setOn.set).length > 0) {
        applyActions({set: setOn.set});
      }

      if (rule.writebackExpr?.trim()) {
        const actions = parseWritebackToActions(rule.writebackExpr.trim(), {
          variables: state.variables,
          reputation: state.reputation,
        });
        if (actions) applyActions(actions);
      }

      const journals = asArray<JournalAppendTemplate>(setOn.journalAppend);
      for (const draft of journals) {
        if (!draft.id?.trim() || !draft.title?.trim() || !draft.content?.trim()) continue;
        appendJournal(
          {
            id: draft.id.trim(),
            title: draft.title.trim(),
            content: draft.content.trim(),
            tags: draft.tags?.filter(Boolean),
            createdAt: Date.now(),
            sourceActionRef: actionRef,
          },
          draft.onceKey
        );
      }
    }
  }
}
