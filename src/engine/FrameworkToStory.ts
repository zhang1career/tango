/**
 * StoryFramework -> Story 转换，用于构建 .tw 文件
 * 链接由地图边与准入规则推导；章节起止衔接
 */

import type {Passage, PassageLink, Story} from '@/types';
import type {SceneEntry, StoryFramework} from '../schema/story-framework';
import {flattenSceneEntries, toPassageId} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {MapEdge} from '../schema/game-map';
import type {GameRule} from '../schema/game-rule';

/** 准入条件按顺序嵌套：先章节规则，再场景条件，再场景规则 */
function buildAccessCondition(
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

/** 同章内，mapNodeId 对应的第一个 scene 的 passage id */
function findPassageByMapNode(
  chapterIndex: number,
  mapNodeId: string,
  flatEntries: Array<{ scene: GameScene; chapterIndex: number; entry: { sceneId: string } }>
): string | null {
  for (const item of flatEntries) {
    if (item.chapterIndex !== chapterIndex) continue;
    const s = item.scene;
    if (s.mapNodeId === mapNodeId) return toPassageId(chapterIndex, item.entry.sceneId);
  }
  return null;
}

export function frameworkToStory(fw: StoryFramework): Story {
  const flatEntries = flattenSceneEntries(fw);
  const sceneMap = new Map<string, GameScene>();
  for (const s of fw.scenes ?? []) sceneMap.set(s.id, s);
  const ruleMap = new Map<string, GameRule>();
  for (const r of fw.gameRules ?? []) ruleMap.set(r.id, r);

  const maps = fw.maps ?? [];
  const edgesByFrom = new Map<string, MapEdge[]>();
  const edgesByTo = new Map<string, MapEdge[]>();
  const nodeNameById = new Map<string, string>();
  for (const map of maps) {
    for (const n of map.nodes) nodeNameById.set(n.id, n.name);
    for (const e of map.edges) {
      const fromList = edgesByFrom.get(e.from) ?? [];
      fromList.push(e);
      edgesByFrom.set(e.from, fromList);
      const toList = edgesByTo.get(e.to) ?? [];
      toList.push(e);
      edgesByTo.set(e.to, toList);
    }
  }

  const passages = new Map<string, Passage>();

  for (const {scene, chapterIndex, entry} of flatEntries) {
    const pid = toPassageId(chapterIndex, entry.sceneId);
    const links: PassageLink[] = [];

    if (scene.mapNodeId) {
      // 出边：当前节点 -> 目标；入边（反向）：目标 -> 当前节点，可生成「从当前到来源」的链接
      const outEdges = edgesByFrom.get(scene.mapNodeId) ?? [];
      const inEdges = edgesByTo.get(scene.mapNodeId) ?? [];
      const seenTargets = new Set<string>();
      const addLink = (edge: MapEdge, targetNodeId: string) => {
        if (seenTargets.has(targetNodeId)) return;
        const targetPid = findPassageByMapNode(chapterIndex, targetNodeId, flatEntries);
        if (!targetPid) return;
        seenTargets.add(targetNodeId);
        const targetScene = flatEntries.find(
          (x) => x.chapterIndex === chapterIndex && toPassageId(x.chapterIndex, x.entry.sceneId) === targetPid
        );
        const targetAccess = targetScene
          ? buildAccessCondition(targetScene.entry, targetScene.scene, ruleMap)
          : undefined;
        let condition = edge.condition?.trim();
        if (targetAccess) condition = condition ? `${condition} and ${targetAccess}` : targetAccess;
        const targetEntry = flatEntries.find(
          (x) => toPassageId(x.chapterIndex, x.entry.sceneId) === targetPid
        );
        const targetNodeName = nodeNameById.get(targetNodeId);
        // displayText：优先非空边文案，否则用目标地图节点名称；统一加「前往」前缀以便与 Twine 展示一致
        const raw = (edge.displayText?.trim())
          ? edge.displayText.trim()
          : (targetNodeName ?? targetEntry?.scene.name ?? targetNodeId);
        const displayText = raw.startsWith('前往') ? raw : `前往 ${raw}`;
        // passageName：目标场景名称（.tw 中 passage 以 name 标识）
        const passageName = targetEntry ? targetEntry.scene.name : (targetNodeName ?? targetNodeId);
        links.push({
          displayText,
          passageName,
          condition: condition || undefined,
        });
      };
      for (const edge of outEdges) addLink(edge, edge.to);
      for (const edge of inEdges) addLink(edge, edge.from);
    }

    const metadata: Record<string, unknown> = {};
    if (scene.stateActions) {
      if (scene.stateActions.give) metadata.give = scene.stateActions.give;
      if (scene.stateActions.take) metadata.take = scene.stateActions.take;
      if (scene.stateActions.rep) metadata.rep = scene.stateActions.rep;
    }
    if (scene.characterIds?.length) {
      const ids = scene.characterIds.filter((id) => id !== fw.playerCharacterId);
      if (ids.length) metadata.characterIds = ids;
    }
    if (scene.openingAnimation) metadata.openingAnimation = scene.openingAnimation;
    const validImages = scene.images?.filter((u) => u?.trim());
    if (validImages?.length) metadata.images = validImages.map((u) => u.trim());
    if (scene.backgroundMusic) metadata.backgroundMusic = scene.backgroundMusic;

    passages.set(pid, {
      id: pid,
      name: scene.name,
      text: scene.summary || '',
      links,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  }

  const chapters = fw.chapters ?? [];

  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const endNodeId = ch.endMapNodeId;
    if (!endNodeId) continue;
    const endPid = findPassageByMapNode(ci, endNodeId, flatEntries);
    if (!endPid) continue;

    const p = passages.get(endPid);
    if (!p) continue;

    const nextCh = chapters[ci + 1];
    if (nextCh?.startMapNodeId) {
      const nextStartPid = findPassageByMapNode(ci + 1, nextCh.startMapNodeId, flatEntries);
      if (nextStartPid) {
        p.links = [...(p.links ?? []), {displayText: '前往 下一章', passageName: nextStartPid}];
      }
    } else {
      p.links = [...(p.links ?? []), {displayText: '前往 完结', passageName: 'End'}];
    }
  }

  passages.set('End', {
    id: 'End',
    name: 'End',
    text: '',
    links: [],
  });

  let startPassageId = 'Start';
  const firstCh = chapters[0];
  if (firstCh?.startMapNodeId) {
    const sid = findPassageByMapNode(0, firstCh.startMapNodeId, flatEntries);
    if (sid) startPassageId = sid;
  }
  if (startPassageId === 'Start' && flatEntries.length > 0) {
    startPassageId = toPassageId(0, flatEntries[0].entry.sceneId);
  }

  const storyMetadata: Record<string, unknown> = {
    variables: fw.initialState?.variables ?? {},
    inventory: fw.initialState?.inventory ?? [],
    reputation: (fw.initialState as { reputation?: Record<string, number> })?.reputation ?? {},
    characters: fw.characters ?? [],
    gameRules: fw.gameRules ?? [],
  };

  return {
    title: fw.title || '未命名故事',
    startPassageId,
    passages,
    metadata: storyMetadata,
  };
}
