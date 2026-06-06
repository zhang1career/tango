/**
 * story.tw 路由链接同步、过期检测与指纹
 */

import type {PassageLink, Story} from '@/types';
import type {FrameworkChapter, SceneEntry, StoryFramework} from '../schema/story-framework';
import {toPassageId} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {
  buildSceneRoutingPlan,
  chapterSceneKey,
  computeAllScenePassageLinks,
  computeScenePassageLinks,
} from './scene-passage-links';
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
  const norm = (links: PassageLink[]) =>
    links.map(normalizeLinkForCompare).sort().join('|');
  return norm(expected) === norm(actual);
}

export function sceneEntryKey(chapterIndex: number, sceneIndex: number): string {
  return `${chapterIndex}:${sceneIndex}`;
}

/** 路由指纹：哈希期望链接拓扑（与正文 compiledFingerprint 分离） */
export function getSceneEntryRoutingFingerprint(
  fw: StoryFramework,
  ch: FrameworkChapter,
  sceneIndex: number,
  sceneMap: Map<string, GameScene>,
  plan?: ReturnType<typeof buildSceneRoutingPlan>
): string | null {
  const entry = ch.sceneEntries[sceneIndex];
  if (!entry) return null;
  const scene = sceneMap.get(entry.sceneId);
  if (!scene) return null;

  const chapterIndex = fw.chapters.indexOf(ch);
  if (chapterIndex < 0) return null;

  try {
    const routingPlan = plan ?? buildSceneRoutingPlan(fw);
    const links = computeScenePassageLinks(fw, chapterIndex, entry.sceneId, routingPlan);
    return hashString(
      JSON.stringify({
        chapter: {
          id: ch.id,
          startMapNodeId: ch.startMapNodeId ?? '',
          endMapNodeId: ch.endMapNodeId ?? '',
          sceneEntryIds: (ch.sceneEntries ?? []).map((e) => e.sceneId),
        },
        scene: {
          id: scene.id,
          mapNodeId: scene.mapNodeId ?? '',
          mainlineLinkDisplayText: scene.mainlineLinkDisplayText ?? '',
          branchOptions: scene.branchOptions ?? [],
          conditions: scene.conditions ?? '',
          ruleIds: scene.ruleIds ?? [],
        },
        entry: {
          sceneId: entry.sceneId,
          ruleIds: entry.ruleIds ?? [],
          sceneIndex,
        },
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
  sceneIndex: number;
  chapterTitle: string;
  sceneId: string;
  sceneName: string;
  expectedLinks: PassageLink[];
  actualLinks: PassageLink[];
}

export interface ScenePassageRef {
  chapterIndex: number;
  sceneIndex: number;
  sceneId: string;
  paginationBaseId: string;
  lookupKeys: string[];
}

export function buildScenePassageRef(
  fw: StoryFramework,
  chapterIndex: number,
  sceneIndex: number,
  lookupKeysForScene?: (chapterIndex: number, sceneId: string, pid: string) => string[]
): ScenePassageRef | null {
  const ch = fw.chapters[chapterIndex];
  const entry = ch?.sceneEntries?.[sceneIndex];
  if (!entry) return null;
  const pid = toPassageId(chapterIndex, entry.sceneId);
  const lookupKeys = lookupKeysForScene?.(chapterIndex, entry.sceneId, pid) ?? [pid];
  return {
    chapterIndex,
    sceneIndex,
    sceneId: entry.sceneId,
    paginationBaseId: pid,
    lookupKeys,
  };
}

/** 读取 story.tw 中场景末页的实际链接 */
export function getActualPassageLinksFromStory(
  story: Story,
  ref: ScenePassageRef
): PassageLink[] {
  const pages = listScenePassagePages(
    story,
    ref.sceneId,
    ref.paginationBaseId,
    ref.lookupKeys
  );
  if (pages.length === 0) return [];
  return pages[pages.length - 1]?.links ?? [];
}

/** 检测路由与框架不一致的场景（可对比 story.tw 或 routingFingerprint） */
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
    for (let si = 0; si < (ch.sceneEntries ?? []).length; si++) {
      const entry = ch.sceneEntries[si];
      const scene = sceneMap.get(entry.sceneId);
      if (!scene) continue;

      const expectedLinks = computeScenePassageLinks(fw, chi, entry.sceneId, plan);
      const routingFp = getSceneEntryRoutingFingerprint(fw, ch, si, sceneMap, plan);

      if (story) {
        const ref = buildScenePassageRef(fw, chi, si, lookupKeysForScene);
        if (!ref) continue;
        const actualLinks = getActualPassageLinksFromStory(story, ref);
        if (!passageLinksEqual(expectedLinks, actualLinks)) {
          stale.push({
            chapterIndex: chi,
            sceneIndex: si,
            chapterTitle: ch.title || ch.id,
            sceneId: entry.sceneId,
            sceneName: scene.name,
            expectedLinks,
            actualLinks,
          });
        }
      } else if (routingFp && entry.routingFingerprint !== routingFp) {
        stale.push({
          chapterIndex: chi,
          sceneIndex: si,
          chapterTitle: ch.title || ch.id,
          sceneId: entry.sceneId,
          sceneName: scene.name,
          expectedLinks,
          actualLinks: [],
        });
      }
    }
  }
  return stale;
}

/** 章节结构变更时可能受影响的场景 id */
export function collectRoutingAffectedSceneIds(
  fw: StoryFramework,
  changedChapterIndices: number[]
): Set<string> {
  let plan: ReturnType<typeof buildSceneRoutingPlan>;
  try {
    plan = buildSceneRoutingPlan(fw);
  } catch {
    return new Set();
  }

  const affected = new Set<string>();
  const chapters = fw.chapters ?? [];

  for (const chi of changedChapterIndices) {
    const ch = chapters[chi];
    if (!ch) continue;
    const mainline = plan.chapterMainlineEntries.get(chi) ?? [];
    for (const item of mainline) affected.add(item.scene.id);

    const prevMainline = plan.chapterMainlineEntries.get(chi - 1) ?? [];
    const prevLast = prevMainline[prevMainline.length - 1];
    if (prevLast) affected.add(prevLast.scene.id);

    const nextMainline = plan.chapterMainlineEntries.get(chi + 1) ?? [];
    const nextFirst = nextMainline[0];
    if (nextFirst) affected.add(nextFirst.scene.id);

    for (const entry of ch.sceneEntries ?? []) {
      const scene = (fw.scenes ?? []).find((s) => s.id === entry.sceneId);
      if ((scene?.branchOptions ?? []).length) affected.add(entry.sceneId);
      const owner = plan.branchOwnerByChapterScene.get(chapterSceneKey(chi, entry.sceneId));
      if (owner) {
        affected.add(entry.sceneId);
        affected.add(owner.rootSceneId);
      }
    }
  }

  return affected;
}

/** 将期望链接写入 story.tw 对应场景末页（不改正文） */
export function applyPassageLinksToStory(
  story: Story,
  ref: ScenePassageRef,
  links: PassageLink[]
): boolean {
  const pages = listScenePassagePages(
    story,
    ref.sceneId,
    ref.paginationBaseId,
    ref.lookupKeys
  );
  if (pages.length === 0) return false;

  const lastPage = pages[pages.length - 1]!;
  const normalized = normalizePassageLinksForStory(links);
  story.passages.set(lastPage.id, {...lastPage, links: normalized});
  return true;
}

export interface SyncPassageLinksResult {
  synced: Array<{chapterIndex: number; sceneIndex: number; sceneId: string; sceneName: string}>;
  skipped: Array<{chapterIndex: number; sceneId: string; reason: string}>;
}

/** 同步指定场景（或全部）的 passage 链接到 story.tw */
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
  const plan = buildSceneRoutingPlan(fw);
  const allLinks = computeAllScenePassageLinks(fw);

  const synced: SyncPassageLinksResult['synced'] = [];
  const skipped: SyncPassageLinksResult['skipped'] = [];

  for (let chi = 0; chi < fw.chapters.length; chi++) {
    const ch = fw.chapters[chi];
    for (let si = 0; si < (ch.sceneEntries ?? []).length; si++) {
      const entry = ch.sceneEntries[si];
      if (sceneFilter && !sceneFilter.has(entry.sceneId)) continue;

      const ref = buildScenePassageRef(fw, chi, si, options.lookupKeysForScene);
      if (!ref) {
        skipped.push({chapterIndex: chi, sceneId: entry.sceneId, reason: '无法解析 passage'});
        continue;
      }

      const key = chapterSceneKey(chi, entry.sceneId);
      const expectedLinks = allLinks.get(key);
      if (!expectedLinks) {
        skipped.push({chapterIndex: chi, sceneId: entry.sceneId, reason: '无期望链接'});
        continue;
      }

      const ok = applyPassageLinksToStory(story, ref, expectedLinks);
      if (!ok) {
        skipped.push({chapterIndex: chi, sceneId: entry.sceneId, reason: 'story.tw 中无对应 passage'});
        continue;
      }

      synced.push({
        chapterIndex: chi,
        sceneIndex: si,
        sceneId: entry.sceneId,
        sceneName: sceneMap.get(entry.sceneId)?.name ?? entry.sceneId,
      });
    }
  }

  void plan;
  return {synced, skipped};
}

/** 同步后更新 story-fm 中各 entry 的 routingFingerprint */
export function patchRoutingFingerprints(
  fw: StoryFramework,
  synced: Array<{chapterIndex: number; sceneIndex: number}>
): StoryFramework {
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  let plan: ReturnType<typeof buildSceneRoutingPlan>;
  try {
    plan = buildSceneRoutingPlan(fw);
  } catch {
    return fw;
  }

  const syncSet = new Set(synced.map((s) => sceneEntryKey(s.chapterIndex, s.sceneIndex)));
  return {
    ...fw,
    chapters: fw.chapters.map((ch, chi) => ({
      ...ch,
      sceneEntries: ch.sceneEntries.map((entry, si) => {
        if (!syncSet.has(sceneEntryKey(chi, si))) return entry;
        const fp = getSceneEntryRoutingFingerprint(fw, ch, si, sceneMap, plan);
        return fp ? {...entry, routingFingerprint: fp} : entry;
      }),
    })),
  };
}

export function findSceneEntryBySceneId(
  fw: StoryFramework,
  sceneId: string
): {chapterIndex: number; sceneIndex: number} | null {
  for (let chi = 0; chi < fw.chapters.length; chi++) {
    const si = fw.chapters[chi].sceneEntries.findIndex((e) => e.sceneId === sceneId);
    if (si >= 0) return {chapterIndex: chi, sceneIndex: si};
  }
  return null;
}

/** 判断某场景路由是否与 story.tw 不一致 */
export function isSceneRoutingStale(
  fw: StoryFramework,
  story: Story,
  chapterIndex: number,
  sceneIndex: number,
  lookupKeysForScene?: (chapterIndex: number, sceneId: string, pid: string) => string[]
): boolean {
  const stale = collectRoutingStaleScenes(fw, story, lookupKeysForScene);
  return stale.some((s) => s.chapterIndex === chapterIndex && s.sceneIndex === sceneIndex);
}

export type {SceneEntry};
