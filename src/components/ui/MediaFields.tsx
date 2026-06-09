/**
 * 共享多媒体字段组件 - 用于场景、人物、物品、事件编辑
 */

import React from 'react';
import {listGrids} from '../../styles/listStyles';
import {editorStyles as styles} from '../../styles/editorStyles';
import {ListDeleteButton, ListOpsCell, ListSectionHead, ListTableRow} from './ListPrimitives';

function FieldRow({
  label,
  value,
  editable,
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
      {editable && children ? children : <div style={styles.readOnlyValue}>{value ?? '-'}</div>}
    </div>
  );
}

/** 单 URL 输入（动画、BGM、头像等） */
export function MediaUrlField({
  label,
  value,
  onChange,
  placeholder,
  editable,
  preserveEmptyString = false,
}: {
  label: string;
  value?: string;
  onChange?: (v: string | undefined) => void;
  placeholder?: string;
  editable: boolean;
  /** 为 true 时输入空字符串会回调 '' 而非 undefined（用于场景显式空值） */
  preserveEmptyString?: boolean;
}) {
  return (
    <FieldRow label={label} value={value ?? ''} editable={editable && !!onChange}>
      <input
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange?.(preserveEmptyString ? '' : undefined);
          } else {
            onChange?.(raw);
          }
        }}
        style={styles.input}
        placeholder={placeholder ?? '相对路径或 URL'}
      />
    </FieldRow>
  );
}

/** 配图轮播（多 URL 列表） */
export function MediaCarouselField({
  label,
  value = [],
  onChange,
  editable,
}: {
  label: string;
  value?: string[];
  onChange?: (v: string[]) => void;
  editable: boolean;
}) {
  const list = Array.isArray(value) ? value : [];

  if (!editable || !onChange) {
    return (
      <div style={styles.row}>
        <label style={styles.label}>{label}</label>
        <div style={styles.readOnlyValue}>
          {list.length === 0 ? '-' : list.map((u, i) => (
            <div key={i} style={{marginBottom: 4}}>{u}</div>
          ))}
        </div>
      </div>
    );
  }

  const add = () => onChange([...list, '']);
  const remove = (i: number) => onChange(list.filter((_, j) => j !== i));
  const update = (i: number, v: string) =>
    onChange(list.map((x, j) => (j === i ? v : x)));

  return (
    <div style={styles.row}>
      <ListSectionHead
        title={<label style={{...styles.label, marginBottom: 0}}>{label}</label>}
        addTitle="添加图片"
        onAdd={add}
      />
      <div>
        {list.map((url, i) => (
          <ListTableRow key={i} grid={listGrids.fieldOps}>
            <input
              value={url}
              onChange={(e) => update(i, e.target.value)}
              style={styles.input}
              placeholder={`图片 ${i + 1} URL`}
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
