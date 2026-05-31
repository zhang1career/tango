/**
 * story-scenes.json 场景 id ↔ story.tw 分页 passage 的映射：
 * - 读取：合并主 passage 与 .p_100/.p_200… 子页为完整正文
 * - 写入：按完整正文重新分页
 */

import type {Passage, Story} from '@/types';
import {isTechnicalPassageId} from './passage-display-title';
import {paginatePassageText, removeSceneSubPassages} from './paginate-passage';

const PAGE_SUFFIX_RE = /\.p_\d+$/;

function normalizePassageKey(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

function parsePageNum(id: string): number {
  const m = id.match(/\.p_(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function isSubPagePassage(passage: Passage): boolean {
  return PAGE_SUFFIX_RE.test(passage.id);
}

/** 列出场景全部分页 passage：主 passage 在前，子页按 p_ 序号 */
export function listScenePassagePages(
  story: Story,
  sceneId: string,
  paginationBaseId: string,
  lookupKeys: string[] = []
): Passage[] {
  const candidates: Passage[] = [];
  const seen = new Set<string>();

  const add = (p: Passage | undefined) => {
    if (!p || seen.has(p.id)) return;
    seen.add(p.id);
    candidates.push(p);
  };

  for (const key of lookupKeys) add(story.passages.get(key));
  add(story.passages.get(paginationBaseId));

  for (const [, p] of story.passages) {
    if (p.metadata?.sceneId === sceneId) add(p);
    if (p.id.startsWith(`${paginationBaseId}.p_`)) add(p);
  }

  const roots = candidates.filter((p) => !isSubPagePassage(p));
  const subs = candidates
    .filter((p) => isSubPagePassage(p))
    .sort((a, b) => parsePageNum(a.id) - parsePageNum(b.id));

  let root: Passage | undefined;
  for (const key of lookupKeys) {
    const matched = roots.find(
      (r) => r.id === key || normalizePassageKey(r.name) === key || r.name === key
    );
    if (matched) {
      root = matched;
      break;
    }
  }
  if (!root) {
    root =
      roots.find((r) => !isTechnicalPassageId(r.name) && !isTechnicalPassageId(r.id)) ??
      roots[0];
  }

  return root ? [root, ...subs] : subs;
}

/** 合并场景全部分页正文（编辑区展示/保存用） */
export function collectSceneFullText(
  story: Story,
  sceneId: string,
  paginationBaseId: string,
  lookupKeys: string[] = []
): string {
  const pages = listScenePassagePages(story, sceneId, paginationBaseId, lookupKeys);
  return pages
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

/** 删除场景在 story.tw 中的主 passage 与全部分页子 passage */
export function removeScenePassagePages(
  story: Story,
  sceneId: string,
  paginationBaseId: string,
  lookupKeys: string[] = []
): void {
  removeSceneSubPassages(story, paginationBaseId);

  const toDelete = new Set<string>();
  for (const [id, p] of story.passages) {
    if (p.metadata?.sceneId === sceneId) toDelete.add(id);
    if (id.startsWith(`${paginationBaseId}.p_`)) toDelete.add(id);
  }
  for (const key of lookupKeys) {
    if (story.passages.has(key)) toDelete.add(key);
  }
  if (story.passages.has(paginationBaseId)) toDelete.add(paginationBaseId);

  for (const id of toDelete) story.passages.delete(id);
}

/** 将完整正文写入 story 并按配置重新分页 */
export function applyScenePassageFullText(
  story: Story,
  options: {
    sceneId: string;
    paginationBaseId: string;
    lookupKeys?: string[];
    rootPassage: Passage;
    fullText: string;
    minChars: number;
    maxChars: number;
  }
): void {
  const {
    sceneId,
    paginationBaseId,
    lookupKeys = [],
    rootPassage,
    fullText,
    minChars,
    maxChars,
  } = options;

  removeScenePassagePages(story, sceneId, paginationBaseId, lookupKeys);
  story.passages.set(paginationBaseId, {
    ...rootPassage,
    id: paginationBaseId,
    text: fullText,
  });
  paginatePassageText(story, paginationBaseId, fullText, minChars, maxChars);
}
