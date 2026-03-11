/**
 * 回写表达式执行器
 * 支持: $entity.is_used = true, $var.xxx = v, $rep.xxx = n, $battle.xxx, give("x"), take("x")
 */

import type {PassageStateActions} from '@/types';

export interface BattleContext {
  rounds: number;
  damageDealt: number;
  damageTaken: number;
  won: boolean;
}

type WritebackCtx = {
  variables: Record<string, unknown>;
  reputation: Record<string, number>;
  battle?: BattleContext;
};

function parseValue(s: string, ctx: WritebackCtx): string | number | boolean | undefined {
  const t = s.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  const n = Number(t);
  if (!Number.isNaN(n) && String(n) === t) return n;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  // ($rep.xxx||0)+5
  const repAdd = t.match(/\(\s*\$rep(?:utation)?(?:\.([a-zA-Z0-9_\u4e00-\u9fa5]+)|\[\s*"([^"]+)"\s*])\s*\|\|\s*0\s*\)\s*\+\s*(\d+)/);
  if (repAdd) {
    const entity = repAdd[1] ?? repAdd[2] ?? '';
    const delta = Number(repAdd[3]);
    return (ctx.reputation[entity] ?? 0) + delta;
  }
  // $battle.rounds, $battle.damageDealt, $battle.damageTaken, $battle.won
  const battleMatch = t.match(/^\$battle\.(rounds|damageDealt|damageTaken|won)$/);
  if (battleMatch && ctx.battle) {
    const key = battleMatch[1];
    if (key === 'rounds') return ctx.battle.rounds;
    if (key === 'damageDealt') return ctx.battle.damageDealt;
    if (key === 'damageTaken') return ctx.battle.damageTaken;
    if (key === 'won') return ctx.battle.won;
  }
  return undefined;
}

/** 将 writebackExpr 解析为 PassageStateActions，可选传入 battle 上下文 */
export function parseWritebackToActions(
  expr: string,
  ctx: WritebackCtx
): PassageStateActions | null {
  const actions: PassageStateActions = {};
  const statements = expr.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  for (const st of statements) {
    // $entity.is_used = true -> 不在此处理，由调用方特殊处理
    if (st.includes('$entity.is_used')) continue;

    // $variables.xxx = v 或 $var.xxx = v
    const setMatch = st.match(/^\$(?:variables\.)?([a-zA-Z0-9_.]+)\s*=\s*(.+)$/);
    if (setMatch) {
      const key = setMatch[1];
      const val = parseValue(setMatch[2], ctx);
      if (val !== undefined) {
        actions.set = actions.set ?? {};
        (actions.set as Record<string, string | number | boolean>)[key] = val as string | number | boolean;
      }
      continue;
    }

    // $rep.xxx = n 或 $reputation["xxx"] = n
    const repMatch = st.match(/^\$rep(?:utation)?(?:\.([a-zA-Z0-9_\u4e00-\u9fa5]+)|\[\s*"([^"]+)"\s*])\s*=\s*(.+)$/);
    if (repMatch) {
      const entity = repMatch[1] ?? repMatch[2] ?? '';
      const val = parseValue(repMatch[3], ctx);
      if (typeof val === 'number') {
        const curr = ctx.reputation[entity] ?? 0;
        actions.rep = actions.rep ?? {};
        actions.rep[entity] = val - curr;
      }
      continue;
    }

    // give("x") take("x")
    const giveMatch = st.match(/^give\s*\(\s*"([^"]*)"\s*\)$/);
    if (giveMatch) {
      actions.give = actions.give
        ? (Array.isArray(actions.give) ? [...actions.give, giveMatch[1]] : [actions.give as string, giveMatch[1]])
        : giveMatch[1];
      continue;
    }
    const takeMatch = st.match(/^take\s*\(\s*"([^"]*)"\s*\)$/);
    if (takeMatch) {
      actions.take = actions.take
        ? (Array.isArray(actions.take) ? [...actions.take, takeMatch[1]] : [actions.take as string, takeMatch[1]])
        : takeMatch[1];
    }
  }
  return Object.keys(actions).length ? actions : null;
}

/** 检查 writebackExpr 是否包含 $entity.is_used = true */
export function hasEntityIsUsedWriteback(expr: string): boolean {
  return expr.includes('$entity.is_used');
}
