import {
  getCanonFetchUrl,
  getForeshadowingFetchUrl,
  getGenerationTracesFetchUrl,
  getOutlineFetchUrl,
} from '@/config';
import {EMPTY_STORY_CANON, normalizeStoryCanon, type StoryCanon} from '@/schema/story-canon';
import {
  EMPTY_STORY_FORESHADOWING,
  normalizeStoryForeshadowing,
  type StoryForeshadowing,
} from '@/schema/story-foreshadowing';
import {EMPTY_STORY_OUTLINE, normalizeStoryOutline, type StoryOutline} from '@/schema/story-outline';
import {
  EMPTY_GENERATION_TRACES,
  normalizeGenerationTraces,
  type GenerationTraceEntry,
  type StoryGenerationTraces,
} from '@/schema/story-generation-traces';
import {formatJsonCompact} from './json-format';

export async function fetchStoryOutline(gameId: string): Promise<StoryOutline> {
  try {
    const res = await fetch(getOutlineFetchUrl(gameId));
    if (!res.ok) return {...EMPTY_STORY_OUTLINE};
    return normalizeStoryOutline(await res.json());
  } catch {
    return {...EMPTY_STORY_OUTLINE};
  }
}

export async function saveStoryOutline(gameId: string, outline: StoryOutline): Promise<void> {
  const res = await fetch(getOutlineFetchUrl(gameId), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: formatJsonCompact(outline),
  });
  const data = (await res.json().catch(() => ({}))) as {ok?: boolean; error?: string};
  if (!res.ok || !data.ok) throw new Error(data.error || `保存大纲失败: ${res.status}`);
}

export async function fetchStoryForeshadowing(gameId: string): Promise<StoryForeshadowing> {
  try {
    const res = await fetch(getForeshadowingFetchUrl(gameId));
    if (!res.ok) return {...EMPTY_STORY_FORESHADOWING};
    return normalizeStoryForeshadowing(await res.json());
  } catch {
    return {...EMPTY_STORY_FORESHADOWING};
  }
}

export async function saveStoryForeshadowing(gameId: string, data: StoryForeshadowing): Promise<void> {
  const res = await fetch(getForeshadowingFetchUrl(gameId), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: formatJsonCompact(data),
  });
  const json = (await res.json().catch(() => ({}))) as {ok?: boolean; error?: string};
  if (!res.ok || !json.ok) throw new Error(json.error || `保存伏笔池失败: ${res.status}`);
}

export async function fetchStoryCanon(gameId: string): Promise<StoryCanon> {
  try {
    const res = await fetch(getCanonFetchUrl(gameId));
    if (!res.ok) return {...EMPTY_STORY_CANON};
    return normalizeStoryCanon(await res.json());
  } catch {
    return {...EMPTY_STORY_CANON};
  }
}

export async function saveStoryCanon(gameId: string, canon: StoryCanon): Promise<void> {
  const res = await fetch(getCanonFetchUrl(gameId), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: formatJsonCompact(canon),
  });
  const json = (await res.json().catch(() => ({}))) as {ok?: boolean; error?: string};
  if (!res.ok || !json.ok) throw new Error(json.error || `保存 canon 失败: ${res.status}`);
}

export async function fetchGenerationTraces(gameId: string): Promise<StoryGenerationTraces> {
  try {
    const res = await fetch(getGenerationTracesFetchUrl(gameId));
    if (!res.ok) return {...EMPTY_GENERATION_TRACES};
    return normalizeGenerationTraces(await res.json());
  } catch {
    return {...EMPTY_GENERATION_TRACES};
  }
}

export async function appendGenerationTrace(gameId: string, entry: GenerationTraceEntry): Promise<void> {
  const log = await fetchGenerationTraces(gameId);
  log.entries.push(entry);
  const res = await fetch(getGenerationTracesFetchUrl(gameId), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: formatJsonCompact(log),
  });
  const json = (await res.json().catch(() => ({}))) as {ok?: boolean; error?: string};
  if (!res.ok || !json.ok) throw new Error(json.error || `保存轨迹失败: ${res.status}`);
}
