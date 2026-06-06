/**
 * 场景 passage 链接计算（与 FrameworkToStory 编译规则单一来源）
 */

import type {PassageLink} from '@/types';
import type {SceneEntry, StoryFramework} from '../schema/story-framework';
import {flattenSceneEntries} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {MapEdge} from '../schema/game-map';
import {ONLY_ONCE_RULE_ID, type GameRule} from '../schema/game-rule';

export function chapterSceneKey(chapterIndex: number, sceneId: string): string {
  return `${chapterIndex}::${sceneId}`;
}

/** 准入条件按顺序嵌套：先章节规则，再场景条件，再场景规则 */
export function buildAccessCondition(
  entry: SceneEntry,
  scene: GameScene,
  ruleMap: Map<string, GameRule>
): string | undefined {
  const parts: string[] = [];
  for (const rid of entry.ruleIds ?? []) {
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

type FlatEntry = {scene: GameScene; chapterIndex: number; entry: SceneEntry};

export interface SceneRoutingPlan {
  flatEntries: FlatEntry[];
  flatEntryByChapterScene: Map<string, FlatEntry>;
  chapterMainlineEntries: Map<number, FlatEntry[]>;
  branchOwnerByChapterScene: Map<string, {rootSceneId: string; optionId: string}>;
  branchLinksByFrom: Map<string, Array<{displayText: string; targetSceneId: string; condition?: string}>>;
  edgesByFrom: Map<string, MapEdge[]>;
  ruleMap: Map<string, GameRule>;
}

function pushBranchLink(
  branchLinksByFrom: Map<string, Array<{displayText: string; targetSceneId: string; condition?: string}>>,
  chapterIndex: number,
  fromSceneId: string,
  link: {displayText: string; targetSceneId: string; condition?: string}
): void {
  const key = chapterSceneKey(chapterIndex, fromSceneId);
  const list = branchLinksByFrom.get(key) ?? [];
  list.push(link);
  branchLinksByFrom.set(key, list);
}

/** 构建全剧路由计划（含支线校验，与 FrameworkToStory 一致） */
export function buildSceneRoutingPlan(fw: StoryFramework): SceneRoutingPlan {
  const flatEntries = flattenSceneEntries(fw);
  const ruleMap = new Map<string, GameRule>();
  for (const r of fw.gameRules ?? []) ruleMap.set(r.id, r);

  const flatEntryByChapterScene = new Map<string, FlatEntry>();
  for (const item of flatEntries) {
    flatEntryByChapterScene.set(chapterSceneKey(item.chapterIndex, item.scene.id), item);
  }

  const edgesByFrom = new Map<string, MapEdge[]>();
  for (const map of fw.maps ?? []) {
    for (const e of map.edges) {
      const fromList = edgesByFrom.get(e.from) ?? [];
      fromList.push(e);
      edgesByFrom.set(e.from, fromList);
    }
  }

  const branchOwnerByChapterScene = new Map<string, {rootSceneId: string; optionId: string}>();
  const branchLinksByFrom = new Map<
    string,
    Array<{displayText: string; targetSceneId: string; condition?: string}>
  >();

  for (let ci = 0; ci < (fw.chapters ?? []).length; ci++) {
    const ch = fw.chapters![ci];
    const chapterItems = flatEntries.filter((x) => x.chapterIndex === ci);
    const chapterSceneIds = new Set(chapterItems.map((x) => x.scene.id));
    for (const item of chapterItems) {
      const rootScene = item.scene;
      const options = (rootScene.branchOptions ?? []).filter(Boolean);
      if (options.length === 0) continue;
      const rootRuleIds = new Set<string>([...(item.entry.ruleIds ?? []), ...(rootScene.ruleIds ?? [])]);
      if (rootRuleIds.has(ONLY_ONCE_RULE_ID)) {
        throw new Error(
          `场景 ${rootScene.id} 配置了 branchOptions，不可使用 onlyOnce 规则（${ONLY_ONCE_RULE_ID}）`
        );
      }
      for (let oi = 0; oi < options.length; oi++) {
        const option = options[oi];
        const optionLabel = option.id || `index_${oi}`;
        const displayText = option.displayText?.trim();
        if (!displayText) {
          throw new Error(`场景 ${rootScene.id} 的 branchOptions[${optionLabel}] 缺少 displayText`);
        }
        const failureEnding = option.failureEnding?.trim();
        if (!failureEnding) {
          throw new Error(`场景 ${rootScene.id} 的 branchOptions[${optionLabel}] 缺少 failureEnding`);
        }
        const branchSceneIds = (option.branchSceneIds ?? []).map((id) => id?.trim()).filter(Boolean);
        if (branchSceneIds.length < 1 || branchSceneIds.length > 2) {
          throw new Error(
            `场景 ${rootScene.id} 的 branchOptions[${optionLabel}] 的 branchSceneIds 必须是 1-2 个场景`
          );
        }
        if (new Set(branchSceneIds).size !== branchSceneIds.length) {
          throw new Error(`场景 ${rootScene.id} 的 branchOptions[${optionLabel}] 存在重复场景 id`);
        }
        if (branchSceneIds.includes(rootScene.id)) {
          throw new Error(`场景 ${rootScene.id} 的 branchOptions[${optionLabel}] 不能把根场景自身放入 branchSceneIds`);
        }
        if (
          option.continueDisplayTexts &&
          option.continueDisplayTexts.length !== branchSceneIds.length - 1
        ) {
          throw new Error(
            `场景 ${rootScene.id} 的 branchOptions[${optionLabel}] 的 continueDisplayTexts 长度应为 branchSceneIds.length - 1`
          );
        }
        pushBranchLink(branchLinksByFrom, ci, rootScene.id, {
          displayText,
          targetSceneId: branchSceneIds[0],
          condition: option.condition?.trim() || undefined,
        });
        for (let bi = 0; bi < branchSceneIds.length; bi++) {
          const sceneId = branchSceneIds[bi];
          if (!chapterSceneIds.has(sceneId)) {
            throw new Error(
              `场景 ${rootScene.id} 的 branchOptions[${optionLabel}] 引用了当前章节不存在的场景 ${sceneId}`
            );
          }
          const ownerKey = chapterSceneKey(ci, sceneId);
          const owner = branchOwnerByChapterScene.get(ownerKey);
          if (owner) {
            throw new Error(
              `章节 ${ch.id} 中场景 ${sceneId} 被多个支线复用（${owner.rootSceneId}/${owner.optionId} 与 ${rootScene.id}/${optionLabel}）`
            );
          }
          branchOwnerByChapterScene.set(ownerKey, {rootSceneId: rootScene.id, optionId: optionLabel});
          const branchItem = flatEntryByChapterScene.get(ownerKey);
          if (!branchItem) {
            throw new Error(`章节 ${ch.id} 中未找到支线场景 ${sceneId}`);
          }
          if (rootScene.mapNodeId !== branchItem.scene.mapNodeId) {
            throw new Error(
              `支线场景 ${sceneId} 必须与根场景 ${rootScene.id} 使用同一 mapNodeId（当前为 ${String(branchItem.scene.mapNodeId ?? '空')}，期望 ${String(rootScene.mapNodeId ?? '空')}）`
            );
          }
          if (!(branchItem.scene.ruleIds ?? []).includes(ONLY_ONCE_RULE_ID)) {
            throw new Error(
              `支线场景 ${sceneId} 必须在 story-scenes.json.scene.ruleIds 中包含 ${ONLY_ONCE_RULE_ID}`
            );
          }
          if (bi < branchSceneIds.length - 1) {
            const txt = option.continueDisplayTexts?.[bi]?.trim() || '继续';
            pushBranchLink(branchLinksByFrom, ci, sceneId, {displayText: txt, targetSceneId: branchSceneIds[bi + 1]});
          } else {
            pushBranchLink(branchLinksByFrom, ci, sceneId, {
              displayText: option.returnDisplayText?.trim() || '返回主线',
              targetSceneId: rootScene.id,
            });
          }
        }
      }
    }
  }

  const chapterOrderedEntries = new Map<number, FlatEntry[]>();
  for (let ci = 0; ci < (fw.chapters ?? []).length; ci++) {
    const ch = fw.chapters![ci];
    const ordered: FlatEntry[] = [];
    for (const entry of ch.sceneEntries ?? []) {
      const item = flatEntryByChapterScene.get(chapterSceneKey(ci, entry.sceneId));
      if (item) ordered.push(item);
    }
    chapterOrderedEntries.set(ci, ordered);
  }

  const chapterMainlineEntries = new Map<number, FlatEntry[]>();
  for (const [ci, ordered] of chapterOrderedEntries) {
    chapterMainlineEntries.set(
      ci,
      ordered.filter((item) => !branchOwnerByChapterScene.has(chapterSceneKey(ci, item.scene.id)))
    );
  }

  return {
    flatEntries,
    flatEntryByChapterScene,
    chapterMainlineEntries,
    branchOwnerByChapterScene,
    branchLinksByFrom,
    edgesByFrom,
    ruleMap,
  };
}

function appendCrossChapterLinks(
  fw: StoryFramework,
  plan: SceneRoutingPlan,
  linksBySceneKey: Map<string, PassageLink[]>
): void {
  const chapters = fw.chapters ?? [];
  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const chapterMainline = plan.chapterMainlineEntries.get(ci) ?? [];
    const chapterLast = chapterMainline[chapterMainline.length - 1];
    if (!chapterLast) continue;
    const lastKey = chapterSceneKey(ci, chapterLast.scene.id);
    const existing = linksBySceneKey.get(lastKey) ?? [];

    const nextCh = chapters[ci + 1];
    if (!nextCh) {
      linksBySceneKey.set(lastKey, [...existing, {displayText: '前往 完结', passageName: 'End'}]);
      continue;
    }

    if (!ch.endMapNodeId || !nextCh.startMapNodeId) continue;
    const nextMainline = plan.chapterMainlineEntries.get(ci + 1) ?? [];
    const nextStart = nextMainline.find((x) => x.scene.mapNodeId === nextCh.startMapNodeId);
    if (!nextStart) {
      throw new Error(
        `章节 ${nextCh.id} 未找到 mapNodeId=${nextCh.startMapNodeId} 的主线场景，无法建立跨章连接`
      );
    }
    const endNode = ch.endMapNodeId;
    const nextStartNode = nextCh.startMapNodeId;
    const sharedBoundary = endNode === nextStartNode;
    const edgeFrom = sharedBoundary
      ? (ch.startMapNodeId ?? chapterLast.scene.mapNodeId ?? endNode)
      : endNode;
    const edgeTo = sharedBoundary ? endNode : nextStartNode;
    const edge = (plan.edgesByFrom.get(edgeFrom) ?? []).find((e) => e.to === edgeTo);
    if (!edge) {
      throw new Error(
        sharedBoundary
          ? `章节边界缺少地图连边：${edgeFrom} -> ${edgeTo}（本章起点至终点，用于跨章「前往」文案）`
          : `章节边界缺少地图连边：${edgeFrom} -> ${edgeTo}`
      );
    }
    const nextAccess = buildAccessCondition(nextStart.entry, nextStart.scene, plan.ruleMap);
    let crossCondition = edge.condition?.trim();
    if (nextAccess) crossCondition = crossCondition ? `${crossCondition} and ${nextAccess}` : nextAccess;
    const raw = edge.displayText?.trim() || '前往 下一章';
    const displayText = raw.startsWith('前往') ? raw : `前往 ${raw}`;
    linksBySceneKey.set(lastKey, [
      ...existing,
      {displayText, passageName: nextStart.scene.name, condition: crossCondition || undefined},
    ]);
  }
}

function computeBaseLinksForScene(
  fw: StoryFramework,
  plan: SceneRoutingPlan,
  chapterIndex: number,
  scene: GameScene,
  entry: SceneEntry
): PassageLink[] {
  const links: PassageLink[] = [];
  const thisSceneKey = chapterSceneKey(chapterIndex, scene.id);
  const isBranchScene = plan.branchOwnerByChapterScene.has(thisSceneKey);

  if (!isBranchScene) {
    const chapterMainline = plan.chapterMainlineEntries.get(chapterIndex) ?? [];
    const idx = chapterMainline.findIndex((x) => x.scene.id === scene.id);
    const hasNextMainline = idx >= 0 && idx < chapterMainline.length - 1;
    const branchOptions = (scene.branchOptions ?? []).filter(Boolean);
    if (hasNextMainline && branchOptions.length > 0) {
      const mainlineText = scene.mainlineLinkDisplayText?.trim();
      if (!mainlineText) {
        throw new Error(
          `场景 ${scene.id} 配置了 branchOptions 且同章有后续主线，须填写 mainlineLinkDisplayText`
        );
      }
    }
    if (hasNextMainline) {
      const nextMainline = chapterMainline[idx + 1];
      const targetAccess = buildAccessCondition(nextMainline.entry, nextMainline.scene, plan.ruleMap);
      const displayText = scene.mainlineLinkDisplayText?.trim() || '继续';
      links.push({
        displayText,
        passageName: nextMainline.scene.name,
        condition: targetAccess || undefined,
      });
    }
  }

  const branchLinks = plan.branchLinksByFrom.get(thisSceneKey) ?? [];
  for (const planned of branchLinks) {
    const target = plan.flatEntryByChapterScene.get(chapterSceneKey(chapterIndex, planned.targetSceneId));
    if (!target) continue;
    const targetAccess = buildAccessCondition(target.entry, target.scene, plan.ruleMap);
    let condition = planned.condition?.trim();
    if (targetAccess) condition = condition ? `${condition} and ${targetAccess}` : targetAccess;
    links.push({
      displayText: planned.displayText,
      passageName: target.scene.name,
      condition: condition || undefined,
    });
  }

  return links;
}

/** 计算单个场景在 story.tw 末页应有的全部链接（含跨章，若该场景为章末主线） */
export function computeScenePassageLinks(
  fw: StoryFramework,
  chapterIndex: number,
  sceneId: string,
  plan?: SceneRoutingPlan
): PassageLink[] {
  const routingPlan = plan ?? buildSceneRoutingPlan(fw);
  const item = routingPlan.flatEntryByChapterScene.get(chapterSceneKey(chapterIndex, sceneId));
  if (!item) return [];

  const linksByKey = new Map<string, PassageLink[]>();
  for (const {scene, chapterIndex: ci, entry} of routingPlan.flatEntries) {
    linksByKey.set(
      chapterSceneKey(ci, scene.id),
      computeBaseLinksForScene(fw, routingPlan, ci, scene, entry)
    );
  }
  appendCrossChapterLinks(fw, routingPlan, linksByKey);
  return linksByKey.get(chapterSceneKey(chapterIndex, sceneId)) ?? [];
}

/** 计算全剧各场景链接，键为 chapterIndex::sceneId */
export function computeAllScenePassageLinks(fw: StoryFramework): Map<string, PassageLink[]> {
  const plan = buildSceneRoutingPlan(fw);
  const linksByKey = new Map<string, PassageLink[]>();
  for (const {scene, chapterIndex, entry} of plan.flatEntries) {
    linksByKey.set(
      chapterSceneKey(chapterIndex, scene.id),
      computeBaseLinksForScene(fw, plan, chapterIndex, scene, entry)
    );
  }
  appendCrossChapterLinks(fw, plan, linksByKey);
  return linksByKey;
}

export interface CrossChapterExit {
  displayText: string;
  targetSceneId: string;
  targetSceneName: string;
  mapEdgeFrom: string;
  mapEdgeTo: string;
}

/** 若该场景为章末主线，返回跨章出口信息（不含「前往 」前缀的展示文案） */
export function computeCrossChapterExit(
  fw: StoryFramework,
  chapterIndex: number,
  sceneId: string,
  plan?: SceneRoutingPlan
): CrossChapterExit | undefined {
  const routingPlan = plan ?? buildSceneRoutingPlan(fw);
  const chapters = fw.chapters ?? [];
  const ch = chapters[chapterIndex];
  if (!ch) return undefined;

  const chapterMainline = routingPlan.chapterMainlineEntries.get(chapterIndex) ?? [];
  const chapterLast = chapterMainline[chapterMainline.length - 1];
  if (!chapterLast || chapterLast.scene.id !== sceneId) return undefined;

  const nextCh = chapters[chapterIndex + 1];
  if (!nextCh || !ch.endMapNodeId || !nextCh.startMapNodeId) return undefined;

  const nextMainline = routingPlan.chapterMainlineEntries.get(chapterIndex + 1) ?? [];
  const nextStart = nextMainline.find((x) => x.scene.mapNodeId === nextCh.startMapNodeId);
  if (!nextStart) return undefined;

  const endNode = ch.endMapNodeId;
  const nextStartNode = nextCh.startMapNodeId;
  const sharedBoundary = endNode === nextStartNode;
  const edgeFrom = sharedBoundary
    ? (ch.startMapNodeId ?? chapterLast.scene.mapNodeId ?? endNode)
    : endNode;
  const edgeTo = sharedBoundary ? endNode : nextStartNode;
  const edge = (routingPlan.edgesByFrom.get(edgeFrom) ?? []).find((e) => e.to === edgeTo);
  if (!edge) return undefined;

  const raw = edge.displayText?.trim() || '下一章';
  const displayText = raw.startsWith('前往') ? raw.slice(3).trim() : raw;
  return {
    displayText,
    targetSceneId: nextStart.scene.id,
    targetSceneName: nextStart.scene.name,
    mapEdgeFrom: edgeFrom,
    mapEdgeTo: edgeTo,
  };
}
