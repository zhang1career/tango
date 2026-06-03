/**
 * 将旧版 hints 迁移为结构化 AI 块字段
 */

import type {ScenePassageAiBlock} from '@/schema/game-scene';

type LegacyAi = ScenePassageAiBlock & {hints?: string};

export function migrateLegacyAiBlock(block: LegacyAi): ScenePassageAiBlock {
  const hints = block.hints?.trim();
  const next: ScenePassageAiBlock = {
    type: 'ai',
    summary: block.summary ?? '',
    wordCount: block.wordCount ?? 200,
    emotion: block.emotion,
    anchors: block.anchors?.length ? block.anchors : undefined,
    forbidden: block.forbidden?.length ? block.forbidden : undefined,
    perspective: block.perspective,
    priority: block.priority,
    style: block.style,
    pacing: block.pacing,
    voice: block.voice,
    constraints: block.constraints,
    characterIds: block.characterIds !== undefined ? [...block.characterIds] : undefined,
    generatedText: block.generatedText,
  };
  if (!hints) return next;
  if (!next.constraints) next.constraints = hints;
  else if (!next.style) next.style = hints;
  else {
    next.constraints = `${next.constraints}\n${hints}`;
  }
  return next;
}

export function splitHintsHeuristic(hints: string): Partial<ScenePassageAiBlock> {
  const patch: Partial<ScenePassageAiBlock> = {constraints: hints};
  const curve = hints.match(/曲线[：:]\s*[^；;]+/);
  if (curve) patch.emotion = curve[0];
  if (/第一人称|第三人称|限知/.test(hints)) patch.perspective = hints.match(/(第一人称[^；;]*|第三人称[^；;]*|限知[^；;]*)/)?.[0];
  if (/白描|对白极少|快剪|议论/.test(hints)) patch.style = hints.match(/(白描[^；;]*|对白极少[^；;]*)/)?.[0] ?? '白描为主';
  if (/曲线|节奏|快|慢/.test(hints)) patch.pacing = hints.match(/节奏[：:][^；;]+/)?.[0];
  if (/第一人称|我/.test(hints)) patch.voice = '第一人称';
  if (/勿复述|不得|禁止/.test(hints)) patch.forbidden = [hints.match(/勿[^；;]+|不得[^；;]+|禁止[^；;]+/)?.[0] ?? '勿复述 leading raw'].filter(Boolean);
  return patch;
}

export function migrateLegacyAiBlockFull(block: LegacyAi): ScenePassageAiBlock {
  const base = migrateLegacyAiBlock(block);
  if (!block.hints?.trim() || (base.style && base.constraints !== block.hints)) return base;
  const h = splitHintsHeuristic(block.hints);
  return {
    ...base,
    emotion: base.emotion ?? h.emotion,
    perspective: base.perspective ?? h.perspective,
    style: base.style ?? h.style,
    pacing: base.pacing ?? h.pacing,
    voice: base.voice ?? h.voice,
    forbidden: base.forbidden ?? h.forbidden,
    constraints: h.constraints,
  };
}
