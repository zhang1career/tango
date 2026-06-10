/**
 * 将路由链接同步写入 story.tw（供剧情页、场景页共用）
 */

import {getGameContentUrl} from '@/config';
import {frameworkToStory, parseTwee, serializeStorySugarcube, syncStoryTitleFromFramework} from '@/engine';
import type {StoryFramework} from '@/schema/story-framework';
import {toPassageId} from '@/schema/story-framework';
import {
  patchRoutingFingerprints,
  syncPassageLinksInStory,
} from '@/utils/scene-routing-sync';

function normalizePassageKey(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

export function lookupKeysForSceneEntry(
  fw: StoryFramework,
  chapterIndex: number,
  sceneId: string
): string[] {
  const pid = toPassageId(chapterIndex, sceneId);
  const keys = [pid];
  try {
    const template = frameworkToStory(fw).passages.get(pid);
    if (template?.name) {
      const byName = normalizePassageKey(template.name);
      if (!keys.includes(byName)) keys.push(byName);
    }
  } catch {
    // ignore routing validation errors when resolving lookup keys
  }
  return keys;
}

const parsedStoryCache = new Map<string, ReturnType<typeof parseTwee>>();

export function invalidateParsedStoryCache(gameId?: string): void {
  if (gameId) parsedStoryCache.delete(gameId);
  else parsedStoryCache.clear();
}

export async function loadStoryFromGame(gameId: string): Promise<ReturnType<typeof parseTwee> | null> {
  const cached = parsedStoryCache.get(gameId);
  if (cached) return cached;
  const res = await fetch(getGameContentUrl(gameId));
  if (!res.ok) return null;
  const parsed = parseTwee(await res.text());
  parsedStoryCache.set(gameId, parsed);
  return parsed;
}

export async function saveStoryTw(gameId: string, story: ReturnType<typeof parseTwee>): Promise<void> {
  const res = await fetch(getGameContentUrl(gameId), {
    method: 'PUT',
    headers: {'Content-Type': 'text/plain; charset=utf-8'},
    body: serializeStorySugarcube(story),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({error: res.statusText}));
    throw new Error((err as {error?: string}).error ?? '保存 story.tw 失败');
  }
  parsedStoryCache.set(gameId, story);
}

export async function syncRoutingLinksForGame(
  gameId: string,
  fw: StoryFramework,
  sceneIds?: string[]
): Promise<{
  fw: StoryFramework;
  story: ReturnType<typeof parseTwee>;
  syncedCount: number;
  skippedCount: number;
}> {
  return persistFrameworkRoutingToStory(gameId, fw, {sceneIds});
}

/** 将章节结构（叙事图、跨章过渡、叙事入口等）同步到 story.tw */
export async function persistFrameworkRoutingToStory(
  gameId: string,
  fw: StoryFramework,
  options: {
    story?: ReturnType<typeof parseTwee> | null;
    sceneIds?: string[];
    syncStartPassage?: boolean;
  } = {}
): Promise<{
  fw: StoryFramework;
  story: ReturnType<typeof parseTwee>;
  syncedCount: number;
  skippedCount: number;
}> {
  const story = options.story ?? (await loadStoryFromGame(gameId));
  if (!story) throw new Error('无法读取 story.tw');

  if (options.syncStartPassage !== false) {
    syncStoryTitleFromFramework(story, fw);
  }

  const result = syncPassageLinksInStory(story, fw, {
    sceneIds: options.sceneIds,
    lookupKeysForScene: (chi, sid) => lookupKeysForSceneEntry(fw, chi, sid),
  });
  const nextFw = patchRoutingFingerprints(fw, result.synced);
  await saveStoryTw(gameId, story);
  parsedStoryCache.set(gameId, story);
  return {
    fw: nextFw,
    story,
    syncedCount: result.synced.length,
    skippedCount: result.skipped.length,
  };
}
