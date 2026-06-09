/**
 * 史料 raw 块在 story.tw 中的 HTML 引用样式（.raw-passage-quote）
 * 编辑弹窗展示纯文本，保存时按 passageBlocks 恢复包裹。
 */

import type {GameScene} from '../schema/game-scene';
import {getScenePassageBlocks} from './passage-blocks';

const RAW_QUOTE_RE = /<div class="raw-passage-quote">([\s\S]*?)<\/div>/gi;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function wrapRawPassageQuote(text: string): string {
  return `<div class="raw-passage-quote">${escapeHtml(text)}</div>`;
}

/** 编辑区：去掉史料块的 HTML 包裹，展示纯文本 */
export function stripRawPassageQuoteMarkup(fullText: string): string {
  return fullText.replace(RAW_QUOTE_RE, (_, inner: string) => unescapeHtml(inner.trim()));
}

/** 保存：与 passageBlocks 中 raw 原文完全一致的段落重新加上引用样式 */
export function restoreRawPassageQuoteMarkup(fullText: string, scene: GameScene): string {
  const rawTexts = new Set(
    getScenePassageBlocks(scene)
      .filter((b) => b.type === 'raw')
      .map((b) => (b.type === 'raw' ? b.text?.trim() : ''))
      .filter((t): t is string => !!t)
  );
  if (rawTexts.size === 0) return fullText;

  return fullText
    .split(/\n\n+/)
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return para;
      if (rawTexts.has(trimmed)) return wrapRawPassageQuote(trimmed);
      return para;
    })
    .join('\n\n');
}
