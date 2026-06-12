import {getPassagePageCharsMax, getPassagePageCharsMin} from '@/config';
import {frameworkToStory, parseTwee, syncStoryTitleFromFramework} from '@/engine';
import type {StoryFramework} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {patchCompiledAndRoutingFingerprints, scenePassagePid} from '../utils/chapter-compile-helpers';
import {
  applyManualEditToScene,
  renderManualEditFields,
  type PassageManualEditFields,
} from '../utils/passage-block-segments';
import {applyScenePassageFullText} from '../utils/scene-passage-text';
import {lookupKeysForSceneEntry} from './scene-routing-sync-service';
import {sceneIsFailure} from '../utils/branch-model';
import {
  resolveSceneBackgroundMusic,
  resolvedSceneImagesArray,
} from '../utils/scene-media';

function sceneAuthoritativeMetadata(scene: GameScene, fw: StoryFramework): Record<string, unknown> {
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

/** 汇编后人工审校：写入 story.tw 成稿；若改 RAW 则同步 leading raw，不改 AI 块 generatedText */
export function saveScenePassageManualEdit(
  fw: StoryFramework,
  story: ReturnType<typeof parseTwee>,
  chapterIndex: number,
  sceneId: string,
  fields: PassageManualEditFields
): {fw: StoryFramework; story: ReturnType<typeof parseTwee>} {
  const scene = (fw.scenes ?? []).find((s) => s.id === sceneId);
  const ch = fw.chapters[chapterIndex];
  if (!scene || !ch) throw new Error(`未找到场景 ${sceneId}`);

  const patchedScene = applyManualEditToScene(scene, fields);
  const pid = scenePassagePid(fw, chapterIndex, sceneId);
  const fwWithScene = {
    ...fw,
    scenes: (fw.scenes ?? []).map((s) => (s.id === sceneId ? patchedScene : s)),
  };
  const fullStory = frameworkToStory(fwWithScene);
  const template = fullStory.passages.get(pid);
  if (!template) throw new Error(`未找到 passage 模板: ${pid}`);

  const meta = {...sceneAuthoritativeMetadata(patchedScene, fwWithScene), ...(template.metadata ?? {})};
  const lookupKeys = lookupKeysForSceneEntry(fwWithScene, chapterIndex, sceneId);
  const storedText = renderManualEditFields(fields);
  applyScenePassageFullText(story, {
    sceneId,
    paginationBaseId: pid,
    lookupKeys,
    rootPassage: {
      ...template,
      name: template.name ?? patchedScene.name ?? pid,
      metadata: Object.keys(meta).length ? meta : undefined,
    },
    fullText: storedText,
    minChars: getPassagePageCharsMin(),
    maxChars: getPassagePageCharsMax(),
  });

  story.metadata = {...(story.metadata ?? {}), ...(fullStory.metadata ?? {})};
  syncStoryTitleFromFramework(story, fwWithScene);

  const nextFw = patchCompiledAndRoutingFingerprints(
    fwWithScene,
    chapterIndex,
    sceneId,
    story,
    lookupKeys
  );
  return {fw: nextFw, story};
}
