/**
 * 字符串列表编辑（如 event.messages / scene.messages）
 */

import React from 'react';
import {listGrids} from '../../styles/listStyles';
import {editorStyles as styles} from '../../styles/editorStyles';
import {ListAddButton, ListDeleteButton, ListOpsCell, ListSectionHead, ListTableRow} from './ListPrimitives';

export function StringListField({
  label,
  hint,
  value = [],
  onChange,
  editable,
  placeholder = '消息文案',
  addButtonLabel = '添加消息',
}: {
  label: string;
  hint?: string;
  value?: string[];
  onChange?: (v: string[]) => void;
  editable: boolean;
  placeholder?: string;
  addButtonLabel?: string;
}) {
  const list = Array.isArray(value) ? value : [];

  if (!editable || !onChange) {
    return (
      <div style={styles.row}>
        <label style={styles.label}>{label}</label>
        {hint && <p style={{margin: '0 0 8px', fontSize: 12, color: '#888'}}>{hint}</p>}
        <div style={styles.readOnlyValue}>
          {list.length === 0 ? (
            '-'
          ) : (
            <ul style={{margin: 0, paddingLeft: 18}}>
              {list.map((text, i) => (
                <li key={i} style={{marginBottom: 4}}>
                  {text.trim() || '（空）'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const add = () => onChange([...list, '']);
  const remove = (i: number) => onChange(list.filter((_, j) => j !== i));
  const update = (i: number, v: string) => onChange(list.map((x, j) => (j === i ? v : x)));

  return (
    <div style={styles.row}>
      <ListSectionHead title={<label style={{...styles.label, marginBottom: 0}}>{label}</label>} addTitle={addButtonLabel} onAdd={add} />
      {hint && <p style={{margin: '0 0 8px', fontSize: 12, color: '#888'}}>{hint}</p>}
      <div>
        {list.map((text, i) => (
          <ListTableRow key={i} grid={listGrids.fieldOps}>
            <textarea
              value={text}
              onChange={(e) => update(i, e.target.value)}
              style={{...styles.input, minHeight: 48, resize: 'vertical'}}
              placeholder={`${placeholder} ${i + 1}`}
              rows={2}
            />
            <ListOpsCell>
              <ListDeleteButton onClick={() => remove(i)} />
            </ListOpsCell>
          </ListTableRow>
        ))}
      </div>
    </div>
  );
}

/** 持久化前去掉空白项 */
export function normalizeStringList(list: string[] | undefined): string[] | undefined {
  const trimmed = (list ?? []).map((s) => s.trim()).filter(Boolean);
  return trimmed.length ? trimmed : undefined;
}
