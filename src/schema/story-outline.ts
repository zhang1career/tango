/**
 * 滚动大纲 - story-outline.json（叙事引擎真相层）
 */

export const STORY_OUTLINE_VERSION = '1';

export interface OutlineBeat {
  /** 可选：绑定到具体场景 */
  sceneId?: string;
  /** 本节拍叙事任务 */
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
  /** 滚动维护的未来章数（默认 5） */
  rollingHorizonChapters: number;
  chapters: OutlineChapter[];
}

export const EMPTY_STORY_OUTLINE: StoryOutline = {
  version: STORY_OUTLINE_VERSION,
  rollingHorizonChapters: 5,
  chapters: [],
};

export function normalizeStoryOutline(raw: unknown): StoryOutline {
  if (!raw || typeof raw !== 'object') return {...EMPTY_STORY_OUTLINE};
  const o = raw as Record<string, unknown>;
  const chapters = Array.isArray(o.chapters)
    ? o.chapters
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .map((c) => ({
          chapterId: String(c.chapterId ?? ''),
          title: String(c.title ?? ''),
          theme: typeof c.theme === 'string' ? c.theme : undefined,
          narrativeGoal: String(c.narrativeGoal ?? ''),
          beats: Array.isArray(c.beats)
            ? c.beats
                .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
                .map((b) => ({
                  sceneId: typeof b.sceneId === 'string' ? b.sceneId : undefined,
                  summary: String(b.summary ?? ''),
                  emotionalTarget: typeof b.emotionalTarget === 'string' ? b.emotionalTarget : undefined,
                }))
            : [],
        }))
        .filter((c) => c.chapterId)
    : [];
  const horizon = Number(o.rollingHorizonChapters);
  return {
    version: String(o.version ?? STORY_OUTLINE_VERSION),
    rollingHorizonChapters: Number.isFinite(horizon) && horizon > 0 ? Math.round(horizon) : 5,
    chapters,
  };
}
