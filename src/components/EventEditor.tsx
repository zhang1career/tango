/**
 * 事件编辑界面
 */

import React from 'react';
import type { StoryFramework } from '../schema/story-framework';
import type { GameEvent } from '../schema/game-event';
import { AttributesEditorCard } from './cards/AttributesEditorCard';
import { ItemsEditorCard } from './cards/ItemsEditorCard';

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
  section: { marginBottom: 24 },
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
  textarea: { minHeight: 60, resize: 'vertical' as const, boxSizing: 'border-box' },
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
    cursor: 'pointer',
  },
  cardBody: { padding: 16 },
  row: { marginBottom: 12 },
  btnSmall: { padding: '4px 10px', backgroundColor: '#333', border: 'none', borderRadius: 4, color: '#aaa', cursor: 'pointer', fontSize: 12 },
  btnIcon: { padding: '2px 8px', backgroundColor: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
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


export function EventEditor({
  fw,
  updateFw,
}: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const events = fw.events ?? [];
  const setEvents = (fn: (e: GameEvent[]) => GameEvent[]) =>
    updateFw((d) => ({ ...d, events: fn(d.events ?? []) }));

  const addEvent = () => {
    const id = `evt_${Date.now()}`;
    setEvents((e) => [...e, { id, name: '新事件', trigger: 'unconditional' }]);
  };

  const updateEvent = (index: number, fn: (e: GameEvent) => GameEvent) =>
    setEvents((e) => e.map((x, i) => (i === index ? fn(x) : x)));

  const removeEvent = (index: number) =>
    setEvents((e) => e.filter((_, i) => i !== index));

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>事件编辑</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" style={styles.btn} onClick={addEvent}>
            + 添加事件
          </button>
          <button type="button" style={styles.btn} onClick={() => saveToPreset('story-events.json', fw.events ?? [])}>
            保存
          </button>
        </div>
      </header>

      <section style={styles.section}>
        {events.length === 0 && (
          <p style={{ color: '#888', fontSize: 14 }}>暂无事件，点击「添加事件」创建。</p>
        )}
        {events.map((evt, ei) => (
          <EventCard
            key={evt.id}
            evt={evt}
            attributeDefs={fw.metadata?.characterAttributes ?? []}
            items={fw.items ?? []}
            onUpdate={(fn) => updateEvent(ei, fn)}
            onRemove={() => removeEvent(ei)}
          />
        ))}
      </section>
    </div>
  );
}

function EventCard({
  evt,
  attributeDefs,
  items,
  onUpdate,
  onRemove,
}: {
  evt: GameEvent;
  attributeDefs: import('../schema/metadata').CharacterAttributeDef[];
  items: import('../schema/game-item').GameItem[];
  onUpdate: (fn: (e: GameEvent) => GameEvent) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = React.useState(true);

  return (
    <div style={styles.card}>
      <div style={styles.cardHead} onClick={() => setExpanded(!expanded)}>
        <span style={{ fontWeight: 600 }}>
          {expanded ? '▼' : '▶'} {evt.name}
          <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
            {evt.trigger === 'unconditional' ? '(无条件)' : '(条件)'}
          </span>
        </span>
        <button type="button" style={styles.btnIcon} onClick={(e) => { e.stopPropagation(); onRemove(); }} title="删除">
          ×
        </button>
      </div>
      {expanded && (
        <div style={styles.cardBody}>
          <div style={styles.row}>
            <label style={styles.label}>ID</label>
            <input
              value={evt.id}
              onChange={(e) => onUpdate((c) => ({ ...c, id: e.target.value }))}
              style={styles.input}
              placeholder="evt_xxx"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>名称</label>
            <input
              value={evt.name}
              onChange={(e) => onUpdate((c) => ({ ...c, name: e.target.value }))}
              style={styles.input}
              placeholder="进入军营"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>触发类型</label>
            <select
              value={evt.trigger}
              onChange={(e) => onUpdate((c) => ({ ...c, trigger: e.target.value as 'unconditional' | 'conditional' }))}
              style={styles.input}
            >
              <option value="unconditional">无条件触发</option>
              <option value="conditional">条件触发</option>
            </select>
          </div>
          {evt.trigger === 'conditional' && (
            <div style={styles.row}>
              <label style={styles.label}>触发条件</label>
              <input
                value={evt.condition ?? ''}
                onChange={(e) => onUpdate((c) => ({ ...c, condition: e.target.value || undefined }))}
                style={styles.input}
                placeholder={'$items has "令牌" 或 $var.尔朱荣 >= 5'}
              />
            </div>
          )}
          <AttributesEditorCard
            attributeDefs={attributeDefs}
            actions={evt.actions}
            onChange={(a) => onUpdate((c) => ({ ...c, actions: a }))}
            title="计算规则（属性）"
          />
          <ItemsEditorCard
            items={items}
            give={Array.isArray(evt.actions?.give) ? evt.actions.give : evt.actions?.give ? [evt.actions.give] : []}
            take={Array.isArray(evt.actions?.take) ? evt.actions.take : evt.actions?.take ? [evt.actions.take] : []}
            onChange={(give, take) =>
              onUpdate((c) => ({
                ...c,
                actions: {
                  ...c.actions,
                  give: give.length ? give : undefined,
                  take: take.length ? take : undefined,
                },
              }))
            }
            title="计算规则（物品）"
          />
        </div>
      )}
    </div>
  );
}
