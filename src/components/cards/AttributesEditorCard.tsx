/**
 * 属性编辑卡 - 复用组件
 * 基于 metadata 人物属性，编辑 set/add/subtract 操作
 */

import React from 'react';
import type { FrameworkStateActions } from '../../schema/state-actions';
import type { CharacterAttributeDef } from '../../schema/metadata';

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
  btnIcon: { padding: '2px 8px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 },
};

export function AttributesEditorCard({
  attributeDefs,
  actions,
  onChange,
  title = '属性',
}: {
  attributeDefs: CharacterAttributeDef[];
  actions?: FrameworkStateActions;
  onChange: (a: FrameworkStateActions) => void;
  title?: string;
}) {
  const set_ = actions?.set ?? {};
  const add = actions?.add ?? {};
  const subtract = actions?.subtract ?? {};

  const updateSet = (k: string, v: string | number | boolean | undefined) => {
    const next = { ...set_ };
    if (v === '' || v === undefined) delete next[k];
    else next[k] = v;
    onChange({ ...actions, set: Object.keys(next).length ? next : undefined });
  };

  const updateAdd = (k: string, v: number) => {
    const next = { ...add };
    if (!v && v !== 0) delete next[k];
    else next[k] = v;
    onChange({ ...actions, add: Object.keys(next).length ? next : undefined });
  };

  const updateSubtract = (k: string, v: number) => {
    const next = { ...subtract };
    if (!v && v !== 0) delete next[k];
    else next[k] = v;
    onChange({ ...actions, subtract: Object.keys(next).length ? next : undefined });
  };

  if (attributeDefs.length === 0) {
    return (
      <div style={styles.section}>
        <label style={styles.label}>{title}</label>
        <p style={{ color: '#888', fontSize: 13 }}>请在「编辑元信息」中先添加人物属性</p>
      </div>
    );
  }

  return (
    <div style={styles.section}>
      <label style={styles.label}>{title}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {attributeDefs.map((def) => (
          <div key={def.id} style={{ ...styles.row, flexWrap: 'wrap' }}>
            <span style={{ minWidth: 80, fontSize: 13 }}>{def.name}</span>
            <span style={{ color: '#666', fontSize: 12 }}>({def.type})</span>
            {def.type === 'number' ? (
              <>
                <input
                  type="number"
                  value={add[def.id] ?? add[def.name] ?? ''}
                  onChange={(e) => updateAdd(def.id, e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)}
                  placeholder="+增量"
                  style={{ ...styles.input, width: 70 }}
                />
                <input
                  type="number"
                  value={subtract[def.id] ?? subtract[def.name] ?? ''}
                  onChange={(e) => updateSubtract(def.id, e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)}
                  placeholder="-减量"
                  style={{ ...styles.input, width: 70 }}
                />
                <input
                  type="number"
                  value={String(set_[def.id] ?? set_[def.name] ?? '')}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateSet(def.id, v === '' ? undefined : parseInt(v, 10) || 0);
                  }}
                  placeholder="=设值"
                  style={{ ...styles.input, width: 70 }}
                />
              </>
            ) : (
              <input
                value={String(set_[def.id] ?? set_[def.name] ?? '')}
                onChange={(e) => updateSet(def.id, e.target.value === '' ? '' : def.type === 'boolean' ? e.target.value === 'true' : e.target.value)}
                placeholder={def.type === 'boolean' ? 'true/false' : '值'}
                style={{ ...styles.input, flex: 1, maxWidth: 120 }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
