/**
 * 多选下拉（已选项列表 + 下拉添加，替代 checkbox 列表）
 */

import React, {useState} from 'react';
import {editorStyles as styles} from '../../styles/editorStyles';
import type {SelectOption} from './SingleSelectField';

const localStyles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 6,
    maxWidth: '100%',
  },
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
  empty: {fontSize: 12, color: '#888', marginBottom: 8},
};

export function MultiSelectField({
  label,
  options,
  value,
  onChange,
  readOnly = false,
  addPlaceholder = '添加…',
  emptyHint = '（未选择）',
  hint,
  maxSelection,
}: {
  label: string;
  options: SelectOption[];
  value: string[];
  onChange?: (ids: string[]) => void;
  readOnly?: boolean;
  addPlaceholder?: string;
  emptyHint?: string;
  hint?: string;
  /** 最多可选数量；超出时隐藏添加下拉 */
  maxSelection?: number;
}) {
  const [addId, setAddId] = useState('');
  const selectedSet = new Set(value);
  const available = options.filter((o) => !selectedSet.has(o.id));
  const atMax = maxSelection != null && value.length >= maxSelection;

  const remove = (id: string) => {
    const next = value.filter((x) => x !== id);
    onChange?.(next.length ? next : []);
  };

  const labelOf = (id: string) => options.find((o) => o.id === id)?.name ?? id;

  const showLabel = label.trim().length > 0;

  if (readOnly || !onChange) {
    return (
      <div style={styles.row}>
        {showLabel ? <label style={styles.label}>{label}</label> : null}
        {hint ? <p style={{fontSize: 12, color: '#888', margin: '0 0 6px'}}>{hint}</p> : null}
        <div style={styles.readOnlyValue}>
          {value.length ? value.map(labelOf).join(', ') : emptyHint}
        </div>
      </div>
    );
  }

  return (
    <div style={showLabel ? styles.row : {marginBottom: 10}}>
      {showLabel ? <label style={styles.label}>{label}</label> : null}
      {hint ? <p style={{fontSize: 12, color: '#888', margin: '0 0 6px'}}>{hint}</p> : null}
      {value.length === 0 ? (
        <div style={localStyles.empty}>{emptyHint}</div>
      ) : (
        <div style={localStyles.list}>
          {value.map((id) => (
            <div key={id} style={localStyles.item}>
              <span style={localStyles.itemLabel}>{labelOf(id)}</span>
              <button type="button" style={localStyles.removeBtn} onClick={() => remove(id)} title="移除">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {available.length > 0 && !atMax && (
        <select
          value={addId}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) {
              setAddId('');
              return;
            }
            onChange([...value, id]);
            setAddId('');
          }}
          style={styles.input}
        >
          <option value="">{addPlaceholder}</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      {atMax && available.length > 0 ? (
        <p style={{fontSize: 12, color: '#888', margin: '6px 0 0'}}>
          已达上限（{maxSelection} 项）
        </p>
      ) : null}
    </div>
  );
}
