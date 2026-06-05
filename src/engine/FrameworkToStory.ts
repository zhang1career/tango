/**
 * StoryFramework -> Story 转换，用于构建 .tw 文件
 * 链接由地图边与准入规则推导；章节起止衔接
 */

import type {Passage, PassageLink, Story} from '@/types';
import type {SceneEntry, StoryFramework} from '../schema/story-framework';
import {flattenSceneEntries, toPassageId} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import type {MapEdge} from '../schema/game-map';
import {ONLY_ONCE_RULE_ID, type GameRule} from '../schema/game-rule';
import {
  resolveSceneBackgroundMusic,
  resolvedSceneImagesArray,
} from '../utils/scene-media';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapRawPassageBlock(text: string): string {
  return `<div class="raw-passage-quote">${escapeHtml(text)}</div>`;
}

function sceneDraftText(scene: GameScene): string {
  const blocks = Array.isArray(scene.passageBlocks) ? scene.passageBlocks : [];
  if (blocks.length === 0) return '';
  return blocks
    .map((block) => (block.type === 'raw' ? wrapRawPassageBlock(block.text) : block.summary))
    .map((text) => text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n');
}

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

function chapterSceneKey(chapterIndex: number, sceneId: string): string {
  return `${chapterIndex}::${sceneId}`;
}

const DEFAULT_BRANCH_FAILURE_TEMPLATE = '【失败结局】{{failureEnding}}\n\n你暂时偏离了主线目标。';

function renderBranchFailureTemplate(
  template: string,
  payload: { failureEnding: string; rootSceneName: string; branchOptionId: string }
): string {
  return template
    .replace(/\{\{failureEnding\}\}/g, payload.failureEnding)
    .replace(/\{\{rootSceneName\}\}/g, payload.rootSceneName)
    .replace(/\{\{branchOptionId\}\}/g, payload.branchOptionId);
}

export function frameworkToStory(fw: StoryFramework): Story {
  const flatEntries = flattenSceneEntries(fw);
  const sceneMap = new Map<string, GameScene>();
  for (const s of fw.scenes ?? []) sceneMap.set(s.id, s);
  const ruleMap = new Map<string, GameRule>();
  for (const r of fw.gameRules ?? []) ruleMap.set(r.id, r);
  const flatEntryByChapterScene = new Map<string, { scene: GameScene; chapterIndex: number; entry: SceneEntry }>();
  for (const item of flatEntries) {
    flatEntryByChapterScene.set(chapterSceneKey(item.chapterIndex, item.scene.id), item);
  }

  const maps = fw.maps ?? [];
  const edgesByFrom = new Map<string, MapEdge[]>();
  for (const map of maps) {
    for (const e of map.edges) {
      const fromList = edgesByFrom.get(e.from) ?? [];
      fromList.push(e);
      edgesByFrom.set(e.from, fromList);
    }
  }

  const passages = new Map<string, Passage>();
  const branchOwnerByChapterScene = new Map<string, { rootSceneId: string; optionId: string }>();
  const branchLinksByFrom = new Map<string, Array<{ displayText: string; targetSceneId: string; condition?: string }>>();

  const pushBranchLink = (
    chapterIndex: number,
    fromSceneId: string,
    link: { displayText: string; targetSceneId: string; condition?: string }
  ) => {
    const key = chapterSceneKey(chapterIndex, fromSceneId);
    const list = branchLinksByFrom.get(key) ?? [];
    list.push(link);
    branchLinksByFrom.set(key, list);
  };

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
        pushBranchLink(ci, rootScene.id, {
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
            pushBranchLink(ci, sceneId, {displayText: txt, targetSceneId: branchSceneIds[bi + 1]});
          } else {
            pushBranchLink(ci, sceneId, {
              displayText: option.returnDisplayText?.trim() || '返回主线',
              targetSceneId: rootScene.id,
            });
          }
        }
      }
    }
  }
  const chapterOrderedEntries = new Map<number, Array<{ scene: GameScene; chapterIndex: number; entry: SceneEntry }>>();
  for (let ci = 0; ci < (fw.chapters ?? []).length; ci++) {
    const ch = fw.chapters![ci];
    const ordered: Array<{ scene: GameScene; chapterIndex: number; entry: SceneEntry }> = [];
    for (const entry of ch.sceneEntries ?? []) {
      const item = flatEntryByChapterScene.get(chapterSceneKey(ci, entry.sceneId));
      if (item) ordered.push(item);
    }
    chapterOrderedEntries.set(ci, ordered);
  }
  const chapterMainlineEntries = new Map<number, Array<{ scene: GameScene; chapterIndex: number; entry: SceneEntry }>>();
  for (const [ci, ordered] of chapterOrderedEntries) {
    chapterMainlineEntries.set(
      ci,
      ordered.filter((item) => !branchOwnerByChapterScene.has(chapterSceneKey(ci, item.scene.id)))
    );
  }

  for (const {scene, chapterIndex, entry} of flatEntries) {
    const pid = toPassageId(chapterIndex, entry.sceneId);
    const links: PassageLink[] = [];

    const thisSceneKey = chapterSceneKey(chapterIndex, scene.id);
    const isBranchScene = branchOwnerByChapterScene.has(thisSceneKey);
    if (!isBranchScene) {
      const chapterMainline = chapterMainlineEntries.get(chapterIndex) ?? [];
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
        const targetAccess = buildAccessCondition(nextMainline.entry, nextMainline.scene, ruleMap);
        const displayText = scene.mainlineLinkDisplayText?.trim() || '继续';
        links.push({
          displayText,
          passageName: nextMainline.scene.name,
          condition: targetAccess || undefined,
        });
      }
    }
    const branchLinks = branchLinksByFrom.get(thisSceneKey) ?? [];
    for (const planned of branchLinks) {
      const target = flatEntryByChapterScene.get(chapterSceneKey(chapterIndex, planned.targetSceneId));
      if (!target) continue;
      const targetAccess = buildAccessCondition(target.entry, target.scene, ruleMap);
      let condition = planned.condition?.trim();
      if (targetAccess) condition = condition ? `${condition} and ${targetAccess}` : targetAccess;
      links.push({
        displayText: planned.displayText,
        passageName: target.scene.name,
        condition: condition || undefined,
      });
    }

    const isBranchFailureEnding = !!scene.branchFailureEnding;
    const branchFailureTemplate = fw.features?.branchFailureEnding?.template?.trim() || DEFAULT_BRANCH_FAILURE_TEMPLATE;

    const metadata: Record<string, unknown> = { sceneId: scene.id };
    if (scene.stateActions) {
      if (scene.stateActions.give) metadata.give = scene.stateActions.give;
      if (scene.stateActions.take) metadata.take = scene.stateActions.take;
      if (scene.stateActions.rep) metadata.rep = scene.stateActions.rep;
    }
    if (scene.characterIds?.length) {
      const ids = scene.characterIds.filter((id) => id !== fw.playerCharacterId);
      if (ids.length) metadata.characterIds = ids;
    }
    if (scene.counterpartCharacterIds?.length) {
      metadata.counterpartCharacterIds = scene.counterpartCharacterIds.filter(Boolean);
    }
    if (scene.characterOverrides && Object.keys(scene.characterOverrides).length > 0) {
      metadata.characterOverrides = scene.characterOverrides;
    }
    if (scene.eventIds?.length) metadata.eventIds = scene.eventIds;
    if (scene.openingAnimation) metadata.openingAnimation = scene.openingAnimation;
    const resolvedBgm = resolveSceneBackgroundMusic(scene, fw.features);
    if (resolvedBgm) metadata.backgroundMusic = resolvedBgm;
    const resolvedImages = resolvedSceneImagesArray(scene, fw.features);
    if (resolvedImages) metadata.images = resolvedImages;
    if (scene.synthesizedBgm) metadata.synthesizedBgm = scene.synthesizedBgm;
    const sceneMessages = scene.messages?.map((m) => m?.trim()).filter(Boolean) as string[] | undefined;
    if (sceneMessages?.length) metadata.messages = sceneMessages;
    if (isBranchFailureEnding) metadata.branchTerminal = true;
    const failureSuffix = isBranchFailureEnding
      ? `\n\n${renderBranchFailureTemplate(branchFailureTemplate, {
          failureEnding: scene.branchFailureEndingText?.trim() ?? '',
          rootSceneName: '',
          branchOptionId: '',
        })}`
      : '';

    passages.set(pid, {
      id: pid,
      name: scene.name,
      text: `${sceneDraftText(scene)}${failureSuffix}`.trim(),
      links,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  }

  const chapters = fw.chapters ?? [];

  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const chapterMainline = chapterMainlineEntries.get(ci) ?? [];
    const chapterLast = chapterMainline[chapterMainline.length - 1];
    if (!chapterLast) continue;
    const lastPid = toPassageId(ci, chapterLast.entry.sceneId);
    const p = passages.get(lastPid);
    if (!p) continue;

    const nextCh = chapters[ci + 1];
    if (!nextCh) {
      p.links = [...(p.links ?? []), {displayText: '前往 完结', passageName: 'End'}];
      continue;
    }

    if (!ch.endMapNodeId || !nextCh.startMapNodeId) continue;
    const nextMainline = chapterMainlineEntries.get(ci + 1) ?? [];
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
    const edge = (edgesByFrom.get(edgeFrom) ?? []).find((e) => e.to === edgeTo);
    if (!edge) {
      throw new Error(
        sharedBoundary
          ? `章节边界缺少地图连边：${edgeFrom} -> ${edgeTo}（本章起点至终点，用于跨章「前往」文案）`
          : `章节边界缺少地图连边：${edgeFrom} -> ${edgeTo}`
      );
    }
    const nextAccess = buildAccessCondition(nextStart.entry, nextStart.scene, ruleMap);
    let crossCondition = edge.condition?.trim();
    if (nextAccess) crossCondition = crossCondition ? `${crossCondition} and ${nextAccess}` : nextAccess;
    const raw = edge.displayText?.trim() || '前往 下一章';
    const displayText = raw.startsWith('前往') ? raw : `前往 ${raw}`;
    p.links = [
      ...(p.links ?? []),
      {displayText, passageName: nextStart.scene.name, condition: crossCondition || undefined},
    ];
  }

  passages.set('End', {
    id: 'End',
    name: 'End',
    text: '',
    links: [],
  });

  let startPassageId = 'Start';
  const firstCh = chapters[0];
  const firstMainline = chapterMainlineEntries.get(0) ?? [];
  if (firstMainline.length > 0) {
    if (firstCh?.startMapNodeId) {
      const matched = firstMainline.find((x) => x.scene.mapNodeId === firstCh.startMapNodeId);
      if (matched) startPassageId = toPassageId(0, matched.entry.sceneId);
    } else {
      startPassageId = toPassageId(0, firstMainline[0].entry.sceneId);
    }
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
    events: fw.events ?? [],
    scenes: fw.scenes ?? [],
    items: fw.items ?? [],
    features: fw.features ?? null,
  };

  return {
    title: fw.title || '未命名故事',
    startPassageId,
    passages,
    metadata: storyMetadata,
  };
}

/** 将 story-fm.json 中的标题同步到已解析的 Story（写入 story.tw 的 StoryTitle） */
export function syncStoryTitleFromFramework(story: Story, fw: StoryFramework): void {
  const title = fw.title?.trim();
  if (title) story.title = title;
}
