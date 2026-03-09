/**
 * 物品编辑界面
 */

import React, {useState} from 'react';
import type {StoryFramework} from '../schema/story-framework';
import type {GameItem} from '../schema/game-item';
import {formatJsonCompact} from '../utils/json-format';
import {DetailEditModal} from './ui/DetailEditModal';

const styles: Record<string, React.CSSProperties> = {
  container: {maxWidth: 720, margin: '0 auto', padding: 20, color: '#e8e8e8'},
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #333',
  },
  title: {fontSize: 20, fontWeight: 600, margin: 0},
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
  row: {marginBottom: 12},
  label: {display: 'block', marginBottom: 6, fontSize: 13, color: '#a78bfa'},
  input: {
    width: '100%',
    padding: 10,
    backgroundColor: '#252540',
    border: '1px solid #333',
    borderRadius: 6,
    color: '#e8e8e8',
    fontSize: 14,
  },
  btnSmall: {
    padding: '4px 10px',
    backgroundColor: '#333',
    border: 'none',
    borderRadius: 4,
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 12
  },
  btnIcon: {
    padding: '2px 8px',
    background: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 16
  },
};

/** 保存物品到预设路径 assets/story-items.json */
async function saveItemsToPreset(items: unknown): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch('/api/story-items', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(items),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(items)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-items.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
}

type ItemFormProps = {
  item: GameItem;
  editable: boolean;
  onUpdate?: (fn: (x: GameItem) => GameItem) => void;
};

function ItemFormContent({item, editable, onUpdate}: ItemFormProps) {
  if (!editable || !onUpdate) {
    return (
      <div style={{color: '#e8e8e8', fontSize: 14}}>
        <p style={{margin: '0 0 8px'}}><strong>ID：</strong>{item.id}</p>
        <p style={{margin: '0 0 8px'}}><strong>名称：</strong>{item.name}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.row}>
        <label style={styles.label}>ID</label>
        <input
          value={item.id}
          onChange={(e) => onUpdate((x) => ({...x, id: e.target.value}))}
          style={styles.input}
        />
      </div>
      <div style={styles.row}>
        <label style={styles.label}>名称</label>
        <input
          value={item.name}
          onChange={(e) => onUpdate((x) => ({...x, name: e.target.value}))}
          style={styles.input}
        />
      </div>
    </div>
  );
}

export function ItemsEditorPage({fw, updateFw}: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void
}) {
  const items = fw.items ?? [];
  const setItems = (fn: (i: GameItem[]) => GameItem[]) =>
    updateFw((d) => ({...d, items: fn(d.items ?? [])}));

  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newItem, setNewItem] = useState<GameItem>(() => ({id: `item_${Date.now()}`, name: '新物品'}));

  const openAddModal = () => {
    setNewItem({id: `item_${Date.now()}`, name: '新物品'});
    setAddModalOpen(true);
  };

  const confirmAddItem = async () => {
    const next = [...items, newItem];
    setItems(() => next);
    const result = await saveItemsToPreset(next);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  const updateItem = (index: number, fn: (x: GameItem) => GameItem) =>
    setItems((i) => i.map((x, j) => (j === index ? fn(x) : x)));

  const removeItem = async (index: number) => {
    const next = items.filter((_, j) => j !== index);
    setItems(() => next);
    const result = await saveItemsToPreset(next);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };

  const saveItems = async () => {
    const result = await saveItemsToPreset(items);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setEditIndex(null);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>物品</h1>
        <button type="button" style={styles.btn} onClick={openAddModal}>
          + 添加物品
        </button>
      </header>

      <section>
        {items.length === 0 && <p style={{color: '#888'}}>暂无物品，点击「添加物品」创建。</p>}
        {items.map((item, i) => (
          <div key={`item-${i}`} style={styles.card}>
            <div style={styles.cardHead}>
              <span
                style={{fontWeight: 600, flex: 1, cursor: 'pointer'}}
                onClick={() => setDetailIndex(i)}
              >
                {item.name}
                <span style={{marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400}}>
                  · {item.id}
                </span>
              </span>
              <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <button type="button" style={styles.btnIcon} onClick={() => setEditIndex(i)} title="编辑">
                  ✎
                </button>
                <button type="button" style={styles.btnIcon} onClick={() => removeItem(i)} title="删除">
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {detailIndex !== null && items[detailIndex] && (
        <DetailEditModal
          title="物品详情"
          open={true}
          onClose={() => setDetailIndex(null)}
          editable={false}
        >
          <ItemFormContent item={items[detailIndex]} editable={false}/>
        </DetailEditModal>
      )}

      {editIndex !== null && items[editIndex] && (
        <DetailEditModal
          title="编辑物品"
          open={true}
          onClose={() => setEditIndex(null)}
          editable={true}
          onSave={saveItems}
        >
          <ItemFormContent
            item={items[editIndex]}
            editable={true}
            onUpdate={(fn) => updateItem(editIndex, fn)}
          />
        </DetailEditModal>
      )}

      {addModalOpen && (
        <DetailEditModal
          title="添加物品"
          open={true}
          onClose={() => setAddModalOpen(false)}
          editable={true}
          onSave={confirmAddItem}
        >
          <ItemFormContent
            item={newItem}
            editable={true}
            onUpdate={(fn) => setNewItem(fn(newItem))}
          />
        </DetailEditModal>
      )}
    </div>
  );
}
