/** 运行时章节连通态变量约定 */

export const ACTIVE_CHAPTER_VAR = '$activeChapterId';

/** 运行时 story.tw 中 $chapterMode_{chapterId} 的取值 */
export type ChapterSceneMode = 'narrative' | 'open_world';

export function chapterModeVar(chapterId: string): string {
  return `$chapterMode_${chapterId}`;
}

export function chapterModeFromRouting(narrative: boolean): ChapterSceneMode {
  return narrative ? 'narrative' : 'open_world';
}

export function chapterModeCondition(chapterId: string, mode: ChapterSceneMode): string {
  return `${chapterModeVar(chapterId)} == "${mode}"`;
}
