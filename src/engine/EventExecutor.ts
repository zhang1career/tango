/**
 * 事件执行 - 准入预计算与执行
 * 用于场景进入时执行关联的、满足准入条件的事件
 */

import type {GameEvent, EventBehaviorSequenceItem} from '../schema/game-event';
import type {GameCharacter} from '../schema/game-character';
import type {GameRule} from '../schema/game-rule';
import type {GameBehavior} from '../schema/game-behavior';
import type {RuntimeState} from '@/types';
import {admissionCalc} from './AdmissionCalculator';
import {isAttackBehavior, executeBattleWriteback} from './BehaviorInteraction';

export interface EventExecutionContext {
  events: GameEvent[];
  characters: GameCharacter[];
  ruleMap: Map<string, GameRule>;
  getState: () => RuntimeState;
  applyActions: (actions: {
    set?: Record<string, string | number | boolean>;
    give?: string | string[];
    take?: string | string[];
    rep?: Record<string, number>;
  }) => void;
  usedEventIds: Set<string>;
  usedBehaviorIds: Set<string>;
}

/** 检查事件是否通过准入预计算（条件为真、规则预计算为真） */
export function checkEventAdmission(
  event: GameEvent,
  ctx: EventExecutionContext
): boolean {
  const state = ctx.getState();
  const entity = { id: event.id, name: event.name };
  const ruleMap = new Map(
    Array.from(ctx.ruleMap.entries()).map(([k, v]) => [
      k,
      { judgeExpr: v.judgeExpr, writebackExpr: v.writebackExpr },
    ])
  );
  return admissionCalc({
    judgeExpr: undefined,
    ruleIds: ['rule_0001'],
    ruleMap,
    entity,
    visitedIds: ctx.usedEventIds,
    ctx: state,
    test: true,
  });
}

/** 事件执行结果：同步完成，或需要打开战斗 */
export type EventExecuteResult =
  | { ok: true; completed: true }
  | { ok: true; completed: false; pendingBattle: PendingEventBattle };

export interface PendingEventBattle {
  event: GameEvent;
  seqIndex: number;
  contentIndex: number;
  item: EventBehaviorSequenceItem;
  behavior: GameBehavior;
}

/**
 * 执行事件的行为序列。
 * 若遇到攻击行为，返回 pendingBattle，由调用方打开战斗；战斗结束后再调用 resumeEventExecution 继续。
 */
export function executeEvent(
  event: GameEvent,
  ctx: EventExecutionContext
): EventExecuteResult {
  const sequence = event.behaviorSequence ?? [];

  for (let si = 0; si < sequence.length; si++) {
    const item = sequence[si];
    const contents = item.contents ?? [];
    for (let ci = 0; ci < contents.length; ci++) {
      const behavior = contents[ci];
      if (isAttackBehavior(behavior)) {
        return {
          ok: true,
          completed: false,
          pendingBattle: { event, seqIndex: si, contentIndex: ci, item, behavior },
        };
      }
      if (!runNonAttackBehavior(behavior, item, ctx)) {
        break;
      }
    }
  }

  ctx.usedEventIds.add(event.id);
  return { ok: true, completed: true };
}

/** 执行非攻击行为（对话等）：应用回写 */
function runNonAttackBehavior(
  behavior: GameBehavior,
  item: EventBehaviorSequenceItem,
  ctx: EventExecutionContext
): boolean {
  const subjectId = item.subject || 'player';
  const objectId = item.object ?? '';
  const fullId = objectId ? `${objectId}.${behavior.id}` : `${subjectId}.${behavior.id}`;
  const state = ctx.getState();
  const ruleMap = new Map(
    Array.from(ctx.ruleMap.entries()).map(([k, v]) => [
      k,
      { judgeExpr: v.judgeExpr, writebackExpr: v.writebackExpr },
    ])
  );
  const entity = { id: fullId, name: behavior.id };
  const effectiveRuleIds = ['rule_0001', ...(behavior.ruleIds ?? []).filter((r) => r !== 'rule_0001')];

  const passed = admissionCalc({
    judgeExpr: behavior.judgeExpr,
    ruleIds: effectiveRuleIds,
    ruleMap,
    entity,
    visitedIds: ctx.usedBehaviorIds,
    ctx: state,
    test: false,
    writebackExpr: behavior.writebackExpr,
    onEntityUsed: (id) => ctx.usedBehaviorIds.add(id),
    applyActions: ctx.applyActions,
  });
  return passed;
}

/** 战斗结束后继续执行事件 */
export function resumeEventExecution(
  pending: PendingEventBattle,
  battleResult: { rounds: number; damageDealt: number; damageTaken: number; won: boolean },
  ctx: EventExecutionContext
): EventExecuteResult {
  const { event, item, behavior } = pending;
  const objectId = item.object ?? '';
  const subjectId = item.subject || 'player';

  const charId = objectId || subjectId;
  executeBattleWriteback(
    `${charId}.${behavior.id}`,
    behavior,
    battleResult,
    {
      characters: ctx.characters,
      ruleMap: ctx.ruleMap,
      getState: ctx.getState,
      applyActions: ctx.applyActions,
      usedBehaviorIds: ctx.usedBehaviorIds,
    }
  );

  const sequence = event.behaviorSequence ?? [];
  const si = pending.seqIndex;
  const contents = item.contents ?? [];
  for (let ci = pending.contentIndex + 1; ci < contents.length; ci++) {
    const b = contents[ci];
    if (isAttackBehavior(b)) {
      return { ok: true, completed: false, pendingBattle: { ...pending, contentIndex: ci, behavior: b } };
    }
    if (!runNonAttackBehavior(b, item, ctx)) break;
  }

  for (let nextSi = si + 1; nextSi < sequence.length; nextSi++) {
    const nextItem = sequence[nextSi];
    const nextContents = nextItem.contents ?? [];
    for (let ci = 0; ci < nextContents.length; ci++) {
      const b = nextContents[ci];
      if (isAttackBehavior(b)) {
        return {
          ok: true,
          completed: false,
          pendingBattle: { event, seqIndex: nextSi, contentIndex: ci, item: nextItem, behavior: b },
        };
      }
      if (!runNonAttackBehavior(b, nextItem, ctx)) break;
    }
  }

  ctx.usedEventIds.add(event.id);
  return { ok: true, completed: true };
}
