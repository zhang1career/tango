/**
 * 人物编辑界面
 */

import React from 'react';
import type { StoryFramework } from '../schema/story-framework';
import type { GameCharacter } from '../schema/game-character';
import { flattenScenes } from '../schema/story-framework';
import { AttributeValuesCard } from './cards/AttributeValuesCard';
import { InventoryValuesCard } from './cards/InventoryValuesCard';
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

export function CharacterEditor({
  fw,
  updateFw,
}: {
  fw: StoryFramework;
  updateFw: (fn: (d: StoryFramework) => StoryFramework) => void;
}) {
  const characters = fw.characters ?? [];
  const setCharacters = (fn: (c: GameCharacter[]) => GameCharacter[]) =>
    updateFw((d) => ({ ...d, characters: fn(d.characters ?? []) }));

  const attributeDefs = fw.metadata?.characterAttributes ?? [];
  const items = fw.items ?? [];

  const addCharacter = (type: 'player' | 'npc') => {
    const id = type === 'player' ? 'player' : `npc_${Date.now()}`;
    setCharacters((c) => [...c, { id, type, name: type === 'player' ? '玩家' : '新 NPC' }]);
  };

  const updateCharacter = (index: number, fn: (c: GameCharacter) => GameCharacter) =>
    setCharacters((c) => c.map((x, i) => (i === index ? fn(x) : x)));

  const removeCharacter = (index: number) =>
    setCharacters((c) => c.filter((_, i) => i !== index));

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>人物编辑</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" style={styles.btn} onClick={() => addCharacter('player')}>
            + 添加玩家
          </button>
          <button type="button" style={styles.btn} onClick={() => addCharacter('npc')}>
            + 添加 NPC
          </button>
          <button type="button" style={styles.btn} onClick={() => saveToPreset('story-characters.json', fw.characters ?? [])}>
            保存
          </button>
        </div>
      </header>

      <section style={styles.section}>
        {characters.length === 0 && (
          <p style={{ color: '#888', fontSize: 14 }}>暂无人物，点击「添加玩家」或「添加 NPC」创建。</p>
        )}

        {characters.map((char, ci) => (
          <CharacterCard
            key={char.id}
            char={char}
            attributeDefs={attributeDefs}
            items={items}
            onUpdate={(fn) => updateCharacter(ci, fn)}
            onRemove={() => removeCharacter(ci)}
          />
        ))}
      </section>
    </div>
  );
}

function CharacterCard({
  char,
  attributeDefs,
  items,
  onUpdate,
  onRemove,
}: {
  char: GameCharacter;
  attributeDefs: import('../schema/metadata').CharacterAttributeDef[];
  items: import('../schema/game-item').GameItem[];
  onUpdate: (fn: (c: GameCharacter) => GameCharacter) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const isPlayer = char.type === 'player';

  return (
    <div style={styles.card}>
      <div style={styles.cardHead} onClick={() => setExpanded(!expanded)}>
        <span style={{ fontWeight: 600 }}>
          {expanded ? '▼' : '▶'} {char.name}
          <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
            {isPlayer ? '(玩家)' : '(NPC)'}
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
              value={char.id}
              onChange={(e) => onUpdate((c) => ({ ...c, id: e.target.value }))}
              style={styles.input}
              placeholder={isPlayer ? 'player' : 'npc_xxx'}
              readOnly={isPlayer}
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>名称</label>
            <input
              value={char.name}
              onChange={(e) => onUpdate((c) => ({ ...c, name: e.target.value }))}
              style={styles.input}
              placeholder="尔朱荣"
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>描述</label>
            <textarea
              value={char.description ?? ''}
              onChange={(e) => onUpdate((c) => ({ ...c, description: e.target.value || undefined }))}
              style={{ ...styles.input, ...styles.textarea, minHeight: 40 }}
              placeholder="权臣，北魏将领..."
            />
          </div>
          <AttributeValuesCard
            attributeDefs={attributeDefs}
            values={char.attributes}
            onChange={(v) => onUpdate((c) => ({ ...c, attributes: Object.keys(v).length ? v : undefined }))}
            title="属性"
          />
          <InventoryValuesCard
            items={items}
            inventory={char.inventory ?? []}
            onChange={(ids) => onUpdate((c) => ({ ...c, inventory: ids.length ? ids : undefined }))}
            title="物品"
          />
          {!isPlayer && (
            <>
              <div style={styles.row}>
                <label style={styles.label}>规则（每行一条）</label>
                <textarea
                  value={(char.rules ?? []).join('\n')}
                  onChange={(e) =>
                    onUpdate((c) => ({ ...c, rules: e.target.value.split('\n').filter(Boolean) || undefined }))
                  }
                  style={{ ...styles.input, ...styles.textarea, minHeight: 40 }}
                  placeholder="$var.尔朱荣 >= 7 时解锁密谈"
                />
              </div>
              <AttributesEditorCard
                attributeDefs={attributeDefs}
                actions={char.onMeet}
                onChange={(a) => onUpdate((c) => ({ ...c, onMeet: a }))}
                title="onMeet 属性变更"
              />
              <ItemsEditorCard
                items={items}
                give={Array.isArray(char.onMeet?.give) ? char.onMeet.give : char.onMeet?.give ? [char.onMeet.give] : []}
                take={Array.isArray(char.onMeet?.take) ? char.onMeet.take : char.onMeet?.take ? [char.onMeet.take] : []}
                onChange={(give, take) =>
                  onUpdate((c) => ({
                    ...c,
                    onMeet: { ...c.onMeet, give: give.length ? give : undefined, take: take.length ? take : undefined },
                  }))
                }
                title="onMeet 物品变更"
              />
              <div style={styles.row}>
                <label style={styles.label}>出现地点（场景/地图节点 id，逗号分隔）</label>
                <input
                  value={(char.inLocations ?? []).join(', ')}
                  onChange={(e) =>
                    onUpdate((c) => ({
                      ...c,
                      inLocations: e.target.value
                        ? e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
                        : undefined,
                    }))
                  }
                  style={styles.input}
                  placeholder="军营内, 权力祭坛"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
