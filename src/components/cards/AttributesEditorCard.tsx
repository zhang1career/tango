/**
 * 属性编辑卡 - 复用组件
 * 基于 metadata 人物属性，编辑 set/add/subtract 操作
 */

import React from 'react';
import type {FrameworkStateActions} from '@/schema/state-actions.ts';
import type {CharacterAttributeDef} from '@/schema/metadata.ts';
import {getAttrKey} from '@/schema/metadata.ts';

import {editorStyles as styles} from '@/styles/editorStyles';

export function AttributesEditorCard({
                                       attributeDefs,
                                       actions,
                                       onChange,
                                       title = '属性',
                                       readOnly = false,
                                     }: {
  attributeDefs: CharacterAttributeDef[];
  actions?: FrameworkStateActions;
  onChange?: (a: FrameworkStateActions) => void;
  title?: string;
  readOnly?: boolean;
}) {
  const set_ = actions?.set ?? {};
  const add = actions?.add ?? {};
  const subtract = actions?.subtract ?? {};

  const updateSet = (k: string, v: string | number | boolean | undefined) => {
    if (!onChange) return;
    const next = {...set_};
    if (v === '' || v === undefined) delete next[k];
    else next[k] = v;
    onChange({...actions, set: Object.keys(next).length ? next : undefined});
  };

  const updateAdd = (k: string, v: number) => {
    if (!onChange) return;
    const next = {...add};
    if (!v && v !== 0) delete next[k];
    else next[k] = v;
    onChange({...actions, add: Object.keys(next).length ? next : undefined});
  };

  const updateSubtract = (k: string, v: number) => {
    if (!onChange) return;
    const next = {...subtract};
    if (!v && v !== 0) delete next[k];
    else next[k] = v;
    onChange({...actions, subtract: Object.keys(next).length ? next : undefined});
  };

  if (attributeDefs.length === 0) {
    return (
      <div style={styles.section}>
        {title && <label style={styles.label}>{title}</label>}
        <p style={{color: '#888', fontSize: 13}}>请在「元信息」中先添加人物属性</p>
      </div>
    );
  }

  return (
    <div style={styles.section}>
      {title && <label style={styles.label}>{title}</label>}
      <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
        {attributeDefs.map((def) => {
          const key = getAttrKey(def);
          const addVal = add[key] ?? add[def.id] ?? add[def.name];
          const subVal = subtract[key] ?? subtract[def.id] ?? subtract[def.name];
          const setVal = set_[key] ?? set_[def.id] ?? set_[def.name];
          const hasVal = addVal !== undefined || subVal !== undefined || setVal !== undefined;

          if (readOnly) {
            const parts: string[] = [];
            if (setVal !== undefined) parts.push(`设=${String(setVal)}`);
            if (addVal !== undefined) parts.push(`+${addVal}`);
            if (subVal !== undefined) parts.push(`-${subVal}`);
            return (
              <div key={key} style={{...styles.row, flexWrap: 'wrap'}}>
                <span style={{minWidth: 80, fontSize: 13}}>{def.name}</span>
                <span style={styles.readOnlyValue}>{hasVal ? parts.join(' ') : '-'}</span>
              </div>
            );
          }

          return (
            <div key={key} style={{...styles.row, flexWrap: 'wrap'}}>
              <span style={{minWidth: 80, fontSize: 13}}>{def.name}</span>
              <span style={{color: '#666', fontSize: 12}}>({def.type})</span>
              {def.type === 'number' ? (
                <>
                  <input
                    type="number"
                    value={addVal ?? ''}
                    onChange={(e) => updateAdd(key, e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)}
                    placeholder="+增量"
                    style={{...styles.input, width: 70}}
                  />
                  <input
                    type="number"
                    value={subVal ?? ''}
                    onChange={(e) => updateSubtract(key, e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)}
                    placeholder="-减量"
                    style={{...styles.input, width: 70}}
                  />
                  <input
                    type="number"
                    value={String(setVal ?? '')}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateSet(key, v === '' ? undefined : parseInt(v, 10) || 0);
                    }}
                    placeholder="=设值"
                    style={{...styles.input, width: 70}}
                  />
                </>
              ) : (
                <input
                  value={String(setVal ?? '')}
                  onChange={(e) => updateSet(key, e.target.value === '' ? '' : def.type === 'boolean' ? e.target.value === 'true' : e.target.value)}
                  placeholder={def.type === 'boolean' ? 'true/false' : '值'}
                  style={{...styles.input, flex: 1, maxWidth: 120}}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
