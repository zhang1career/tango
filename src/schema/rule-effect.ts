/**
 * 规则统一执行面 - Rule.effects 与后续扩展共用
 */

export type Primitive = string | number | boolean;

export type RuleEffectType =
  | 'set'
  | 'give'
  | 'take'
  | 'rep'
  | 'journal.unlock'
  | 'entity.mark_used';

export interface RuleEffectSet {
  type: 'set';
  key: string;
  value: Primitive;
}

export interface RuleEffectGive {
  type: 'give';
  itemId: string;
}

export interface RuleEffectTake {
  type: 'take';
  itemId: string;
}

export interface RuleEffectRep {
  type: 'rep';
  entity: string;
  delta: number;
}

export interface RuleEffectJournalUnlock {
  type: 'journal.unlock';
  journalId: string;
}

export interface RuleEffectMarkEntityUsed {
  type: 'entity.mark_used';
}

export type RuleEffect =
  | RuleEffectSet
  | RuleEffectGive
  | RuleEffectTake
  | RuleEffectRep
  | RuleEffectJournalUnlock
  | RuleEffectMarkEntityUsed;

export const RULE_EFFECT_TYPES: {type: RuleEffectType; label: string}[] = [
  {type: 'set', label: '设置变量'},
  {type: 'journal.unlock', label: '解锁心迹'},
  {type: 'give', label: '获得物品'},
  {type: 'take', label: '失去物品'},
  {type: 'rep', label: '调整声誉'},
  {type: 'entity.mark_used', label: '标记已用'},
];

export function asEffectArray(input: RuleEffect | RuleEffect[] | undefined): RuleEffect[] {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
}
