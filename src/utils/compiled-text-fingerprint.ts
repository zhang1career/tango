/**
 * story.tw 场景成稿正文指纹（合并多页后的全文 hash）
 */

import type {Story} from '@/types';
import type {StoryFramework} from '../schema/story-framework';
import {getChapterSceneMeta} from './chapter-scene';
import {collectSceneFullText} from './scene-passage-text';

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashScenePassageFullText(fullText: string): string {
  return hashString(fullText);
}

function passagePid(chapterIndex: number, sceneId: string): string {
  return `ch${chapterIndex}.${sceneId}`.trim().replace(/\s+/g, '_');
}

export function readScenePassageFullText(
  story: Story,
  sceneId: string,
  chapterIndex: number,
  lookupKeys: string[] = []
): string {
  return collectSceneFullText(story, sceneId, passagePid(chapterIndex, sceneId), lookupKeys);
}

export function scenePassageTextManuallyEdited(
  fw: StoryFramework,
  story: Story,
  chapterIndex: number,
  sceneId: string,
  lookupKeys: string[] = []
): boolean {
  const stored = getChapterSceneMeta(fw.chapters[chapterIndex]!, sceneId)?.compiledTextFingerprint;
  if (!stored) return false;
  const live = hashScenePassageFullText(
    readScenePassageFullText(story, sceneId, chapterIndex, lookupKeys)
  );
  return live !== stored;
}

export type ScenePassageEditTarget = {
  chapterIndex: number;
  sceneId: string;
  sceneName: string;
};

export function collectManuallyEditedPassageTargets(
  fw: StoryFramework,
  story: Story,
  targets: Array<{chapterIndex: number; sceneId: string}>,
  lookupKeysForScene: (chapterIndex: number, sceneId: string) => string[]
): ScenePassageEditTarget[] {
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const edited: ScenePassageEditTarget[] = [];
  for (const t of targets) {
    if (!scenePassageTextManuallyEdited(fw, story, t.chapterIndex, t.sceneId, lookupKeysForScene(t.chapterIndex, t.sceneId))) {
      continue;
    }
    edited.push({
      chapterIndex: t.chapterIndex,
      sceneId: t.sceneId,
      sceneName: sceneMap.get(t.sceneId)?.name ?? t.sceneId,
    });
  }
  return edited;
}

export const COMPILE_OVERWRITE_CONFIRM =
  'story.tw 中该场景正文与上次汇编结果不一致，可能有人工修改。继续汇编将覆盖当前正文。';

export function compileOverwriteConfirmMessage(sceneNames: string[]): string {
  if (sceneNames.length === 1) return COMPILE_OVERWRITE_CONFIRM;
  return (
    `以下 ${sceneNames.length} 个场景 story.tw 正文与上次汇编结果不一致，可能有人工修改：\n` +
    sceneNames.map((n) => `· ${n}`).join('\n') +
    '\n\n继续汇编将覆盖这些场景的正文。'
  );
}
