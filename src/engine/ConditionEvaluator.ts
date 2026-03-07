/**
 * 条件表达式求值器
 * 支持: $var, $var == value, $items has "x", $rep.xxx >= n
 */

import type { RuntimeState } from '../types';

type Context = RuntimeState;

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

export function evaluateCondition(condition: string, ctx: Context): boolean {
  const expr = condition.trim();
  if (!expr) return true;

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
        case '>=': return l >= r;
        case '<=': return l <= r;
        case '==': return l === r;
        case '!=': return l !== r;
        case '>': return l > r;
        case '<': return l < r;
      }
    }
    // 字符串比较
    const ls = String(left);
    const rs = String(right);
    switch (op) {
      case '==': return ls === rs;
      case '!=': return ls !== rs;
      default: return false;
    }
  }

  // $rep.xxx 或 $rep["xxx"] 与数字比较
  const repMatch = expr.match(
    /^\$rep(?:\.([a-zA-Z0-9_\u4e00-\u9fa5]+)|\["([^"]+)"\])\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$/
  );
  if (repMatch) {
    const entity = repMatch[1] ?? repMatch[2] ?? '';
    const op = repMatch[3];
    const r = Number(repMatch[4]);
    const val = ctx.reputation[entity] ?? 0;
    switch (op) {
      case '>=': return val >= r;
      case '<=': return val <= r;
      case '==': return val === r;
      case '!=': return val !== r;
      case '>': return val > r;
      case '<': return val < r;
      default: return false;
    }
  }

  return false;
}
