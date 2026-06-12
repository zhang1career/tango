/**
 * 将 story.tw 合并正文供章节页「编辑正文」使用。
 * 成稿正文与游戏展示一致（RAW + 汇编 AI 正文），不按 AI 块强行拆分。
 */

import type {GameScene, ScenePassageBlock} from '../schema/game-scene';
import {getLeadingRawBlock, getScenePassageBlocks, upsertLeadingRaw} from './passage-blocks';
import {stripRawPassageQuoteMarkup, wrapRawPassageQuote} from './raw-passage-quote-markup';

/** @deprecated 章节页手工编辑请用 PassageManualEditFields */
export type PassageBlockSegment = {
  blockIndex: number;
  type: 'raw' | 'ai';
  label: string;
  text: string;
};

/** 章节页「编辑正文」：与 story.tw / 游戏展示一致的字段 */
export type PassageManualEditFields = {
  hasLeadingRaw: boolean;
  rawText: string;
  bodyText: string;
};

export function storyPassageToManualEditFields(fullText: string, scene: GameScene): PassageManualEditFields {
  const leadingRaw = getLeadingRawBlock(scene);
  const stripped = stripRawPassageQuoteMarkup(fullText).trim();
  if (!leadingRaw?.text?.trim()) {
    return {hasLeadingRaw: false, rawText: '', bodyText: stripped};
  }
  const raw = leadingRaw.text.trim();
  const idx = stripped.indexOf(raw);
  if (idx >= 0) {
    const bodyText = stripped.slice(idx + raw.length).replace(/^[\s\n]+/, '');
    return {hasLeadingRaw: true, rawText: raw, bodyText};
  }
  return {hasLeadingRaw: true, rawText: raw, bodyText: stripped};
}

export function renderManualEditFields(fields: PassageManualEditFields): string {
  const parts: string[] = [];
  if (fields.hasLeadingRaw && fields.rawText.trim()) {
    parts.push(wrapRawPassageQuote(fields.rawText.trim()));
  }
  if (fields.bodyText.trim()) parts.push(fields.bodyText.trim());
  return parts.join('\n\n');
}

/** 审校保存：若修改 RAW 则同步 leading raw；成稿正文只写入 story.tw，不回写 AI 块 generatedText */
export function applyManualEditToScene(scene: GameScene, fields: PassageManualEditFields): GameScene {
  if (!fields.hasLeadingRaw) return scene;
  return upsertLeadingRaw(scene, fields.rawText);
}

function blockLabel(block: ScenePassageBlock, blockIndex: number, blocks: ScenePassageBlock[]): string {
  if (block.type === 'raw') {
    return blockIndex === 0 ? 'RAW · 史料/定调' : `RAW · 块 ${blockIndex}`;
  }
  const aiNum = blocks.slice(0, blockIndex + 1).filter((b) => b.type === 'ai').length;
  return `AI · 块 ${aiNum}`;
}

function aiIndicesBeforeRaw(blocks: ScenePassageBlock[], rawBi: number): number[] {
  const out: number[] = [];
  for (let j = rawBi - 1; j >= 0; j--) {
    if (blocks[j]!.type === 'ai') out.unshift(j);
    else if (blocks[j]!.type === 'raw') break;
  }
  return out;
}

function aiIndicesAfterLastRaw(blocks: ScenePassageBlock[]): number[] {
  let lastRaw = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.type === 'raw') lastRaw = i;
  }
  const out: number[] = [];
  for (let j = lastRaw + 1; j < blocks.length; j++) {
    if (blocks[j]!.type === 'ai') out.push(j);
  }
  return out;
}

function distributeAiText(indices: number[], texts: string[], content: string): void {
  const trimmed = content.trim();
  if (!trimmed || indices.length === 0) return;
  if (indices.length === 1) {
    texts[indices[0]!] = trimmed;
    return;
  }
  const parts = trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === indices.length) {
    indices.forEach((idx, pi) => {
      texts[idx] = parts[pi]!;
    });
    return;
  }
  texts[indices[indices.length - 1]!] = trimmed;
}

function extractTextsPerBlock(stripped: string, blocks: ScenePassageBlock[]): string[] {
  const texts = blocks.map((block) =>
    block.type === 'raw' ? (block.text?.trim() ?? '') : (block.generatedText?.trim() ?? '')
  );

  let cursor = 0;
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (block?.type !== 'raw') continue;

    const raw = texts[bi]!.trim();
    if (!raw) continue;

    const idx = stripped.indexOf(raw, cursor);
    if (idx < 0) continue;

    if (idx > cursor) {
      distributeAiText(aiIndicesBeforeRaw(blocks, bi), texts, stripped.slice(cursor, idx));
    }

    texts[bi] = stripped.slice(idx, idx + raw.length);
    cursor = idx + raw.length;
    while (cursor < stripped.length && /\s/.test(stripped[cursor]!)) cursor++;
  }

  const tail = stripped.slice(cursor).trim();
  if (tail) distributeAiText(aiIndicesAfterLastRaw(blocks), texts, tail);

  return texts;
}

/** @deprecated 章节页请用 storyPassageToManualEditFields */
export function passageBlocksToEditSegments(fullText: string, scene: GameScene): PassageBlockSegment[] {
  const blocks = getScenePassageBlocks(scene);
  const stripped = stripRawPassageQuoteMarkup(fullText).trim();
  const texts = stripped ? extractTextsPerBlock(stripped, blocks) : [];

  return blocks.map((block, blockIndex) => ({
    blockIndex,
    type: block.type,
    label: blockLabel(block, blockIndex, blocks),
    text:
      texts[blockIndex] ??
      (block.type === 'raw' ? (block.text ?? '') : (block.generatedText ?? '')),
  }));
}

/** @deprecated 使用 passageBlocksToEditSegments */
export function splitPassageTextByBlocks(fullText: string, scene: GameScene): PassageBlockSegment[] {
  return passageBlocksToEditSegments(fullText, scene);
}

/** 按分段类型写入 story.tw：RAW 包裹引用样式，AI 为纯文本 */
export function renderPassageBlockSegments(segments: PassageBlockSegment[]): string {
  const ordered = [...segments].sort((a, b) => a.blockIndex - b.blockIndex);
  return ordered
    .map((s) => {
      const text = s.text.trim();
      if (!text) return '';
      return s.type === 'raw' ? wrapRawPassageQuote(text) : text;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** 将编辑结果回写 passageBlocks（RAW → text，AI → generatedText） */
export function applySegmentsToScenePassageBlocks(
  scene: GameScene,
  segments: PassageBlockSegment[]
): GameScene {
  const blocks = getScenePassageBlocks(scene);
  const byIndex = new Map(segments.map((s) => [s.blockIndex, s]));
  const next = blocks.map((block, blockIndex) => {
    const seg = byIndex.get(blockIndex);
    if (!seg) return block;
    if (block.type === 'raw' && seg.type === 'raw') {
      return {type: 'raw' as const, text: seg.text};
    }
    if (block.type === 'ai' && seg.type === 'ai') {
      return {...block, generatedText: seg.text.trim() || undefined};
    }
    return block;
  });
  return {...scene, passageBlocks: next};
}
