import {journalUnlockVar} from '@/schema/story-journal';
import type {RuleEffect} from '@/schema/rule-effect';
import {asEffectArray} from '@/schema/rule-effect';

export interface RuleEffectContext {
  applyActions: (actions: {
    set?: Record<string, string | number | boolean>;
    give?: string | string[];
    take?: string | string[];
    rep?: Record<string, number>;
  }) => void;
  markEntityUsed?: () => void;
}

export function executeRuleEffects(
  effects: RuleEffect | RuleEffect[] | undefined,
  ctx: RuleEffectContext
): void {
  for (const effect of asEffectArray(effects)) {
    switch (effect.type) {
      case 'set':
        if (effect.key?.trim()) {
          ctx.applyActions({set: {[effect.key.trim()]: effect.value}});
        }
        break;
      case 'give':
        if (effect.itemId?.trim()) ctx.applyActions({give: effect.itemId.trim()});
        break;
      case 'take':
        if (effect.itemId?.trim()) ctx.applyActions({take: effect.itemId.trim()});
        break;
      case 'rep':
        if (effect.entity?.trim()) {
          ctx.applyActions({rep: {[effect.entity.trim()]: effect.delta}});
        }
        break;
      case 'journal.unlock': {
        const id = effect.journalId?.trim();
        if (!id) break;
        ctx.applyActions({set: {[journalUnlockVar(id)]: true}});
        break;
      }
      case 'entity.mark_used':
        ctx.markEntityUsed?.();
        break;
      default:
        break;
    }
  }
}
