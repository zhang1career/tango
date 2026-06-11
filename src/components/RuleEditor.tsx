/**
 * 规则编辑界面
 */

import React, {useEffect, useState} from 'react';
import {getRulesFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import type {StoryFramework} from '../schema/story-framework';
import type {GameRule} from '../schema/game-rule';
import type {SceneRuleBinding} from '../schema/story-rules-bundle';
import {getChapterAvailableSceneIds} from '../utils/chapter-scene';
import type {RuleExecutionKind} from '../schema/rule-execution';
import {formatJsonCompact} from '../utils/json-format';
import {normalizeGameRules} from '../utils/normalize-game-rules';
import {parseStoryRulesFile, serializeStoryRulesBundle} from '../utils/parse-story-rules';
import {RULE_EXECUTION_KIND_OPTIONS} from '../utils/rule-usage';
import {DetailEditModal} from './ui/DetailEditModal';
import {editorStyles as styles} from '../styles/editorStyles';
import {listGrids, listStyles} from '../styles/listStyles';
import {EntityFlatList} from './ui/EntityFlatList';
import {
  ListAddButton,
  ListDeleteButton,
  ListOpsCell,
  ListSectionHead,
  ListTableHeader,
  ListTableRow,
} from './ui/ListPrimitives';

async function saveRulesToPreset(fw: StoryFramework, gameId: string): Promise<{ ok: boolean; error?: string }> {
  const payload = serializeStoryRulesBundle({
    rules: fw.gameRules ?? [],
    sceneBindings: fw.sceneBindings ?? [],
  });
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getRulesFetchUrl(gameId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(payload)], {type: 'application/json'});
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

const RULE_FORM_HINT =
  '条件表达式支持约定变量（如 $entity.is_used、$action.sceneId 等）。留空视为 true。';

function emptyRule(): GameRule {
  return {
    id: '',
    name: '',
    judgeExpr: undefined,
    execution: {kind: 'builtin'},
  };
}

function RuleFormContent({rule, editable, onUpdate}: RuleFormProps) {
  const executionKind = rule.execution?.kind ?? 'builtin';

  return (
    <div>
      <FieldRow label="ID" value={rule.id} editable={editable && !!onUpdate}>
        <input
          value={rule.id}
          onChange={(e) => onUpdate!((r) => ({...r, id: e.target.value}))}
          style={styles.input}
          placeholder="规则 id"
        />
      </FieldRow>
      <FieldRow label="名称" value={rule.name} editable={editable && !!onUpdate}>
        <input
          value={rule.name}
          onChange={(e) => onUpdate!((r) => ({...r, name: e.target.value}))}
          style={styles.input}
          placeholder="规则名称"
        />
      </FieldRow>
      <FieldRow label="条件表达式" value={rule.judgeExpr} editable={editable && !!onUpdate}>
        <textarea
          value={rule.judgeExpr ?? ''}
          onChange={(e) => onUpdate!((r) => ({...r, judgeExpr: e.target.value || undefined}))}
          style={{...styles.input, ...styles.textarea, minHeight: 60}}
          placeholder="留空视为 true"
        />
      </FieldRow>
      <FieldRow label="执行方式" value={executionKind} editable={editable && !!onUpdate}>
        <select
          value={executionKind}
          onChange={(e) => {
            const kind = e.target.value as RuleExecutionKind;
            onUpdate!((r) => ({
              ...r,
              execution: {kind},
              entries: kind === 'builtin' ? undefined : r.entries,
            }));
          }}
          style={styles.input}
        >
          {RULE_EXECUTION_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </FieldRow>
      <p style={{fontSize: 12, color: '#888', marginTop: 8}}>{RULE_FORM_HINT}</p>
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
  const {checkAuthForSave} = useAuth();
  useEffect(() => {
    fetch(getRulesFetchUrl(gameId))
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const bundle = parseStoryRulesFile(data);
        updateFw((d) => ({
          ...d,
          gameRules: normalizeGameRules(bundle.rules),
          sceneBindings: bundle.sceneBindings ?? [],
        }));
      })
      .catch(() => {
      });
  }, [updateFw, gameId]);

  const rules = fw.gameRules ?? [];
  const bindings = fw.sceneBindings ?? [];
  const setRules = (fn: (r: GameRule[]) => GameRule[]) =>
    updateFw((d) => ({...d, gameRules: fn(d.gameRules ?? [])}));
  const setBindings = (fn: (b: SceneRuleBinding[]) => SceneRuleBinding[]) =>
    updateFw((d) => ({...d, sceneBindings: fn(d.sceneBindings ?? [])}));

  const saveBindings = async (next: SceneRuleBinding[]) => {
    const result = await saveRulesToPreset({...fw, sceneBindings: next}, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };

  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newRule, setNewRule] = useState<GameRule>(() => ({
    ...emptyRule(),
    id: `rule_${Date.now()}`,
    name: '新规则',
  }));

  const openAddModal = () => {
    setNewRule({
      ...emptyRule(),
      id: `rule_${Date.now()}`,
      name: '新规则',
    });
    setAddModalOpen(true);
  };

  const confirmAddRule = async () => {
    const next = [...rules, newRule];
    setRules(() => next);
    const result = await saveRulesToPreset({...fw, gameRules: next}, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  const updateRule = (index: number, fn: (r: GameRule) => GameRule) =>
    setRules((r) => r.map((x, i) => (i === index ? fn(x) : x)));

  const removeRule = async (index: number) => {
    const next = rules.filter((_, i) => i !== index);
    setRules(() => next);
    const result = await saveRulesToPreset({...fw, gameRules: next}, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };
  const removeRuleWithAuth = (index: number) => checkAuthForSave(() => removeRule(index));

  const saveRules = async () => {
    const result = await saveRulesToPreset(fw, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setEditIndex(null);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>规则</h1>
        <ListAddButton title="添加规则" onClick={openAddModal} />
      </header>

      <section style={styles.section}>
        <EntityFlatList
          count={rules.length}
          emptyHint="暂无规则，点击 + 创建。"
          getKey={(ri) => `rule-${ri}`}
          getPrimary={(ri) => rules[ri]!.name}
          getMeta={(ri) => rules[ri]!.id}
          onOpen={setDetailIndex}
          onEdit={setEditIndex}
          onDelete={removeRuleWithAuth}
        />
      </section>

      <section style={{...styles.section, marginTop: 32}}>
        <ListSectionHead
          title={<h2 style={{...styles.sectionTitle, margin: 0}}>场景规则绑定（sceneBindings）</h2>}
          addTitle="添加绑定"
          onAdd={() =>
            checkAuthForSave(() => {
              const ch = fw.chapters[0];
              const pool = ch ? getChapterAvailableSceneIds(ch) : [];
              const next: SceneRuleBinding[] = [
                ...bindings,
                {chapterId: ch?.id ?? '', sceneId: pool[0] ?? '', ruleIds: []},
              ];
              setBindings(() => next);
              void saveBindings(next);
            })
          }
        />
        <p style={{fontSize: 12, color: '#888', marginBottom: 12}}>
          按章节×场景引用准入规则（写入 story-rules.json）。与场景自身的 ruleIds、conditions 按 and 合并。
        </p>
        {bindings.length === 0 ? (
          <p style={{color: '#888', fontSize: 12}}>暂无绑定。章节场景池中的准入规则应在此维护。</p>
        ) : (
          <div>
            <ListTableHeader grid={listGrids.binding}>
              <span>章节</span>
              <span>场景</span>
              <span>规则</span>
              <span style={listStyles.cellOps}>操作</span>
            </ListTableHeader>
            {bindings.map((b, bi) => {
              const ch = fw.chapters.find((c) => c.id === b.chapterId);
              const pool = ch ? getChapterAvailableSceneIds(ch) : [];
              return (
                <ListTableRow key={`bind-${bi}`} grid={listGrids.binding}>
                  <select
                    value={b.chapterId}
                    onChange={(e) => {
                      const next = bindings.map((x, i) =>
                        i === bi ? {...x, chapterId: e.target.value, sceneId: ''} : x
                      );
                      setBindings(() => next);
                      void saveBindings(next);
                    }}
                    style={styles.input}
                  >
                    <option value="">选择章节</option>
                    {fw.chapters.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                  <select
                    value={b.sceneId}
                    onChange={(e) => {
                      const next = bindings.map((x, i) => (i === bi ? {...x, sceneId: e.target.value} : x));
                      setBindings(() => next);
                      void saveBindings(next);
                    }}
                    style={styles.input}
                  >
                    <option value="">选择场景</option>
                    {pool.map((sid) => {
                      const scene = (fw.scenes ?? []).find((s) => s.id === sid);
                      return (
                        <option key={sid} value={sid}>{scene?.name ?? sid}</option>
                      );
                    })}
                  </select>
                  <select
                    multiple
                    value={b.ruleIds ?? []}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                      const next = bindings.map((x, i) => (i === bi ? {...x, ruleIds: selected} : x));
                      setBindings(() => next);
                      void saveBindings(next);
                    }}
                    style={{...styles.input, minHeight: 56}}
                  >
                    {rules.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                    ))}
                  </select>
                  <ListOpsCell>
                    <ListDeleteButton
                      onClick={() =>
                        checkAuthForSave(() => {
                          const next = bindings.filter((_, i) => i !== bi);
                          setBindings(() => next);
                          void saveBindings(next);
                        })
                      }
                    />
                  </ListOpsCell>
                </ListTableRow>
              );
            })}
          </div>
        )}
      </section>

      {detailIndex !== null && rules[detailIndex] && (
        <DetailEditModal
          title="规则详情"
          open={true}
          onClose={() => setDetailIndex(null)}
          editable={false}>
          <RuleFormContent rule={rules[detailIndex]} editable={false} />
        </DetailEditModal>
      )}

      {editIndex !== null && rules[editIndex] && (
        <DetailEditModal
          title="编辑规则"
          open={true}
          onClose={() => setEditIndex(null)}
          editable={true}
          onSave={() => checkAuthForSave(saveRules)}>
          <RuleFormContent
            rule={rules[editIndex]}
            editable={true}
            onUpdate={(fn) => updateRule(editIndex, fn)}
          />
        </DetailEditModal>
      )}

      {addModalOpen && (
        <DetailEditModal
          title="添加规则"
          open={true}
          onClose={() => setAddModalOpen(false)}
          editable={true}
          onSave={() => checkAuthForSave(confirmAddRule)}
        >
          <RuleFormContent
            rule={newRule}
            editable={true}
            onUpdate={(fn) => setNewRule(fn(newRule))}
          />
        </DetailEditModal>
      )}
    </div>
  );
}
