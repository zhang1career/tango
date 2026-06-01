/**
 * passageBlocks 编辑辅助：leading raw + 多个 ai 块
 */

import type {GameScene, ScenePassageAiBlock, ScenePassageBlock, ScenePassageRawBlock} from '@/schema/game-scene';

/** 轻量互动：单 ai 块字数上限默认值 */
export const DEFAULT_AI_WORD_COUNT = 200;

export const AI_WORD_COUNT_MIN = 160;
export const AI_WORD_COUNT_MAX = 220;

export function clampAiWordCount(n: number | undefined): number | undefined {
  if (n == null || Number.isNaN(n)) return undefined;
  const v = Math.round(n);
  if (v < 1) return undefined;
  return Math.min(AI_WORD_COUNT_MAX, Math.max(AI_WORD_COUNT_MIN, v));
}

export function getLeadingRawBlock(scene: GameScene): ScenePassageRawBlock | null {
  const blocks = scene.passageBlocks ?? [];
  const first = blocks[0];
  return first?.type === 'raw' ? first : null;
}

export function getAiBlocks(scene: GameScene): ScenePassageAiBlock[] {
  return (scene.passageBlocks ?? []).filter((b): b is ScenePassageAiBlock => b.type === 'ai');
}

export function defaultPassageBlocks(): ScenePassageBlock[] {
  return [
    {type: 'raw', text: ''},
    {type: 'ai', summary: '', wordCount: DEFAULT_AI_WORD_COUNT},
  ];
}

/** 保证首块为 raw，其余为 ai（丢弃非法中间 raw） */
export function normalizePassageBlocks(blocks: ScenePassageBlock[]): ScenePassageBlock[] {
  const raw = blocks.find((b): b is ScenePassageRawBlock => b.type === 'raw');
  const ai = blocks.filter((b): b is ScenePassageAiBlock => b.type === 'ai');
  const leading: ScenePassageRawBlock = raw ?? {type: 'raw', text: ''};
  const aiBlocks =
    ai.length > 0
      ? ai.map((b) => ({
          type: 'ai' as const,
          summary: b.summary ?? '',
          hints: b.hints,
          wordCount: clampAiWordCount(b.wordCount) ?? DEFAULT_AI_WORD_COUNT,
        }))
      : [{type: 'ai' as const, summary: '', wordCount: DEFAULT_AI_WORD_COUNT}];
  return [leading, ...aiBlocks];
}

export function upsertLeadingRaw(scene: GameScene, text: string): GameScene {
  const normalized = normalizePassageBlocks(scene.passageBlocks ?? []);
  normalized[0] = {type: 'raw', text};
  return {...scene, passageBlocks: normalized};
}

export function upsertAiBlock(
  scene: GameScene,
  aiIndex: number,
  patch: (block: ScenePassageAiBlock) => ScenePassageAiBlock
): GameScene {
  const normalized = normalizePassageBlocks(scene.passageBlocks ?? []);
  const aiBlocks = normalized.slice(1) as ScenePassageAiBlock[];
  if (aiIndex < 0 || aiIndex >= aiBlocks.length) return scene;
  aiBlocks[aiIndex] = patch(aiBlocks[aiIndex]);
  return {...scene, passageBlocks: [normalized[0] as ScenePassageRawBlock, ...aiBlocks]};
}

export function addAiBlock(scene: GameScene): GameScene {
  const normalized = normalizePassageBlocks(scene.passageBlocks ?? []);
  return {
    ...scene,
    passageBlocks: [
      ...normalized,
      {type: 'ai', summary: '', wordCount: DEFAULT_AI_WORD_COUNT},
    ],
  };
}

export function removeAiBlock(scene: GameScene, aiIndex: number): GameScene {
  const normalized = normalizePassageBlocks(scene.passageBlocks ?? []);
  const aiBlocks = normalized.slice(1) as ScenePassageAiBlock[];
  if (aiBlocks.length <= 1) return scene;
  aiBlocks.splice(aiIndex, 1);
  return {...scene, passageBlocks: [normalized[0] as ScenePassageRawBlock, ...aiBlocks]};
}

export function formatAiWordCountPrompt(block: ScenePassageAiBlock): string {
  const wc = clampAiWordCount(block.wordCount) ?? DEFAULT_AI_WORD_COUNT;
  return `字数要求：不得超过${wc}字（含标点）；宜控制在 ${AI_WORD_COUNT_MIN}–${AI_WORD_COUNT_MAX} 字以内`;
}
