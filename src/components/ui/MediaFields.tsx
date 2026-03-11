/**
 * 共享多媒体字段组件 - 用于场景、人物、物品、事件编辑
 */

import React from 'react';
import {editorStyles as styles} from '../../styles/editorStyles';

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
}: {
  label: string;
  value?: string;
  onChange?: (v: string | undefined) => void;
  placeholder?: string;
  editable: boolean;
}) {
  return (
    <FieldRow label={label} value={value ?? ''} editable={editable && !!onChange}>
      <input
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value === '' ? undefined : e.target.value)}
        style={styles.input}
        placeholder={placeholder ?? '相对路径或完整 URL'}
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
      <label style={styles.label}>{label}</label>
      <div>
        {list.map((url, i) => (
          <div key={i} style={{display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center'}}>
            <input
              value={url}
              onChange={(e) => update(i, e.target.value)}
              style={{...styles.input, flex: 1}}
              placeholder={`图片 ${i + 1} URL`}
            />
            <button type="button" style={styles.btnIcon} onClick={() => remove(i)} title="删除">×</button>
          </div>
        ))}
        <button type="button" style={styles.btn} onClick={add}>+ 添加图片</button>
      </div>
    </div>
  );
}
