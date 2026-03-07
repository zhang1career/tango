/**
 * Twee 3 格式解析器 - 兼容 Twine
 * 参考: https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md
 * 扩展: 支持条件链接 [[display|target]] condition、StoryData 初始状态、passage metadata 状态动作
 */

import type { Passage, PassageLink, Story, InitialRuntimeState, PassageStateActions } from '../types';

const PASSAGE_HEADER_RE = /^::\s*(.+?)(?:\s+\[([^\]]*)\])?(?:\s*(\{.*\}))?$/;
// Twine link + 可选条件: [[...]] condition
const LINK_RE =
  /\[\[([^\]]+?)(?:\|([^\]]+?))?\]\]|\[\[([^\]]+?)->([^\]]+?)\]\]|\[\[([^\]]+?)<-([^\]]+?)\]\]/g;

function parseLinks(text: string): Array<{ displayText: string; passageName: string; raw: string; condition?: string }> {
  const links: Array<{ displayText: string; passageName: string; raw: string; condition?: string }> = [];
  // 匹配 [[...]] 及可选条件（]] 后至下一个 [[ 或结尾）
  const fullRe = /\[\[([^\]]+?)(?:\|([^\]]+?))?\]\]|\[\[([^\]]+?)->([^\]]+?)\]\]|\[\[([^\]]+?)<-([^\]]+?)\]\](\s+[^\[]*)?(?=\[\[|$)/g;
  let m: RegExpExecArray | null;

  while ((m = fullRe.exec(text)) !== null) {
    const raw = m[0];
    let displayText: string;
    let passageName: string;
    const conditionPart = m[8]?.trim();

    if (m[3] && m[4]) {
      displayText = m[3].trim();
      passageName = m[4].trim();
    } else if (m[5] && m[6]) {
      displayText = m[6].trim();
      passageName = m[5].trim();
    } else if (m[1] && m[2]) {
      displayText = m[1].trim();
      passageName = m[2].trim();
    } else if (m[1]) {
      passageName = m[1].trim();
      displayText = passageName;
    } else {
      continue;
    }
    links.push({
      displayText,
      passageName,
      raw: raw.replace(/\s+[^\[]*$/, ''), // raw 不含 condition，用于替换
      condition: conditionPart && !conditionPart.startsWith('[[') ? conditionPart : undefined,
    });
  }
  return links;
}

function normalizeId(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

export function parseTwee(source: string): Story {
  const passages = new Map<string, Passage>();
  let startPassageId = 'Start';
  let title = 'Untitled Story';
  let storyMetadata: Record<string, unknown> = {};

  const lines = source.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const headerMatch = line.match(PASSAGE_HEADER_RE);
    if (!headerMatch) {
      i++;
      continue;
    }

    const [, namePart, tagsStr, metaStr] = headerMatch;
    const name = namePart.trim();
    const tags = tagsStr ? tagsStr.split(/\s+/).filter(Boolean) : [];
    let metadata: Record<string, unknown> = {};
    if (metaStr) {
      try {
        metadata = JSON.parse(metaStr);
      } catch {
        // 忽略解析错误
      }
    }

    const contentLines: string[] = [];
    i++;
    while (i < lines.length && !lines[i].match(PASSAGE_HEADER_RE)) {
      contentLines.push(lines[i]);
      i++;
    }
    const rawContent = contentLines.join('\n').trim();

    if (name === 'StoryTitle') {
      title = rawContent || 'Untitled Story';
      continue;
    }

    if (name === 'StoryData') {
      try {
        storyMetadata = JSON.parse(rawContent);
        const start = (storyMetadata as { start?: string }).start;
        if (start) startPassageId = normalizeId(start);
      } catch {
        // 忽略
      }
      continue;
    }

    const links = parseLinks(rawContent);
    const fullLinkRe =
      /\[\[([^\]]+?)(?:\|([^\]]+?))?\]\]|\[\[([^\]]+?)->([^\]]+?)\]\]|\[\[([^\]]+?)<-([^\]]+?)\]\](\s+[^\[]*)?(?=\[\[|$)/g;
    const cleanText = rawContent
      .replace(fullLinkRe, (match) => {
        const parsed = parseLinks(match)[0];
        return parsed ? parsed.displayText : match;
      })
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const id = normalizeId(name);
    passages.set(id, {
      id,
      name,
      text: cleanText,
      tags: tags.length ? tags : undefined,
      metadata: Object.keys(metadata).length ? metadata : undefined,
      links: links.map(
        (l): PassageLink => ({
          displayText: l.displayText,
          passageName: l.passageName,
          condition: l.condition,
        })
      ),
    });
  }

  if (!passages.has(startPassageId)) {
    const first = passages.keys().next().value;
    if (first) startPassageId = first;
  }

  return {
    title,
    startPassageId,
    passages,
    metadata: Object.keys(storyMetadata).length ? storyMetadata : undefined,
  };
}
