/**
 * 滚动大纲 - story-outline.json（叙事引擎真相层）
 */

export const STORY_OUTLINE_VERSION = '1';

export interface OutlineBeat {
  /** 可选：绑定到具体场景 */
  sceneId?: string;
  /** 本场景叙事任务 */
  summary: string;
  emotionalTarget?: string;
}

export interface OutlineChapter {
  chapterId: string;
  title: string;
  theme?: string;
  /** 本章叙事目标（不可协商方向） */
  narrativeGoal: string;
  beats: OutlineBeat[];
}

export interface StoryOutline {
  version: string;
  /** 从进度锚点起详细维护的章数（默认 5，含锚点章） */
  rollingHorizonChapters: number;
  /** 叙事进度锚点：对应 story-fm 章节 id */
  progressAnchorChapterId?: string;
  /** 已归档章节 id（锚点之前、或前移锚点时标记） */
  archivedChapterIds?: string[];
  chapters: OutlineChapter[];
}

export const EMPTY_STORY_OUTLINE: StoryOutline = {
  version: STORY_OUTLINE_VERSION,
  rollingHorizonChapters: 5,
  chapters: [],
  archivedChapterIds: [],
};

export function normalizeStoryOutline(raw: unknown): StoryOutline {
  if (!raw || typeof raw !== 'object') return {...EMPTY_STORY_OUTLINE};
  const o = raw as Record<string, unknown>;
  const chapters = Array.isArray(o.chapters)
    ? o.chapters
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .map((c) => ({
          chapterId: String(c.chapterId ?? c.id ?? ''),
          title: String(c.title ?? ''),
          theme: typeof c.theme === 'string' ? c.theme : undefined,
          narrativeGoal: String(c.narrativeGoal ?? ''),
          beats: Array.isArray(c.beats)
            ? c.beats
                .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
                .map((b) => ({
                  sceneId: typeof b.sceneId === 'string' ? b.sceneId : undefined,
                  summary: String(b.summary ?? b.intent ?? ''),
                  emotionalTarget: typeof b.emotionalTarget === 'string' ? b.emotionalTarget : undefined,
                }))
            : [],
        }))
        .filter((c) => c.chapterId)
    : [];
  const horizon = Number(o.rollingHorizonChapters);
  const archivedChapterIds = Array.isArray(o.archivedChapterIds)
    ? o.archivedChapterIds.map(String).filter(Boolean)
    : [];
  const progressAnchorChapterId =
    typeof o.progressAnchorChapterId === 'string' && o.progressAnchorChapterId.trim()
      ? o.progressAnchorChapterId.trim()
      : undefined;
  return {
    version: String(o.version ?? STORY_OUTLINE_VERSION),
    rollingHorizonChapters: Number.isFinite(horizon) && horizon > 0 ? Math.round(horizon) : 5,
    progressAnchorChapterId,
    archivedChapterIds: archivedChapterIds.length ? archivedChapterIds : undefined,
    chapters,
  };
}
