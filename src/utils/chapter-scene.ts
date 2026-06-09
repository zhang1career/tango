/**
 * 章节内场景引用辅助（池子、指纹、绑定）
 */

import type {FrameworkChapter, StoryFramework} from '../schema/story-framework';
import type {SceneRuleBinding} from '../schema/story-rules-bundle';
import {edgeIsBranch} from './branch-model';

export interface ChapterSceneMeta {
  compiledFingerprint?: string;
  routingFingerprint?: string;
  /** story.tw 合并正文指纹（汇编或手工编辑后更新） */
  compiledTextFingerprint?: string;
}

export function chapterSceneKey(chapterIndex: number, sceneId: string): string {
  return `${chapterIndex}::${sceneId}`;
}

export function getChapterAvailableSceneIds(ch: FrameworkChapter): string[] {
  if (ch.availableSceneIds?.length) return ch.availableSceneIds;
  const legacy = ch.sceneEntries ?? [];
  return legacy.map((e) => e.sceneId);
}

/** 是否开放世界：勾选=是；narrativeGraph 为 true 表示否（叙事图） */
export function isNarrativeGraph(ch: FrameworkChapter, sceneId: string): boolean {
  if (ch.narrativeGraph?.[sceneId] === true) return true;
  if (ch.openWorld && sceneId in ch.openWorld) return ch.openWorld[sceneId] !== true;
  if (ch.narrativeRouting?.[sceneId] === true) return true;
  if (ch.sceneModes?.[sceneId] === 'narrative') return true;
  return false;
}

export function isNarrativeRouting(ch: FrameworkChapter, sceneId: string): boolean {
  return isNarrativeGraph(ch, sceneId);
}

/**
 * 推断章末场景：无叙事出边；或仅有支线出边且为本章叙事入口（支线枢纽）。
 */
export function inferChapterEndSceneIds(ch: FrameworkChapter): string[] {
  const pool = getChapterAvailableSceneIds(ch);
  const edges = ch.narrativeEdges ?? [];
  const outgoingByScene = new Map<string, typeof edges>();
  for (const e of edges) {
    const list = outgoingByScene.get(e.fromSceneId) ?? [];
    list.push(e);
    outgoingByScene.set(e.fromSceneId, list);
  }

  const ends: string[] = [];
  for (const sid of pool) {
    const out = outgoingByScene.get(sid) ?? [];
    if (out.length === 0) {
      ends.push(sid);
      continue;
    }
    if (sid === ch.startSceneId && out.every((e) => edgeIsBranch(e))) {
      ends.push(sid);
    }
  }
  return ends;
}

export function getSceneBindings(
  bindings: SceneRuleBinding[] | undefined,
  chapterId: string,
  sceneId: string
): string[] {
  return bindings?.find((b) => b.chapterId === chapterId && b.sceneId === sceneId)?.ruleIds ?? [];
}

export function findChapterSceneIndices(
  fw: StoryFramework,
  sceneId: string
): Array<{chapterIndex: number; sceneId: string}> {
  const out: Array<{chapterIndex: number; sceneId: string}> = [];
  for (let ci = 0; ci < (fw.chapters ?? []).length; ci++) {
    const ids = getChapterAvailableSceneIds(fw.chapters[ci]);
    if (ids.includes(sceneId)) out.push({chapterIndex: ci, sceneId});
  }
  return out;
}

export function getChapterSceneMeta(
  ch: FrameworkChapter,
  sceneId: string
): ChapterSceneMeta | undefined {
  return ch.sceneMeta?.[sceneId];
}

export function patchChapterSceneMeta(
  ch: FrameworkChapter,
  sceneId: string,
  patch: Partial<ChapterSceneMeta>
): FrameworkChapter {
  const prev = ch.sceneMeta?.[sceneId] ?? {};
  return {
    ...ch,
    sceneMeta: {
      ...(ch.sceneMeta ?? {}),
      [sceneId]: {...prev, ...patch},
    },
  };
}
