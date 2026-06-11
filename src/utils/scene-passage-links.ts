/**
 * 场景 passage 链接计算（章节图 + 开放世界双轨）
 */

import type {PassageLink} from '@/types';
import type {FrameworkChapter, StoryFramework} from '../schema/story-framework';
import {flattenSceneEntries, toPassageId} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {MapEdge} from '../schema/game-map';
import type {GameRule} from '../schema/game-rule';
import {
  chapterSceneKey,
  getChapterAvailableSceneIds,
  getSceneBindings,
  isNarrativeGraph,
} from './chapter-scene';
import {
  ACTIVE_CHAPTER_VAR,
  chapterModeCondition,
} from './chapter-runtime-vars';

export {chapterSceneKey};

function combineConditions(...parts: Array<string | undefined>): string | undefined {
  const trimmed = parts.map((p) => p?.trim()).filter(Boolean) as string[];
  if (trimmed.length === 0) return undefined;
  return trimmed.map((p) => (p.includes(' and ') ? `(${p})` : p)).join(' and ');
}

/** 准入：章节绑定规则 → 场景 conditions → 场景 ruleIds */
export function buildAccessCondition(
  fw: StoryFramework,
  chapterId: string,
  scene: GameScene,
  ruleMap: Map<string, GameRule>
): string | undefined {
  const parts: string[] = [];
  for (const rid of getSceneBindings(fw.sceneBindings, chapterId, scene.id)) {
    const rule = ruleMap.get(rid);
    if (rule?.judgeExpr?.trim()) parts.push(`(${rule.judgeExpr.trim()})`);
  }
  if (scene.conditions?.trim()) parts.push(`(${scene.conditions.trim()})`);
  for (const rid of scene.ruleIds ?? []) {
    const rule = ruleMap.get(rid);
    if (rule?.judgeExpr?.trim()) parts.push(`(${rule.judgeExpr.trim()})`);
  }
  if (parts.length === 0) return undefined;
  return parts.join(' and ');
}

type FlatEntry = {scene: GameScene; chapterIndex: number; sceneId: string};

export interface SceneRoutingPlan {
  flatEntries: FlatEntry[];
  flatEntryByChapterScene: Map<string, FlatEntry>;
  edgesByFrom: Map<string, MapEdge[]>;
  ruleMap: Map<string, GameRule>;
}

export function buildSceneRoutingPlan(fw: StoryFramework): SceneRoutingPlan {
  const flatEntries = flattenSceneEntries(fw);
  const ruleMap = new Map<string, GameRule>();
  for (const r of fw.gameRules ?? []) ruleMap.set(r.id, r);

  const flatEntryByChapterScene = new Map<string, FlatEntry>();
  for (const item of flatEntries) {
    flatEntryByChapterScene.set(chapterSceneKey(item.chapterIndex, item.sceneId), item);
  }

  const edgesByFrom = new Map<string, MapEdge[]>();
  for (const map of fw.maps ?? []) {
    for (const e of map.edges) {
      const fromList = edgesByFrom.get(e.from) ?? [];
      fromList.push(e);
      edgesByFrom.set(e.from, fromList);
    }
  }

  validateChapterGraphs(fw, flatEntryByChapterScene, edgesByFrom);

  return {flatEntries, flatEntryByChapterScene, edgesByFrom, ruleMap};
}

/** 叙事图中不可达的场景须在地图上可达（否则报错） */
function validateChapterGraphs(
  fw: StoryFramework,
  flatEntryByChapterScene: Map<string, FlatEntry>,
  edgesByFrom: Map<string, MapEdge[]>
): void {
  for (let ci = 0; ci < (fw.chapters ?? []).length; ci++) {
    const ch = fw.chapters![ci];
    const pool = getChapterAvailableSceneIds(ch);
    const narrativeReachable = new Set<string>();
    for (const edge of ch.narrativeEdges ?? []) {
      narrativeReachable.add(edge.fromSceneId);
      narrativeReachable.add(edge.toSceneId);
    }
    if (ch.startSceneId) narrativeReachable.add(ch.startSceneId);

    const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
    const poolNodes = new Set(
      pool.map((id) => sceneMap.get(id)?.mapNodeId).filter(Boolean) as string[]
    );

    for (const sceneId of pool) {
      if (narrativeReachable.has(sceneId)) continue;
      const nodeId = sceneMap.get(sceneId)?.mapNodeId;
      if (!nodeId) {
        throw new Error(
          `章节 ${ch.id} 场景 ${sceneId} 在叙事图中不可达且未配置 mapNodeId`
        );
      }
      if (!isMapReachableFromPool(nodeId, poolNodes, edgesByFrom)) {
        throw new Error(
          `章节 ${ch.id} 场景 ${sceneId} 在叙事图与地图上均不可达（请检查池子与地图边）`
        );
      }
    }

    for (const edge of ch.narrativeEdges ?? []) {
      if (!pool.includes(edge.fromSceneId) || !pool.includes(edge.toSceneId)) {
        throw new Error(`章节 ${ch.id} 叙事边 ${edge.id} 端点不在场景池内`);
      }
    }
  }
}

function isMapReachableFromPool(
  targetNode: string,
  poolNodes: Set<string>,
  edgesByFrom: Map<string, MapEdge[]>
): boolean {
  if (poolNodes.has(targetNode)) return true;
  const visited = new Set<string>();
  const queue = [...poolNodes];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === targetNode) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const e of edgesByFrom.get(node) ?? []) {
      if (!visited.has(e.to)) queue.push(e.to);
    }
  }
  return false;
}

function narrativeLinksForScene(
  fw: StoryFramework,
  ch: FrameworkChapter,
  chapterIndex: number,
  sceneId: string,
  plan: SceneRoutingPlan
): PassageLink[] {
  const chapterId = ch.id;
  const modeCond = chapterModeCondition(chapterId, 'narrative');
  const links: PassageLink[] = [];
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));

  for (const edge of ch.narrativeEdges ?? []) {
    if (edge.fromSceneId !== sceneId) continue;
    const target = sceneMap.get(edge.toSceneId);
    if (!target) continue;
    const targetAccess = buildAccessCondition(fw, chapterId, target, plan.ruleMap);
    links.push({
      displayText: edge.displayText,
      passageName: target.name,
      condition: combineConditions(modeCond, edge.condition, targetAccess),
    });
  }
  return links;
}

function openWorldLinksForScene(
  fw: StoryFramework,
  ch: FrameworkChapter,
  chapterIndex: number,
  scene: GameScene,
  plan: SceneRoutingPlan
): PassageLink[] {
  const chapterId = ch.id;
  const modeCond = chapterModeCondition(chapterId, 'open_world');
  const pool = new Set(getChapterAvailableSceneIds(ch));
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const links: PassageLink[] = [];
  const seen = new Set<string>();
  const mapNodeId = scene.mapNodeId?.trim();
  if (!mapNodeId) return links;

  const addLink = (
    targetId: string,
    displayText: string,
    extraCondition?: string
  ) => {
    if (targetId === scene.id || seen.has(targetId)) return;
    if (!pool.has(targetId)) return;
    const target = sceneMap.get(targetId);
    if (!target) return;
    const targetAccess = buildAccessCondition(fw, chapterId, target, plan.ruleMap);
    links.push({
      displayText,
      passageName: target.name,
      condition: combineConditions(modeCond, extraCondition, targetAccess),
    });
    seen.add(targetId);
  };

  for (const otherId of pool) {
    const other = sceneMap.get(otherId);
    if (other?.mapNodeId === mapNodeId) {
      addLink(otherId, other.name);
    }
  }

  for (const mapEdge of plan.edgesByFrom.get(mapNodeId) ?? []) {
    const edgeCond = mapEdge.condition?.trim();
    const label = mapEdge.displayText?.trim() || mapEdge.to;
    for (const otherId of pool) {
      const other = sceneMap.get(otherId);
      if (other?.mapNodeId === mapEdge.to) {
        addLink(otherId, label, edgeCond);
      }
    }
  }

  return links;
}

function transitionLinksForScene(
  fw: StoryFramework,
  ch: FrameworkChapter,
  chapterIndex: number,
  sceneId: string,
  plan: SceneRoutingPlan
): PassageLink[] {
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const links: PassageLink[] = [];

  for (const tr of ch.transitions ?? []) {
    if (tr.fromSceneId !== sceneId) continue;
    const targetChIdx = fw.chapters.findIndex((c) => c.id === tr.toChapterId);
    if (targetChIdx < 0) continue;
    const targetCh = fw.chapters[targetChIdx]!;
    const landingSceneId = targetCh.startSceneId;
    if (!landingSceneId) continue;
    const targetScene = sceneMap.get(landingSceneId);
    if (!targetScene) continue;
    const targetAccess = buildAccessCondition(fw, targetCh.id, targetScene, plan.ruleMap);
    const raw = tr.displayText.trim();
    const displayText = raw.startsWith('前往') ? raw : `前往 ${raw}`;
    links.push({
      displayText,
      passageName: targetScene.name,
      condition: combineConditions(tr.condition, targetAccess),
      linkActions: {
        set: {
          activeChapterId: tr.toChapterId,
        },
      },
    });
  }
  return links;
}

function computeBaseLinksForScene(
  fw: StoryFramework,
  plan: SceneRoutingPlan,
  chapterIndex: number,
  sceneId: string
): PassageLink[] {
  const ch = fw.chapters[chapterIndex];
  if (!ch) return [];
  const item = plan.flatEntryByChapterScene.get(chapterSceneKey(chapterIndex, sceneId));
  if (!item) return [];

  return [
    ...narrativeLinksForScene(fw, ch, chapterIndex, sceneId, plan),
    ...openWorldLinksForScene(fw, ch, chapterIndex, item.scene, plan),
    ...transitionLinksForScene(fw, ch, chapterIndex, sceneId, plan),
  ];
}

export function computeScenePassageLinks(
  fw: StoryFramework,
  chapterIndex: number,
  sceneId: string,
  plan?: SceneRoutingPlan
): PassageLink[] {
  const routingPlan = plan ?? buildSceneRoutingPlan(fw);
  return computeBaseLinksForScene(fw, routingPlan, chapterIndex, sceneId);
}

export function computeAllScenePassageLinks(fw: StoryFramework): Map<string, PassageLink[]> {
  const plan = buildSceneRoutingPlan(fw);
  const linksByKey = new Map<string, PassageLink[]>();
  for (const {chapterIndex, sceneId} of plan.flatEntries) {
    linksByKey.set(
      chapterSceneKey(chapterIndex, sceneId),
      computeBaseLinksForScene(fw, plan, chapterIndex, sceneId)
    );
  }
  return linksByKey;
}

/** 某场景在章节内的入边（含失败边元数据） */
export function getIncomingNarrativeEdges(
  ch: FrameworkChapter,
  sceneId: string
) {
  return (ch.narrativeEdges ?? []).filter((e) => e.toSceneId === sceneId);
}

export function getSceneUsesNarrativeRouting(ch: FrameworkChapter, sceneId: string): boolean {
  return isNarrativeGraph(ch, sceneId);
}
