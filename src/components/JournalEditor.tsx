/**
 * 心迹编辑 - 主题与列表项（story-journal.json）
 */

import React, {useEffect, useState} from 'react';
import {getJournalFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import type {JournalEntryDef, JournalTheme, StoryJournalCatalog} from '@/schema/story-journal';
import {EMPTY_JOURNAL_CATALOG, journalUnlockVar, resolveJournalUnlockVar} from '@/schema/story-journal';
import {formatJsonCompact} from '@/utils/json-format';
import {DetailEditModal} from './ui/DetailEditModal';
import {editorStyles as styles} from '@/styles/editorStyles';

async function saveJournalToPreset(
  catalog: StoryJournalCatalog,
  gameId: string
): Promise<{ok: boolean; error?: string}> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(getJournalFetchUrl(gameId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: formatJsonCompact(catalog),
      });
      const json = (await res.json()) as {ok?: boolean; error?: string};
      if (res.ok && json.ok) return {ok: true};
      return {ok: false, error: json.error || `HTTP ${res.status}`};
    } catch (e) {
      return {ok: false, error: String(e)};
    }
  }
  const blob = new Blob([formatJsonCompact(catalog)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'story-journal.json';
  a.click();
  URL.revokeObjectURL(url);
  return {ok: true};
}

function ThemeForm({
  theme,
  editable,
  onUpdate,
}: {
  theme: JournalTheme;
  editable: boolean;
  onUpdate?: (fn: (t: JournalTheme) => JournalTheme) => void;
}) {
  return (
    <div>
      <div style={styles.row}>
        <label style={styles.label}>ID</label>
        {editable && onUpdate ? (
          <input
            value={theme.id}
            onChange={(e) => onUpdate((t) => ({...t, id: e.target.value}))}
            style={styles.input}
          />
        ) : (
          <div style={styles.readOnlyValue}>{theme.id}</div>
        )}
      </div>
      <div style={styles.row}>
        <label style={styles.label}>名称</label>
        {editable && onUpdate ? (
          <input
            value={theme.name}
            onChange={(e) => onUpdate((t) => ({...t, name: e.target.value}))}
            style={styles.input}
          />
        ) : (
          <div style={styles.readOnlyValue}>{theme.name}</div>
        )}
      </div>
      <div style={styles.row}>
        <label style={styles.label}>排序</label>
        {editable && onUpdate ? (
          <input
            type="number"
            value={theme.order}
            onChange={(e) => onUpdate((t) => ({...t, order: Number(e.target.value)}))}
            style={styles.input}
          />
        ) : (
          <div style={styles.readOnlyValue}>{theme.order}</div>
        )}
      </div>
      <div style={styles.row}>
        <label style={styles.label}>说明</label>
        {editable && onUpdate ? (
          <textarea
            value={theme.description ?? ''}
            onChange={(e) => onUpdate((t) => ({...t, description: e.target.value || undefined}))}
            style={{...styles.input, ...styles.textarea, minHeight: 60}}
          />
        ) : (
          <div style={styles.readOnlyValue}>{theme.description ?? '-'}</div>
        )}
      </div>
    </div>
  );
}

function EntryForm({
  entry,
  themes,
  editable,
  onUpdate,
}: {
  entry: JournalEntryDef;
  themes: JournalTheme[];
  editable: boolean;
  onUpdate?: (fn: (e: JournalEntryDef) => JournalEntryDef) => void;
}) {
  const unlock = resolveJournalUnlockVar(entry);
  return (
    <div>
      <div style={styles.row}>
        <label style={styles.label}>ID</label>
        {editable && onUpdate ? (
          <input
            value={entry.id}
            onChange={(e) => onUpdate((x) => ({...x, id: e.target.value}))}
            style={styles.input}
          />
        ) : (
          <div style={styles.readOnlyValue}>{entry.id}</div>
        )}
      </div>
      <div style={styles.row}>
        <label style={styles.label}>主题</label>
        {editable && onUpdate ? (
          <select
            value={entry.themeId}
            onChange={(e) => onUpdate((x) => ({...x, themeId: e.target.value}))}
            style={styles.input}
          >
            <option value="">选择主题</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        ) : (
          <div style={styles.readOnlyValue}>
            {themes.find((t) => t.id === entry.themeId)?.name ?? entry.themeId}
          </div>
        )}
      </div>
      <div style={styles.row}>
        <label style={styles.label}>标题</label>
        {editable && onUpdate ? (
          <input
            value={entry.title}
            onChange={(e) => onUpdate((x) => ({...x, title: e.target.value}))}
            style={styles.input}
          />
        ) : (
          <div style={styles.readOnlyValue}>{entry.title}</div>
        )}
      </div>
      <div style={styles.row}>
        <label style={styles.label}>正文</label>
        {editable && onUpdate ? (
          <textarea
            value={entry.content}
            onChange={(e) => onUpdate((x) => ({...x, content: e.target.value}))}
            style={{...styles.input, ...styles.textarea, minHeight: 100}}
          />
        ) : (
          <div style={{...styles.readOnlyValue, whiteSpace: 'pre-wrap'}}>{entry.content}</div>
        )}
      </div>
      <div style={styles.row}>
        <label style={styles.label}>解锁变量</label>
        <div style={{...styles.readOnlyValue, fontSize: 12, color: '#888'}}>
          {unlock}
          {editable ? '（自动生成，可在规则中用 journal.unlock 写入 true）' : ''}
        </div>
      </div>
      <div style={styles.row}>
        <label style={styles.label}>主题内排序</label>
        {editable && onUpdate ? (
          <input
            type="number"
            value={entry.order ?? 0}
            onChange={(e) => onUpdate((x) => ({...x, order: Number(e.target.value)}))}
            style={styles.input}
          />
        ) : (
          <div style={styles.readOnlyValue}>{entry.order ?? 0}</div>
        )}
      </div>
    </div>
  );
}

export function JournalEditor() {
  const {gameId} = useGameId();
  const {checkAuthForSave} = useAuth();
  const [catalog, setCatalog] = useState<StoryJournalCatalog>(EMPTY_JOURNAL_CATALOG);
  const [themeDetail, setThemeDetail] = useState<number | null>(null);
  const [themeEdit, setThemeEdit] = useState<number | null>(null);
  const [themeAddOpen, setThemeAddOpen] = useState(false);
  const [newTheme, setNewTheme] = useState<JournalTheme>({
    id: `theme_${Date.now()}`,
    name: '新主题',
    order: 1,
  });
  const [entryDetail, setEntryDetail] = useState<number | null>(null);
  const [entryEdit, setEntryEdit] = useState<number | null>(null);
  const [entryAddOpen, setEntryAddOpen] = useState(false);
  const [newEntry, setNewEntry] = useState<JournalEntryDef>(() => ({
    id: `j_${Date.now()}`,
    themeId: '',
    title: '新心迹',
    content: '',
    order: 0,
  }));

  useEffect(() => {
    fetch(getJournalFetchUrl(gameId))
      .then((res) => (res.ok ? res.json() : EMPTY_JOURNAL_CATALOG))
      .then((data) => setCatalog(data as StoryJournalCatalog))
      .catch(() => setCatalog(EMPTY_JOURNAL_CATALOG));
  }, [gameId]);

  const persist = async (next: StoryJournalCatalog) => {
    setCatalog(next);
    const result = await saveJournalToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    return result.ok;
  };

  const sortedThemes = [...catalog.themes].sort((a, b) => a.order - b.order);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>心迹</h1>
      </header>

      <section style={styles.section}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
          <h2 style={{fontSize: 16, margin: 0, color: '#a78bfa'}}>主题</h2>
          <button type="button" style={styles.btn} onClick={() => setThemeAddOpen(true)}>
            + 添加主题
          </button>
        </div>
        {sortedThemes.length === 0 && (
          <p style={{color: '#888', fontSize: 14}}>暂无主题。可从元信息迁移或手动添加。</p>
        )}
        {sortedThemes.map((theme, ti) => {
          const idx = catalog.themes.indexOf(theme);
          const count = catalog.entries.filter((e) => e.themeId === theme.id).length;
          return (
            <div key={theme.id} style={styles.card}>
              <div style={styles.cardHead}>
                <span
                  style={{fontWeight: 600, flex: 1, cursor: 'pointer'}}
                  onClick={() => setThemeDetail(idx)}
                >
                  {theme.name}
                  <span style={{marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400}}>
                    {theme.id} · {count} 条
                  </span>
                </span>
                <button type="button" style={styles.btnIcon} onClick={() => setThemeEdit(idx)} title="编辑">✎</button>
                <button
                  type="button"
                  style={styles.btnIcon}
                  onClick={() =>
                    checkAuthForSave(async () => {
                      const next = {
                        ...catalog,
                        themes: catalog.themes.filter((_, i) => i !== idx),
                        entries: catalog.entries.filter((e) => e.themeId !== theme.id),
                      };
                      await persist(next);
                    })
                  }
                  title="删除"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section style={styles.section}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
          <h2 style={{fontSize: 16, margin: 0, color: '#a78bfa'}}>心迹列表项</h2>
          <button
            type="button"
            style={styles.btn}
            onClick={() => {
              setNewEntry({
                id: `j_${Date.now()}`,
                themeId: sortedThemes[0]?.id ?? '',
                title: '新心迹',
                content: '',
                order: catalog.entries.length,
              });
              setEntryAddOpen(true);
            }}
          >
            + 添加条目
          </button>
        </div>
        {catalog.entries.length === 0 && (
          <p style={{color: '#888', fontSize: 14}}>暂无条目。解锁触发在「场景」「剧情」等使用处配置。</p>
        )}
        {catalog.entries.map((entry, ei) => (
          <div key={entry.id} style={styles.card}>
            <div style={styles.cardHead}>
              <span
                style={{fontWeight: 600, flex: 1, cursor: 'pointer'}}
                onClick={() => setEntryDetail(ei)}
              >
                {entry.title}
                <span style={{marginLeft: 8, fontSize: 12, color: '#888', fontWeight: 400}}>
                  {entry.id}
                </span>
              </span>
              <button type="button" style={styles.btnIcon} onClick={() => setEntryEdit(ei)} title="编辑">✎</button>
              <button
                type="button"
                style={styles.btnIcon}
                onClick={() =>
                  checkAuthForSave(async () => {
                    await persist({
                      ...catalog,
                      entries: catalog.entries.filter((_, i) => i !== ei),
                    });
                  })
                }
                title="删除"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </section>

      {themeDetail !== null && catalog.themes[themeDetail] && (
        <DetailEditModal title="主题详情" open onClose={() => setThemeDetail(null)} editable={false}>
          <ThemeForm theme={catalog.themes[themeDetail]} editable={false} />
        </DetailEditModal>
      )}
      {themeEdit !== null && catalog.themes[themeEdit] && (
        <DetailEditModal
          title="编辑主题"
          open
          onClose={() => setThemeEdit(null)}
          editable
          onSave={() =>
            checkAuthForSave(async () => {
              if (await persist(catalog)) setThemeEdit(null);
            })
          }
        >
          <ThemeForm
            theme={catalog.themes[themeEdit]}
            editable
            onUpdate={(fn) =>
              setCatalog((c) => ({
                ...c,
                themes: c.themes.map((t, i) => (i === themeEdit ? fn(t) : t)),
              }))
            }
          />
        </DetailEditModal>
      )}
      {themeAddOpen && (
        <DetailEditModal
          title="添加主题"
          open
          onClose={() => setThemeAddOpen(false)}
          editable
          onSave={() =>
            checkAuthForSave(async () => {
              const ok = await persist({...catalog, themes: [...catalog.themes, newTheme]});
              if (ok) setThemeAddOpen(false);
            })
          }
        >
          <ThemeForm theme={newTheme} editable onUpdate={(fn) => setNewTheme(fn(newTheme))} />
        </DetailEditModal>
      )}

      {entryDetail !== null && catalog.entries[entryDetail] && (
        <DetailEditModal title="心迹详情" open onClose={() => setEntryDetail(null)} editable={false}>
          <EntryForm entry={catalog.entries[entryDetail]} themes={catalog.themes} editable={false} />
        </DetailEditModal>
      )}
      {entryEdit !== null && catalog.entries[entryEdit] && (
        <DetailEditModal
          title="编辑心迹"
          open
          onClose={() => setEntryEdit(null)}
          editable
          onSave={() =>
            checkAuthForSave(async () => {
              if (await persist(catalog)) setEntryEdit(null);
            })
          }
        >
          <EntryForm
            entry={catalog.entries[entryEdit]}
            themes={catalog.themes}
            editable
            onUpdate={(fn) =>
              setCatalog((c) => ({
                ...c,
                entries: c.entries.map((e, i) => (i === entryEdit ? fn(e) : e)),
              }))
            }
          />
        </DetailEditModal>
      )}
      {entryAddOpen && (
        <DetailEditModal
          title="添加心迹"
          open
          onClose={() => setEntryAddOpen(false)}
          editable
          onSave={() =>
            checkAuthForSave(async () => {
              const ok = await persist({...catalog, entries: [...catalog.entries, newEntry]});
              if (ok) setEntryAddOpen(false);
            })
          }
        >
          <EntryForm
            entry={newEntry}
            themes={catalog.themes}
            editable
            onUpdate={(fn) => setNewEntry(fn(newEntry))}
          />
          <p style={{fontSize: 12, color: '#888', marginTop: 8}}>
            解锁变量：{journalUnlockVar(newEntry.id)}
          </p>
        </DetailEditModal>
      )}
    </div>
  );
}
