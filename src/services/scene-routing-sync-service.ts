/**
 * 将路由链接同步写入 story.tw（供剧情页、场景页共用）
 */

import {getGameContentUrl} from '@/config';
import {frameworkToStory, parseTwee, serializeStorySugarcube} from '@/engine';
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

export async function loadStoryFromGame(gameId: string): Promise<ReturnType<typeof parseTwee> | null> {
  const res = await fetch(getGameContentUrl(gameId));
  if (!res.ok) return null;
  return parseTwee(await res.text());
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
  const story = await loadStoryFromGame(gameId);
  if (!story) throw new Error('无法读取 story.tw');

  const result = syncPassageLinksInStory(story, fw, {
    sceneIds,
    lookupKeysForScene: (chi, sid) => lookupKeysForSceneEntry(fw, chi, sid),
  });
  const nextFw = patchRoutingFingerprints(fw, result.synced);
  await saveStoryTw(gameId, story);
  return {
    fw: nextFw,
    story,
    syncedCount: result.synced.length,
    skippedCount: result.skipped.length,
  };
}
