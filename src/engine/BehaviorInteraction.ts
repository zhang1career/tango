/**
 * 行为交互系统
 * 提供：查询可用行为列表、执行行为
 */

import type {RuntimeState} from '@/types';
import type {GameCharacter} from '../schema/game-character';
import type {GameBehavior} from '../schema/game-behavior';
import {ONLY_ONCE_RULE_ID, type GameRule} from '../schema/game-rule';
import type {GameActionRef} from '../schema/action-ref';
import {admissionCalc} from './AdmissionCalculator';
import {getBehaviorListLimit} from '@/config';
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
  /** 当前 passage 对应的场景 id；用于 sceneIds 过滤 */
  currentSceneId?: string;
  onAction?: (action: GameActionRef) => void;
}

function behaviorMatchesScene(behavior: GameBehavior, currentSceneId: string | undefined): boolean {
  const ids = behavior.sceneIds?.map((id) => id.trim()).filter(Boolean);
  if (!ids?.length) return true;
  if (!currentSceneId) return false;
  return ids.includes(currentSceneId);
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
      {judgeExpr: v.judgeExpr, effects: v.effects},
    ])
  );

  /** 行为准入时由程序临时添加 onlyOnce 规则，不保存到数据 */
  const effectiveRuleIds = (ids: string[] | undefined) =>
    [ONLY_ONCE_RULE_ID, ...(ids ?? []).filter((r) => r !== ONLY_ONCE_RULE_ID)];

  const result: GameBehavior[] = [];
  for (const b of lib) {
    if (!behaviorMatchesScene(b, ctx.currentSceneId)) continue;
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
  if (!behaviorMatchesScene(b, ctx.currentSceneId)) {
    return { ok: false, response: UNAVAILABLE_RESPONSE };
  }

  const state = ctx.getState();
  const ruleMap = new Map(
    Array.from(ctx.ruleMap.entries()).map(([k, v]) => [
      k,
      {judgeExpr: v.judgeExpr, effects: v.effects},
    ])
  );
  const entity = { id: behaviorId, name: b.id };

  /** 行为准入时由程序临时添加 onlyOnce 规则，不保存到数据 */
  const effectiveRuleIds = [ONLY_ONCE_RULE_ID, ...(b.ruleIds ?? []).filter((r) => r !== ONLY_ONCE_RULE_ID)];

  const passed = admissionCalc({
    judgeExpr: b.judgeExpr,
    ruleIds: effectiveRuleIds,
    ruleMap,
    entity,
    visitedIds: ctx.usedBehaviorIds,
    ctx: state,
    test: false,
    applyActions: ctx.applyActions,
  });

  if (!passed) return { ok: false, response: UNAVAILABLE_RESPONSE };
  ctx.onAction?.({
    type: 'behavior.execute',
    behaviorId,
    sceneId: ctx.currentSceneId,
  });
  return { ok: true, response: b.a };
}

/** 获取动作标识：t=action 时，取 actionKind 或 q */
function getActionId(b: GameBehavior): string {
  const id = (b.actionKind ?? b.q ?? '').trim().toLowerCase();
  if (id === 'attack' || id === '攻击') return 'battle';
  return id;
}

/** 判定行为是否应触发战斗：t=action 且功能模块中存在 key 匹配 actionId，且 key=battle 映射战斗 */
export function shouldOpenBattle(
  b: GameBehavior,
  features: { battle?: unknown } | null
): boolean {
  if (b.t !== 'action') return false;
  const actionId = getActionId(b);
  if (actionId !== 'battle') return false;
  return features != null && 'battle' in features && features.battle != null;
}

/** @deprecated 使用 shouldOpenBattle(b, features)，兼容旧调用 */
export function isAttackBehavior(b: GameBehavior): boolean {
  return shouldOpenBattle(b, { battle: {} });
}

/** 战斗结束后执行回写（使用累计数值），并标记行为已用 */
export function executeBattleWriteback(
  behaviorId: string,
  behavior: GameBehavior,
  battleResult: { rounds: number; damageDealt: number; damageTaken: number; won: boolean },
  ctx: BehaviorInteractionContext
): void {
  void behavior;
  void battleResult;
  ctx.usedBehaviorIds.add(behaviorId);
}
