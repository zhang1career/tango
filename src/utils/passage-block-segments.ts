/**
 * 将 story.tw 合并正文按 passageBlocks 拆分为 RAW / AI 段，供章节页正文编辑展示与保存。
 */

import type {GameScene, ScenePassageBlock} from '../schema/game-scene';
import {getScenePassageBlocks} from './passage-blocks';
import {stripRawPassageQuoteMarkup, wrapRawPassageQuote} from './raw-passage-quote-markup';

export type PassageBlockSegment = {
  blockIndex: number;
  type: 'raw' | 'ai';
  label: string;
  text: string;
};

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

/** 每个 passageBlock 对应一段，blockIndex 与 blocks 数组下标一致 */
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
