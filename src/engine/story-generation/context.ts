import type {StoryFramework, FrameworkChapter} from '@/schema/story-framework';
import {getChapterAvailableSceneIds} from '@/utils/chapter-scene';
import type {GameScene, ScenePassageAiBlock} from '@/schema/game-scene';
import type {StoryGenerationBundle, SceneChapterContext, TextPolicyBundle} from './types';
import {
  formatAiBlockSpec,
  getAiBlocks,
  getScenePassageBlocks,
  resolveAiBlockCharacterIds,
} from '@/utils/passage-blocks';
import {buildSceneRawContextForAiBlock} from './raw-context';
import {buildRollingOutlineGenerationContext} from '@/utils/story-outline-fm';

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
  const priorGenerated: string[] = [];
  for (let i = 0; i < passageBlockIndex; i++) {
    const b = blocks[i];
    if (b.type === 'ai' && b.generatedText?.trim()) priorGenerated.push(truncate(b.generatedText, 200));
  }

  const rollingOutline = buildRollingOutlineGenerationContext(
    fw,
    outline,
    scene.id,
    chapter.chapterId
  );
  const openThreads = foreshadowing.threads.filter((t) => t.status !== 'resolved').slice(0, 12);
  const canonScene = canon.scenes[scene.id];

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
  const blockCharIds = resolveAiBlockCharacterIds(aiBlock, scene);
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
  const dialogueSpeakers = blockCharIds
    .map((id) => fw.characters?.find((c) => c.id === id)?.name ?? id)
    .filter(Boolean);

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
    dialogueSpeakerSource:
      aiBlock.characterIds !== undefined ? 'aiBlock.characterIds' : 'scene.characterIds（继承）',
    mapNode: mapNodeLabel,
    itemsInScene: scene.stateActions?.give
      ? Array.isArray(scene.stateActions.give)
        ? scene.stateActions.give
        : [scene.stateActions.give]
      : undefined,
    rollingOutline,
    openForeshadowing: openThreads,
    canonForScene: canonScene,
    priorGeneratedInScene: priorGenerated.length ? priorGenerated : undefined,
    priorGeneratedWarning:
      priorGenerated.length < passageBlockIndex - 1
        ? '前序 AI 块部分尚未生成，连贯性可能不足'
        : undefined,
  };

  const constraint = {
    writingRules: fw.rules ?? [],
    chapterTitle: chapter.chapterTitle,
    chapterTheme: chapter.chapterTheme,
    previousSceneSummaries: prevSummaries,
    blockSpec: formatAiBlockSpec(aiBlock, scene),
    dialogueRule:
      blockCharIds.length > 0
        ? `对白仅允许以下角色发言：${dialogueSpeakers.join('、')}；问一句一行、答一句一行。`
        : '本块宜纯旁白与描写，不写具名角色对白。',
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
