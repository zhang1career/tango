import {getPassagePageCharsMin, getPassagePageCharsMax} from '@/config';
import {saveStoryScenes} from './story-scenes-persist';
import {frameworkToStory, parseTwee, syncStoryTitleFromFramework} from '@/engine';
import type {StoryFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {ensureSceneAiBlocksGenerated, runAssembleScene} from './scene-block-generation';
import {patchCompiledAndRoutingFingerprints, scenePassagePid} from '../utils/chapter-compile-helpers';
import {getScenePassageBlocks} from '../utils/passage-blocks';
import {applyScenePassageFullText} from '../utils/scene-passage-text';
import {lookupKeysForSceneEntry} from './scene-routing-sync-service';
import {sceneIsFailure} from '../utils/branch-model';
import {
  resolveSceneBackgroundMusic,
  resolvedSceneImagesArray,
} from '../utils/scene-media';

function sceneAuthoritativeMetadata(scene: GameScene, fw: StoryFramework, chapterIndex: number): Record<string, unknown> {
  const hasFailureScene = sceneIsFailure(scene);
  const mediaOpts = {useFailurePreset: hasFailureScene};
  const m: Record<string, unknown> = {sceneId: scene.id};
  if (scene.characterIds?.length) m.characterIds = scene.characterIds;
  const bgm = resolveSceneBackgroundMusic(scene, fw.features, mediaOpts);
  if (bgm) m.backgroundMusic = bgm;
  const imgs = resolvedSceneImagesArray(scene, fw.features, mediaOpts);
  if (imgs) m.images = imgs;
  if (hasFailureScene) m.branchTerminal = true;
  return m;
}

export async function compileChapterScene(
  fw: StoryFramework,
  story: ReturnType<typeof parseTwee>,
  chapterIndex: number,
  sceneId: string,
  gameId: string
): Promise<{fw: StoryFramework; story: ReturnType<typeof parseTwee>; generatedCount: number}> {
  const scene = (fw.scenes ?? []).find((s) => s.id === sceneId);
  const ch = fw.chapters[chapterIndex];
  if (!scene || !ch) throw new Error(`未找到场景 ${sceneId}`);

  const ensured = await ensureSceneAiBlocksGenerated(gameId, fw, scene, {regenerateAll: true});
  const pid = scenePassagePid(ensured.fw, chapterIndex, sceneId);
  const {passageText} = await runAssembleScene(gameId, ensured.scene, ch.id);
  const fullStory = frameworkToStory(ensured.fw);
  const template = fullStory.passages.get(pid);
  if (!template) throw new Error(`未找到 passage 模板: ${pid}`);

  const meta = {
    ...sceneAuthoritativeMetadata(ensured.scene, ensured.fw, chapterIndex),
    ...(template.metadata ?? {}),
  };
  const lookupKeys = lookupKeysForSceneEntry(ensured.fw, chapterIndex, sceneId);
  applyScenePassageFullText(story, {
    sceneId,
    paginationBaseId: pid,
    lookupKeys,
    rootPassage: {
      ...template,
      name: template.name ?? ensured.scene.name ?? pid,
      metadata: Object.keys(meta).length ? meta : undefined,
    },
    fullText: passageText,
    minChars: getPassagePageCharsMin(),
    maxChars: getPassagePageCharsMax(),
  });

  story.metadata = {...(story.metadata ?? {}), ...(fullStory.metadata ?? {})};
  syncStoryTitleFromFramework(story, ensured.fw);

  const nextFw = patchCompiledAndRoutingFingerprints(
    ensured.fw,
    chapterIndex,
    sceneId,
    story,
    lookupKeys
  );
  const scenes = nextFw.scenes;
  if (!scenes?.length) throw new Error('场景列表为空，无法保存 story-scenes');
  const saved = await saveStoryScenes(gameId, scenes);
  if (!saved.ok) throw new Error(saved.error || '保存 story-scenes.json 失败');
  return {fw: nextFw, story, generatedCount: ensured.generatedCount};
}

export function sceneContextSummary(scene: GameScene): string {
  return getScenePassageBlocks(scene)
    .map((b) => (b.type === 'raw' ? b.text : b.summary))
    .filter(Boolean)
    .join('\n\n');
}
