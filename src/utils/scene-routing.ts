/**
 * 场景在章节内的路由视图（供编辑器展示）
 */

import type {StoryFramework} from '../schema/story-framework';
import type {ChapterNarrativeEdge, ChapterTransition} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {getChapterAvailableSceneIds, inferChapterEndSceneIds, isNarrativeGraph} from './chapter-scene';
import {computeScenePassageLinks} from './scene-passage-links';

export interface NarrativeEdgeView {
  edge: ChapterNarrativeEdge;
  targetName: string;
}

export interface TransitionView {
  transition: ChapterTransition;
  targetChapterTitle: string;
  targetSceneName: string;
}

export interface SceneRoutingView {
  inChapter: boolean;
  chapterTitle?: string;
  chapterIndex?: number;
  chapterId?: string;
  narrativeGraph?: boolean;
  narrativeOutEdges: NarrativeEdgeView[];
  narrativeInEdges: NarrativeEdgeView[];
  transitions: TransitionView[];
  isEndScene: boolean;
  expectedLinkCount: number;
}

export function getSceneRoutingView(fw: StoryFramework | undefined, scene: GameScene): SceneRoutingView {
  const empty: SceneRoutingView = {
    inChapter: false,
    narrativeOutEdges: [],
    narrativeInEdges: [],
    transitions: [],
    isEndScene: false,
    expectedLinkCount: 0,
  };
  if (!fw) return empty;

  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));

  for (let ci = 0; ci < (fw.chapters ?? []).length; ci++) {
    const ch = fw.chapters[ci];
    const pool = getChapterAvailableSceneIds(ch);
    if (!pool.includes(scene.id)) continue;

    const narrativeOutEdges = (ch.narrativeEdges ?? [])
      .filter((e) => e.fromSceneId === scene.id)
      .map((edge) => ({
        edge,
        targetName: sceneMap.get(edge.toSceneId)?.name ?? edge.toSceneId,
      }));

    const narrativeInEdges = (ch.narrativeEdges ?? [])
      .filter((e) => e.toSceneId === scene.id)
      .map((edge) => ({
        edge,
        targetName: sceneMap.get(edge.fromSceneId)?.name ?? edge.fromSceneId,
      }));

    const transitions = (ch.transitions ?? [])
      .filter((t) => t.fromSceneId === scene.id)
      .map((transition) => {
        const targetCh = fw.chapters.find((c) => c.id === transition.toChapterId);
        return {
          transition,
          targetChapterTitle: targetCh?.title ?? transition.toChapterId,
          targetSceneName: targetCh?.startSceneId
            ? (sceneMap.get(targetCh.startSceneId)?.name ?? targetCh.startSceneId)
            : '（未配置叙事入口）',
        };
      });

    let expectedLinkCount = 0;
    try {
      expectedLinkCount = computeScenePassageLinks(fw, ci, scene.id).length;
    } catch {
      expectedLinkCount = 0;
    }

    return {
      inChapter: true,
      chapterTitle: ch.title,
      chapterIndex: ci,
      chapterId: ch.id,
      narrativeGraph: isNarrativeGraph(ch, scene.id),
      narrativeOutEdges,
      narrativeInEdges,
      transitions,
      isEndScene: inferChapterEndSceneIds(ch).includes(scene.id),
      expectedLinkCount,
    };
  }

  return empty;
}
