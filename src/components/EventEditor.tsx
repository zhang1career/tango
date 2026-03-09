/**
 * 事件编辑界面
 */

import React, {useState} from 'react';
import type {StoryFramework} from '../schema/story-framework';
import type {GameEvent} from '../schema/game-event';
import {AttributesEditorCard} from './cards/AttributesEditorCard';
import {ItemsEditorCard} from './cards/ItemsEditorCard';
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
  section: {marginBottom: 24},
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
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 16
  },
};

/** 保存事件到预设路径 assets/story-events.json */
async function saveEventsToPreset(events: unknown): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch('/api/story-events', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(events),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(events)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-events.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
}

type EventFormProps = {
  evt: GameEvent;
  editable: boolean;
  attributeDefs: import('../schema/metadata').CharacterAttributeDef[];
  items: import('../schema/game-item').GameItem[];
  onUpdate?: (fn: (e: GameEvent) => GameEvent) => void;
};

function EventFormContent({evt, editable, attributeDefs, items, onUpdate}: EventFormProps) {
  if (!editable || !onUpdate) {
    return (
      <div style={{color: '#e8e8e8', fontSize: 14}}>
        <p style={{margin: '0 0 8px'}}><strong>ID：</strong>{evt.id}</p>
        <p style={{margin: '0 0 8px'}}><strong>名称：</strong>{evt.name}</p>
        <p style={{margin: '0 0 8px'}}><strong>触发类型：</strong>{evt.trigger === 'unconditional' ? '无条件' : '条件'}
        </p>
        {evt.trigger === 'conditional' && evt.condition && (
          <p style={{margin: '0 0 8px'}}><strong>触发条件：</strong>{evt.condition}</p>
        )}
        {evt.actions && (Object.keys(evt.actions).length > 0 || evt.actions.give || evt.actions.take) && (
          <p style={{margin: '0 0 8px'}}><strong>计算规则：</strong>{JSON.stringify(evt.actions)}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={styles.row}>
        <label style={styles.label}>ID</label>
        <input
          value={evt.id}
          onChange={(e) => onUpdate((c) => ({...c, id: e.target.value}))}
          style={styles.input}
          placeholder="evt_xxx"
        />
      </div>
      <div style={styles.row}>
        <label style={styles.label}>名称</label>
        <input
          value={evt.name}
          onChange={(e) => onUpdate((c) => ({...c, name: e.target.value}))}
          style={styles.input}
          placeholder="进入军营"
        />
      </div>
      <div style={styles.row}>
        <label style={styles.label}>触发类型</label>
        <select
          value={evt.trigger}
          onChange={(e) => onUpdate((c) => ({...c, trigger: e.target.value as 'unconditional' | 'conditional'}))}
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
            onChange={(e) => onUpdate((c) => ({...c, condition: e.target.value || undefined}))}
            style={styles.input}
            placeholder={'$items has "令牌" 或 $var.尔朱荣 >= 5'}
          />
        </div>
      )}
      <AttributesEditorCard
        attributeDefs={attributeDefs}
        actions={evt.actions}
        onChange={(a) => onUpdate((c) => ({...c, actions: a}))}
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
  );
}

export function EventEditor({fw, updateFw}: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void
}) {
  const events = fw.events ?? [];
  const setEvents = (fn: (e: GameEvent[]) => GameEvent[]) =>
    updateFw((d) => ({...d, events: fn(d.events ?? [])}));

  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState<GameEvent>(() => ({
    id: `evt_${Date.now()}`,
    name: '新事件',
    trigger: 'unconditional'
  }));

  const openAddModal = () => {
    setNewEvent({id: `evt_${Date.now()}`, name: '新事件', trigger: 'unconditional'});
    setAddModalOpen(true);
  };

  const confirmAddEvent = async () => {
    const next = [...events, newEvent];
    setEvents(() => next);
    const result = await saveEventsToPreset(next);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  const updateEvent = (index: number, fn: (e: GameEvent) => GameEvent) =>
    setEvents((e) => e.map((x, i) => (i === index ? fn(x) : x)));

  const removeEvent = async (index: number) => {
    const next = events.filter((_, i) => i !== index);
    setEvents(() => next);
    const result = await saveEventsToPreset(next);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };

  const saveEvents = async () => {
    const result = await saveEventsToPreset(events);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setEditIndex(null);
  };

  const attributeDefs = fw.metadata?.characterAttributes ?? [];
  const items = fw.items ?? [];

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>事件</h1>
        <button type="button" style={styles.btn} onClick={openAddModal}>
          + 添加事件
        </button>
      </header>

      <section style={styles.section}>
        {events.length === 0 && (
          <p style={{color: '#888', fontSize: 14}}>暂无事件，点击「添加事件」创建。</p>
        )}
        {events.map((evt, ei) => (
          <div key={`evt-${ei}`} style={styles.card}>
            <div style={styles.cardHead}>
              <span
                style={{fontWeight: 600, flex: 1, cursor: 'pointer'}}
                onClick={() => setDetailIndex(ei)}
              >
                {evt.name}
                <span style={{marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400}}>
                  {evt.trigger === 'unconditional' ? '(无条件)' : '(条件)'} · {evt.id}
                </span>
              </span>
              <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <button type="button" style={styles.btnIcon} onClick={() => setEditIndex(ei)} title="编辑">
                  ✎
                </button>
                <button
                  type="button"
                  style={styles.btnIcon}
                  onClick={() => removeEvent(ei)}
                  title="删除"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {detailIndex !== null && events[detailIndex] && (
        <DetailEditModal
          title="事件详情"
          open={true}
          onClose={() => setDetailIndex(null)}
          editable={false}
        >
          <EventFormContent
            evt={events[detailIndex]}
            editable={false}
            attributeDefs={attributeDefs}
            items={items}
          />
        </DetailEditModal>
      )}

      {editIndex !== null && events[editIndex] && (
        <DetailEditModal
          title="编辑事件"
          open={true}
          onClose={() => setEditIndex(null)}
          editable={true}
          onSave={saveEvents}
        >
          <EventFormContent
            evt={events[editIndex]}
            editable={true}
            attributeDefs={attributeDefs}
            items={items}
            onUpdate={(fn) => updateEvent(editIndex, fn)}
          />
        </DetailEditModal>
      )}

      {addModalOpen && (
        <DetailEditModal
          title="添加事件"
          open={true}
          onClose={() => setAddModalOpen(false)}
          editable={true}
          onSave={confirmAddEvent}
        >
          <EventFormContent
            evt={newEvent}
            editable={true}
            attributeDefs={attributeDefs}
            items={items}
            onUpdate={(fn) => setNewEvent(fn(newEvent))}
          />
        </DetailEditModal>
      )}
    </div>
  );
}
