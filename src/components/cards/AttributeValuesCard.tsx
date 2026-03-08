/**
 * 属性值编辑卡 - 编辑角色属性当前值（非操作）
 */

import React from 'react';
import type { CharacterAttributeDef } from '../../schema/metadata';
import { getAttrKey } from '../../schema/metadata';

const styles: Record<string, React.CSSProperties> = {
  section: { marginTop: 16 },
  label: { display: 'block', marginBottom: 6, fontSize: 13, color: '#a78bfa' },
  input: {
    width: '100%',
    padding: 8,
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 6,
    color: '#e8e8e8',
    fontSize: 13,
  },
  row: { marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' },
};

const readOnlyValue: React.CSSProperties = { fontSize: 13, color: '#e8e8e8' };

export function AttributeValuesCard({
  attributeDefs,
  values,
  onChange,
  title = '属性',
  readOnly = false,
}: {
  attributeDefs: CharacterAttributeDef[];
  values?: Record<string, string | number | boolean>;
  onChange?: (v: Record<string, string | number | boolean>) => void;
  title?: string;
  readOnly?: boolean;
}) {
  const val = values ?? {};

  if (attributeDefs.length === 0) {
    return (
      <div style={styles.section}>
        {title && <label style={styles.label}>{title}</label>}
        <p style={{ color: '#888', fontSize: 13 }}>请在「元信息」中先添加人物属性</p>
      </div>
    );
  }

  const update = (k: string, v: string | number | boolean) => {
    if (!onChange) return;
    const next = { ...val };
    if (v === '' || v === undefined) delete next[k];
    else next[k] = v;
    onChange(next);
  };

  return (
    <div style={styles.section}>
      {title && <label style={styles.label}>{title}</label>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {attributeDefs.map((def) => {
          const key = getAttrKey(def);
          const displayVal = val[key] ?? val[def.id] ?? val[def.name] ?? '-';
          return (
            <div key={key} style={styles.row}>
              <span style={{ minWidth: 80, fontSize: 13 }}>{def.name}</span>
              {readOnly ? (
                <span style={readOnlyValue}>{String(displayVal)}</span>
              ) : def.type === 'number' ? (
                <input
                  type="number"
                  value={String(displayVal)}
                  onChange={(e) => update(key, e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)}
                  style={{ ...styles.input, maxWidth: 120 }}
                />
              ) : def.type === 'boolean' ? (
                <select
                  value={String(displayVal)}
                  onChange={(e) => update(key, e.target.value === 'true')}
                  style={{ ...styles.input, maxWidth: 100 }}
                >
                  <option value="">-</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  value={String(displayVal)}
                  onChange={(e) => update(key, e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
