/**
 * 滚动大纲 ↔ story-fm（锚点、窗口、同步、生成上下文）
 */

import type {FrameworkChapter, StoryFramework} from '@/schema/story-framework';
import type {GameScene} from '@/schema/game-scene';
import type {OutlineBeat, OutlineChapter, StoryOutline} from '@/schema/story-outline';
import {getChapterAvailableSceneIds} from '@/utils/chapter-scene';
import {getAiBlocks} from '@/utils/passage-blocks';

export type OutlineChapterZone = 'archived' | 'active' | 'stub';

export interface RollingWindowSplit {
  anchorIndex: number;
  anchorChapterId: string;
  archived: Array<{chapter: OutlineChapter; index: number}>;
  active: Array<{chapter: OutlineChapter; index: number}>;
  stub: Array<{chapter: OutlineChapter; index: number}>;
}

export function buildOutlineChapterSkeleton(
  ch: FrameworkChapter,
  existing?: OutlineChapter
): OutlineChapter {
  const sceneIds = getChapterAvailableSceneIds(ch);
  let beats: OutlineBeat[];
  if (existing) {
    const covered = new Set(existing.beats.map((b) => b.sceneId).filter(Boolean));
    beats = [...existing.beats];
    for (const sid of sceneIds) {
      if (!covered.has(sid)) {
        beats.push({sceneId: sid, summary: `场景 ${sid}`});
      }
    }
  } else {
    beats = sceneIds.map((sid) => ({sceneId: sid, summary: `场景 ${sid}`}));
  }
  return {
    chapterId: ch.id,
    title: ch.title,
    theme: ch.theme,
    narrativeGoal: existing?.narrativeGoal ?? (ch.theme ? `推进主题：${ch.theme}` : ''),
    beats,
  };
}

/** 按 story-fm 顺序全量同步，保留 narrativeGoal / beats；丢弃不在 fm 中的孤儿项 */
export function mergeOutlineFromFm(outline: StoryOutline, fw: StoryFramework): StoryOutline {
  const existingById = new Map(outline.chapters.map((c) => [c.chapterId, c]));
  const fmChapters = fw.chapters ?? [];
  const chapters = fmChapters.map((ch) => buildOutlineChapterSkeleton(ch, existingById.get(ch.id)));
  const fmIds = new Set(fmChapters.map((c) => c.id));
  const archivedChapterIds = (outline.archivedChapterIds ?? []).filter((id) => fmIds.has(id));
  let progressAnchorChapterId = outline.progressAnchorChapterId;
  if (!progressAnchorChapterId || !fmIds.has(progressAnchorChapterId)) {
    progressAnchorChapterId = fmChapters[0]?.id;
  }
  return {...outline, chapters, archivedChapterIds, progressAnchorChapterId};
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

  (outline.chapters ?? []).forEach((chapter, index) => {
    const zone = getChapterZone(fw, outline, index);
    const entry = {chapter, index};
    if (zone === 'archived') archived.push(entry);
    else if (zone === 'active') active.push(entry);
    else stub.push(entry);
  });

  return {anchorIndex, anchorChapterId, archived, active, stub};
}

export function sceneIdsAvailableForBeat(
  fmChapter: FrameworkChapter | undefined,
  beats: OutlineBeat[],
  includeSceneId?: string
): string[] {
  if (!fmChapter) return includeSceneId ? [includeSceneId] : [];
  const pool = getChapterAvailableSceneIds(fmChapter);
  const used = new Set(
    beats.map((b) => b.sceneId).filter((id): id is string => !!id && id !== includeSceneId)
  );
  return pool.filter((id) => !used.has(id));
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

export function applyProgressAnchor(
  fw: StoryFramework,
  outline: StoryOutline,
  newAnchorChapterId: string,
  options?: {archiveSkipped?: boolean}
): StoryOutline {
  const newIdx = (fw.chapters ?? []).findIndex((c) => c.id === newAnchorChapterId);
  if (newIdx < 0) return outline;

  const oldIdx = getAnchorChapterIndex(fw, outline);
  let archivedChapterIds = [...(outline.archivedChapterIds ?? [])];

  if (newIdx > oldIdx && !options?.archiveSkipped) {
    const toArchive = (fw.chapters ?? []).slice(oldIdx, newIdx).map((c) => c.id);
    archivedChapterIds = [...new Set([...archivedChapterIds, ...toArchive])];
  }

  return {
    ...outline,
    progressAnchorChapterId: newAnchorChapterId,
    archivedChapterIds,
  };
}

/** 生成上下文：当前章详细（含本场 beat）+ 窗口内后续章仅 narrativeGoal/theme */
export function buildRollingOutlineGenerationContext(
  fw: StoryFramework,
  outline: StoryOutline,
  sceneId: string,
  currentChapterId: string
): Record<string, unknown> {
  const anchorIdx = getAnchorChapterIndex(fw, outline);
  const horizon = outline.rollingHorizonChapters;
  const windowEnd = anchorIdx + horizon;
  const outlineById = new Map(outline.chapters.map((c) => [c.chapterId, c]));
  const currentIdx = (fw.chapters ?? []).findIndex((c) => c.id === currentChapterId);

  const currentOutline = outlineById.get(currentChapterId);
  const beatForScene = currentOutline?.beats.find((b) => b.sceneId === sceneId);

  const currentChapter =
    currentOutline && currentIdx >= anchorIdx && currentIdx < windowEnd
      ? {
          chapterId: currentOutline.chapterId,
          title: currentOutline.title,
          narrativeGoal: currentOutline.narrativeGoal,
          theme: currentOutline.theme,
          beatForThisScene: beatForScene ?? null,
          otherBeatsSummary: (currentOutline.beats ?? [])
            .filter((b) => b.sceneId !== sceneId && b.summary.trim())
            .map((b) => ({sceneId: b.sceneId, summary: b.summary})),
        }
      : currentOutline
        ? {
            chapterId: currentOutline.chapterId,
            title: currentOutline.title,
            narrativeGoal: currentOutline.narrativeGoal,
            theme: currentOutline.theme,
            beatForThisScene: beatForScene ?? null,
            note: '当前章在滚动窗口外，仅注入本章约束',
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
    const oc = outlineById.get(fmCh.id);
    upcomingInWindow.push({
      chapterId: fmCh.id,
      title: fmCh.title,
      narrativeGoal: oc?.narrativeGoal ?? '',
      theme: oc?.theme ?? fmCh.theme,
    });
  }

  return {
    progressAnchorChapterId: outline.progressAnchorChapterId,
    rollingHorizonChapters: horizon,
    currentChapter,
    upcomingInWindow: upcomingInWindow.length ? upcomingInWindow : undefined,
  };
}

export function ensureOutlineWithFm(
  outline: StoryOutline,
  fw: StoryFramework,
  scenes?: GameScene[]
): StoryOutline {
  let next = mergeOutlineFromFm(outline, fw);
  if (!next.progressAnchorChapterId && scenes?.length) {
    const inferred = inferProgressAnchorFromScenes(fw, scenes);
    if (inferred) next = {...next, progressAnchorChapterId: inferred};
  }
  return next;
}
