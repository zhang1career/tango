import type {GameScene} from '@/schema/game-scene';
import {getScenePassageBlocks} from '@/utils/passage-blocks';

export function buildSceneRawContextForAiBlock(
  scene: GameScene,
  passageBlockIndex: number
): {
  precedingRawBlockCount?: number;
  followingRawBlockCount?: number;
  rawContextNote?: string;
} {
  const blocks = getScenePassageBlocks(scene);
  let precedingRawBlockCount = 0;
  let followingRawBlockCount = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type !== 'raw') continue;
    if (i < passageBlockIndex) precedingRawBlockCount++;
    else if (i > passageBlockIndex) followingRawBlockCount++;
  }
  const rawContextNote =
    precedingRawBlockCount || followingRawBlockCount
      ? `本 AI 块之前已有 ${precedingRawBlockCount} 段 raw、之后另有 ${followingRawBlockCount} 段 raw。不得复述 raw 原文。`
      : '不得复述 passage 中已单独展示的 raw 原文。';
  return {
    precedingRawBlockCount: precedingRawBlockCount || undefined,
    followingRawBlockCount: followingRawBlockCount || undefined,
    rawContextNote,
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
