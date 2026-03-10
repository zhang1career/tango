/**
 * 行为交互系统
 * 提供：查询可用行为列表、执行行为
 */

import type {RuntimeState} from '@/types';
import type {GameCharacter} from '../schema/game-character';
import type {GameBehavior} from '../schema/game-behavior';
import type {GameRule} from '../schema/game-rule';
import {admissionCalc} from './AdmissionCalculator';
import {getBehaviorListLimit} from '../config';
import {parseCascadedId} from '../utils/cascadedId';

const UNAVAILABLE_RESPONSE = '（喔…当前不可用）';

/** 拼接级联行为 id：charId.behaviorId，兼容旧格式 charId_b_100 */
export function toBehaviorFullId(characterId: string, behaviorId: string): string {
  return normalizeBehaviorId(characterId, behaviorId);
}

/** 规范化行为 id 为 point 格式：兼容旧格式 charId_b_100 -> charId.b_100 */
function normalizeBehaviorId(charId: string, bId: string): string {
  if (bId.includes('.')) return bId;
  if (bId.startsWith(charId + '_')) return charId + '.' + bId.slice(charId.length + 1);
  return `${charId}.${bId}`;
}

export interface BehaviorInteractionContext {
  characters: GameCharacter[];
  ruleMap: Map<string, GameRule>;
  getState: () => RuntimeState;
  applyActions: (actions: {
    set?: Record<string, string | number | boolean>;
    give?: string | string[];
    take?: string | string[];
    rep?: Record<string, number>;
  }) => void;
  usedBehaviorIds: Set<string>;
}

export function getAvailableBehaviors(
  characterId: string,
  ctx: BehaviorInteractionContext
): GameBehavior[] {
  const char = ctx.characters.find((c) => c.id === characterId);
  const lib = char?.behaviorLibrary ?? [];
  const limit = getBehaviorListLimit();
  const state = ctx.getState();
  const ruleMap = new Map(
    Array.from(ctx.ruleMap.entries()).map(([k, v]) => [
      k,
      { judgeExpr: v.judgeExpr, writebackExpr: v.writebackExpr },
    ])
  );

  /** 行为准入时由程序临时添加 rule_0001（onlyOnce），不保存到数据 */
  const effectiveRuleIds = (ids: string[] | undefined) =>
    ['rule_0001', ...(ids ?? []).filter((r) => r !== 'rule_0001')];

  const result: GameBehavior[] = [];
  for (const b of lib) {
    const behaviorId = normalizeBehaviorId(characterId, b.id);
    const entity = { id: behaviorId, name: b.id };
    const passed = admissionCalc({
      judgeExpr: b.judgeExpr,
      ruleIds: effectiveRuleIds(b.ruleIds),
      ruleMap,
      entity,
      visitedIds: ctx.usedBehaviorIds,
      ctx: state,
      test: true,
    });
    if (passed) result.push(b);
    if (result.length >= limit) break;
  }
  return result;
}

export function executeBehavior(
  behaviorId: string,
  ctx: BehaviorInteractionContext
): { ok: boolean; response: string } {
  let parsed = parseCascadedId(behaviorId);
  if (!parsed) {
    const char = ctx.characters.find((c) => behaviorId.startsWith(c.id + '_'));
    if (char) parsed = { prefix: char.id, suffix: behaviorId.slice(char.id.length + 1) };
  }
  if (!parsed) return { ok: false, response: UNAVAILABLE_RESPONSE };
  const { prefix: characterId, suffix: bId } = parsed;
  const char = ctx.characters.find((c) => c.id === characterId);
  if (!char) return { ok: false, response: UNAVAILABLE_RESPONSE };
  const b = char.behaviorLibrary?.find(
    (x) => x.id === bId || x.id === `${characterId}.${bId}`
  );
  if (!b) return { ok: false, response: UNAVAILABLE_RESPONSE };

  const state = ctx.getState();
  const ruleMap = new Map(
    Array.from(ctx.ruleMap.entries()).map(([k, v]) => [
      k,
      { judgeExpr: v.judgeExpr, writebackExpr: v.writebackExpr },
    ])
  );
  const entity = { id: behaviorId, name: b.id };

  /** 行为准入时由程序临时添加 rule_0001（onlyOnce），不保存到数据 */
  const effectiveRuleIds = ['rule_0001', ...(b.ruleIds ?? []).filter((r) => r !== 'rule_0001')];

  const passed = admissionCalc({
    judgeExpr: b.judgeExpr,
    ruleIds: effectiveRuleIds,
    ruleMap,
    entity,
    visitedIds: ctx.usedBehaviorIds,
    ctx: state,
    test: false,
    writebackExpr: b.writebackExpr,
    onEntityUsed: (id) => ctx.usedBehaviorIds.add(id),
    applyActions: ctx.applyActions,
  });

  if (!passed) return { ok: false, response: UNAVAILABLE_RESPONSE };
  return { ok: true, response: b.a };
}
