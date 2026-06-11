/** 下拉选项字典：id 为 key，显示名为 value */
export type IdNameDict = Record<string, string>;

export function buildIdNameDict(
  entries: ReadonlyArray<{id: string; name?: string | null}>
): IdNameDict {
  const dict: IdNameDict = {};
  for (const e of entries) {
    const id = e.id?.trim();
    if (!id) continue;
    dict[id] = e.name?.trim() || id;
  }
  return dict;
}

export function resolveIdName(dict: IdNameDict, id: string): string {
  return dict[id] ?? id;
}

/** 按显示名排序；pinIds 置顶（用于当前已选但不在字典中的项） */
export function sortedDictIds(dict: IdNameDict, pinIds?: string[]): string[] {
  const pinned = new Set((pinIds ?? []).filter(Boolean));
  const sortByLabel = (a: string, b: string) =>
    (dict[a] ?? a).localeCompare(dict[b] ?? b, 'zh');
  const ids = Object.keys(dict);
  return [
    ...ids.filter((id) => pinned.has(id)).sort(sortByLabel),
    ...ids.filter((id) => !pinned.has(id)).sort(sortByLabel),
  ];
}
