/**
 * 单选下拉（替代 radio 列表）
 */

import React from 'react';
import {editorStyles as styles} from '../../styles/editorStyles';

export type SelectOption = {id: string; name: string};

export function SingleSelectField({
  label,
  options,
  value,
  onChange,
  readOnly = false,
  allowEmpty = true,
  emptyLabel = '无',
  hint,
}: {
  label: string;
  options: SelectOption[];
  value?: string;
  onChange?: (id: string | undefined) => void;
  readOnly?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  hint?: string;
}) {
  const display =
    value != null && value !== ''
      ? options.find((o) => o.id === value)?.name ?? value
      : allowEmpty
        ? emptyLabel
        : '-';

  if (readOnly || !onChange) {
    return (
      <div style={styles.row}>
        <label style={styles.label}>{label}</label>
        {hint ? <p style={{fontSize: 12, color: '#888', margin: '0 0 6px'}}>{hint}</p> : null}
        <div style={styles.readOnlyValue}>{display}</div>
      </div>
    );
  }

  return (
    <div style={styles.row}>
      <label style={styles.label}>{label}</label>
      {hint ? <p style={{fontSize: 12, color: '#888', margin: '0 0 6px'}}>{hint}</p> : null}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={styles.input}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
