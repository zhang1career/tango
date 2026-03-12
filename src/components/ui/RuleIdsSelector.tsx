/**
 * 规则多选控件（可拖拽排序）
 * 用于「剧情」章节中的场景规则与「场景」页的规则，准入按顺序嵌套执行
 */

import React, {useState} from 'react';

const styles: Record<string, React.CSSProperties> = {
  row: {marginBottom: 12},
  label: {display: 'block', marginBottom: 6, fontSize: 13, color: '#a78bfa'},
  list: {display: 'flex', flexDirection: 'column', gap: 4},
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 6,
    cursor: 'grab',
  },
  itemDragging: {opacity: 0.6, cursor: 'grabbing'},
  dragHandle: {color: '#888', fontSize: 14, userSelect: 'none'},
  itemLabel: {flex: 1, fontSize: 14, color: '#e8e8e8'},
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
}: {
  ruleList: Array<{ id: string; name: string }>;
  value: string[];
  onChange: (ids: string[]) => void;
  readOnly?: boolean;
  label?: string;
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [addId, setAddId] = useState('');

  const ordered = value.slice();
  const selectedSet = new Set(value);
  const available = ruleList.filter((r) => !selectedSet.has(r.id));

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

  const add = () => {
    if (!addId) return;
    onChange([...ordered, addId]);
    setAddId('');
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
          return (
            <div
              key={`${id}-${index}`}
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
          );
        })}
      </div>
      {available.length > 0 && (
        <div key={value.join(',')} style={styles.addRow}>
          <select
            style={styles.select}
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
          >
            <option value="">添加规则…</option>
            {available.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button type="button" style={styles.addBtn} onClick={add} disabled={!addId}>
            添加
          </button>
        </div>
      )}
    </div>
  );
}
