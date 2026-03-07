/**
 * 物品列表编辑卡 - 编辑角色的物品列表（非 give/take 操作）
 */

import React from 'react';
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

export function InventoryValuesCard({
  items,
  inventory,
  onChange,
  title = '物品',
}: {
  items: GameItem[];
  inventory: string[];
  onChange: (ids: string[]) => void;
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
      <input
        value={inventory.join(', ')}
        onChange={(e) => onChange(parseList(e.target.value))}
        style={styles.input}
        placeholder="物品 id，逗号分隔"
      />
      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
        可选: {items.map((i) => `${i.name}(${i.id})`).join(', ')}
      </div>
    </div>
  );
}
