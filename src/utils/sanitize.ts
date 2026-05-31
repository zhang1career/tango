/**
 * 段落内容 sanitize - 仅允许媒体标签及换行，防止 XSS
 */

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['img', 'audio', 'video', 'br', 'div'];
const ALLOWED_ATTR = ['src', 'alt', 'width', 'height', 'autoplay', 'loop', 'muted', 'controls', 'title', 'class', 'data-images'];

function splitLongLine(line: string, target = 92): string[] {
  const trimmed = line.trim();
  if (trimmed.length <= target) return [trimmed];
  const parts: string[] = [];
  let rest = trimmed;
  const punct = /[，。！？；：]/g;

  while (rest.length > target) {
    let cut = -1;
    punct.lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = punct.exec(rest)) !== null) {
      if (match.index <= target) cut = match.index + 1;
      else break;
    }
    if (cut <= 0) cut = target;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

function normalizeLine(line: string): string[] {
  if (!line.trim()) return [''];
  // 含 HTML 标签的行交给原渲染，避免破坏媒体结构。
  if (line.includes('<')) return [line];
  const dialogSeparated = line
    .replace(/([。！？])(?=“)/g, '$1\n')
    .replace(/”(?=“)/g, '”\n“');
  const chunks = dialogSeparated.split('\n').flatMap((segment) => splitLongLine(segment));
  return chunks.length > 0 ? chunks : [line];
}

export function sanitizePassageContent(html: string): string {
  const normalized = html
    .split('\n')
    .flatMap((line) => normalizeLine(line))
    .join('\n');
  const withBreaks = normalized.replace(/\n/g, '<br>');
  return DOMPurify.sanitize(withBreaks, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['controls'], // 部分浏览器需要
  });
}
