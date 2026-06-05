import React from 'react';
import type {GameRule} from '@/schema/game-rule';
import {
  linkedInjectableRules,
  usageWhenFromContext,
  type RuleUsageContext,
} from '@/utils/rule-usage';
import {RuleUsageInjectionPanel} from './RuleUsageInjectionPanel';

export function RuleUsageBindings({
  ruleIds,
  gameRules,
  context,
  editable,
  onUpdateRule,
  onSaveRules,
}: {
  ruleIds: string[] | undefined;
  gameRules: GameRule[];
  context: RuleUsageContext;
  editable: boolean;
  onUpdateRule?: (ruleId: string, fn: (r: GameRule) => GameRule) => void;
  onSaveRules?: () => void;
}) {
  const rules = linkedInjectableRules(ruleIds, gameRules);
  if (!rules.length) {
    const missing =
      (ruleIds ?? []).length > 0 && gameRules.length === 0
        ? '规则数据尚未加载，请稍候或刷新页面'
        : null;
    if (!missing) return null;
    return <p style={{fontSize: 12, color: '#888', marginBottom: 12}}>{missing}</p>;
  }

  return (
    <>
      {rules.map((rule) => {
        const when = usageWhenFromContext(context);
        if (!when) return null;
        return (
          <RuleUsageInjectionPanel
            key={rule.id}
            rule={rule}
            when={when}
            editable={editable}
            onUpdateRule={onUpdateRule ? (fn) => onUpdateRule(rule.id, fn) : undefined}
            onSaveRules={onSaveRules}
          />
        );
      })}
    </>
  );
}
