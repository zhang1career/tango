/**
 * StoryFramework -> Story 转换
 */

import type {Passage, Story} from '@/types';
import type {StoryFramework} from '../schema/story-framework';
import {flattenSceneEntries, toPassageId} from '../schema/story-framework';
import type {GameScene} from '../schema/game-scene';
import {
  buildSceneRoutingPlan,
  computeAllScenePassageLinks,
  getIncomingNarrativeEdges,
} from '../utils/scene-passage-links';
import {
  resolveSceneBackgroundMusic,
  resolvedSceneImagesArray,
} from '../utils/scene-media';
import {edgeIsBranch, sceneFailureEndingText, sceneIsFailure} from '../utils/branch-model';
import {getFailureBranchConfig} from '../utils/failure-branch-features';
import {inferChapterEndSceneIds, isNarrativeGraph} from '../utils/chapter-scene';
import {ACTIVE_CHAPTER_VAR, chapterModeFromRouting, chapterModeVar} from '../utils/chapter-runtime-vars';

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

const DEFAULT_BRANCH_FAILURE_TEMPLATE = '【失败结局】{{failureEnding}}\n\n你暂时偏离了主线目标。';

function renderBranchFailureTemplate(
  template: string,
  payload: {failureEnding: string; rootSceneName: string; edgeId: string}
): string {
  return template
    .replace(/\{\{failureEnding\}\}/g, payload.failureEnding)
    .replace(/\{\{rootSceneName\}\}/g, payload.rootSceneName)
    .replace(/\{\{branchOptionId\}\}/g, payload.edgeId);
}

function failureSuffixForScene(
  fw: StoryFramework,
  chapterIndex: number,
  sceneId: string
): string {
  const ch = fw.chapters[chapterIndex];
  if (!ch) return '';
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const scene = sceneMap.get(sceneId);
  if (!scene || !sceneIsFailure(scene)) return '';

  const incoming = getIncomingNarrativeEdges(ch, sceneId).filter((e) => edgeIsBranch(e));
  const edge = incoming[0];
  const fromScene = edge ? sceneMap.get(edge.fromSceneId) : undefined;
  const template =
    getFailureBranchConfig(fw.features)?.template?.trim() || DEFAULT_BRANCH_FAILURE_TEMPLATE;
  const failureEnding = sceneFailureEndingText(scene);
  return `\n\n${renderBranchFailureTemplate(template, {
    failureEnding,
    rootSceneName: fromScene?.name ?? edge?.fromSceneId ?? '',
    edgeId: edge?.id ?? sceneId,
  })}`;
}

export function frameworkToStory(fw: StoryFramework): Story {
  const flatEntries = flattenSceneEntries(fw);
  const plan = buildSceneRoutingPlan(fw);
  const linksBySceneKey = computeAllScenePassageLinks(fw);

  const passages = new Map<string, Passage>();
  const chaptersMeta = (fw.chapters ?? []).map((ch, ci) => ({
    id: ch.id,
    index: ci,
    narrativeGraph: ch.narrativeGraph ?? {},
    startSceneId: ch.startSceneId,
    endSceneIds: inferChapterEndSceneIds(ch),
  }));

  for (const {scene, chapterIndex, sceneId} of flatEntries) {
    const pid = toPassageId(chapterIndex, sceneId);
    const ch = fw.chapters[chapterIndex]!;
    const thisSceneKey = `${chapterIndex}::${sceneId}`;
    const links = linksBySceneKey.get(thisSceneKey) ?? [];
    const chapterMode = chapterModeFromRouting(isNarrativeGraph(ch, sceneId));
    const hasFailureScene = sceneIsFailure(scene);
    const outEdges = (ch.narrativeEdges ?? []).filter((e) => e.fromSceneId === sceneId);
    const isTerminal = outEdges.length === 0 && !(ch.transitions ?? []).some((t) => t.fromSceneId === sceneId);

    const metadata: Record<string, unknown> = {
      sceneId: scene.id,
      chapterId: ch.id,
      chapterMode,
      set: {
        activeChapterId: ch.id,
        [chapterModeVar(ch.id).replace(/^\$/, '')]: chapterMode,
      },
    };
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
    const mediaOpts = {useFailurePreset: hasFailureScene};
    const resolvedBgm = resolveSceneBackgroundMusic(scene, fw.features, mediaOpts);
    if (resolvedBgm) metadata.backgroundMusic = resolvedBgm;
    const resolvedImages = resolvedSceneImagesArray(scene, fw.features, mediaOpts);
    if (resolvedImages) metadata.images = resolvedImages;
    if (scene.synthesizedBgm) metadata.synthesizedBgm = scene.synthesizedBgm;
    const sceneMessages = scene.messages?.map((m) => m?.trim()).filter(Boolean) as string[] | undefined;
    if (sceneMessages?.length) metadata.messages = sceneMessages;
    if (hasFailureScene && isTerminal) metadata.branchTerminal = true;

    const failureSuffix = failureSuffixForScene(fw, chapterIndex, sceneId);

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
  if (firstCh) {
    const startSceneId = firstCh.startSceneId ?? flatEntries.find((e) => e.chapterIndex === 0)?.sceneId;
    if (startSceneId) startPassageId = toPassageId(0, startSceneId);
  }
  if (startPassageId === 'Start' && flatEntries.length > 0) {
    startPassageId = toPassageId(0, flatEntries[0]!.sceneId);
  }

  const firstChapterId = firstCh?.id ?? '';
  const firstMode = firstCh && firstCh.startSceneId
    ? chapterModeFromRouting(isNarrativeGraph(firstCh, firstCh.startSceneId))
    : 'open_world';

  const storyMetadata: Record<string, unknown> = {
    variables: {
      ...(fw.initialState?.variables ?? {}),
      activeChapterId: firstChapterId,
      ...(firstChapterId
        ? {[chapterModeVar(firstChapterId).replace(/^\$/, '')]: firstMode}
        : {}),
    },
    inventory: fw.initialState?.inventory ?? [],
    reputation: (fw.initialState as {reputation?: Record<string, number>})?.reputation ?? {},
    characters: fw.characters ?? [],
    gameRules: fw.gameRules ?? [],
    events: fw.events ?? [],
    scenes: fw.scenes ?? [],
    items: fw.items ?? [],
    features: fw.features ?? null,
    chapters: chaptersMeta,
  };

  return {
    title: fw.title || '未命名故事',
    startPassageId,
    passages,
    metadata: storyMetadata,
  };
}

export function syncStoryTitleFromFramework(story: Story, fw: StoryFramework): void {
  const title = fw.title?.trim();
  if (title) story.title = title;
}
