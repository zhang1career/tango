/**
 * 心迹目录 - story-journal.json
 * 主题与列表项在发行前定稿；运行时以 unlockVar === true 控制可见性
 */

export interface JournalTheme {
  id: string;
  name: string;
  order: number;
  description?: string;
}

export interface JournalEntryDef {
  id: string;
  themeId: string;
  title: string;
  content: string;
  tags?: string[];
  /** 解锁变量；省略时默认为 journal.unlocked.{id} */
  unlockVar?: string;
  /** 同主题内排序（升序） */
  order?: number;
}

export interface StoryJournalCatalog {
  themes: JournalTheme[];
  entries: JournalEntryDef[];
}

export const EMPTY_JOURNAL_CATALOG: StoryJournalCatalog = {
  themes: [],
  entries: [],
};

/** 心迹解锁变量名（约定） */
export function journalUnlockVar(entryId: string): string {
  return `journal.unlocked.${entryId}`;
}

export function resolveJournalUnlockVar(entry: Pick<JournalEntryDef, 'id' | 'unlockVar'>): string {
  const custom = entry.unlockVar?.trim();
  return custom || journalUnlockVar(entry.id);
}

export function normalizeJournalCatalog(raw: unknown): StoryJournalCatalog {
  if (!raw || typeof raw !== 'object') return {...EMPTY_JOURNAL_CATALOG};
  const o = raw as { themes?: unknown; entries?: unknown };
  const themes = Array.isArray(o.themes) ? (o.themes as JournalTheme[]) : [];
  const entries = Array.isArray(o.entries) ? (o.entries as JournalEntryDef[]) : [];
  return {themes, entries};
}
