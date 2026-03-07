/**
 * 物品编辑卡 - 复用组件
 * 基于 items 列表，编辑 give/take
 */

import React from 'react';
import type { FrameworkStateActions } from '../../schema/state-actions';
import type { GameItem } from '../../schema/game-item';

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
};

export function ItemsEditorCard({
  items,
  give,
  take,
  onChange,
  title = '物品',
}: {
  items: GameItem[];
  give: string[];
  take: string[];
  onChange: (give: string[], take: string[]) => void;
  title?: string;
}) {
  const parseList = (s: string) => s ? s.split(/[,，]/).map((x) => x.trim()).filter(Boolean) : [];

  if (items.length === 0) {
    return (
      <div style={styles.section}>
        <label style={styles.label}>{title}</label>
        <p style={{ color: '#888', fontSize: 13 }}>请在「编辑物品」中先添加物品</p>
      </div>
    );
  }

  return (
    <div style={styles.section}>
      <label style={styles.label}>{title}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <small style={{ color: '#888' }}>添加（give）</small>
          <input
            value={give.join(', ')}
            onChange={(e) => onChange(parseList(e.target.value), take)}
            style={styles.input}
            placeholder="物品 id 或名称，逗号分隔"
          />
        </div>
        <div>
          <small style={{ color: '#888' }}>移除（take）</small>
          <input
            value={take.join(', ')}
            onChange={(e) => onChange(give, parseList(e.target.value))}
            style={styles.input}
            placeholder="物品 id 或名称，逗号分隔"
          />
        </div>
        <div style={{ fontSize: 11, color: '#666' }}>
          可选: {items.map((i) => `${i.name}(${i.id})`).join(', ')}
        </div>
      </div>
    </div>
  );
}
