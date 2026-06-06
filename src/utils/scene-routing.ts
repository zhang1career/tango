/**
 * 场景在章节内的主线/支线路由（与 FrameworkToStory 编译规则一致，供编辑器展示）
 */

import type {StoryFramework} from '../schema/story-framework';
import type {GameScene, SceneBranchOption} from '../schema/game-scene';
import {computeCrossChapterExit, type CrossChapterExit} from './scene-passage-links';

export interface BranchOwnerInfo {
  rootSceneId: string;
  rootSceneName: string;
  optionId: string;
}

export interface SceneChapterContext {
  chapterIndex: number;
  chapterId: string;
  chapterTitle: string;
  sceneIdsInChapter: string[];
  mainlineSceneIds: string[];
  branchOwnerBySceneId: Map<string, BranchOwnerInfo>;
}

export interface BranchOptionView {
  option: SceneBranchOption;
  targetScenes: Array<{sceneId: string; name: string}>;
  returnLabel: string;
  returnTargetName: string;
}

export interface SceneRoutingView {
  inChapter: boolean;
  chapterTitle?: string;
  chapterIndex?: number;
  isBranchScene: boolean;
  branchOwner?: BranchOwnerInfo;
  mainlinePosition?: {index: number; total: number};
  nextMainline?: {sceneId: string; name: string};
  hasNextMainline: boolean;
  crossChapterExit?: CrossChapterExit;
  branchOptionViews: BranchOptionView[];
}

export type {CrossChapterExit};

function buildBranchOwnersForChapter(
  entries: Array<{sceneId: string}>,
  sceneMap: Map<string, GameScene>
): Map<string, BranchOwnerInfo> {
  const owners = new Map<string, BranchOwnerInfo>();
  for (const entry of entries) {
    const rootScene = sceneMap.get(entry.sceneId);
    if (!rootScene) continue;
    for (const option of (rootScene.branchOptions ?? []).filter(Boolean)) {
      const optionId = option.id?.trim() || 'branch';
      for (const branchId of (option.branchSceneIds ?? []).map((id) => id?.trim()).filter(Boolean)) {
        owners.set(branchId, {
          rootSceneId: rootScene.id,
          rootSceneName: rootScene.name,
          optionId,
        });
      }
    }
  }
  return owners;
}

/** 按 sceneId 索引其所在章节的编译期路由上下文 */
export function buildSceneChapterContextIndex(fw: StoryFramework): Map<string, SceneChapterContext> {
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const bySceneId = new Map<string, SceneChapterContext>();

  for (let ci = 0; ci < (fw.chapters ?? []).length; ci++) {
    const ch = fw.chapters[ci];
    const entries = ch.sceneEntries ?? [];
    const sceneIdsInChapter = entries.map((e) => e.sceneId).filter((id) => sceneMap.has(id));
    const branchOwnerBySceneId = buildBranchOwnersForChapter(entries, sceneMap);
    const mainlineSceneIds = sceneIdsInChapter.filter((id) => !branchOwnerBySceneId.has(id));
    const ctx: SceneChapterContext = {
      chapterIndex: ci,
      chapterId: ch.id,
      chapterTitle: ch.title,
      sceneIdsInChapter,
      mainlineSceneIds,
      branchOwnerBySceneId,
    };
    for (const sid of sceneIdsInChapter) {
      bySceneId.set(sid, ctx);
    }
  }
  return bySceneId;
}

export function getSceneRoutingView(
  fw: StoryFramework | undefined,
  scene: GameScene
): SceneRoutingView {
  const empty: SceneRoutingView = {
    inChapter: false,
    isBranchScene: false,
    hasNextMainline: false,
    branchOptionViews: [],
  };
  if (!fw) return empty;

  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const ctx = buildSceneChapterContextIndex(fw).get(scene.id);
  if (!ctx) return empty;

  const branchOwner = ctx.branchOwnerBySceneId.get(scene.id);
  const isBranchScene = !!branchOwner;
  const mainlineIdx = ctx.mainlineSceneIds.indexOf(scene.id);
  const hasNextMainline = !isBranchScene && mainlineIdx >= 0 && mainlineIdx < ctx.mainlineSceneIds.length - 1;
  const nextId = hasNextMainline ? ctx.mainlineSceneIds[mainlineIdx + 1] : undefined;
  const nextScene = nextId ? sceneMap.get(nextId) : undefined;

  const branchOptionViews: BranchOptionView[] = (scene.branchOptions ?? [])
    .filter(Boolean)
    .map((option) => {
      const targetScenes = (option.branchSceneIds ?? [])
        .map((id) => {
          const s = sceneMap.get(id?.trim() ?? '');
          return s ? {sceneId: s.id, name: s.name} : {sceneId: id, name: id};
        })
        .filter((t) => t.sceneId);
      const rootName = scene.name;
      return {
        option,
        targetScenes,
        returnLabel: option.returnDisplayText?.trim() || '返回主线',
        returnTargetName: rootName,
      };
    });

  let crossChapterExit: CrossChapterExit | undefined;
  if (!isBranchScene && !hasNextMainline) {
    try {
      crossChapterExit = computeCrossChapterExit(fw, ctx.chapterIndex, scene.id);
    } catch {
      crossChapterExit = undefined;
    }
  }

  return {
    inChapter: true,
    chapterTitle: ctx.chapterTitle,
    chapterIndex: ctx.chapterIndex,
    isBranchScene,
    branchOwner,
    mainlinePosition:
      !isBranchScene && mainlineIdx >= 0
        ? {index: mainlineIdx + 1, total: ctx.mainlineSceneIds.length}
        : undefined,
    nextMainline: nextScene ? {sceneId: nextScene.id, name: nextScene.name} : undefined,
    hasNextMainline,
    crossChapterExit,
    branchOptionViews,
  };
}
