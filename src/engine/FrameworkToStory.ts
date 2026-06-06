/**
 * StoryFramework -> Story 转换，用于构建 .tw 文件
 * 链接由地图边与准入规则推导；章节起止衔接
 */

import type {Passage, Story} from '@/types';
import type {StoryFramework} from '../schema/story-framework';
import {flattenSceneEntries, toPassageId} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {
  buildSceneRoutingPlan,
  computeAllScenePassageLinks,
} from '../utils/scene-passage-links';
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
  const plan = buildSceneRoutingPlan(fw);
  const linksBySceneKey = computeAllScenePassageLinks(fw);
  const branchOwnerByChapterScene = plan.branchOwnerByChapterScene;

  const passages = new Map<string, Passage>();

  for (const {scene, chapterIndex, entry} of flatEntries) {
    const pid = toPassageId(chapterIndex, entry.sceneId);
    const thisSceneKey = chapterSceneKey(chapterIndex, scene.id);
    const isBranchScene = branchOwnerByChapterScene.has(thisSceneKey);
    const links = linksBySceneKey.get(thisSceneKey) ?? [];

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

  passages.set('End', {
    id: 'End',
    name: 'End',
    text: '',
    links: [],
  });

  const chapters = fw.chapters ?? [];
  let startPassageId = 'Start';
  const firstCh = chapters[0];
  const firstMainline = plan.chapterMainlineEntries.get(0) ?? [];
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
