/**
 * story.tw 路由链接同步、过期检测与指纹
 */

import type {PassageLink, Story} from '@/types';
import type {FrameworkChapter, StoryFramework} from '../schema/story-framework';
import {toPassageId} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {
  buildSceneRoutingPlan,
  chapterSceneKey,
  computeAllScenePassageLinks,
  computeScenePassageLinks,
} from './scene-passage-links';
import {getChapterAvailableSceneIds, getChapterSceneMeta} from './chapter-scene';
import {listScenePassagePages} from './scene-passage-text';

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function stripPassageLinkPrefix(displayText: string): string {
  return displayText.startsWith('前往 ') ? displayText.slice(3) : displayText;
}

export function normalizePassageLinksForStory(links: PassageLink[]): PassageLink[] {
  return links.map((l) => ({
    ...l,
    displayText: stripPassageLinkPrefix(l.displayText),
  }));
}

function normalizeLinkForCompare(link: PassageLink): string {
  return JSON.stringify({
    displayText: stripPassageLinkPrefix(link.displayText),
    passageName: link.passageName,
    condition: link.condition ?? '',
  });
}

export function passageLinksEqual(expected: PassageLink[], actual: PassageLink[]): boolean {
  const norm = (links: PassageLink[]) => links.map(normalizeLinkForCompare).sort().join('|');
  return norm(expected) === norm(actual);
}

export function chapterSceneRefKey(chapterIndex: number, sceneId: string): string {
  return `${chapterIndex}:${sceneId}`;
}

export function getChapterSceneRoutingFingerprint(
  fw: StoryFramework,
  ch: FrameworkChapter,
  chapterIndex: number,
  sceneId: string,
  sceneMap: Map<string, GameScene>,
  plan?: ReturnType<typeof buildSceneRoutingPlan>
): string | null {
  const scene = sceneMap.get(sceneId);
  if (!scene) return null;

  try {
    const routingPlan = plan ?? buildSceneRoutingPlan(fw);
    const links = computeScenePassageLinks(fw, chapterIndex, sceneId, routingPlan);
    return hashString(
      JSON.stringify({
        chapter: {
          id: ch.id,
          availableSceneIds: getChapterAvailableSceneIds(ch),
          narrativeGraph: ch.narrativeGraph ?? {},
          narrativeEdges: ch.narrativeEdges ?? [],
          startSceneId: ch.startSceneId ?? '',
          transitions: ch.transitions ?? [],
        },
        scene: {
          id: scene.id,
          mapNodeId: scene.mapNodeId ?? '',
          conditions: scene.conditions ?? '',
          ruleIds: scene.ruleIds ?? [],
        },
        bindings: (fw.sceneBindings ?? []).filter(
          (b) => b.chapterId === ch.id && b.sceneId === sceneId
        ),
        links: links.map(normalizeLinkForCompare),
        maps: (fw.maps ?? []).map((m) => ({
          id: m.id,
          edges: m.edges.map((e) => ({
            from: e.from,
            to: e.to,
            displayText: e.displayText ?? '',
            condition: e.condition ?? '',
          })),
        })),
      })
    );
  } catch {
    return null;
  }
}

export interface RoutingStaleEntry {
  chapterIndex: number;
  sceneId: string;
  chapterTitle: string;
  sceneName: string;
  expectedLinks: PassageLink[];
  actualLinks: PassageLink[];
}

export interface ScenePassageRef {
  chapterIndex: number;
  sceneId: string;
  paginationBaseId: string;
  lookupKeys: string[];
}

export function buildScenePassageRef(
  fw: StoryFramework,
  chapterIndex: number,
  sceneId: string,
  lookupKeysForScene?: (chapterIndex: number, sceneId: string, pid: string) => string[]
): ScenePassageRef | null {
  const ch = fw.chapters[chapterIndex];
  if (!ch || !getChapterAvailableSceneIds(ch).includes(sceneId)) return null;
  const pid = toPassageId(chapterIndex, sceneId);
  const lookupKeys = lookupKeysForScene?.(chapterIndex, sceneId, pid) ?? [pid];
  return {chapterIndex, sceneId, paginationBaseId: pid, lookupKeys};
}

export function getActualPassageLinksFromStory(story: Story, ref: ScenePassageRef): PassageLink[] {
  const pages = listScenePassagePages(story, ref.sceneId, ref.paginationBaseId, ref.lookupKeys);
  if (pages.length === 0) return [];
  return pages[pages.length - 1]?.links ?? [];
}

export function collectRoutingStaleScenes(
  fw: StoryFramework,
  story?: Story,
  lookupKeysForScene?: (chapterIndex: number, sceneId: string, pid: string) => string[]
): RoutingStaleEntry[] {
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  let plan: ReturnType<typeof buildSceneRoutingPlan> | undefined;
  try {
    plan = buildSceneRoutingPlan(fw);
  } catch {
    return [];
  }

  const stale: RoutingStaleEntry[] = [];
  for (let chi = 0; chi < fw.chapters.length; chi++) {
    const ch = fw.chapters[chi];
    for (const sceneId of getChapterAvailableSceneIds(ch)) {
      const scene = sceneMap.get(sceneId);
      if (!scene) continue;

      const expectedLinks = computeScenePassageLinks(fw, chi, sceneId, plan);
      const routingFp = getChapterSceneRoutingFingerprint(fw, ch, chi, sceneId, sceneMap, plan);
      const storedFp = getChapterSceneMeta(ch, sceneId)?.routingFingerprint;

      if (story) {
        const ref = buildScenePassageRef(fw, chi, sceneId, lookupKeysForScene);
        if (!ref) continue;
        const actualLinks = getActualPassageLinksFromStory(story, ref);
        if (!passageLinksEqual(expectedLinks, actualLinks)) {
          stale.push({
            chapterIndex: chi,
            sceneId,
            chapterTitle: ch.title || ch.id,
            sceneName: scene.name,
            expectedLinks,
            actualLinks,
          });
        }
      } else if (routingFp && storedFp !== routingFp) {
        stale.push({
          chapterIndex: chi,
          sceneId,
          chapterTitle: ch.title || ch.id,
          sceneName: scene.name,
          expectedLinks,
          actualLinks: [],
        });
      }
    }
  }
  return stale;
}

export function applyPassageLinksToStory(
  story: Story,
  ref: ScenePassageRef,
  links: PassageLink[]
): boolean {
  const pages = listScenePassagePages(story, ref.sceneId, ref.paginationBaseId, ref.lookupKeys);
  if (pages.length === 0) return false;
  const lastPage = pages[pages.length - 1]!;
  const normalized = normalizePassageLinksForStory(links);
  story.passages.set(lastPage.id, {...lastPage, links: normalized});
  return true;
}

export interface SyncPassageLinksResult {
  synced: Array<{chapterIndex: number; sceneId: string; sceneName: string}>;
  skipped: Array<{chapterIndex: number; sceneId: string; reason: string}>;
}

export function syncPassageLinksInStory(
  story: Story,
  fw: StoryFramework,
  options: {
    sceneIds?: string[];
    lookupKeysForScene?: (chapterIndex: number, sceneId: string, pid: string) => string[];
  } = {}
): SyncPassageLinksResult {
  const sceneFilter = options.sceneIds ? new Set(options.sceneIds) : null;
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const allLinks = computeAllScenePassageLinks(fw);

  const synced: SyncPassageLinksResult['synced'] = [];
  const skipped: SyncPassageLinksResult['skipped'] = [];

  for (let chi = 0; chi < fw.chapters.length; chi++) {
    const ch = fw.chapters[chi];
    for (const sceneId of getChapterAvailableSceneIds(ch)) {
      if (sceneFilter && !sceneFilter.has(sceneId)) continue;

      const ref = buildScenePassageRef(fw, chi, sceneId, options.lookupKeysForScene);
      if (!ref) {
        skipped.push({chapterIndex: chi, sceneId, reason: '无法解析 passage'});
        continue;
      }

      const key = chapterSceneKey(chi, sceneId);
      const expectedLinks = allLinks.get(key);
      if (!expectedLinks) {
        skipped.push({chapterIndex: chi, sceneId, reason: '无期望链接'});
        continue;
      }

      const ok = applyPassageLinksToStory(story, ref, expectedLinks);
      if (!ok) {
        skipped.push({chapterIndex: chi, sceneId, reason: 'story.tw 中无对应 passage'});
        continue;
      }

      synced.push({
        chapterIndex: chi,
        sceneId,
        sceneName: sceneMap.get(sceneId)?.name ?? sceneId,
      });
    }
  }

  return {synced, skipped};
}

export function patchRoutingFingerprints(
  fw: StoryFramework,
  synced: Array<{chapterIndex: number; sceneId: string}>
): StoryFramework {
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  let plan: ReturnType<typeof buildSceneRoutingPlan>;
  try {
    plan = buildSceneRoutingPlan(fw);
  } catch {
    return fw;
  }

  const syncSet = new Set(synced.map((s) => chapterSceneRefKey(s.chapterIndex, s.sceneId)));
  return {
    ...fw,
    chapters: fw.chapters.map((ch, chi) => {
      let next = ch;
      for (const sceneId of getChapterAvailableSceneIds(ch)) {
        if (!syncSet.has(chapterSceneRefKey(chi, sceneId))) continue;
        const fp = getChapterSceneRoutingFingerprint(fw, ch, chi, sceneId, sceneMap, plan);
        if (!fp) continue;
        const prev = next.sceneMeta?.[sceneId] ?? {};
        next = {
          ...next,
          sceneMeta: {
            ...(next.sceneMeta ?? {}),
            [sceneId]: {...prev, routingFingerprint: fp},
          },
        };
      }
      return next;
    }),
  };
}

export function findChapterSceneRef(
  fw: StoryFramework,
  sceneId: string
): {chapterIndex: number; sceneId: string} | null {
  for (let chi = 0; chi < fw.chapters.length; chi++) {
    if (getChapterAvailableSceneIds(fw.chapters[chi]).includes(sceneId)) {
      return {chapterIndex: chi, sceneId};
    }
  }
  return null;
}

export function isSceneRoutingStale(
  fw: StoryFramework,
  story: Story,
  chapterIndex: number,
  sceneId: string,
  lookupKeysForScene?: (chapterIndex: number, sceneId: string, pid: string) => string[]
): boolean {
  const stale = collectRoutingStaleScenes(fw, story, lookupKeysForScene);
  return stale.some((s) => s.chapterIndex === chapterIndex && s.sceneId === sceneId);
}
