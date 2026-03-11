/**
 * 段落内容 sanitize - 仅允许媒体标签及换行，防止 XSS
 */

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['img', 'audio', 'video', 'br', 'div'];
const ALLOWED_ATTR = ['src', 'alt', 'width', 'height', 'autoplay', 'loop', 'muted', 'controls', 'title', 'class', 'data-images'];

export function sanitizePassageContent(html: string): string {
  const withBreaks = html.replace(/\n/g, '<br>');
  return DOMPurify.sanitize(withBreaks, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['controls'], // 部分浏览器需要
  });
}
