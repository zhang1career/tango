/**
 * 物品编辑界面
 */

import React from 'react';
import type { StoryFramework } from '../schema/story-framework';
import type { GameItem } from '../schema/game-item';

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 720, margin: '0 auto', padding: 20, color: '#e8e8e8' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #333',
  },
  title: { fontSize: 20, fontWeight: 600, margin: 0 },
  btn: {
    padding: '8px 16px',
    backgroundColor: '#2d2d44',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e8e8e8',
    cursor: 'pointer',
    fontSize: 14,
  },
  card: {
    marginBottom: 12,
    backgroundColor: '#1e1e32',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #333',
  },
  cardHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#252540',
  },
  cardBody: { padding: 16 },
  row: { marginBottom: 12 },
  label: { display: 'block', marginBottom: 6, fontSize: 13, color: '#a78bfa' },
  input: {
    width: '100%',
    padding: 10,
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 6,
    color: '#e8e8e8',
    fontSize: 14,
  },
  btnIcon: { padding: '2px 8px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 },
};

function saveToPreset(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ItemsEditorPage({
  fw,
  updateFw,
}: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const items = fw.items ?? [];
  const setItems = (fn: (i: GameItem[]) => GameItem[]) =>
    updateFw((d) => ({ ...d, items: fn(d.items ?? []) }));

  const addItem = () => {
    const id = `item_${Date.now()}`;
    setItems((i) => [...i, { id, name: '新物品' }]);
  };

  const updateItem = (index: number, fn: (x: GameItem) => GameItem) =>
    setItems((i) => i.map((x, j) => (j === index ? fn(x) : x)));

  const removeItem = (index: number) => setItems((i) => i.filter((_, j) => j !== index));

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>编辑物品</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" style={styles.btn} onClick={addItem}>
            + 添加物品
          </button>
          <button type="button" style={styles.btn} onClick={() => saveToPreset('items.json', fw.items ?? [])}>
            保存
          </button>
        </div>
      </header>

      <section>
        {items.length === 0 && <p style={{ color: '#888' }}>暂无物品，点击「添加物品」创建。</p>}
        {items.map((item, i) => (
          <div key={item.id} style={styles.card}>
            <div style={styles.cardHead}>
              <span>{item.name}</span>
              <button type="button" style={styles.btnIcon} onClick={() => removeItem(i)}>×</button>
            </div>
            <div style={styles.cardBody}>
              <div style={styles.row}>
                <label style={styles.label}>ID</label>
                <input
                  value={item.id}
                  onChange={(e) => updateItem(i, (x) => ({ ...x, id: e.target.value }))}
                  style={styles.input}
                />
              </div>
              <div style={styles.row}>
                <label style={styles.label}>名称</label>
                <input
                  value={item.name}
                  onChange={(e) => updateItem(i, (x) => ({ ...x, name: e.target.value }))}
                  style={styles.input}
                />
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
