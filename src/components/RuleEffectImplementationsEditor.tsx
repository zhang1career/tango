/**
 * 规则执行实现选择器：展示抽象执行面的全部实现类型（固定列表），在使用处勾选并配置参数。
 */

import React from 'react';
import type {RuleEffect, RuleEffectType} from '@/schema/rule-effect';
import {RULE_EFFECT_TYPES, asEffectArray} from '@/schema/rule-effect';
import type {StoryJournalCatalog} from '@/schema/story-journal';
import {editorStyles as styles} from '@/styles/editorStyles';

function defaultEffect(type: RuleEffectType): RuleEffect {
  switch (type) {
    case 'set':
      return {type: 'set', key: '', value: true};
    case 'give':
      return {type: 'give', itemId: ''};
    case 'take':
      return {type: 'take', itemId: ''};
    case 'rep':
      return {type: 'rep', entity: '', delta: 0};
    case 'journal.unlock':
      return {type: 'journal.unlock', journalId: ''};
    case 'entity.mark_used':
      return {type: 'entity.mark_used'};
    default:
      return {type: 'set', key: '', value: true};
  }
}

function groupByType(effects: RuleEffect[]): Partial<Record<RuleEffectType, RuleEffect[]>> {
  const map: Partial<Record<RuleEffectType, RuleEffect[]>> = {};
  for (const e of effects) {
    (map[e.type] ??= []).push(e);
  }
  return map;
}

function flattenGrouped(map: Partial<Record<RuleEffectType, RuleEffect[]>>): RuleEffect[] {
  const out: RuleEffect[] = [];
  for (const t of RULE_EFFECT_TYPES) {
    for (const e of map[t.type] ?? []) out.push(e);
  }
  return out;
}

export function RuleEffectImplementationsEditor({
  effects,
  editable,
  journalCatalog,
  allowedTypes,
  onChange,
}: {
  effects: RuleEffect | RuleEffect[] | undefined;
  editable: boolean;
  journalCatalog?: StoryJournalCatalog;
  /** 限制可选实现；默认全部 RULE_EFFECT_TYPES */
  allowedTypes?: RuleEffectType[];
  onChange?: (effects: RuleEffect[]) => void;
}) {
  const list = asEffectArray(effects);
  const grouped = groupByType(list);
  const types = RULE_EFFECT_TYPES.filter((t) =>
    (allowedTypes ?? RULE_EFFECT_TYPES.map((x) => x.type)).includes(t.type)
  );

  const setGrouped = (next: Partial<Record<RuleEffectType, RuleEffect[]>>) => {
    onChange?.(flattenGrouped(next));
  };

  const toggle = (type: RuleEffectType, on: boolean) => {
    const next = {...grouped};
    if (on) {
      if (next[type]?.length) {
        // keep existing values
      } else if (type === 'journal.unlock') {
        const all = journalCatalog?.entries ?? [];
        next[type] = [{type: 'journal.unlock', journalId: all[0]?.id ?? ''}];
      } else {
        next[type] = [defaultEffect(type)];
      }
    }
    else delete next[type];
    setGrouped(next);
  };

  return (
    <div>
      <label style={styles.label}>执行实现（勾选启用的类型）</label>
      {types.map(({type, label}) => {
        const enabled = (grouped[type]?.length ?? 0) > 0;
        const rows = grouped[type] ?? [];
        return (
          <div
            key={type}
            style={{
              marginBottom: 10,
              padding: 10,
              border: '1px solid #333',
              borderRadius: 6,
              opacity: enabled ? 1 : 0.55,
            }}
          >
            <label style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: enabled ? 8 : 0, cursor: editable ? 'pointer' : 'default'}}>
              <input
                type="checkbox"
                checked={enabled}
                disabled={!editable || !onChange}
                onChange={(e) => toggle(type, e.target.checked)}
              />
              <span style={{fontSize: 13, fontWeight: 600}}>{label}</span>
              <span style={{fontSize: 11, color: '#666'}}>{type}</span>
            </label>
            {!enabled ? null : !editable ? (
              <div style={{fontSize: 12, color: '#aaa', paddingLeft: 24}}>
                {rows.map((e, i) => (
                  <div key={i}>
                    {e.type === 'set' && `${e.key} = ${String(e.value)}`}
                    {e.type === 'journal.unlock' && e.journalId}
                    {e.type === 'give' || e.type === 'take' ? e.itemId : null}
                    {e.type === 'rep' && `${e.entity} ${e.delta >= 0 ? '+' : ''}${e.delta}`}
                    {e.type === 'entity.mark_used' && '标记已用'}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{paddingLeft: 24}}>
                {type === 'journal.unlock' && (
                  <JournalUnlockConfig
                    rows={rows.filter((e): e is Extract<RuleEffect, {type: 'journal.unlock'}> => e.type === 'journal.unlock')}
                    journalCatalog={journalCatalog}
                    onChange={(journalRows) => setGrouped({...grouped, 'journal.unlock': journalRows})}
                  />
                )}
                {type === 'set' && rows[0]?.type === 'set' && (() => {
                  const eff = rows[0];
                  return (
                  <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                    <input
                      value={eff.key}
                      onChange={(e) => setGrouped({...grouped, set: [{...eff, key: e.target.value}]})}
                      style={{...styles.input, flex: 1, minWidth: 120}}
                      placeholder="变量名"
                    />
                    <input
                      value={String(eff.value)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        let value: string | number | boolean = raw;
                        if (raw === 'true') value = true;
                        else if (raw === 'false') value = false;
                        else if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);
                        setGrouped({...grouped, set: [{...eff, value}]});
                      }}
                      style={{...styles.input, width: 100}}
                      placeholder="值"
                    />
                  </div>
                  );
                })()}
                {type === 'give' && rows[0]?.type === 'give' && (
                  <input
                    value={rows[0].itemId}
                    onChange={(e) => setGrouped({...grouped, give: [{type: 'give', itemId: e.target.value}]})}
                    style={{...styles.input, width: '100%'}}
                    placeholder="物品 id"
                  />
                )}
                {type === 'take' && rows[0]?.type === 'take' && (
                  <input
                    value={rows[0].itemId}
                    onChange={(e) => setGrouped({...grouped, take: [{type: 'take', itemId: e.target.value}]})}
                    style={{...styles.input, width: '100%'}}
                    placeholder="物品 id"
                  />
                )}
                {type === 'rep' && rows[0]?.type === 'rep' && (() => {
                  const eff = rows[0];
                  return (
                  <div style={{display: 'flex', gap: 8}}>
                    <input
                      value={eff.entity}
                      onChange={(e) => setGrouped({...grouped, rep: [{...eff, entity: e.target.value}]})}
                      style={{...styles.input, flex: 1}}
                      placeholder="声誉实体"
                    />
                    <input
                      type="number"
                      value={eff.delta}
                      onChange={(e) => setGrouped({...grouped, rep: [{...eff, delta: Number(e.target.value)}]})}
                      style={{...styles.input, width: 80}}
                    />
                  </div>
                  );
                })()}
                {type === 'entity.mark_used' && (
                  <span style={{fontSize: 12, color: '#888'}}>将当前实体标记为已使用</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function JournalUnlockConfig({
  rows,
  journalCatalog,
  onChange,
}: {
  rows: Extract<RuleEffect, {type: 'journal.unlock'}>[];
  journalCatalog?: StoryJournalCatalog;
  onChange: (rows: Extract<RuleEffect, {type: 'journal.unlock'}>[]) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [onlySelected, setOnlySelected] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const ids = rows.map((r) => r.journalId).filter(Boolean);
  const all = journalCatalog?.entries ?? [];
  const themes = journalCatalog?.themes ?? [];
  const themeMap = new Map(themes.map((t) => [t.id, t]));
  const q = query.trim().toLowerCase();

  const filtered = all.filter((j) => {
    if (onlySelected && !ids.includes(j.id)) return false;
    if (!q) return true;
    const themeName = themeMap.get(j.themeId)?.name ?? j.themeId;
    return (
      j.title.toLowerCase().includes(q) ||
      j.id.toLowerCase().includes(q) ||
      themeName.toLowerCase().includes(q)
    );
  });

  const grouped = new Map<string, typeof filtered>();
  for (const j of filtered) {
    const list = grouped.get(j.themeId) ?? [];
    list.push(j);
    grouped.set(j.themeId, list);
  }
  const orderedGroupIds = [...grouped.keys()].sort((a, b) => {
    const ao = themeMap.get(a)?.order ?? Number.MAX_SAFE_INTEGER;
    const bo = themeMap.get(b)?.order ?? Number.MAX_SAFE_INTEGER;
    return ao - bo || a.localeCompare(b);
  });

  if (all.length > 0) {
    return (
      <div style={{display: 'grid', gap: 8}}>
        <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{...styles.input, flex: 1, minWidth: 180}}
            placeholder="搜索心迹（标题 / id / 主题）"
          />
          <label style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#bbb'}}>
            <input
              type="checkbox"
              checked={onlySelected}
              onChange={(e) => setOnlySelected(e.target.checked)}
            />
            仅看已选
          </label>
          <span style={{fontSize: 12, color: '#888'}}>已选 {ids.length}</span>
        </div>

        <div style={{maxHeight: 260, overflowY: 'auto', border: '1px solid #333', borderRadius: 6, padding: 8}}>
          {orderedGroupIds.length === 0 && (
            <div style={{fontSize: 12, color: '#888'}}>无匹配项</div>
          )}
          {orderedGroupIds.map((themeId) => {
            const group = grouped.get(themeId) ?? [];
            const selectedCount = group.filter((j) => ids.includes(j.id)).length;
            const themeName = themeMap.get(themeId)?.name ?? themeId;
            const isCollapsed = query ? false : (collapsed[themeId] ?? selectedCount === 0);
            return (
              <div key={themeId} style={{marginBottom: 8}}>
                <button
                  type="button"
                  style={{...styles.btnSmall, width: '100%', textAlign: 'left'}}
                  onClick={() => setCollapsed((s) => ({...s, [themeId]: !isCollapsed}))}
                >
                  {isCollapsed ? '▶' : '▼'} {themeName}（{selectedCount}/{group.length}）
                </button>
                {!isCollapsed && (
                  <div style={{display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 8px'}}>
                    {group
                      .slice()
                      .sort((a, b) => Number(ids.includes(b.id)) - Number(ids.includes(a.id)) || (a.order ?? 9999) - (b.order ?? 9999))
                      .map((j) => {
                        const checked = ids.includes(j.id);
                        return (
                          <label key={j.id} style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 13}}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const nextIds = e.target.checked
                                  ? [...ids, j.id]
                                  : ids.filter((id) => id !== j.id);
                                onChange(nextIds.map((journalId) => ({type: 'journal.unlock', journalId})));
                              }}
                            />
                            {j.title} <span style={{color: '#666', fontSize: 11}}>({j.id})</span>
                          </label>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <input
      value={ids[0] ?? ''}
      onChange={(e) => onChange(e.target.value ? [{type: 'journal.unlock', journalId: e.target.value}] : [])}
      style={{...styles.input, width: '100%'}}
      placeholder="心迹条目 id"
    />
  );
}

/** 场景进入：常用实现子集 */
export const SCENE_ENTER_EFFECT_TYPES: RuleEffectType[] = ['journal.unlock', 'set'];
