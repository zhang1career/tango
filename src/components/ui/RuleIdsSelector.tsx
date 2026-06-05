/**
 * 规则多选控件（可拖拽排序）
 * 用于「剧情」章节中的场景规则与「场景」页的规则，准入按顺序嵌套执行
 * 可选：在使用处内联展示 injectable 规则的 setOn 等配置（位于该规则行下方、「添加规则」上方）
 */

import React, {useState} from 'react';
import type {GameRule} from '@/schema/game-rule';
import {RuleUsageInjectionPanel} from '../RuleUsageInjectionPanel';
import {
  ruleNeedsUsageInjection,
  usageWhenFromContext,
  type RuleUsageContext,
} from '@/utils/rule-usage';

const styles: Record<string, React.CSSProperties> = {
  row: {marginBottom: 12},
  label: {display: 'block', marginBottom: 6, fontSize: 13, color: '#a78bfa'},
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'flex-start',
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 6,
    cursor: 'grab',
    maxWidth: '100%',
  },
  itemDragging: {opacity: 0.6, cursor: 'grabbing'},
  itemBlock: {display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0},
  itemBlockWithPanel: {flex: '1 1 100%', maxWidth: '100%'},
  itemBlockChip: {flex: '0 1 auto', maxWidth: '100%'},
  dragHandle: {color: '#888', fontSize: 14, userSelect: 'none'},
  itemLabel: {fontSize: 13, color: '#e8e8e8', lineHeight: 1.4},
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 16,
    padding: '0 4px',
    lineHeight: 1,
  },
  addRow: {display: 'flex', gap: 8, alignItems: 'center', marginTop: 8},
  select: {
    flex: 1,
    padding: '8px 10px',
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 6,
    color: '#e8e8e8',
    fontSize: 14,
  },
  addBtn: {
    padding: '8px 12px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    cursor: 'pointer',
    fontSize: 13,
  },
  readOnlyValue: {fontSize: 14, color: '#e8e8e8', padding: '4px 0'},
};

export function RuleIdsSelector({
  ruleList,
  value,
  onChange,
  readOnly = false,
  label = '规则',
  gameRules,
  usageContext,
  onUpdateRule,
  onSaveRules,
  disabledAddOptions,
}: {
  ruleList: Array<{ id: string; name: string }>;
  value: string[];
  onChange: (ids: string[]) => void;
  readOnly?: boolean;
  label?: string;
  /** 传入时在每条 injectable 规则下方内联展示 setOn 等配置 */
  gameRules?: GameRule[];
  usageContext?: RuleUsageContext;
  onUpdateRule?: (ruleId: string, fn: (r: GameRule) => GameRule) => void;
  onSaveRules?: () => void;
  /** 下拉中可见但不可添加的规则（仍显示名称与原因） */
  disabledAddOptions?: Array<{id: string; reason: string}>;
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [addId, setAddId] = useState('');

  const ordered = value.slice();
  const selectedSet = new Set(value);
  const disabledAddById = new Map((disabledAddOptions ?? []).map((d) => [d.id, d.reason]));
  const available = ruleList.filter((r) => !selectedSet.has(r.id));
  const rulesById = new Map((gameRules ?? []).map((r) => [r.id, r]));
  const usageWhen = usageContext ? usageWhenFromContext(usageContext) : undefined;
  const bindingsEditable = !readOnly && !!onUpdateRule;
  const showBindings = !!usageWhen && (gameRules?.length ?? 0) > 0;
  const rulesDataMissing =
    ordered.length > 0 && usageContext != null && (gameRules?.length ?? 0) === 0;

  const move = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= ordered.length) return;
    const next = [...ordered];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    onChange(next);
  };

  const remove = (index: number) => {
    const next = ordered.filter((_, i) => i !== index);
    onChange(next.length ? next : []);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (Number.isNaN(fromIndex) || fromIndex === toIndex) {
      setDraggingIndex(null);
      return;
    }
    move(fromIndex, toIndex);
    setDraggingIndex(null);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
  };

  if (readOnly) {
    return (
      <div style={styles.row}>
        <label style={styles.label}>{label}</label>
        <div style={styles.readOnlyValue}>
          {ordered.length
            ? ordered.map((id) => ruleList.find((r) => r.id === id)?.name ?? id).join(' → ')
            : '-'}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.row}>
      <label style={styles.label}>{label}</label>
      <div style={styles.list}>
        {ordered.map((id, index) => {
          const rule = ruleList.find((r) => r.id === id);
          const name = rule?.name ?? id;
          const fullRule = rulesById.get(id);
          const showPanel = showBindings && fullRule && ruleNeedsUsageInjection(fullRule);
          return (
            <div
              key={`${id}-${index}`}
              style={{
                ...styles.itemBlock,
                ...(showPanel ? styles.itemBlockWithPanel : styles.itemBlockChip),
              }}
            >
              <div
                style={{
                  ...styles.item,
                  ...(draggingIndex === index ? styles.itemDragging : {}),
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, index)}
              >
                <span style={styles.dragHandle} title="拖拽排序">⋮⋮</span>
                <span style={styles.itemLabel}>{name}</span>
                <button
                  type="button"
                  style={styles.removeBtn}
                  onClick={() => remove(index)}
                  title="移除"
                >
                  ×
                </button>
              </div>
              {showPanel && usageWhen ? (
                <RuleUsageInjectionPanel
                  rule={fullRule}
                  when={usageWhen}
                  editable={bindingsEditable}
                  onUpdateRule={onUpdateRule ? (fn) => onUpdateRule(id, fn) : undefined}
                  onSaveRules={onSaveRules}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {rulesDataMissing ? (
        <p style={{fontSize: 12, color: '#888', margin: '4px 0 0'}}>
          规则数据尚未加载，请稍候或刷新页面
        </p>
      ) : null}
      {available.length > 0 && (
        <div key={value.join(',')} style={styles.addRow}>
          <select
            style={styles.select}
            value={addId}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) {
                setAddId('');
                return;
              }
              const blockReason = disabledAddById.get(id);
              if (blockReason) {
                alert(blockReason);
                setAddId('');
                return;
              }
              onChange([...ordered, id]);
              setAddId('');
            }}
          >
            <option value="">添加规则…</option>
            {available.map((r) => {
              const blockReason = disabledAddById.get(r.id);
              return (
                <option key={r.id} value={r.id} disabled={!!blockReason}>
                  {blockReason ? `${r.name}（不可用）` : r.name}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}
