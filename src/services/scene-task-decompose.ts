/**
 * Step 2：将章节场景任务拆解为 AI 块结构（不写 generatedText）
 */

import type {StoryFramework} from '@/schema/story-framework';
import type {GameScene, ScenePassageAiBlock, ScenePassageBlock} from '@/schema/game-scene';
import {buildChapterContext} from '@/engine/story-generation/context';
import {chatCompletion, previewText, requireAigcConfig} from '@/engine/story-generation/llm';
import {buildPriorCanonInjection} from '@/engine/story-generation/prior-canon';
import {foreshadowThreadsForGeneration} from '@/schema/story-foreshadowing';
import type {StoryOutline} from '@/schema/story-outline';
import {
  fetchStoryCanon,
  fetchStoryForeshadowing,
  fetchStoryOutline,
} from '@/utils/story-engine-files';
import {getChapterAvailableSceneIds} from '@/utils/chapter-scene';
import {
  clampAiWordCount,
  getLeadingRawBlock,
  getScenePassageBlocks,
  normalizePassageBlocks,
} from '@/utils/passage-blocks';
import {
  getChapterNarrativeTask,
  getChapterZone,
  isChapterMarkedArchived,
  listPeerNarrativeTasks,
} from '@/utils/story-outline-fm';
import {saveStoryScenes} from './story-scenes-persist';
import {getAIGCModel} from '@/config';
import {appendGenerationTrace} from '@/utils/story-engine-files';
import type {GenerationTracePhase} from '@/schema/story-generation-traces';

function truncate(text: string, max: number): string {
  const c = text.replace(/\s+/g, ' ').trim();
  return c.length > max ? `${c.slice(0, max)}…` : c;
}

function priorSceneGeneratedSummaries(
  fw: StoryFramework,
  scenes: GameScene[],
  chapterIndex: number,
  sceneIndex: number
): Array<{sceneId: string; excerpt: string}> {
  const ch = fw.chapters[chapterIndex];
  if (!ch) return [];
  const pool = getChapterAvailableSceneIds(ch);
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  return pool.slice(0, sceneIndex).slice(-6).map((sid) => {
    const scene = sceneMap.get(sid);
    if (!scene) return {sceneId: sid, excerpt: ''};
    const blocks = getScenePassageBlocks(scene);
    const parts: string[] = [];
    for (const b of blocks) {
      if (b.type === 'ai' && b.generatedText?.trim()) {
        parts.push(truncate(b.generatedText, 200));
      }
    }
    return {sceneId: sid, excerpt: parts.join(' ') || truncate(getChapterNarrativeTask(ch, sid), 120)};
  });
}

function parseJsonFromModel<T>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : text.trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeDecomposedBlock(raw: Record<string, unknown>): ScenePassageAiBlock {
  const anchors = Array.isArray(raw.anchors)
    ? raw.anchors.map(String).map((s) => s.trim()).filter(Boolean)
    : undefined;
  const forbidden = Array.isArray(raw.forbidden)
    ? raw.forbidden.map(String).map((s) => s.trim()).filter(Boolean)
    : undefined;
  const priority = raw.priority;
  return {
    type: 'ai',
    summary: String(raw.summary ?? '').trim(),
    wordCount: clampAiWordCount(Number(raw.wordCount)),
    emotion: typeof raw.emotion === 'string' ? raw.emotion : undefined,
    anchors: anchors?.length ? anchors : undefined,
    forbidden: forbidden?.length ? forbidden : undefined,
    perspective: typeof raw.perspective === 'string' ? raw.perspective : undefined,
    priority:
      priority === 'low' || priority === 'high' || priority === 'medium' ? priority : 'medium',
    style: typeof raw.style === 'string' ? raw.style : undefined,
    pacing: typeof raw.pacing === 'string' ? raw.pacing : undefined,
    voice: typeof raw.voice === 'string' ? raw.voice : undefined,
    constraints: typeof raw.constraints === 'string' ? raw.constraints : undefined,
  };
}

export async function decomposeSceneTaskToAiBlocks(input: {
  gameId: string;
  fw: StoryFramework;
  scenes: GameScene[];
  chapterIndex: number;
  sceneId: string;
}): Promise<{scene: GameScene; fw: StoryFramework}> {
  if (!import.meta.env.DEV) throw new Error('场景分析仅支持开发模式');
  requireAigcConfig();

  const {gameId, fw, scenes, chapterIndex, sceneId} = input;
  const ch = fw.chapters[chapterIndex];
  if (!ch) throw new Error('章节不存在');

  const outline: StoryOutline = await fetchStoryOutline(gameId);
  if (isChapterMarkedArchived(outline, ch.id)) {
    throw new Error('已归档章节不参与场景分析');
  }
  const chi = fw.chapters.findIndex((c) => c.id === ch.id);
  if (chi >= 0 && getChapterZone(fw, outline, chi) === 'archived') {
    throw new Error('锚点之前的章节不参与场景分析');
  }

  const task = getChapterNarrativeTask(ch, sceneId);
  if (!task) throw new Error('请先填写场景任务');

  const scene = scenes.find((s) => s.id === sceneId) ?? (fw.scenes ?? []).find((s) => s.id === sceneId);
  if (!scene) throw new Error(`未找到场景 ${sceneId}`);

  const chapterCtx =
    buildChapterContext(fw, sceneId) ?? {
      chapterId: ch.id,
      chapterTitle: ch.title,
      chapterTheme: ch.theme ?? '',
      chapterIndex,
      sceneIndex: getChapterAvailableSceneIds(ch).indexOf(sceneId),
    };

  const [foreshadowing, canon] = await Promise.all([
    fetchStoryForeshadowing(gameId),
    fetchStoryCanon(gameId),
  ]);

  const priorCanon = buildPriorCanonInjection(fw, canon, chapterIndex, chapterCtx.sceneIndex);
  const priorGenerated = priorSceneGeneratedSummaries(fw, scenes, chapterIndex, chapterCtx.sceneIndex);
  const peerTasks = listPeerNarrativeTasks(ch, sceneId);
  const rawBlock = getLeadingRawBlock(scene);

  const system = `你是叙事引擎的「块级规划师」。根据场景任务与真相层，输出 JSON：
{"aiBlocks":[{"summary":"定场/推进/收束：…","wordCount":200,"emotion":"…","anchors":[],"forbidden":[],"style":"…","constraints":"…"}]}
规则：
- 只输出 ai 块数组，不要 raw 块
- summary 使用项目标注（定场/推进/收束/失败 等），块序符合叙事节奏
- 若存在 leadingRawPreview：首块定场不得复述其中的时地、史料与描写，只规划 raw 未覆盖的新节拍（内心、对话、行动后果）
- 多块时各块 summary 的叙事节拍须互斥递进：每块只写一个新节拍，anchors/意象/对白轮次不得跨块重复
- 若 narrativeTask 或 counterpartCharacterIds 涉及多方立场/议场分歧，至少一块 summary 应含「一句关键问询或引语」节拍，并在该块 anchors 标注问询对象或关键引语（勿规划连续对白交锋；完整问答仍属 behaviorLibrary）
- 推进/收束块不得重复定场块已规划的内容；若定场已写「父训回响」，推进应写具体回忆画面，收束应写决策动作
- wordCount 在 160–220
- 任务拆解为 1–4 个 ai 块
只输出 JSON。`;

  const userPayload = {
    sceneId,
    sceneName: scene.name,
    narrativeTask: task,
    sceneCharacterIds: (scene.characterIds ?? []).map((id) => ({
      id,
      name: fw.characters?.find((c) => c.id === id)?.name ?? id,
    })),
    counterpartCharacterIds: (scene.counterpartCharacterIds ?? []).map((id) => ({
      id,
      name: fw.characters?.find((c) => c.id === id)?.name ?? id,
    })),
    chapter: {
      id: ch.id,
      title: ch.title,
      theme: ch.theme,
      narrativeGoal: ch.narrativeGoal,
    },
    peerTasksReference: peerTasks.length ? peerTasks : undefined,
    openForeshadowing: foreshadowThreadsForGeneration(foreshadowing.threads, sceneId),
    priorCanon,
    priorSceneGenerated: priorGenerated,
    leadingRawPreview: rawBlock?.text?.trim() ? truncate(rawBlock.text, 300) : undefined,
  };

  const out = await chatCompletion(
    [
      {role: 'system', content: system},
      {role: 'user', content: JSON.stringify(userPayload, null, 2)},
    ],
    {temperature: 0.25}
  );

  const parsed = parseJsonFromModel<{aiBlocks?: Record<string, unknown>[]}>(out);
  let aiBlocks = (parsed?.aiBlocks ?? [])
    .map((b) => normalizeDecomposedBlock(b))
    .filter((b) => b.summary.trim());
  if (!aiBlocks.length) throw new Error('分析未返回有效 AI 块');

  if (rawBlock?.text?.trim() || aiBlocks.length > 1) {
    aiBlocks = aiBlocks.map((block, idx) => {
      const forbidden = new Set(block.forbidden ?? []);
      const constraintParts = block.constraints ? [block.constraints] : [];
      if (idx === 0 && rawBlock?.text?.trim()) {
        forbidden.add('勿复述 leading raw 中的时地、史料与描写');
        constraintParts.push('承接 raw，只写 raw 未覆盖的新信息');
      }
      if (idx > 0) {
        forbidden.add('勿重复前序 AI 块的时地定场与对白');
        constraintParts.push('接续前块，只写本块 summary 的新节拍');
      }
      return {
        ...block,
        forbidden: forbidden.size ? [...forbidden] : undefined,
        constraints: constraintParts.length ? constraintParts.join('；') : undefined,
      };
    });
  }

  const leading = rawBlock ?? {type: 'raw' as const, text: ''};
  const passageBlocks: ScenePassageBlock[] = normalizePassageBlocks([leading, ...aiBlocks]);

  const updatedScene: GameScene = {...scene, passageBlocks};
  const saved = await saveStoryScenes(gameId, (fw.scenes ?? []).map((s) => (s.id === sceneId ? updatedScene : s)));
  if (!saved.ok) throw new Error(saved.error || '保存 story-scenes 失败');

  const phases: GenerationTracePhase[] = [{name: 'decompose', outputPreview: previewText(out)}];
  await appendGenerationTrace(gameId, {
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    kind: 'decompose_scene',
    sceneId,
    sceneName: scene.name,
    chapterId: ch.id,
    model: getAIGCModel(),
    phases,
  });

  const nextFw: StoryFramework = {
    ...fw,
    scenes: (fw.scenes ?? []).map((s) => (s.id === sceneId ? updatedScene : s)),
  };

  return {scene: updatedScene, fw: nextFw};
}
