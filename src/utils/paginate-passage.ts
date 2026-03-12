/**
 * 将长段落文本按字数分页，拆成主 passage + 子 passage，用「继续」链接串联
 * 子 passage ID 格式：base.p_100, base.p_200, ...（步长 100）
 */

import type {Passage, PassageLink, Story} from '@/types';
import {toCascadedSubId} from './cascadedId';
import {splitTextIntoChunks} from './text-chunks';

const PAGE_STEP = 100;
const SUB_PASSAGE_PREFIX = '.p_';

/** 删除该场景的所有分页子 passage（baseId.p_100, baseId.p_200, ...） */
export function removeSceneSubPassages(story: Story, baseId: string): void {
  const prefix = baseId + SUB_PASSAGE_PREFIX;
  for (const id of [...story.passages.keys()]) {
    if (id.startsWith(prefix)) story.passages.delete(id);
  }
}

/**
 * 对指定 passage 的文本按字数分页；若超出 maxChars 则拆成多段，主段仅保留「继续」链接，末段保留原链接
 * @param story 故事对象（会被就地修改）
 * @param passageId 要分页的 passage id
 * @param text 新文本内容
 * @param minChars 每页最少字数
 * @param maxChars 每页最多字数
 */
export function paginatePassageText(
  story: Story,
  passageId: string,
  text: string,
  minChars: number,
  maxChars: number
): void {
  const p = story.passages.get(passageId);
  if (!p) return;

  const chunks = splitTextIntoChunks(text ?? '', minChars, maxChars);
  if (chunks.length <= 1) {
    p.text = chunks[0] ?? text ?? '';
    return;
  }

  const stripPrefix = (t: string) => (t.startsWith('前往 ') ? t.slice(3) : t);
  const originalLinks: PassageLink[] = (p.links ?? []).map((l) =>
    ({ ...l, displayText: stripPrefix(l.displayText) })
  );
  const firstSubId = toCascadedSubId(passageId, 'p', PAGE_STEP);
  p.text = chunks[0]!;
  p.links = [{displayText: '继续', passageName: firstSubId}];

  for (let i = 1; i < chunks.length; i++) {
    const subId = toCascadedSubId(passageId, 'p', i * PAGE_STEP);
    const isLast = i === chunks.length - 1;
    const nextSubId = isLast ? null : toCascadedSubId(passageId, 'p', (i + 1) * PAGE_STEP);
    const subLinks: PassageLink[] = isLast
      ? originalLinks  // 分页子 passage 的链接不带「前往 」前缀
      : [{displayText: '继续', passageName: nextSubId!}];

    const subP: Passage = {
      id: subId,
      name: subId,
      text: chunks[i]!,
      links: subLinks,
      metadata: p.metadata,
    };
    story.passages.set(subId, subP);
  }
}
