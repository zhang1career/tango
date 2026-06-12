import type {GameScene} from '@/schema/game-scene';
import {getLeadingRawBlock, getScenePassageBlocks} from '@/utils/passage-blocks';

function truncate(text: string, max: number): string {
  const c = text.replace(/\s+/g, ' ').trim();
  return c.length > max ? `${c.slice(0, max)}…` : c;
}

export function buildSceneRawContextForAiBlock(
  scene: GameScene,
  passageBlockIndex: number
): {
  precedingRawBlockCount?: number;
  followingRawBlockCount?: number;
  rawContextNote?: string;
  leadingRawExcerpt?: string;
} {
  const blocks = getScenePassageBlocks(scene);
  let precedingRawBlockCount = 0;
  let followingRawBlockCount = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type !== 'raw') continue;
    if (i < passageBlockIndex) precedingRawBlockCount++;
    else if (i > passageBlockIndex) followingRawBlockCount++;
  }
  const leadingRaw = getLeadingRawBlock(scene);
  const leadingRawExcerpt = leadingRaw?.text?.trim() ? truncate(leadingRaw.text, 320) : undefined;
  const rawContextNote =
    precedingRawBlockCount || followingRawBlockCount
      ? `本 AI 块之前已有 ${precedingRawBlockCount} 段 raw、之后另有 ${followingRawBlockCount} 段 raw。不得复述 raw 原文。`
      : leadingRawExcerpt
        ? 'leading raw 已单独展示给读者，本块不得复述其中的时地、史料与描写，只写 raw 未覆盖的新信息。'
        : '不得复述 passage 中已单独展示的 raw 原文。';
  return {
    precedingRawBlockCount: precedingRawBlockCount || undefined,
    followingRawBlockCount: followingRawBlockCount || undefined,
    rawContextNote,
    leadingRawExcerpt,
  };
}

export function collectPrecedingRawTextsAtBlockIndex(scene: GameScene, passageBlockIndex: number): string[] {
  const blocks = getScenePassageBlocks(scene);
  const texts: string[] = [];
  for (let i = 0; i < passageBlockIndex; i++) {
    const b = blocks[i];
    if (b.type === 'raw' && b.text?.trim()) texts.push(b.text.trim());
  }
  return texts;
}

export function collectPrecedingAiGeneratedTextsAtBlockIndex(
  scene: GameScene,
  passageBlockIndex: number
): string[] {
  const blocks = getScenePassageBlocks(scene);
  const texts: string[] = [];
  for (let i = 0; i < passageBlockIndex; i++) {
    const b = blocks[i];
    if (b.type === 'ai' && b.generatedText?.trim()) texts.push(b.generatedText.trim());
  }
  return texts;
}
