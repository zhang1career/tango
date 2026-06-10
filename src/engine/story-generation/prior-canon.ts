import type {StoryFramework} from '@/schema/story-framework';
import type {CanonSceneState, StoryCanon} from '@/schema/story-canon';
import {getChapterAvailableSceneIds} from '@/utils/chapter-scene';

const BUDGET = {
  maxPriorScenes: 14,
  maxFactsPerScene: 3,
  maxOpenQuestions: 10,
  maxSummaryChars: 200,
  maxFactChars: 120,
  maxQuestionChars: 120,
};

function truncate(text: string, max: number): string {
  const c = text.replace(/\s+/g, ' ').trim();
  return c.length > max ? `${c.slice(0, max)}…` : c;
}

export interface PriorCanonSceneEntry {
  sceneId: string;
  summary?: string;
  facts?: string[];
  openQuestions?: string[];
}

export interface PriorCanonInjection {
  priorScenes: PriorCanonSceneEntry[];
  openQuestions: string[];
}

/** 叙事顺序上位于当前场之前的 scene id（含前序章节） */
export function collectPriorSceneIds(
  fw: StoryFramework,
  chapterIndex: number,
  sceneIndex: number
): string[] {
  const ids: string[] = [];
  for (let chi = 0; chi <= chapterIndex; chi++) {
    const ch = fw.chapters?.[chi];
    if (!ch) continue;
    const pool = getChapterAvailableSceneIds(ch);
    const end = chi === chapterIndex ? sceneIndex : pool.length;
    for (let si = 0; si < end; si++) ids.push(pool[si]);
  }
  return ids;
}

function sceneEntryFromState(sceneId: string, st: CanonSceneState): PriorCanonSceneEntry | null {
  const summary = st.summary?.trim()
    ? truncate(st.summary.trim(), BUDGET.maxSummaryChars)
    : undefined;
  const facts = !summary && st.facts?.length
    ? st.facts
        .slice(0, BUDGET.maxFactsPerScene)
        .map((f) => truncate(f, BUDGET.maxFactChars))
    : undefined;
  const openQuestions = st.openQuestions?.length
    ? st.openQuestions.map((q) => truncate(q, BUDGET.maxQuestionChars))
    : undefined;
  if (!summary && !facts?.length && !openQuestions?.length) return null;
  return {
    sceneId,
    ...(summary ? {summary} : {}),
    ...(facts?.length ? {facts} : {}),
    ...(openQuestions?.length ? {openQuestions} : {}),
  };
}

export function buildPriorCanonInjection(
  fw: StoryFramework,
  canon: StoryCanon,
  chapterIndex: number,
  sceneIndex: number
): PriorCanonInjection | undefined {
  const priorIds = collectPriorSceneIds(fw, chapterIndex, sceneIndex);
  if (!priorIds.length) return undefined;

  const windowIds = priorIds.slice(-BUDGET.maxPriorScenes);
  const priorScenes: PriorCanonSceneEntry[] = [];
  const openQuestions: string[] = [];
  const seenQuestions = new Set<string>();

  for (const sceneId of priorIds) {
    const st = canon.scenes[sceneId];
    if (!st?.openQuestions?.length) continue;
    for (const q of st.openQuestions) {
      const t = q.trim();
      if (!t || seenQuestions.has(t) || openQuestions.length >= BUDGET.maxOpenQuestions) continue;
      seenQuestions.add(t);
      openQuestions.push(truncate(t, BUDGET.maxQuestionChars));
    }
  }

  for (const sceneId of windowIds) {
    const st = canon.scenes[sceneId];
    if (!st) continue;
    const entry = sceneEntryFromState(sceneId, st);
    if (entry) priorScenes.push(entry);
  }

  if (!priorScenes.length && !openQuestions.length) return undefined;
  return {priorScenes, openQuestions};
}
