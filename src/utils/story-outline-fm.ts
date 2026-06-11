/**
 * 叙事进度 ↔ story-fm（锚点、窗口、生成上下文）
 */

import type {FrameworkChapter, StoryFramework} from '@/schema/story-framework';
import type {GameScene} from '@/schema/game-scene';
import type {StoryOutline} from '@/schema/story-outline';
import {getChapterAvailableSceneIds} from '@/utils/chapter-scene';
import {getAiBlocks} from '@/utils/passage-blocks';

export type OutlineChapterZone = 'archived' | 'active' | 'stub';

export interface RollingWindowSplit {
  anchorIndex: number;
  anchorChapterId: string;
  archived: Array<{chapter: FrameworkChapter; index: number}>;
  active: Array<{chapter: FrameworkChapter; index: number}>;
  stub: Array<{chapter: FrameworkChapter; index: number}>;
}

export function getChapterNarrativeTask(ch: FrameworkChapter, sceneId: string): string {
  return ch.narrativeTasks?.[sceneId]?.trim() ?? '';
}

export function findFmChapter(
  fw: StoryFramework | null,
  chapterId: string
): FrameworkChapter | undefined {
  return fw?.chapters?.find((c) => c.id === chapterId);
}

export function getAnchorChapterIndex(fw: StoryFramework, outline: StoryOutline): number {
  const id = outline.progressAnchorChapterId;
  if (!id) return 0;
  const idx = (fw.chapters ?? []).findIndex((c) => c.id === id);
  return idx >= 0 ? idx : 0;
}

export function getChapterZone(
  fw: StoryFramework,
  outline: StoryOutline,
  chapterIndex: number
): OutlineChapterZone {
  const anchorIdx = getAnchorChapterIndex(fw, outline);
  const horizon = outline.rollingHorizonChapters;
  if (chapterIndex < anchorIdx) return 'archived';
  if (chapterIndex < anchorIdx + horizon) return 'active';
  return 'stub';
}

export function isChapterMarkedArchived(outline: StoryOutline, chapterId: string): boolean {
  return (outline.archivedChapterIds ?? []).includes(chapterId);
}

export function splitOutlineByRollingWindow(
  fw: StoryFramework,
  outline: StoryOutline
): RollingWindowSplit {
  const anchorIndex = getAnchorChapterIndex(fw, outline);
  const anchorChapterId = fw.chapters?.[anchorIndex]?.id ?? outline.progressAnchorChapterId ?? '';
  const archived: RollingWindowSplit['archived'] = [];
  const active: RollingWindowSplit['active'] = [];
  const stub: RollingWindowSplit['stub'] = [];

  (fw.chapters ?? []).forEach((chapter, index) => {
    const zone = getChapterZone(fw, outline, index);
    const entry = {chapter, index};
    if (zone === 'archived') archived.push(entry);
    else if (zone === 'active') active.push(entry);
    else stub.push(entry);
  });

  return {anchorIndex, anchorChapterId, archived, active, stub};
}

/** 从场景正文推断：按章序+场景池序，最后一个含 generatedText 的 AI 块所在章 */
export function inferProgressAnchorFromScenes(
  fw: StoryFramework,
  scenes: GameScene[]
): string | undefined {
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  let lastChapterId: string | undefined;

  for (const ch of fw.chapters ?? []) {
    for (const sid of getChapterAvailableSceneIds(ch)) {
      const scene = sceneMap.get(sid);
      if (!scene) continue;
      const hasGenerated = getAiBlocks(scene).some((b) => b.generatedText?.trim());
      if (hasGenerated) lastChapterId = ch.id;
    }
  }

  return lastChapterId;
}

/** 锚点之前章节的 id 列表（与锚点索引对齐，不含锚点本身） */
export function archivedChapterIdsBeforeAnchor(
  fw: StoryFramework,
  anchorIndex: number
): string[] {
  return (fw.chapters ?? []).slice(0, anchorIndex).map((c) => c.id);
}

export function applyProgressAnchor(
  fw: StoryFramework,
  outline: StoryOutline,
  newAnchorChapterId: string,
  options?: {archiveSkipped?: boolean}
): StoryOutline {
  const chapters = fw.chapters ?? [];
  const newIdx = chapters.findIndex((c) => c.id === newAnchorChapterId);
  if (newIdx < 0) return outline;

  const oldIdx = getAnchorChapterIndex(fw, outline);
  let archivedChapterIds: string[];

  if (newIdx > oldIdx && options?.archiveSkipped) {
    // 前移锚点但用户选择不归档跳过的章：保留既有归档，仅去掉锚点及之后的章
    archivedChapterIds = (outline.archivedChapterIds ?? []).filter((id) => {
      const idx = chapters.findIndex((c) => c.id === id);
      return idx >= 0 && idx < newIdx;
    });
  } else {
    // 对齐规则：严格位于新锚点之前的章为已归档（回退锚点时复位锚点及之后章的归档状态）
    archivedChapterIds = archivedChapterIdsBeforeAnchor(fw, newIdx);
  }

  return {
    ...outline,
    progressAnchorChapterId: newAnchorChapterId,
    archivedChapterIds: archivedChapterIds.length ? archivedChapterIds : undefined,
  };
}

export function ensureOutlineProgress(
  outline: StoryOutline,
  fw: StoryFramework,
  scenes?: GameScene[]
): StoryOutline {
  const fmIds = new Set((fw.chapters ?? []).map((c) => c.id));
  let next: StoryOutline = {
    ...outline,
    archivedChapterIds: (outline.archivedChapterIds ?? []).filter((id) => fmIds.has(id)),
  };
  if (!next.progressAnchorChapterId || !fmIds.has(next.progressAnchorChapterId)) {
    next = {...next, progressAnchorChapterId: fw.chapters?.[0]?.id};
  }
  if (!next.progressAnchorChapterId && scenes?.length) {
    const inferred = inferProgressAnchorFromScenes(fw, scenes);
    if (inferred) next = {...next, progressAnchorChapterId: inferred};
  }
  return next;
}

/** Step 3 生成上下文：当前章 narrativeGoal/theme + 窗口内后续章粗纲（不含场景任务正文） */
export function buildRollingOutlineGenerationContext(
  fw: StoryFramework,
  outline: StoryOutline,
  currentChapterId: string
): Record<string, unknown> {
  const anchorIdx = getAnchorChapterIndex(fw, outline);
  const horizon = outline.rollingHorizonChapters;
  const windowEnd = anchorIdx + horizon;
  const currentIdx = (fw.chapters ?? []).findIndex((c) => c.id === currentChapterId);
  const currentChapter = fw.chapters[currentIdx];

  const currentChapterCtx =
    currentChapter && currentIdx >= 0
      ? {
          chapterId: currentChapter.id,
          title: currentChapter.title,
          narrativeGoal: currentChapter.narrativeGoal ?? '',
          theme: currentChapter.theme,
          ...(currentIdx >= anchorIdx && currentIdx < windowEnd
            ? {}
            : {note: '当前章在滚动窗口外，仅注入本章约束'}),
        }
      : null;

  const upcomingInWindow: Array<{
    chapterId: string;
    title: string;
    narrativeGoal: string;
    theme?: string;
  }> = [];

  for (let i = Math.max(anchorIdx, currentIdx + 1); i < windowEnd && i < (fw.chapters ?? []).length; i++) {
    const fmCh = fw.chapters[i];
    upcomingInWindow.push({
      chapterId: fmCh.id,
      title: fmCh.title,
      narrativeGoal: fmCh.narrativeGoal ?? '',
      theme: fmCh.theme,
    });
  }

  return {
    progressAnchorChapterId: outline.progressAnchorChapterId,
    rollingHorizonChapters: horizon,
    currentChapter: currentChapterCtx,
    upcomingInWindow: upcomingInWindow.length ? upcomingInWindow : undefined,
  };
}

/** 同章其它场景任务（Step 2 参照，非硬约束） */
export function listPeerNarrativeTasks(
  ch: FrameworkChapter,
  excludeSceneId: string
): Array<{sceneId: string; task: string}> {
  return getChapterAvailableSceneIds(ch)
    .filter((sid) => sid !== excludeSceneId)
    .map((sid) => ({sceneId: sid, task: getChapterNarrativeTask(ch, sid)}))
    .filter((e) => e.task);
}
