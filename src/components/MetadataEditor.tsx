/**
 * 元信息编辑界面 - 人物属性定义
 */

import React, {useState} from 'react';
import {getMetadataFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useStoryMetadata} from '../hooks/useStoryMetadata';
import type {StoryFramework} from '../schema/story-framework';
import type {AttributeType, CharacterAttributeDef, GameMetadata} from '../schema/metadata';
import {getAttrKey} from '../schema/metadata';
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
  btnIcon: {
    padding: '2px 8px',
    background: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 16
  },
};

/** 保存元信息到预设路径 assets/games/{gameId}/story-metadata.json */
async function saveMetadataToPreset(metadata: unknown, gameId: string): Promise<{ ok: boolean; error?: string }> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getMetadataFetchUrl(gameId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(metadata),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(metadata)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-metadata.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
}

function AttrFormContent({
                           attr,
                           editable,
                           onUpdate,
                         }: {
  attr: CharacterAttributeDef;
  editable: boolean;
  onUpdate?: (fn: (a: CharacterAttributeDef) => CharacterAttributeDef) => void;
}) {
  if (!editable || !onUpdate) {
    return (
      <div style={{color: '#e8e8e8', fontSize: 14}}>
        <p style={{margin: '0 0 8px'}}><strong>一级 id：</strong>{attr.id}</p>
        {attr.subId != null && attr.subId !== '' && (
          <p style={{margin: '0 0 8px'}}><strong>二级 subId：</strong>{attr.subId}</p>
        )}
        <p style={{margin: '0 0 8px'}}><strong>变量名称：</strong>{attr.name}</p>
        <p style={{margin: '0 0 8px'}}><strong>变量类型：</strong>{attr.type}</p>
        {attr.type === 'number' && attr.valueRange && (
          <p style={{margin: '0 0 8px'}}><strong>取值范围：</strong>{attr.valueRange}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={styles.row}>
        <label style={styles.label}>一级 id（如 reputation、experience）</label>
        <input
          value={attr.id}
          onChange={(e) => onUpdate((x) => ({...x, id: e.target.value}))}
          style={styles.input}
          placeholder="reputation"
        />
      </div>
      <div style={styles.row}>
        <label style={styles.label}>二级 subId（可选，如 erzhurong）</label>
        <input
          value={attr.subId ?? ''}
          onChange={(e) => onUpdate((x) => ({...x, subId: e.target.value || undefined}))}
          style={styles.input}
          placeholder="留空表示扁平属性"
        />
      </div>
      <div style={styles.row}>
        <label style={styles.label}>变量名称（显示用）</label>
        <input
          value={attr.name}
          onChange={(e) => onUpdate((x) => ({...x, name: e.target.value}))}
          style={styles.input}
          placeholder="声誉-尔朱荣"
        />
      </div>
      <div style={styles.row}>
        <label style={styles.label}>变量类型</label>
        <select
          value={attr.type}
          onChange={(e) => onUpdate((x) => ({...x, type: e.target.value as AttributeType}))}
          style={styles.input}
        >
          <option value="number">number</option>
          <option value="string">string</option>
          <option value="boolean">boolean</option>
        </select>
      </div>
      {attr.type === 'number' && (
        <div style={styles.row}>
          <label style={styles.label}>取值范围（min,max）</label>
          <input
            value={attr.valueRange ?? ''}
            onChange={(e) => onUpdate((x) => ({...x, valueRange: e.target.value || undefined}))}
            style={styles.input}
            placeholder="0,100"
          />
        </div>
      )}
    </div>
  );
}

export function MetadataEditor({
                                 fw,
                                 updateFw,
                               }: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const {gameId} = useGameId();
  useStoryMetadata(updateFw);

  const metadata = fw.metadata ?? {characterAttributes: []};
  const attrs = metadata.characterAttributes;
  const setMetadata = (fn: (m: GameMetadata) => GameMetadata) =>
    updateFw((d) => ({...d, metadata: fn(d.metadata ?? {characterAttributes: []})}));

  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newAttr, setNewAttr] = useState<CharacterAttributeDef>(() => ({
    id: `attr_${Date.now()}`,
    name: '新属性',
    type: 'number',
  }));

  const updateAttr = (i: number, fn: (a: CharacterAttributeDef) => CharacterAttributeDef) =>
    setMetadata((m) => ({
      ...m,
      characterAttributes: m.characterAttributes.map((a, j) => (j === i ? fn(a) : a)),
    }));

  const removeAttr = async (i: number) => {
    const nextAttrs = attrs.filter((_, j) => j !== i);
    const nextMeta: GameMetadata = {...metadata, characterAttributes: nextAttrs};
    setMetadata(() => nextMeta);
    const result = await saveMetadataToPreset(nextMeta, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
  };

  const saveMetadata = async () => {
    const result = await saveMetadataToPreset(fw.metadata ?? {characterAttributes: []}, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setEditIndex(null);
  };

  const openAddModal = () => {
    setNewAttr({id: `attr_${Date.now()}`, name: '新属性', type: 'number'});
    setAddModalOpen(true);
  };

  const confirmAdd = async () => {
    const nextAttrs = [...attrs, newAttr];
    const nextMeta: GameMetadata = {...metadata, characterAttributes: nextAttrs};
    setMetadata(() => nextMeta);
    const result = await saveMetadataToPreset(nextMeta, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    else setAddModalOpen(false);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>元信息</h1>
      </header>

      <section>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
          <h2 style={{fontSize: 16, margin: 0}}>人物属性</h2>
          <button type="button" style={styles.btn} onClick={openAddModal}>
            + 添加人物属性
          </button>
        </div>
        {attrs.length === 0 && (
          <p style={{color: '#888'}}>暂无属性，点击「添加人物属性」创建。属性供编辑时间线、编辑人物等页面的属性操作使用。</p>
        )}

        {attrs.map((a, i) => (
          <div key={`attr-${i}`} style={styles.card}>
            <div style={styles.cardHead}>
              <span
                style={{fontWeight: 600, flex: 1, cursor: 'pointer'}}
                onClick={() => setDetailIndex(i)}
              >
                {a.name}
                <span style={{marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400}}>
                  · {a.type}{a.type === 'number' && a.valueRange ? ` (${a.valueRange})` : ''}
                  {a.subId ? ` · ${getAttrKey(a)}` : ''}
                </span>
              </span>
              <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <button type="button" style={styles.btnIcon} onClick={() => setEditIndex(i)} title="编辑">
                  ✎
                </button>
                <button type="button" style={styles.btnIcon} onClick={() => removeAttr(i)} title="删除">
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {detailIndex !== null && attrs[detailIndex] && (
        <DetailEditModal
          title="属性详情"
          open={true}
          onClose={() => setDetailIndex(null)}
          editable={false}
        >
          <AttrFormContent attr={attrs[detailIndex]} editable={false}/>
        </DetailEditModal>
      )}

      {editIndex !== null && attrs[editIndex] && (
        <DetailEditModal
          title="编辑属性"
          open={true}
          onClose={() => setEditIndex(null)}
          editable={true}
          onSave={saveMetadata}
        >
          <AttrFormContent
            attr={attrs[editIndex]}
            editable={true}
            onUpdate={(fn) => updateAttr(editIndex, fn)}
          />
        </DetailEditModal>
      )}

      {addModalOpen && (
        <DetailEditModal
          title="添加人物属性"
          open={true}
          onClose={() => setAddModalOpen(false)}
          editable={true}
          onSave={confirmAdd}
        >
          <AttrFormContent
            attr={newAttr}
            editable={true}
            onUpdate={(fn) => setNewAttr(fn(newAttr))}
          />
        </DetailEditModal>
      )}
    </div>
  );
}
