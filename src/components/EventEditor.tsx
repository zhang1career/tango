/**
 * 事件编辑界面
 */

import React, {useEffect, useState} from 'react';
import {getEventsFetchUrl, getCharactersFetchUrl, getRulesFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import type {StoryFramework} from '../schema/story-framework';
import type {GameEvent, EventBehaviorSequenceItem} from '../schema/game-event';
import type {GameBehavior} from '../schema/game-behavior';
import type {GameCharacter} from '../schema/game-character';
import type {GameRule} from '../schema/game-rule';
import {formatJsonCompact} from '../utils/json-format';
import {assignBehaviorIds} from '../utils/behavior-ids';
import {DetailEditModal} from './ui/DetailEditModal';
import {MediaUrlField} from './ui/MediaFields';
import {RuleIdsSelector} from './ui/RuleIdsSelector';

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
    fontSize: 12,
  },
  btnIcon: {
    padding: '2px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 16,
  },
  seqItem: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#1e1e32',
    borderRadius: 8,
    border: '1px solid #333',
  },
  contentItem: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#252540',
    borderRadius: 6,
    border: '1px solid #333',
  },
  readOnlyValue: {fontSize: 14, color: '#e8e8e8', padding: '4px 0'},
};

/** 收集事件下所有行为用于 id 生成 */
function collectAllBehaviors(evt: GameEvent): GameBehavior[] {
  const list: GameBehavior[] = [];
  for (const item of evt.behaviorSequence ?? []) {
    list.push(...(item.contents ?? []));
  }
  return list;
}

type EventFormProps = {
  evt: GameEvent;
  editable: boolean;
  characters: GameCharacter[];
  gameRules: GameRule[];
  onUpdate?: (fn: (e: GameEvent) => GameEvent) => void;
};

function EventBehaviorContentsEditor({
  ownerId,
  contents,
  allBehaviorsInEvent,
  ruleList,
  editable,
  onUpdate,
}: {
  ownerId: string;
  contents: GameBehavior[];
  allBehaviorsInEvent: GameBehavior[];
  ruleList: Array<{id: string; name: string}>;
  editable: boolean;
  onUpdate?: (contents: GameBehavior[]) => void;
}) {
  const add = () => {
    if (!onUpdate) return;
    const [id] = assignBehaviorIds(ownerId, allBehaviorsInEvent, 1);
    onUpdate([...contents, {id, q: '', a: '', t: 'dialog'}]);
  };
  const remove = (i: number) => {
    onUpdate?.(contents.filter((_, idx) => idx !== i));
  };
  const update = (i: number, fn: (b: GameBehavior) => GameBehavior) => {
    onUpdate?.(contents.map((b, idx) => (idx === i ? fn(b) : b)));
  };

  if (!editable || !onUpdate) {
    return (
      <div style={styles.row}>
        {contents.length === 0 ? (
          <div style={styles.readOnlyValue}>暂无行为</div>
        ) : (
          <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
            {contents.map((b, i) => (
              <li key={b.id} style={{...styles.contentItem, marginBottom: 8}}>
                <div style={{fontSize: 14, color: '#a78bfa'}}>请求：{b.t === 'action' ? `(${b.q})` : b.q}</div>
                <div style={{fontSize: 14, color: '#c4b5fd', marginTop: 4}}>响应：{b.a}</div>
                {b.judgeExpr && (
                  <div style={{fontSize: 12, color: '#888', marginTop: 4}}>条件：{b.judgeExpr}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div style={styles.row}>
      {contents.map((b, i) => (
        <div key={b.id} style={styles.contentItem}>
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6}}>
            <span style={{fontSize: 12, color: '#888'}}>行为 #{i + 1}</span>
            <button type="button" style={styles.btnSmall} onClick={() => remove(i)}>
              删除
            </button>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>请求</label>
            <input
              value={b.q}
              onChange={(e) => update(i, (x) => ({...x, q: e.target.value}))}
              style={styles.input}
              placeholder="主体说的话或动作描述"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>响应</label>
            <input
              value={b.a}
              onChange={(e) => update(i, (x) => ({...x, a: e.target.value}))}
              style={styles.input}
              placeholder="客体回应；无客体时可填旁白或留空"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>类型</label>
            <select
              value={b.t ?? 'dialog'}
              onChange={(e) => update(i, (x) => ({...x, t: e.target.value as 'dialog' | 'action'}))}
              style={styles.input}
            >
              <option value="dialog">对话</option>
              <option value="action">动作</option>
            </select>
          </div>
          {(b.t ?? 'dialog') === 'action' && (
            <div style={styles.row}>
              <label style={styles.label}>动作类型</label>
              <select
                value={b.actionKind ?? ''}
                onChange={(e) =>
                  update(i, (x) => ({
                    ...x,
                    actionKind: (e.target.value || undefined) as import('../schema/game-behavior').ActionKind | undefined,
                  }))
                }
                style={styles.input}
              >
                <option value="">—</option>
                <option value="battle">战斗</option>
              </select>
            </div>
          )}
          <RuleIdsSelector
            ruleList={ruleList}
            value={b.ruleIds ?? []}
            onChange={(ids) => update(i, (x) => ({...x, ruleIds: ids.length ? ids : undefined}))}
            readOnly={false}
            label="规则"
          />
          <div style={styles.row}>
            <label style={styles.label}>条件表达式</label>
            <input
              value={b.judgeExpr ?? ''}
              onChange={(e) => update(i, (x) => ({...x, judgeExpr: e.target.value || undefined}))}
              style={styles.input}
              placeholder="例如 $rep.费穆 >= 5"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>回写表达式</label>
            <input
              value={b.writebackExpr ?? ''}
              onChange={(e) => update(i, (x) => ({...x, writebackExpr: e.target.value || undefined}))}
              style={styles.input}
              placeholder='例如 $rep.费穆 = ($rep.费穆||0)+1'
            />
          </div>
        </div>
      ))}
      <button type="button" style={styles.btn} onClick={add}>
        + 添加内容
      </button>
    </div>
  );
}

function BehaviorSequenceEditor({
  evt,
  characters,
  gameRules,
  editable,
  onUpdate,
}: {
  evt: GameEvent;
  characters: GameCharacter[];
  gameRules: GameRule[];
  editable: boolean;
  onUpdate?: (fn: (e: GameEvent) => GameEvent) => void;
}) {
  const seq = evt.behaviorSequence ?? [];
  const ruleList = gameRules.map((r) => ({id: r.id, name: r.name}));
  const subjectOptions = [...characters.map((c) => ({id: c.id, name: c.name}))];
  const objectOptions = [{id: '', name: '无'}, ...characters.map((c) => ({id: c.id, name: c.name}))];

  const addSeqItem = () => {
    if (!onUpdate) return;
    const next: EventBehaviorSequenceItem = {subject: '', object: '', contents: []};
    onUpdate((e) => ({
      ...e,
      behaviorSequence: [...(e.behaviorSequence ?? []), next],
    }));
  };
  const removeSeqItem = (idx: number) => {
    onUpdate?.((e) => ({
      ...e,
      behaviorSequence: (e.behaviorSequence ?? []).filter((_, i) => i !== idx),
    }));
  };
  const updateSeqItem = (idx: number, fn: (item: EventBehaviorSequenceItem) => EventBehaviorSequenceItem) => {
    onUpdate?.((e) => ({
      ...e,
      behaviorSequence: (e.behaviorSequence ?? []).map((item, i) => (i === idx ? fn(item) : item)),
    }));
  };

  if (!editable || !onUpdate) {
    return (
      <div style={styles.section}>
        <label style={styles.label}>行为序列</label>
        {seq.length === 0 ? (
          <div style={styles.readOnlyValue}>暂无</div>
        ) : (
          seq.map((item, i) => {
            const subName = subjectOptions.find((o) => o.id === item.subject)?.name ?? item.subject;
            const objName = item.object ? (objectOptions.find((o) => o.id === item.object)?.name ?? item.object) : '无';
            return (
              <div key={i} style={{...styles.seqItem, marginBottom: 8}}>
                <p style={{margin: '0 0 6px', fontWeight: 600}}>
                  项 {i + 1}：{subName} → {objName}
                </p>
                <p style={{margin: 0, fontSize: 13, color: '#888'}}>{item.contents.length} 条行为</p>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div style={styles.section}>
      <label style={styles.label}>行为序列</label>
      {seq.map((item, idx) => (
        <div key={idx} style={styles.seqItem}>
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
            <span style={{fontSize: 13, color: '#a78bfa'}}>行为序列项 #{idx + 1}</span>
            <button type="button" style={styles.btnSmall} onClick={() => removeSeqItem(idx)}>
              删除
            </button>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>主体</label>
            <select
              value={item.subject}
              onChange={(e) => updateSeqItem(idx, (x) => ({...x, subject: e.target.value}))}
              style={styles.input}
            >
              {subjectOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>客体</label>
            <select
              value={item.object ?? ''}
              onChange={(e) => updateSeqItem(idx, (x) => ({...x, object: e.target.value}))}
              style={styles.input}
            >
              {objectOptions.map((o) => (
                <option key={o.id || '_none'} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{marginTop: 12}}>
            <label style={{...styles.label, marginBottom: 8}}>内容列表</label>
            <EventBehaviorContentsEditor
              ownerId={evt.id}
              contents={item.contents}
              allBehaviorsInEvent={collectAllBehaviors(evt)}
              ruleList={ruleList}
              editable={editable}
              onUpdate={(contents) => updateSeqItem(idx, (x) => ({...x, contents}))}
            />
          </div>
        </div>
      ))}
      <button type="button" style={styles.btn} onClick={addSeqItem}>
        + 添加行为
      </button>
    </div>
  );
}

function EventFormContent({evt, editable, characters, gameRules, onUpdate}: EventFormProps) {
  if (!editable || !onUpdate) {
    return (
      <div style={{color: '#e8e8e8', fontSize: 14}}>
        <p style={{margin: '0 0 8px'}}><strong>ID：</strong>{evt.id}</p>
        <p style={{margin: '0 0 8px'}}><strong>名称：</strong>{evt.name}</p>
        {evt.openingAnimation && (
          <p style={{margin: '0 0 8px'}}><strong>开场动画：</strong>{evt.openingAnimation}</p>
        )}
        {evt.endingAnimation && (
          <p style={{margin: '0 0 8px'}}><strong>终场动画：</strong>{evt.endingAnimation}</p>
        )}
        {evt.backgroundMusic && (
          <p style={{margin: '0 0 8px'}}><strong>背景音乐：</strong>{evt.backgroundMusic}</p>
        )}
        <BehaviorSequenceEditor
          evt={evt}
          characters={characters}
          gameRules={gameRules}
          editable={false}
        />
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
      <MediaUrlField
        label="开场动画"
        value={evt.openingAnimation}
        onChange={(v) => onUpdate((c) => ({...c, openingAnimation: v}))}
        editable={editable && !!onUpdate}
      />
      <MediaUrlField
        label="终场动画"
        value={evt.endingAnimation}
        onChange={(v) => onUpdate((c) => ({...c, endingAnimation: v}))}
        editable={editable && !!onUpdate}
      />
      <MediaUrlField
        label="背景音乐"
        value={evt.backgroundMusic}
        onChange={(v) => onUpdate((c) => ({...c, backgroundMusic: v}))}
        editable={editable && !!onUpdate}
      />
      <BehaviorSequenceEditor
        evt={evt}
        characters={characters}
        gameRules={gameRules}
        editable={editable}
        onUpdate={onUpdate}
      />
    </div>
  );
}

/** 保存事件到预设路径 assets/games/{gameId}/story-events.json */
async function saveEventsToPreset(events: unknown, gameId: string): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getEventsFetchUrl(gameId), {
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

async function preloadForEvents(updateFw: (fn: (d: StoryFramework) => StoryFramework) => void, gameId: string) {
  const apis: Array<{url: string; key: keyof StoryFramework}> = [
    {url: getEventsFetchUrl(gameId), key: 'events'},
    {url: getCharactersFetchUrl(gameId), key: 'characters'},
    {url: getRulesFetchUrl(gameId), key: 'gameRules'},
  ];
  for (const {url, key} of apis) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const parsed = Array.isArray(data) ? data : null;
        if (parsed) updateFw((d) => ({...d, [key]: parsed}));
      }
    } catch {
      // ignore
    }
  }
}

export function EventEditor({fw, updateFw}: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void
}) {
  const {gameId} = useGameId();
  const {checkAuthForSave} = useAuth();
  useEffect(() => {
    preloadForEvents(updateFw, gameId);
  }, [updateFw, gameId]);

  const events = fw.events ?? [];
  const setEvents = (fn: (e: GameEvent[]) => GameEvent[]) =>
    updateFw((d) => ({...d, events: fn(d.events ?? [])}));

  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState<GameEvent>(() => ({
    id: `evt_${Date.now()}`,
    name: '新事件',
    behaviorSequence: [],
  }));

  const openAddModal = () => {
    setNewEvent({
      id: `evt_${Date.now()}`,
      name: '新事件',
      behaviorSequence: [],
    });
    setAddModalOpen(true);
  };

  const confirmAddEvent = async () => {
    const next = [...events, newEvent];
    setEvents(() => next);
    const result = await saveEventsToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  const updateEvent = (index: number, fn: (e: GameEvent) => GameEvent) =>
    setEvents((e) => e.map((x, i) => (i === index ? fn(x) : x)));

  const removeEvent = async (index: number) => {
    const next = events.filter((_, i) => i !== index);
    setEvents(() => next);
    const result = await saveEventsToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };
  const removeEventWithAuth = (index: number) => checkAuthForSave(() => removeEvent(index));

  const saveEvents = async () => {
    const result = await saveEventsToPreset(events, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setEditIndex(null);
  };

  const characters = fw.characters ?? [];
  const gameRules = fw.gameRules ?? [];

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
                  {evt.id}
                </span>
              </span>
              <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <button type="button" style={styles.btnIcon} onClick={() => setEditIndex(ei)} title="编辑">
                  ✎
                </button>
                <button
                  type="button"
                  style={styles.btnIcon}
                  onClick={() => removeEventWithAuth(ei)}
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
            characters={characters}
            gameRules={gameRules}
          />
        </DetailEditModal>
      )}

      {editIndex !== null && events[editIndex] && (
        <DetailEditModal
          title="编辑事件"
          open={true}
          onClose={() => setEditIndex(null)}
          editable={true}
          onSave={() => checkAuthForSave(saveEvents)}
        >
          <EventFormContent
            evt={events[editIndex]}
            editable={true}
            characters={characters}
            gameRules={gameRules}
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
          onSave={() => checkAuthForSave(confirmAddEvent)}
        >
          <EventFormContent
            evt={newEvent}
            editable={true}
            characters={characters}
            gameRules={gameRules}
            onUpdate={(fn) => setNewEvent(fn(newEvent))}
          />
        </DetailEditModal>
      )}
    </div>
  );
}
