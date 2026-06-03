import type {GameRule} from '@/schema/game-rule';

/**
 * 补全缺失的 execution（不依赖具体 rule id）
 * - 有 effects => builtin
 * - 其余默认 injectable（包括 entries 为空的可注入规则）
 */
export function normalizeGameRule(rule: GameRule): GameRule {
  if (rule.execution?.kind) return rule;
  if (rule.effects) {
    return {...rule, execution: {kind: 'builtin' as const}};
  }
  return {...rule, execution: {kind: 'injectable' as const}};
}

export function normalizeGameRules(rules: GameRule[]): GameRule[] {
  return rules.map(normalizeGameRule);
}
