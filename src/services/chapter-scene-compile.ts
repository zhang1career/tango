import {getAIGCApiKey, getGameContentUrl, getPassagePageCharsMin, getPassagePageCharsMax} from '@/config';
import {frameworkToStory, parseTwee, syncStoryTitleFromFramework} from '@/engine';
import type {StoryFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {runAssembleScene} from './scene-block-generation';
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
): Promise<{fw: StoryFramework; story: ReturnType<typeof parseTwee>}> {
  const scene = (fw.scenes ?? []).find((s) => s.id === sceneId);
  const ch = fw.chapters[chapterIndex];
  if (!scene || !ch) throw new Error(`未找到场景 ${sceneId}`);

  const pid = scenePassagePid(fw, chapterIndex, sceneId);
  const {passageText} = await runAssembleScene(gameId, scene, ch.id);
  const fullStory = frameworkToStory(fw);
  const template = fullStory.passages.get(pid);
  if (!template) throw new Error(`未找到 passage 模板: ${pid}`);

  const meta = {...sceneAuthoritativeMetadata(scene, fw, chapterIndex), ...(template.metadata ?? {})};
  const lookupKeys = lookupKeysForSceneEntry(fw, chapterIndex, sceneId);
  applyScenePassageFullText(story, {
    sceneId,
    paginationBaseId: pid,
    lookupKeys,
    rootPassage: {
      ...template,
      name: template.name ?? scene.name ?? pid,
      metadata: Object.keys(meta).length ? meta : undefined,
    },
    fullText: passageText,
    minChars: getPassagePageCharsMin(),
    maxChars: getPassagePageCharsMax(),
  });

  story.metadata = {...(story.metadata ?? {}), ...(fullStory.metadata ?? {})};
  syncStoryTitleFromFramework(story, fw);

  const nextFw = patchCompiledAndRoutingFingerprints(fw, chapterIndex, sceneId);
  return {fw: nextFw, story};
}

export function sceneContextSummary(scene: GameScene): string {
  return getScenePassageBlocks(scene)
    .map((b) => (b.type === 'raw' ? b.text : b.summary))
    .filter(Boolean)
    .join('\n\n');
}
