import type {StoryFramework, FrameworkChapter} from '@/schema/story-framework';
import {getChapterAvailableSceneIds} from '@/utils/chapter-scene';
import type {GameScene, ScenePassageAiBlock} from '@/schema/game-scene';
import type {StoryGenerationBundle, SceneChapterContext, TextPolicyBundle} from './types';
import {
  formatAiBlockSpec,
  getAiBlocks,
  getScenePassageBlocks,
} from '@/utils/passage-blocks';
import {buildSceneRawContextForAiBlock} from './raw-context';
import {buildRollingOutlineGenerationContext} from '@/utils/story-outline-fm';
import {canonSceneForContext} from '@/schema/story-canon';
import {foreshadowThreadsForSceneContext} from '@/schema/story-foreshadowing';
import {buildPriorCanonInjection} from './prior-canon';
import {resolveBlockDialogueContext} from './dialogue-rules';

const BUDGET = {
  maxChapterEvents: 8,
  maxPreviousSceneSummaries: 8,
  maxCharacters: 14,
};

function truncate(text: string, max: number): string {
  const c = text.replace(/\s+/g, ' ').trim();
  return c.length > max ? `${c.slice(0, max)}…` : c;
}

function sceneSummary(scene: GameScene): string {
  const blocks = getAiBlocks(scene);
  if (blocks.length) return blocks.map((b) => b.summary).filter(Boolean).join(' ');
  const raw = getScenePassageBlocks(scene).find((b) => b.type === 'raw');
  return raw?.type === 'raw' ? truncate(raw.text, 120) : '';
}

export function findChapterForScene(
  fw: StoryFramework,
  sceneId: string
): {chapter: FrameworkChapter; chapterIndex: number; sceneIndex: number} | null {
  for (let chi = 0; chi < (fw.chapters ?? []).length; chi++) {
    const ch = fw.chapters[chi];
    const pool = getChapterAvailableSceneIds(ch);
    const si = pool.indexOf(sceneId);
    if (si >= 0) return {chapter: ch, chapterIndex: chi, sceneIndex: si};
  }
  return null;
}

export function buildChapterContext(
  fw: StoryFramework,
  sceneId: string
): SceneChapterContext | null {
  const found = findChapterForScene(fw, sceneId);
  if (!found) return null;
  return {
    chapterId: found.chapter.id,
    chapterTitle: found.chapter.title,
    chapterTheme: found.chapter.theme ?? '',
    chapterIndex: found.chapterIndex,
    sceneIndex: found.sceneIndex,
  };
}

export function buildGenerationContextPayload(
  bundle: StoryGenerationBundle,
  scene: GameScene,
  chapter: SceneChapterContext,
  aiBlock: ScenePassageAiBlock,
  passageBlockIndex: number
): {possibility: Record<string, unknown>; constraint: Record<string, unknown>} {
  const {fw, outline, foreshadowing, canon, policy} = bundle;
  const sceneMap = new Map((fw.scenes ?? []).map((s) => [s.id, s]));
  const ch = fw.chapters[chapter.chapterIndex];
  const pool = getChapterAvailableSceneIds(ch);
  const prevSummaries = pool.slice(0, chapter.sceneIndex).slice(-BUDGET.maxPreviousSceneSummaries).map((sid) => {
    const s = sceneMap.get(sid);
    return {sceneId: sid, summary: s ? truncate(sceneSummary(s), 180) : ''};
  });

  const blocks = getScenePassageBlocks(scene);
  const allAiBlocks = getAiBlocks(scene);
  let currentAiIndex = 0;
  for (let i = 0; i < passageBlockIndex; i++) {
    if (blocks[i].type === 'ai') currentAiIndex++;
  }

  const priorGenerated: string[] = [];
  for (let i = 0; i < passageBlockIndex; i++) {
    const b = blocks[i];
    if (b.type === 'ai' && b.generatedText?.trim()) priorGenerated.push(b.generatedText.trim());
  }

  const sceneBlockPlan =
    allAiBlocks.length > 1
      ? allAiBlocks.map((b, idx) => ({
          block: idx + 1,
          total: allAiBlocks.length,
          phase: idx === currentAiIndex ? 'current' : idx < currentAiIndex ? 'completed' : 'upcoming',
          summary: b.summary,
          ...(idx < currentAiIndex && b.generatedText?.trim()
            ? {alreadyWritten: truncate(b.generatedText, 400)}
            : {}),
        }))
      : undefined;

  const rollingOutline = buildRollingOutlineGenerationContext(fw, outline, chapter.chapterId);
  const openThreads = foreshadowThreadsForSceneContext(foreshadowing.threads, scene.id);
  const canonForScene = canonSceneForContext(canon, scene.id);
  const priorCanon = buildPriorCanonInjection(fw, canon, chapter.chapterIndex, chapter.sceneIndex);

  const chapterEventIds = new Set<string>();
  for (const sid of pool) {
    const s = sceneMap.get(sid);
    for (const id of s?.eventIds ?? []) chapterEventIds.add(id);
  }
  const chapterEvents = (fw.events ?? [])
    .filter((e) => chapterEventIds.has(e.id))
    .slice(0, BUDGET.maxChapterEvents)
    .map((e) => ({id: e.id, name: e.name, description: e.description ? truncate(e.description, 160) : undefined}));

  const chapterCharIds = new Set<string>();
  for (const sid of pool) {
    const s = sceneMap.get(sid);
    for (const id of s?.characterIds ?? []) chapterCharIds.add(id);
  }
  const sceneCharIds = new Set((scene.characterIds ?? []).filter(Boolean));
  const dialogueCtx = resolveBlockDialogueContext({aiBlock, scene, fw});
  const {blockCharIds, speakerNames: dialogueSpeakers, policy: dialoguePolicy} = dialogueCtx;
  const blockCharIdSet = new Set(blockCharIds);
  const characterPreview = (fw.characters ?? [])
    .filter((c) => blockCharIdSet.has(c.id) || chapterCharIds.has(c.id))
    .slice(0, BUDGET.maxCharacters)
    .map((c) => ({
      id: c.id,
      name: c.name,
      inScene: sceneCharIds.has(c.id),
      maySpeakInBlock: blockCharIdSet.has(c.id),
      description: c.description ? truncate(c.description, 200) : undefined,
    }));
  const counterpartCharacters = (scene.counterpartCharacterIds ?? [])
    .map((id) => {
      const c = fw.characters?.find((x) => x.id === id);
      return c ? {id: c.id, name: c.name} : {id, name: id};
    })
    .filter((c) => c.id);

  const mapNode = scene.mapNodeId
    ? (fw.maps ?? []).flatMap((m) => m.nodes ?? []).find((n) => n.id === scene.mapNodeId)
    : undefined;
  const mapNodeLabel = mapNode ? {id: mapNode.id, name: mapNode.name} : undefined;

  const possibility = {
    background: fw.background ? truncate(fw.background, 600) : undefined,
    policyGlobalRules: policy.globalRules,
    chapterEvents,
    characterPreview,
    dialogueSpeakers: dialogueSpeakers.length ? dialogueSpeakers : ['（本块无具名对白角色）'],
    dialogueSpeakerSource: dialogueCtx.explicitBlockCharacterIds
      ? 'aiBlock.characterIds（本块显式指定）'
      : 'scene.characterIds（继承）',
    ...(counterpartCharacters.length
      ? {
          counterpartCharacters,
          counterpartNote:
            '本场议题涉及的对戏/立场人物；若本块含问询节拍，优先让这些人物之一发言（须在 block dialogueCharacters 白名单内）。',
        }
      : {}),
    mapNode: mapNodeLabel,
    itemsInScene: scene.stateActions?.give
      ? Array.isArray(scene.stateActions.give)
        ? scene.stateActions.give
        : [scene.stateActions.give]
      : undefined,
    rollingOutline,
    openForeshadowing: openThreads.length ? openThreads : undefined,
    canonForScene,
    priorCanon,
  };

  const multiBlockScene = allAiBlocks.length > 1;
  const constraint = {
    writingRules: fw.rules ?? [],
    chapterTitle: chapter.chapterTitle,
    chapterTheme: chapter.chapterTheme,
    previousSceneSummaries: prevSummaries,
    blockSpec: formatAiBlockSpec(aiBlock, scene),
    currentBlockMission: aiBlock.summary,
    dialoguePolicy,
    impliesInquiry: dialogueCtx.impliesInquiry,
    summaryOnlyRule: dialogueCtx.summaryOnlyRule,
    dialogueRule: dialogueCtx.dialogueRule,
    ...(multiBlockScene
      ? {
          sceneBlockPlan,
          continuityRule:
            '同场多块须语义连贯、节拍递进：已完成块与 raw 已展示的内容（时地、环境、对白、人物问询）不得在本块复述或同义改写；本块只写 blockSpec 中的新节拍并自然接续上文。',
        }
      : {}),
    ...(priorGenerated.length
      ? {
          priorGeneratedInScene: priorGenerated.map((text, idx) => ({
            block: idx + 1,
            excerpt: truncate(text, 400),
          })),
          noRepeatPriorBlocks:
            '严禁重复 priorGeneratedInScene 中已写过的句子、对白轮次或场景定场；从已完成处往下推进。',
        }
      : {}),
    ...buildSceneRawContextForAiBlock(scene, passageBlockIndex),
  };

  return {possibility, constraint};
}

export async function loadTextPolicy(): Promise<TextPolicyBundle> {
  try {
    const res = await fetch('/assets/policy.json');
    if (!res.ok) return {globalRules: []};
    const data = (await res.json()) as {
      textPolicies?: {globalRules?: string[]; addressingRules?: unknown[]};
    };
    return {
      globalRules: data.textPolicies?.globalRules ?? [],
      addressingRules: data.textPolicies?.addressingRules,
    };
  } catch {
    return {globalRules: []};
  }
}
