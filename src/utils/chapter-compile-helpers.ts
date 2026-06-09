/**
 * 场景汇编指纹与 story.tw 正文写入（剧情/章节页共用）
 */

import type {StoryFramework, FrameworkChapter} from '../schema/story-framework';
import {toPassageId} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {getChapterAvailableSceneIds, getChapterSceneMeta, patchChapterSceneMeta} from './chapter-scene';
import {getChapterSceneRoutingFingerprint} from './scene-routing-sync';
import {getScenePassageBlocks} from './passage-blocks';

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function chapterSceneRefKey(chapterIndex: number, sceneId: string): string {
  return `${chapterIndex}:${sceneId}`;
}

export function getSceneCompileFingerprint(
  fw: StoryFramework,
  ch: FrameworkChapter,
  chapterIndex: number,
  sceneId: string,
  sceneMap: Map<string, GameScene>
): string | null {
  const scene = sceneMap.get(sceneId);
  if (!scene) return null;
  return hashString(
    JSON.stringify({
      title: fw.title,
      background: fw.background ?? '',
      rules: fw.rules ?? [],
      chapter: {
        id: ch.id,
        title: ch.title,
        theme: ch.theme ?? '',
      },
      scene: {
        id: scene.id,
        name: scene.name,
        passageBlocks: getScenePassageBlocks(scene),
        mapNodeId: scene.mapNodeId ?? '',
        characterIds: scene.characterIds ?? [],
        counterpartCharacterIds: scene.counterpartCharacterIds ?? [],
        characterOverrides: scene.characterOverrides ?? {},
        eventIds: scene.eventIds ?? [],
        openingAnimation: scene.openingAnimation ?? '',
        backgroundMusic: scene.backgroundMusic ?? '',
        images: scene.images ?? [],
      },
      sceneId,
      chapterIndex,
    })
  );
}

export function collectSceneFingerprintMap(fw: StoryFramework): Map<string, string> {
  const map = new Map<string, string>();
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  for (let chi = 0; chi < fw.chapters.length; chi++) {
    const ch = fw.chapters[chi];
    for (const sceneId of getChapterAvailableSceneIds(ch)) {
      const fp = getSceneCompileFingerprint(fw, ch, chi, sceneId, sceneMap);
      if (fp) map.set(chapterSceneRefKey(chi, sceneId), fp);
    }
  }
  return map;
}

export type SceneCompileTarget = {chapterIndex: number; sceneId: string};

export function collectChangedSceneTargets(
  newFw: StoryFramework,
  oldFingerprintMap: Map<string, string>
): SceneCompileTarget[] {
  const targets: SceneCompileTarget[] = [];
  const sceneMap = new Map((newFw.scenes ?? []).map((s) => [s.id, s]));
  for (let chi = 0; chi < newFw.chapters.length; chi++) {
    const ch = newFw.chapters[chi];
    for (const sceneId of getChapterAvailableSceneIds(ch)) {
      const fp = getSceneCompileFingerprint(newFw, ch, chi, sceneId, sceneMap);
      if (!fp || oldFingerprintMap.get(chapterSceneRefKey(chi, sceneId)) === fp) continue;
      targets.push({chapterIndex: chi, sceneId});
    }
  }
  return targets;
}

export function patchSceneCompileMeta(
  fw: StoryFramework,
  chapterIndex: number,
  sceneId: string,
  patch: {compiledFingerprint?: string; routingFingerprint?: string}
): StoryFramework {
  return {
    ...fw,
    chapters: fw.chapters.map((ch, chi) =>
      chi === chapterIndex ? patchChapterSceneMeta(ch, sceneId, patch) : ch
    ),
  };
}

export function collectStaleCompiledScenes(fw: StoryFramework): Array<{
  chapterTitle: string;
  sceneName: string;
  sceneId: string;
}> {
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const stale: Array<{chapterTitle: string; sceneName: string; sceneId: string}> = [];
  for (let chi = 0; chi < fw.chapters.length; chi++) {
    const ch = fw.chapters[chi];
    for (const sceneId of getChapterAvailableSceneIds(ch)) {
      const fp = getSceneCompileFingerprint(fw, ch, chi, sceneId, sceneMap);
      const stored = getChapterSceneMeta(ch, sceneId)?.compiledFingerprint;
      if (fp && stored !== fp) {
        stale.push({
          chapterTitle: ch.title || ch.id,
          sceneName: sceneMap.get(sceneId)?.name ?? sceneId,
          sceneId,
        });
      }
    }
  }
  return stale;
}

export function patchCompiledAndRoutingFingerprints(
  fw: StoryFramework,
  chapterIndex: number,
  sceneId: string
): StoryFramework {
  const ch = fw.chapters[chapterIndex];
  if (!ch) return fw;
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const compiledFp = getSceneCompileFingerprint(fw, ch, chapterIndex, sceneId, sceneMap);
  const routingFp = getChapterSceneRoutingFingerprint(fw, ch, chapterIndex, sceneId, sceneMap);
  return patchSceneCompileMeta(fw, chapterIndex, sceneId, {
    compiledFingerprint: compiledFp ?? undefined,
    routingFingerprint: routingFp ?? undefined,
  });
}

export function scenePassagePid(fw: StoryFramework, chapterIndex: number, sceneId: string): string {
  return toPassageId(chapterIndex, sceneId);
}
