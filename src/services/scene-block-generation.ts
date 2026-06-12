import {
  assembleScenePassage,
  buildChapterContext,
  generatePassageBlock,
  loadGenerationBundle,
  loadTextPolicy,
  requireAigcConfig,
} from '@/engine/story-generation';
import type {StoryFramework} from '@/schema/story-framework';
import type {GameScene} from '@/schema/game-scene';
import {
  appendGenerationTrace,
  fetchStoryCanon,
  fetchStoryForeshadowing,
  fetchStoryOutline,
  saveStoryCanon,
  saveStoryForeshadowing,
} from '@/utils/story-engine-files';
import {getScenePassageBlocks, passageBlockIndexToAiIndex, upsertAiBlock} from '@/utils/passage-blocks';
import {getAIGCModel} from '@/config';
import type {GenerationTraceEntry} from '@/schema/story-generation-traces';

export async function runGenerateAiBlock(
  gameId: string,
  fw: StoryFramework,
  scene: GameScene,
  passageBlockIndex: number
): Promise<{scene: GameScene; traceId: string}> {
  requireAigcConfig();
  const blocks = getScenePassageBlocks(scene);
  const block = blocks[passageBlockIndex];
  if (!block || block.type !== 'ai') throw new Error('请选择 AI 块');
  const aiIndex = passageBlockIndexToAiIndex(blocks, passageBlockIndex);
  if (aiIndex == null) throw new Error('无效的 AI 块索引');

  const chapter =
    buildChapterContext(fw, scene.id) ?? {
      chapterId: '_unassigned',
      chapterTitle: '（未编入章节）',
      chapterTheme: '',
      chapterIndex: 0,
      sceneIndex: 0,
    };

  const bundle = await loadGenerationBundle(fw, gameId, {
    outline: () => fetchStoryOutline(gameId),
    foreshadowing: () => fetchStoryForeshadowing(gameId),
    canon: () => fetchStoryCanon(gameId),
    policy: () => loadTextPolicy(),
  });

  const result = await generatePassageBlock({
    bundle,
    scene,
    chapter,
    aiBlock: block,
    aiBlockIndex: aiIndex,
    passageBlockIndex,
  });

  const updatedScene = upsertAiBlock(scene, aiIndex, (b) => ({
    ...b,
    generatedText: result.generatedText,
  }));

  await saveStoryCanon(gameId, result.canon);
  await saveStoryForeshadowing(gameId, result.foreshadowing);

  const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: GenerationTraceEntry = {
    id: traceId,
    at: new Date().toISOString(),
    kind: 'generate_block',
    sceneId: scene.id,
    sceneName: scene.name,
    chapterId: chapter.chapterId,
    blockIndex: aiIndex,
    model: getAIGCModel(),
    phases: result.phases,
  };
  await appendGenerationTrace(gameId, entry);

  return {scene: updatedScene, traceId};
}

function patchSceneInFramework(fw: StoryFramework, scene: GameScene): StoryFramework {
  return {
    ...fw,
    scenes: (fw.scenes ?? []).map((s) => (s.id === scene.id ? scene : s)),
  };
}

/** 汇编前生成 AI 块 generatedText（按 passageBlocks 顺序逐块串行生成） */
export async function ensureSceneAiBlocksGenerated(
  gameId: string,
  fw: StoryFramework,
  scene: GameScene,
  options?: {regenerateAll?: boolean}
): Promise<{fw: StoryFramework; scene: GameScene; generatedCount: number}> {
  const regenerateAll = options?.regenerateAll ?? false;
  let currentScene = scene;
  let currentFw = fw;
  let generatedCount = 0;

  for (let passageBlockIndex = 0; ; passageBlockIndex++) {
    const blocks = getScenePassageBlocks(currentScene);
    if (passageBlockIndex >= blocks.length) break;
    const block = blocks[passageBlockIndex];
    if (block.type !== 'ai') continue;
    if (!regenerateAll && block.generatedText?.trim()) continue;
    if (!block.summary?.trim()) {
      throw new Error('AI 块缺少 summary，无法自动生成正文（请在「场景」页填写后再汇编）');
    }
    const {scene: nextScene} = await runGenerateAiBlock(
      gameId,
      currentFw,
      currentScene,
      passageBlockIndex
    );
    currentScene = nextScene;
    currentFw = patchSceneInFramework(currentFw, currentScene);
    generatedCount++;
  }

  return {fw: currentFw, scene: currentScene, generatedCount};
}

export async function runAssembleScene(
  gameId: string,
  scene: GameScene,
  chapterId?: string
): Promise<{passageText: string; traceId: string}> {
  requireAigcConfig();
  const {passageText, phases} = await assembleScenePassage(scene);
  const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await appendGenerationTrace(gameId, {
    id: traceId,
    at: new Date().toISOString(),
    kind: 'assemble_scene',
    sceneId: scene.id,
    sceneName: scene.name,
    chapterId,
    model: getAIGCModel(),
    phases,
  });
  return {passageText, traceId};
}
