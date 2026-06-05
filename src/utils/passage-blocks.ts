/**
 * passageBlocks 编辑辅助：leading raw + 多个 ai 块
 */

import type {GameScene, ScenePassageAiBlock, ScenePassageBlock, ScenePassageRawBlock} from '@/schema/game-scene';
import {migrateLegacyAiBlockFull} from './migrate-ai-block';

/** 轻量互动：单 ai 块字数上限默认值 */
export const DEFAULT_AI_WORD_COUNT = 200;

export const AI_WORD_COUNT_MIN = 160;
export const AI_WORD_COUNT_MAX = 220;

export function clampAiWordCount(n: number | undefined): number {
  if (n == null || Number.isNaN(n)) return DEFAULT_AI_WORD_COUNT;
  const v = Math.round(n);
  if (v < 1) return DEFAULT_AI_WORD_COUNT;
  return Math.min(AI_WORD_COUNT_MAX, Math.max(AI_WORD_COUNT_MIN, v));
}

export function getScenePassageBlocks(scene: GameScene): ScenePassageBlock[] {
  return normalizePassageBlocks(scene.passageBlocks ?? []);
}

export function getLeadingRawBlock(scene: GameScene): ScenePassageRawBlock | null {
  const blocks = getScenePassageBlocks(scene);
  const first = blocks[0];
  return first?.type === 'raw' ? first : null;
}

export function getAiBlocks(scene: GameScene): ScenePassageAiBlock[] {
  return getScenePassageBlocks(scene).filter((b): b is ScenePassageAiBlock => b.type === 'ai');
}

export function defaultAiBlock(): ScenePassageAiBlock {
  return {
    type: 'ai',
    summary: '',
    wordCount: DEFAULT_AI_WORD_COUNT,
    priority: 'medium',
  };
}

export function defaultPassageBlocks(): ScenePassageBlock[] {
  return [{type: 'raw', text: ''}, defaultAiBlock()];
}

/** 保证首块为 raw，其余为 ai（丢弃非法中间 raw）；迁移 legacy hints */
export function normalizePassageBlocks(blocks: ScenePassageBlock[]): ScenePassageBlock[] {
  const raw = blocks.find((b): b is ScenePassageRawBlock => b.type === 'raw');
  const ai = blocks.filter((b): b is ScenePassageAiBlock => b.type === 'ai');
  const leading: ScenePassageRawBlock = raw ?? {type: 'raw', text: ''};
  const aiBlocks =
    ai.length > 0
      ? ai.map((b) => {
          const legacy = b as ScenePassageAiBlock & {hints?: string};
          const migrated = legacy.hints?.trim()
            ? migrateLegacyAiBlockFull(legacy)
            : legacy;
          return {
            type: 'ai' as const,
            summary: migrated.summary ?? '',
            wordCount: clampAiWordCount(migrated.wordCount),
            emotion: migrated.emotion,
            anchors: migrated.anchors?.length ? migrated.anchors : undefined,
            forbidden: migrated.forbidden?.length ? migrated.forbidden : undefined,
            perspective: migrated.perspective,
            priority: migrated.priority ?? 'medium',
            style: migrated.style,
            pacing: migrated.pacing,
            voice: migrated.voice,
            constraints: migrated.constraints,
            characterIds: migrated.characterIds !== undefined ? migrated.characterIds : undefined,
            generatedText: migrated.generatedText?.trim() || undefined,
          };
        })
      : [defaultAiBlock()];
  return [leading, ...aiBlocks];
}

export function aiIndexToPassageBlockIndex(scene: GameScene, aiIndex: number): number | null {
  const blocks = getScenePassageBlocks(scene);
  let count = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type !== 'ai') continue;
    if (count === aiIndex) return i;
    count++;
  }
  return null;
}

export function passageBlockIndexToAiIndex(blocks: ScenePassageBlock[], blockIndex: number): number | null {
  const normalized = normalizePassageBlocks(blocks);
  if (blockIndex < 0 || blockIndex >= normalized.length) return null;
  if (normalized[blockIndex].type !== 'ai') return null;
  let aiIndex = 0;
  for (let i = 0; i < blockIndex; i++) {
    if (normalized[i].type === 'ai') aiIndex++;
  }
  return aiIndex;
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
  const patched = patch({...aiBlocks[aiIndex]});
  aiBlocks[aiIndex] = patched;
  return {...scene, passageBlocks: [normalized[0] as ScenePassageRawBlock, ...aiBlocks]};
}

export function addAiBlock(scene: GameScene): GameScene {
  const normalized = normalizePassageBlocks(scene.passageBlocks ?? []);
  return {...scene, passageBlocks: [...normalized, defaultAiBlock()]};
}

export function removeAiBlock(scene: GameScene, aiIndex: number): GameScene {
  const normalized = normalizePassageBlocks(scene.passageBlocks ?? []);
  const aiBlocks = normalized.slice(1) as ScenePassageAiBlock[];
  if (aiBlocks.length <= 1) return scene;
  aiBlocks.splice(aiIndex, 1);
  return {...scene, passageBlocks: [normalized[0] as ScenePassageRawBlock, ...aiBlocks]};
}

export function formatAiWordCountPrompt(block: ScenePassageAiBlock): string {
  const wc = clampAiWordCount(block.wordCount);
  return `字数要求：不得超过${wc}字（含标点）；宜控制在 ${AI_WORD_COUNT_MIN}–${AI_WORD_COUNT_MAX} 字以内`;
}

/** 本块用于生成对白的人物；undefined 表示继承场景出场人物 */
export function resolveAiBlockCharacterIds(
  block: ScenePassageAiBlock,
  scene: GameScene
): string[] {
  if (block.characterIds !== undefined) return block.characterIds;
  return scene.characterIds ?? [];
}

export function formatAiBlockSpec(block: ScenePassageAiBlock, scene?: GameScene): string {
  const lines = [
    `summary: ${block.summary}`,
    formatAiWordCountPrompt(block),
    block.emotion ? `emotion: ${block.emotion}` : '',
    block.priority ? `priority: ${block.priority}` : '',
    block.perspective ? `perspective: ${block.perspective}` : '',
    block.style ? `style: ${block.style}` : '',
    block.pacing ? `pacing: ${block.pacing}` : '',
    block.voice ? `voice: ${block.voice}` : '',
    block.anchors?.length ? `anchors（必须体现）: ${block.anchors.join('；')}` : '',
    block.forbidden?.length ? `forbidden: ${block.forbidden.join('；')}` : '',
    block.constraints ? `constraints: ${block.constraints}` : '',
    scene
      ? `dialogueCharacters: ${resolveAiBlockCharacterIds(block, scene).join('、') || '（无，宜纯旁白）'}`
      : block.characterIds?.length
        ? `dialogueCharacters: ${block.characterIds.join('、')}`
        : '',
  ].filter(Boolean);
  return lines.join('\n');
}
