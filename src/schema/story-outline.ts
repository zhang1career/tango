/**
 * 叙事进度 - story-outline.json（仅进度锚点与滚动窗口，章级内容在 story-fm）
 */

export const STORY_OUTLINE_VERSION = '1';

export interface StoryOutline {
  version: string;
  /** 从进度锚点起详细维护的章数（默认 5，含锚点章） */
  rollingHorizonChapters: number;
  /** 叙事进度锚点：对应 story-fm 章节 id */
  progressAnchorChapterId?: string;
  /** 已归档章节 id（锚点之前、或前移锚点时标记） */
  archivedChapterIds?: string[];
}

export const EMPTY_STORY_OUTLINE: StoryOutline = {
  version: STORY_OUTLINE_VERSION,
  rollingHorizonChapters: 5,
  archivedChapterIds: [],
};

export function normalizeStoryOutline(raw: unknown): StoryOutline {
  if (!raw || typeof raw !== 'object') return {...EMPTY_STORY_OUTLINE};
  const o = raw as Record<string, unknown>;
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
  };
}
