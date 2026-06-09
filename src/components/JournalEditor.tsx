/**
 * 心迹编辑 - 主题与列表项（story-journal.json）
 */

import React, {useEffect, useState} from 'react';
import {getJournalFetchUrl} from '@/config';
import {useGameId} from '@/context/GameIdContext';
import {useAuth} from '@/context/AuthContext';
import type {JournalEntryDef, JournalTheme, StoryJournalCatalog} from '@/schema/story-journal';
import {
  EMPTY_JOURNAL_CATALOG,
  journalUnlockVar,
  normalizeJournalCatalog,
  resolveJournalUnlockVar,
} from '@/schema/story-journal';
import {formatJsonCompact} from '@/utils/json-format';
import {DetailEditModal} from './ui/DetailEditModal';
import {editorStyles as styles} from '@/styles/editorStyles';
import {listBtnIcon, listGrids, listStyles} from '@/styles/listStyles';
import {EntityFlatList} from './ui/EntityFlatList';
import {
  ListDeleteButton,
  ListOpsCell,
  ListSectionHead,
  ListTableHeader,
  ListTableRow,
} from './ui/ListPrimitives';

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

function entriesForTheme(entries: JournalEntryDef[], themeId: string): JournalEntryDef[] {
  return entries
    .filter((e) => e.themeId === themeId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function nextThemeEntryOrder(entries: JournalEntryDef[], themeId: string): number {
  const linked = entriesForTheme(entries, themeId);
  if (linked.length === 0) return 0;
  return Math.max(...linked.map((e) => e.order ?? 0)) + 1;
}

function moveEntryInTheme(
  entries: JournalEntryDef[],
  themeId: string,
  entryId: string,
  direction: -1 | 1
): JournalEntryDef[] {
  const linked = entriesForTheme(entries, themeId);
  const pos = linked.findIndex((e) => e.id === entryId);
  const newPos = pos + direction;
  if (pos < 0 || newPos < 0 || newPos >= linked.length) return entries;
  const reordered = [...linked];
  [reordered[pos], reordered[newPos]] = [reordered[newPos], reordered[pos]];
  const orderById = new Map(reordered.map((e, i) => [e.id, i]));
  return entries.map((e) =>
    e.themeId === themeId && orderById.has(e.id) ? {...e, order: orderById.get(e.id)!} : e
  );
}

function ThemeAssociationPanel({
  theme,
  draftEntries,
  onDraftChange,
}: {
  theme: JournalTheme;
  draftEntries: JournalEntryDef[];
  onDraftChange: (entries: JournalEntryDef[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickId, setPickId] = useState('');

  const linked = entriesForTheme(draftEntries, theme.id);
  const available = draftEntries.filter((e) => e.themeId !== theme.id);

  const openPicker = () => {
    setPickId(available[0]?.id ?? '');
    setPickerOpen(true);
  };

  const confirmAssociate = () => {
    if (!pickId) return;
    const order = nextThemeEntryOrder(draftEntries, theme.id);
    onDraftChange(
      draftEntries.map((e) => (e.id === pickId ? {...e, themeId: theme.id, order} : e))
    );
    setPickerOpen(false);
    setPickId('');
  };

  return (
    <div
      style={{
        marginBottom: 20,
        padding: 16,
        backgroundColor: '#252540',
        borderRadius: 8,
        border: '1px solid #444',
      }}
    >
      <ListSectionHead
        title={<h3 style={{fontSize: 16, margin: 0, color: '#a78bfa', fontWeight: 600}}>心迹列表项</h3>}
        addTitle={available.length === 0 ? '请先在下方「心迹列表项」中创建条目' : '添加'}
        addDisabled={available.length === 0}
        onAdd={openPicker}
      />
      {linked.length === 0 && !pickerOpen && (
        <p style={{color: '#888', fontSize: 14, margin: '0 0 12px'}}>暂无条目</p>
      )}
      {pickerOpen && available.length > 0 && (
        <div style={{...styles.card, marginBottom: 12}}>
          <div style={{padding: 12}}>
            <label style={styles.label}>选择心迹列表项</label>
            <select
              value={pickId}
              onChange={(e) => setPickId(e.target.value)}
              style={styles.input}
            >
              {available.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} ({e.id})
                  {e.themeId ? ` · 当前主题: ${e.themeId}` : ''}
                </option>
              ))}
            </select>
            <div style={{display: 'flex', gap: 8, marginTop: 10}}>
              <button type="button" style={styles.btn} onClick={confirmAssociate}>
                确认关联
              </button>
              <button
                type="button"
                style={styles.btn}
                onClick={() => {
                  setPickerOpen(false);
                  setPickId('');
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {linked.length > 0 && (
        <div>
          <ListTableHeader grid={listGrids.nameOps}>
            <span>名称</span>
            <span style={listStyles.cellOps}>操作</span>
          </ListTableHeader>
          {linked.map((entry, li) => (
            <ListTableRow key={entry.id} grid={listGrids.nameOps}>
              <span>
                <span style={{fontWeight: 600}}>{entry.title}</span>
                <span style={{marginLeft: 8, fontSize: 12, color: '#888'}}>
                  {entry.id} · 排序 {entry.order ?? 0}
                </span>
              </span>
              <ListOpsCell>
                <button
                  type="button"
                  style={listBtnIcon}
                  onClick={() => onDraftChange(moveEntryInTheme(draftEntries, theme.id, entry.id, -1))}
                  disabled={li === 0}
                  title="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  style={listBtnIcon}
                  onClick={() => onDraftChange(moveEntryInTheme(draftEntries, theme.id, entry.id, 1))}
                  disabled={li === linked.length - 1}
                  title="下移"
                >
                  ↓
                </button>
                <ListDeleteButton
                  title="移除关联"
                  onClick={() =>
                    onDraftChange(
                      draftEntries.map((e) => (e.id === entry.id ? {...e, themeId: ''} : e))
                    )
                  }
                />
              </ListOpsCell>
            </ListTableRow>
          ))}
        </div>
      )}
      <p style={{fontSize: 12, color: '#888', marginTop: 8, marginBottom: 0}}>
        管理本主题下的条目关联与排序；正文等内容请在页面底部「心迹列表项」区编辑。点击「保存」后写入 story-journal.json。
      </p>
    </div>
  );
}

type ThemeDetailSession = {
  themeIdx: number;
  draftEntries: JournalEntryDef[];
};

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
  const [themeDetailSession, setThemeDetailSession] = useState<ThemeDetailSession | null>(null);
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
      .then((data) => setCatalog(normalizeJournalCatalog(data)))
      .catch(() => setCatalog(EMPTY_JOURNAL_CATALOG));
  }, [gameId]);

  const persist = async (next: StoryJournalCatalog) => {
    setCatalog(next);
    const result = await saveJournalToPreset(next, gameId);
    if (!result.ok) alert(`保存失败: ${result.error}`);
    return result.ok;
  };

  const sortedThemes = [...catalog.themes].sort((a, b) => a.order - b.order);
  const entries = catalog.entries ?? [];

  const openThemeDetail = (idx: number) => {
    setThemeDetailSession({
      themeIdx: idx,
      draftEntries: entries.map((e) => ({...e})),
    });
  };

  const closeThemeDetail = () => setThemeDetailSession(null);

  const themeDetailTheme =
    themeDetailSession !== null ? catalog.themes[themeDetailSession.themeIdx] : undefined;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>心迹</h1>
      </header>

      <section style={styles.section}>
        <ListSectionHead
          title={<h2 style={{fontSize: 16, margin: 0, color: '#a78bfa'}}>主题</h2>}
          addTitle="添加主题"
          onAdd={() => setThemeAddOpen(true)}
        />
        <EntityFlatList
          count={sortedThemes.length}
          emptyHint="暂无主题。可从元信息迁移或手动添加。"
          getKey={(ti) => sortedThemes[ti]!.id}
          getPrimary={(ti) => sortedThemes[ti]!.name}
          getMeta={(ti) => {
            const theme = sortedThemes[ti]!;
            const count = entries.filter((e) => e.themeId === theme.id).length;
            return `${theme.id} · ${count} 条`;
          }}
          onOpen={(ti) => openThemeDetail(catalog.themes.indexOf(sortedThemes[ti]!))}
          onEdit={(ti) => setThemeEdit(catalog.themes.indexOf(sortedThemes[ti]!))}
          onDelete={(ti) => {
            const theme = sortedThemes[ti]!;
            const idx = catalog.themes.indexOf(theme);
            checkAuthForSave(async () => {
              const next = {
                ...catalog,
                themes: catalog.themes.filter((_, i) => i !== idx),
                entries: entries.map((e) => (e.themeId === theme.id ? {...e, themeId: ''} : e)),
              };
              await persist(next);
            });
          }}
        />
      </section>

      <section style={styles.section}>
        <ListSectionHead
          title={<h2 style={{fontSize: 16, margin: 0, color: '#a78bfa'}}>心迹列表项</h2>}
          addTitle="添加条目"
          onAdd={() => {
            setNewEntry({
              id: `j_${Date.now()}`,
              themeId: sortedThemes[0]?.id ?? '',
              title: '新心迹',
              content: '',
              order: entries.length,
            });
            setEntryAddOpen(true);
          }}
        />
        <EntityFlatList
          count={entries.length}
          emptyHint="暂无条目。解锁触发在「场景」「剧情」等使用处配置。"
          getKey={(ei) => entries[ei]!.id}
          getPrimary={(ei) => entries[ei]!.title}
          getMeta={(ei) => entries[ei]!.id}
          onOpen={setEntryDetail}
          onEdit={setEntryEdit}
          onDelete={(ei) =>
            checkAuthForSave(async () => {
              await persist({
                ...catalog,
                entries: entries.filter((_, i) => i !== ei),
              });
            })
          }
        />
      </section>

      {themeDetailSession !== null && themeDetailTheme && (
        <DetailEditModal
          title={`主题详情 · ${themeDetailTheme.name}`}
          open={true}
          onClose={closeThemeDetail}
          editable={true}
          onSave={() =>
            checkAuthForSave(async () => {
              const ok = await persist({
                ...catalog,
                entries: themeDetailSession.draftEntries,
              });
              if (ok) closeThemeDetail();
            })
          }
        >
          <ThemeAssociationPanel
            theme={themeDetailTheme}
            draftEntries={themeDetailSession.draftEntries}
            onDraftChange={(draftEntries) =>
              setThemeDetailSession((s) => (s ? {...s, draftEntries} : null))
            }
          />
          <div style={{marginTop: 8, paddingTop: 16, borderTop: '1px solid #333'}}>
            <h3 style={{fontSize: 15, margin: '0 0 12px', color: '#a78bfa'}}>主题信息</h3>
            <ThemeForm theme={themeDetailTheme} editable={false} />
          </div>
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

      {entryDetail !== null && entries[entryDetail] && (
        <DetailEditModal title="心迹详情" open onClose={() => setEntryDetail(null)} editable={false}>
          <EntryForm entry={entries[entryDetail]} themes={catalog.themes} editable={false} />
        </DetailEditModal>
      )}
      {entryEdit !== null && entries[entryEdit] && (
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
            entry={entries[entryEdit]}
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
              const ok = await persist({...catalog, entries: [...entries, newEntry]});
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
