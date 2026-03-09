/**
 * 条件表达式求值器
 * 支持: $var, $var == value, $items has "x", $rep.xxx >= n, $entity.is_used
 */

import type {Passage, RuntimeState} from '@/types';

type Context = RuntimeState;

export interface EntityContext {
  /** 链接目标 passage（$entity 指代） */
  entity: Passage;
  /** 已访问过的 passage id/name 集合 */
  visitedIds: Set<string>;
}

function parseValue(s: string): string | number | boolean {
  const t = s.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  const n = Number(t);
  if (!Number.isNaN(n) && String(n) === t) return n;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function getVar(ctx: Context, path: string): unknown {
  const parts = path.split('.');
  if (parts[0] === 'items' || path === 'inventory') {
    return ctx.inventory;
  }
  if (parts[0] === 'rep' || parts[0] === 'reputation') {
    const entity = parts.slice(1).join('.');
    return entity ? ctx.reputation[entity] ?? 0 : ctx.reputation;
  }
  return ctx.variables[path];
}

export function evaluateCondition(
  condition: string,
  ctx: Context,
  entityCtx?: EntityContext
): boolean {
  let expr = condition.trim();
  if (!expr) return true;

  // 剥除外层括号，如 (!hasVisited("x")) -> !hasVisited("x")
  const outerParen = expr.match(/^\s*\(\s*(.+)\s*\)\s*$/);
  if (outerParen) expr = outerParen[1].trim();

  // !$entity.is_used 或 $entity.is_used（链接条件，需传入 entityCtx）
  const entityUsedMatch = expr.match(/^!?\$entity\.is_used$/);
  if (entityUsedMatch && entityCtx) {
    const used = entityCtx.visitedIds.has(entityCtx.entity.id) || entityCtx.visitedIds.has(entityCtx.entity.name);
    return expr.startsWith('!') ? !used : used;
  }

  // hasVisited("passageName") 或 !hasVisited("passageName")（SugarCube 兼容，链接条件需 entityCtx）
  const hasVisitedMatch = expr.match(/^!?hasVisited\s*\(\s*"([^"]*)"\s*\)\s*$/);
  if (hasVisitedMatch && entityCtx) {
    const passageName = hasVisitedMatch[1];
    const used =
      entityCtx.visitedIds.has(passageName) ||
      entityCtx.visitedIds.has(passageName.trim().replace(/\s+/g, '_'));
    return expr.startsWith('!') ? !used : used;
  }

  // $items has "x" 或 $inventory has "x"
  const hasMatch = expr.match(/^\$?(?:items|inventory)\s+has\s+(.+)$/i);
  if (hasMatch) {
    const item = String(parseValue(hasMatch[1].trim()));
    return ctx.inventory.includes(item);
  }

  // $var 单独为真值
  const soloVar = expr.match(/^\$([a-zA-Z0-9_.]+)$/);
  if (soloVar) {
    const v = getVar(ctx, soloVar[1]);
    return v != null && v !== false && v !== 0 && v !== '';
  }

  // $path >= n, <= n, == n, != n, > n, < n
  const cmpMatch = expr.match(
    /^\$([a-zA-Z0-9_.]+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/
  );
  if (cmpMatch) {
    const [, path, op, rightStr] = cmpMatch;
    const left = getVar(ctx, path);
    const right = parseValue(rightStr);
    const l = typeof left === 'number' ? left : Number(left);
    const r = typeof right === 'number' ? right : Number(right);
    if (!Number.isNaN(l) && !Number.isNaN(r)) {
      switch (op) {
        case '>=':
          return l >= r;
        case '<=':
          return l <= r;
        case '==':
          return l === r;
        case '!=':
          return l !== r;
        case '>':
          return l > r;
        case '<':
          return l < r;
      }
    }
    // 字符串比较
    const ls = String(left);
    const rs = String(right);
    switch (op) {
      case '==':
        return ls === rs;
      case '!=':
        return ls !== rs;
      default:
        return false;
    }
  }

  // $rep.xxx 或 $rep["xxx"] 与数字比较
  const repMatch = expr.match(
    /^\$rep(?:\.([a-zA-Z0-9_\u4e00-\u9fa5]+)|\["([^"]+)"])\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$/
  );
  if (repMatch) {
    const entity = repMatch[1] ?? repMatch[2] ?? '';
    const op = repMatch[3];
    const r = Number(repMatch[4]);
    const val = ctx.reputation[entity] ?? 0;
    switch (op) {
      case '>=':
        return val >= r;
      case '<=':
        return val <= r;
      case '==':
        return val === r;
      case '!=':
        return val !== r;
      case '>':
        return val > r;
      case '<':
        return val < r;
      default:
        return false;
    }
  }

  return false;
}
