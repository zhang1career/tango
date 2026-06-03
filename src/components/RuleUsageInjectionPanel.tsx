/**
 * 使用处按规则元信息注入执行对象与数值（条件表达式仅在规则编辑页配置）
 */

import React, {useEffect, useState} from 'react';
import type {ActionRefMatcher} from '@/schema/action-ref';
import type {GameRule} from '@/schema/game-rule';
import {getJournalFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {EMPTY_JOURNAL_CATALOG, normalizeJournalCatalog, type StoryJournalCatalog} from '@/schema/story-journal';
import type {RuleEffect} from '@/schema/rule-effect';
import {
  effectsForWhen,
  judgeExprForWhen,
  removeEntryForWhen,
  upsertEntryForWhen,
} from '@/utils/action-rule-entry';
import {RuleEffectImplementationsEditor} from './RuleEffectImplementationsEditor';
import {editorStyles as styles} from '@/styles/editorStyles';

export function RuleUsageInjectionPanel({
  rule,
  when,
  editable,
  onUpdateRule,
  onSaveRules,
}: {
  rule: GameRule;
  when: ActionRefMatcher;
  editable: boolean;
  onUpdateRule?: (fn: (r: GameRule) => GameRule) => void;
  onSaveRules?: () => void;
}) {
  const {gameId} = useGameId();
  const [journalCatalog, setJournalCatalog] = useState<StoryJournalCatalog>(EMPTY_JOURNAL_CATALOG);

  useEffect(() => {
    fetch(getJournalFetchUrl(gameId))
      .then((res) => (res.ok ? res.json() : EMPTY_JOURNAL_CATALOG))
      .then((data) => setJournalCatalog(normalizeJournalCatalog(data)))
      .catch(() => setJournalCatalog(EMPTY_JOURNAL_CATALOG));
  }, [gameId]);

  const scopedEffects = effectsForWhen(rule, when);
  const canEdit = editable && !!onUpdateRule;
  const setScopedEffects = (next: RuleEffect[]) => {
    onUpdateRule?.((r) => {
      if (!next.length) return removeEntryForWhen(r, when);
      return upsertEntryForWhen(r, when, {
        effects: next,
        judgeExpr: judgeExprForWhen(r, when),
      });
    });
  };

  return (
    <div style={{marginBottom: 12, border: '1px solid #333', borderRadius: 8, padding: 12}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
        <div style={{fontSize: 13, color: '#a78bfa'}}>
          {rule.name}（{rule.id}）
        </div>
        {canEdit && onSaveRules ? (
          <button type="button" style={styles.btnSmall} onClick={onSaveRules}>
            保存规则
          </button>
        ) : null}
      </div>
      <RuleEffectImplementationsEditor
        effects={scopedEffects}
        editable={canEdit}
        journalCatalog={journalCatalog}
        onChange={setScopedEffects}
      />
    </div>
  );
}
