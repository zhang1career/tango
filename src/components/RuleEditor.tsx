/**
 * 规则编辑界面
 */

import React, {useEffect, useState} from 'react';
import {getRulesFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import type {StoryFramework} from '../schema/story-framework';
import type {GameRule} from '../schema/game-rule';
import {formatJsonCompact} from '../utils/json-format';
import {DetailEditModal} from './ui/DetailEditModal';
import {editorStyles as styles} from '../styles/editorStyles';

async function saveRulesToPreset(rules: unknown, gameId: string): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getRulesFetchUrl(gameId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(rules),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(rules)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-rules.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
}

function FieldRow({
                    label,
                    value,
                    editable: isEditable,
                    children,
                  }: {
  label: string;
  value?: string;
  editable: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={styles.row}>
      <label style={styles.label}>{label}</label>
      {isEditable && children ? children : <div style={styles.readOnlyValue}>{value ?? '-'}</div>}
    </div>
  );
}

type RuleFormProps = {
  rule: GameRule;
  editable: boolean;
  onUpdate?: (fn: (r: GameRule) => GameRule) => void;
};

function RuleFormContent({rule, editable, onUpdate}: RuleFormProps) {
  return (
    <div>
      <FieldRow label="ID" value={rule.id} editable={editable && !!onUpdate}>
        <input
          value={rule.id}
          onChange={(e) => onUpdate!((r) => ({...r, id: e.target.value}))}
          style={styles.input}
          placeholder="only_once"
        />
      </FieldRow>
      <FieldRow label="名称" value={rule.name} editable={editable && !!onUpdate}>
        <input
          value={rule.name}
          onChange={(e) => onUpdate!((r) => ({...r, name: e.target.value}))}
          style={styles.input}
          placeholder="仅一次"
        />
      </FieldRow>
      <FieldRow label="条件表达式" value={rule.judgeExpr} editable={editable && !!onUpdate}>
        <textarea
          value={rule.judgeExpr}
          onChange={(e) => onUpdate!((r) => ({...r, judgeExpr: e.target.value}))}
          style={{...styles.input, ...styles.textarea, minHeight: 60}}
          placeholder="!$entity.is_used"
        />
      </FieldRow>
      <FieldRow label="回写表达式" value={rule.writebackExpr} editable={editable && !!onUpdate}>
        <textarea
          value={rule.writebackExpr}
          onChange={(e) => onUpdate!((r) => ({...r, writebackExpr: e.target.value}))}
          style={{...styles.input, ...styles.textarea, minHeight: 60}}
          placeholder="$entity.is_used = true"
        />
      </FieldRow>
    </div>
  );
}

export function RuleEditor({
                             fw,
                             updateFw,
                           }: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const {gameId} = useGameId();
  useEffect(() => {
    fetch(getRulesFetchUrl(gameId))
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        updateFw((d) => ({...d, gameRules: list as GameRule[]}));
      })
      .catch(() => {
      });
  }, [updateFw, gameId]);

  const rules = fw.gameRules ?? [];
  const setRules = (fn: (r: GameRule[]) => GameRule[]) =>
    updateFw((d) => ({...d, gameRules: fn(d.gameRules ?? [])}));

  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newRule, setNewRule] = useState<GameRule>(() => ({
    id: `rule_${Date.now()}`,
    name: '新规则',
    judgeExpr: '',
    writebackExpr: '',
  }));

  const openAddModal = () => {
    setNewRule({
      id: `rule_${Date.now()}`,
      name: '新规则',
      judgeExpr: '',
      writebackExpr: '',
    });
    setAddModalOpen(true);
  };

  const confirmAddRule = async () => {
    const next = [...rules, newRule];
    setRules(() => next);
    const result = await saveRulesToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  const updateRule = (index: number, fn: (r: GameRule) => GameRule) =>
    setRules((r) => r.map((x, i) => (i === index ? fn(x) : x)));

  const removeRule = async (index: number) => {
    const next = rules.filter((_, i) => i !== index);
    setRules(() => next);
    const result = await saveRulesToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };

  const saveRules = async () => {
    const result = await saveRulesToPreset(rules, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setEditIndex(null);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>规则</h1>
        <button type="button" style={styles.btn} onClick={openAddModal}>
          + 添加规则
        </button>
      </header>

      <section style={styles.section}>
        {rules.length === 0 && (
          <p style={{color: '#888', fontSize: 14}}>暂无规则，点击「添加规则」创建。</p>
        )}

        {rules.map((rule, ri) => (
          <div key={`rule-${ri}`} style={styles.card}>
            <div style={styles.cardHead}>
              <span
                style={{fontWeight: 600, flex: 1, cursor: 'pointer'}}
                onClick={() => setDetailIndex(ri)}
              >
                {rule.name}
                <span style={{marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400}}>
                  {rule.id}
                </span>
              </span>
              <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <button type="button" style={styles.btnIcon} onClick={() => setEditIndex(ri)} title="编辑">
                  ✎
                </button>
                <button type="button" style={styles.btnIcon} onClick={() => removeRule(ri)} title="删除">
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {detailIndex !== null && rules[detailIndex] && (
        <DetailEditModal
          title="规则详情"
          open={true}
          onClose={() => setDetailIndex(null)}
          editable={false}>
          <RuleFormContent
            rule={rules[detailIndex]}
            editable={false}/>
        </DetailEditModal>
      )}

      {editIndex !== null && rules[editIndex] && (
        <DetailEditModal
          title="编辑规则"
          open={true}
          onClose={() => setEditIndex(null)}
          editable={true}
          onSave={saveRules}>
          <RuleFormContent
            rule={rules[editIndex]}
            editable={true}
            onUpdate={(fn) => updateRule(editIndex, fn)}/>
        </DetailEditModal>
      )}

      {addModalOpen && (
        <DetailEditModal
          title="添加规则"
          open={true}
          onClose={() => setAddModalOpen(false)}
          editable={true}
          onSave={confirmAddRule}
        >
          <RuleFormContent
            rule={newRule}
            editable={true}
            onUpdate={(fn) => setNewRule(fn(newRule))}/>
        </DetailEditModal>
      )}
    </div>
  );
}
