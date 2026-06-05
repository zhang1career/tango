import type {JournalEntryDef, JournalTheme, StoryJournalCatalog} from '@/schema/story-journal';
import {resolveJournalUnlockVar} from '@/schema/story-journal';

export interface VisibleJournalEntry {
  id: string;
  themeId: string;
  title: string;
  content: string;
  tags?: string[];
}

export interface JournalThemeGroup {
  theme: JournalTheme;
  entries: VisibleJournalEntry[];
}

function isUnlocked(
  variables: Record<string, string | number | boolean>,
  unlockVar: string
): boolean {
  return variables[unlockVar] === true;
}

/** 已解锁条目（扁平） */
export function getUnlockedJournalEntries(
  catalog: StoryJournalCatalog,
  variables: Record<string, string | number | boolean>
): VisibleJournalEntry[] {
  return catalog.entries
    .filter((e) => isUnlocked(variables, resolveJournalUnlockVar(e)))
    .map((e) => ({
      id: e.id,
      themeId: e.themeId,
      title: e.title,
      content: e.content,
      tags: e.tags,
    }));
}

/** 按主题分组；无已解锁条目的主题不显示 */
export function groupJournalByTheme(
  catalog: StoryJournalCatalog,
  variables: Record<string, string | number | boolean>
): JournalThemeGroup[] {
  const unlocked = getUnlockedJournalEntries(catalog, variables);
  if (unlocked.length === 0) return [];

  const themeMap = new Map(catalog.themes.map((t) => [t.id, t]));
  const byTheme = new Map<string, VisibleJournalEntry[]>();
  const entryOrder = new Map(catalog.entries.map((e, i) => [e.id, e.order ?? i]));

  for (const entry of unlocked) {
    const list = byTheme.get(entry.themeId) ?? [];
    list.push(entry);
    byTheme.set(entry.themeId, list);
  }

  const themes = [...byTheme.keys()]
    .map((id) => themeMap.get(id))
    .filter((t): t is JournalTheme => !!t)
    .sort((a, b) => a.order - b.order);

  return themes.map((theme) => ({
    theme,
    entries: (byTheme.get(theme.id) ?? []).sort(
      (a, b) => (entryOrder.get(a.id) ?? 0) - (entryOrder.get(b.id) ?? 0)
    ),
  }));
}
