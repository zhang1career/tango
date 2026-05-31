/**
 * 场景配图 / BGM 的 AI 提示词构建
 *
 * 数据来源（与剧情 AI 扩写共用场景上下文，但不含完整 story-fm 章节链）：
 * - scene.name / scene.id
 * - passageBlocks 第一个 ai 块：summary、hints
 * - passageBlocks 中 raw 块正文（截取，供氛围参考）
 * - mapNode（地图名 + 节点名）
 * - scene.characterIds 对应人物名称
 * - scene.eventIds 对应事件名称与 description
 * - storyBackground（story-fm.background，故事世界观）
 * - writingRules（story-fm.rules，写作风格约束）
 */

import type {GameScene} from '../schema/game-scene';

export type SceneMediaPromptContext = {
  storyBackground?: string;
  writingRules?: string[];
  mapNode?: { mapName: string; name: string };
  characterNames: string[];
  linkedEvents: Array<{ name: string; description?: string }>;
};

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function getFirstAiBlock(scene: GameScene): { summary: string; hints?: string } | null {
  const block = (scene.passageBlocks ?? []).find((b) => b.type === 'ai');
  return block && block.type === 'ai' ? block : null;
}

function collectRawTexts(scene: GameScene, maxChars = 400): string {
  const parts = (scene.passageBlocks ?? [])
    .filter((b): b is { type: 'raw'; text: string } => b.type === 'raw')
    .map((b) => b.text.trim())
    .filter(Boolean);
  return truncate(parts.join('\n'), maxChars);
}

function buildCommonLines(scene: GameScene, ctx: SceneMediaPromptContext): string[] {
  const ai = getFirstAiBlock(scene);
  const lines: string[] = [`场景：${scene.name}（${scene.id}）`];
  if (ai?.summary?.trim()) lines.push(`场景概要：${truncate(ai.summary, 500)}`);
  if (ai?.hints?.trim()) lines.push(`氛围提示：${truncate(ai.hints, 200)}`);
  const raw = collectRawTexts(scene);
  if (raw) lines.push(`原文氛围参考：${raw}`);
  if (ctx.mapNode) lines.push(`地点：${ctx.mapNode.mapName} / ${ctx.mapNode.name}`);
  if (ctx.characterNames.length) lines.push(`出场人物：${ctx.characterNames.join('、')}`);
  if (ctx.linkedEvents.length) {
    const evt = ctx.linkedEvents
      .map((e) => (e.description?.trim() ? `${e.name}（${truncate(e.description, 120)}）` : e.name))
      .join('；');
    lines.push(`关联事件：${evt}`);
  }
  if (ctx.storyBackground?.trim()) lines.push(`故事背景：${truncate(ctx.storyBackground, 400)}`);
  if (ctx.writingRules?.length) lines.push(`风格约束：${ctx.writingRules.join('；')}`);
  return lines;
}

/** 场景背景图提示词（gemini-2.5-flash-image） */
export function buildSceneImagePrompt(scene: GameScene, ctx: SceneMediaPromptContext): string {
  const lines = buildCommonLines(scene, ctx);
  return [
    '请生成一张文字冒险游戏的场景背景图。',
    '要求：横版宽屏构图，适合全屏背景；无文字、无 UI、无水印；画面主体清晰，留足叙事空间。',
    ...lines,
  ].join('\n');
}

/** 场景 BGM 提示词（suno-v3.5） */
export function buildSceneBgmPrompt(scene: GameScene, ctx: SceneMediaPromptContext): string {
  const lines = buildCommonLines(scene, ctx);
  return [
    '请生成一段纯器乐背景音乐（instrumental，无歌词），适合文字冒险游戏场景循环播放。',
    '要求：情绪与场景一致，节奏舒缓，不抢对白；时长约 1–2 分钟。',
    ...lines,
  ].join('\n');
}

export function buildSceneMediaPromptContext(
  scene: GameScene,
  options: {
    storyBackground?: string;
    writingRules?: string[];
    mapNodeIds: Array<{ id: string; name: string; mapName: string }>;
    characters: Array<{ id: string; name: string }>;
    events: Array<{ id: string; name: string; description?: string }>;
  }
): SceneMediaPromptContext {
  const mapNode = scene.mapNodeId
    ? options.mapNodeIds.find((n) => n.id === scene.mapNodeId)
    : undefined;
  const charNameMap = new Map(options.characters.map((c) => [c.id, c.name]));
  const characterNames = (scene.characterIds ?? [])
    .map((id) => charNameMap.get(id) ?? id)
    .filter(Boolean);
  const linkedEvents = (scene.eventIds ?? [])
    .map((id) => options.events.find((e) => e.id === id))
    .filter((e): e is { id: string; name: string; description?: string } => !!e)
    .map((e) => ({name: e.name, description: e.description}));
  return {
    storyBackground: options.storyBackground,
    writingRules: options.writingRules,
    mapNode: mapNode ? {mapName: mapNode.mapName, name: mapNode.name} : undefined,
    characterNames,
    linkedEvents,
  };
}
