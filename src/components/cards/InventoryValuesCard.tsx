/**
 * 物品列表编辑卡 - 编辑角色的物品列表（非 give/take 操作）
 */

import React from 'react';
import type {GameItem} from '@/schema/game-item.ts';
import {editorStyles as styles} from '@/styles/editorStyles';

const readOnlyValue: React.CSSProperties = styles.readOnlyValue ?? {fontSize: 13, color: '#e8e8e8'};

export function InventoryValuesCard({
                                      items,
                                      inventory,
                                      onChange,
                                      title = '物品',
                                      readOnly = false,
                                    }: {
  items: GameItem[];
  inventory: string[];
  onChange?: (ids: string[]) => void;
  title?: string;
  readOnly?: boolean;
}) {
  const parseList = (s: string) => s ? s.split(/[,，]/).map((x) => x.trim()).filter(Boolean) : [];

  if (items.length === 0) {
    return (
      <div style={styles.section}>
        {title && <label style={styles.label}>{title}</label>}
        <p style={{color: '#888', fontSize: 13}}>请在「物品」中先添加物品</p>
      </div>
    );
  }

  return (
    <div style={styles.section}>
      {title && <label style={styles.label}>{title}</label>}
      {readOnly ? (
        <div style={readOnlyValue}>{inventory.length > 0 ? inventory.join(', ') : '-'}</div>
      ) : (
        <>
          <input
            value={inventory.join(', ')}
            onChange={(e) => onChange?.(parseList(e.target.value))}
            style={styles.input}
            placeholder="物品 id，逗号分隔"
          />
          <div style={{fontSize: 11, color: '#666', marginTop: 4}}>
            可选: {items.map((i) => `${i.name}(${i.id})`).join(', ')}
          </div>
        </>
      )}
    </div>
  );
}
