/**
 * 元信息编辑界面 - 人物属性定义
 */

import React from 'react';
import type { StoryFramework } from '../schema/story-framework';
import type { GameMetadata, CharacterAttributeDef } from '../schema/metadata';
import type { AttributeType } from '../schema/metadata';

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

export function MetadataEditor({
  fw,
  updateFw,
}: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const metadata = fw.metadata ?? { characterAttributes: [] };
  const attrs = metadata.characterAttributes;
  const setMetadata = (fn: (m: GameMetadata) => GameMetadata) =>
    updateFw((d) => ({ ...d, metadata: fn(d.metadata ?? { characterAttributes: [] }) }));

  const addAttr = () => {
    const id = `attr_${Date.now()}`;
    setMetadata((m) => ({
      ...m,
      characterAttributes: [...m.characterAttributes, { id, name: '新属性', type: 'number' }],
    }));
  };

  const updateAttr = (i: number, fn: (a: CharacterAttributeDef) => CharacterAttributeDef) =>
    setMetadata((m) => ({
      ...m,
      characterAttributes: m.characterAttributes.map((a, j) => (j === i ? fn(a) : a)),
    }));

  const removeAttr = (i: number) =>
    setMetadata((m) => ({
      ...m,
      characterAttributes: m.characterAttributes.filter((_, j) => j !== i),
    }));

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>编辑元信息</h1>
        <button type="button" style={styles.btn} onClick={() => saveToPreset('metadata.json', fw.metadata ?? { characterAttributes: [] })}>
          保存
        </button>
      </header>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>人物属性</h2>
          <button type="button" style={{ ...styles.btn, padding: '6px 12px', fontSize: 13 }} onClick={addAttr}>
            + 添加属性
          </button>
        </div>

        {attrs.length === 0 && (
          <p style={{ color: '#888' }}>暂无属性，点击「添加属性」创建。属性供编辑时间线、编辑人物等页面的属性操作使用。</p>
        )}

        {attrs.map((a, i) => (
          <div key={a.id} style={styles.card}>
            <div style={styles.cardHead}>
              <span>{a.name}</span>
              <button type="button" style={styles.btnIcon} onClick={() => removeAttr(i)} title="删除">×</button>
            </div>
            <div style={styles.cardBody}>
              <div style={styles.row}>
                <label style={styles.label}>变量名称</label>
                <input
                  value={a.name}
                  onChange={(e) => updateAttr(i, (x) => ({ ...x, name: e.target.value }))}
                  style={styles.input}
                  placeholder="尔朱荣"
                />
              </div>
              <div style={styles.row}>
                <label style={styles.label}>变量类型</label>
                <select
                  value={a.type}
                  onChange={(e) => updateAttr(i, (x) => ({ ...x, type: e.target.value as AttributeType }))}
                  style={styles.input}
                >
                  <option value="number">number</option>
                  <option value="string">string</option>
                  <option value="boolean">boolean</option>
                </select>
              </div>
              {a.type === 'number' && (
                <div style={styles.row}>
                  <label style={styles.label}>取值范围（min,max）</label>
                  <input
                    value={a.valueRange ?? ''}
                    onChange={(e) => updateAttr(i, (x) => ({ ...x, valueRange: e.target.value || undefined }))}
                    style={styles.input}
                    placeholder="0,100"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
