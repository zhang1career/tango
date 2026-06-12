import type {GameScene, ScenePassageAiBlock} from '@/schema/game-scene';
import type {StoryFramework} from '@/schema/story-framework';
import {resolveAiBlockCharacterIds} from '@/utils/passage-blocks';

/** 本块对白策略：禁止 / 可选 / 弱强制（summary 暗示问询）/ 强强制（显式 characterIds + 问询） */
export type DialoguePolicy = 'forbidden' | 'optional' | 'required_weak' | 'required_strong';

const INQUIRY_PATTERN =
  /(?:问|答|质询|问询|奏对|引语|对白|发言|回话|开口|质问道|请教|辩驳|争论|论辩|陈奏|启奏|殿议|攀谈|诘问|一问|一答|一句(?:话|引)|(?:谁|为何|如何).{0,8}[？?])/;

const QUOTED_ANCHOR = /[「『"“]/;

function blockTextForInquiryScan(block: ScenePassageAiBlock): string {
  const parts = [block.summary, ...(block.anchors ?? []), block.constraints].filter(Boolean);
  return parts.join('\n');
}

/** summary / anchors / constraints 是否暗示人物问询或关键引语 */
export function blockImpliesInquiry(block: ScenePassageAiBlock): boolean {
  const text = blockTextForInquiryScan(block);
  if (INQUIRY_PATTERN.test(text)) return true;
  return (block.anchors ?? []).some((a) => QUOTED_ANCHOR.test(a));
}

export function isExplicitBlockCharacterIds(block: ScenePassageAiBlock): boolean {
  return block.characterIds !== undefined;
}

export function hasExplicitNonProtagonistSpeakers(
  blockCharIds: string[],
  playerCharacterId?: string
): boolean {
  if (!blockCharIds.length) return false;
  if (!playerCharacterId) return blockCharIds.length > 0;
  return blockCharIds.some((id) => id !== playerCharacterId);
}

export function resolveDialoguePolicy(input: {
  aiBlock: ScenePassageAiBlock;
  blockCharIds: string[];
  playerCharacterId?: string;
}): DialoguePolicy {
  const {aiBlock, blockCharIds, playerCharacterId} = input;

  if (isExplicitBlockCharacterIds(aiBlock) && blockCharIds.length === 0) {
    return 'forbidden';
  }

  const impliesInquiry = blockImpliesInquiry(aiBlock);
  const explicitChars = isExplicitBlockCharacterIds(aiBlock) && blockCharIds.length > 0;
  const hasNonProtagonist = hasExplicitNonProtagonistSpeakers(blockCharIds, playerCharacterId);

  if (explicitChars && hasNonProtagonist && impliesInquiry) {
    return 'required_strong';
  }

  if (impliesInquiry && blockCharIds.length > 0) {
    return 'required_weak';
  }

  return 'optional';
}

export function buildDialogueRule(input: {
  policy: DialoguePolicy;
  speakerNames: string[];
}): string {
  const {policy, speakerNames} = input;
  const list = speakerNames.length ? speakerNames.join('、') : '（无）';
  const formatHint = '问一句一行、答一句一行，不超过 1 轮';

  switch (policy) {
    case 'forbidden':
      return '本块 characterIds 为空（纯旁白块），不得写入具名角色对白。';
    case 'required_strong':
      return `本块显式指定可发言人物且 summary/anchors 含问询节拍：须优先从以下角色写出不超过 1 轮对白（${formatHint}）：${list}。`;
    case 'required_weak':
      return `summary 或 anchors 已含问询/引语节拍：须用以下白名单角色之一写出不超过 1 轮对白（${formatHint}）：${list}。`;
    default:
      return speakerNames.length
        ? `对白仅允许以下角色发言：${list}；无问询节拍时宜纯旁白，不写具名对白。`
        : '本块无具名对白角色，宜纯旁白与描写。';
  }
}

export function buildSummaryOnlyRule(policy: DialoguePolicy): string {
  const base =
    '正文必须且只能实现 currentBlockMission 的单一节拍；不得写入 summary/anchors 未暗示的时地定场、人物问询、回忆闪回或最终决策。';
  if (policy === 'required_weak' || policy === 'required_strong') {
    return `${base} summary 或 anchors 已暗示问询时，须按 dialogueRule 用白名单角色写出不超过 1 轮对白，不得扩写为多轮交锋。`;
  }
  if (policy === 'forbidden') {
    return `${base} 本块为纯旁白块，不得写入具名角色对白。`;
  }
  return base;
}

export function resolveBlockDialogueContext(input: {
  aiBlock: ScenePassageAiBlock;
  scene: GameScene;
  fw: StoryFramework;
}): {
  blockCharIds: string[];
  speakerNames: string[];
  policy: DialoguePolicy;
  impliesInquiry: boolean;
  explicitBlockCharacterIds: boolean;
  dialogueRule: string;
  summaryOnlyRule: string;
} {
  const {aiBlock, scene, fw} = input;
  const blockCharIds = resolveAiBlockCharacterIds(aiBlock, scene);
  const speakerNames = blockCharIds
    .map((id) => fw.characters?.find((c) => c.id === id)?.name ?? id)
    .filter(Boolean);
  const impliesInquiry = blockImpliesInquiry(aiBlock);
  const explicitBlockCharacterIds = isExplicitBlockCharacterIds(aiBlock);
  const policy = resolveDialoguePolicy({
    aiBlock,
    blockCharIds,
    playerCharacterId: fw.playerCharacterId,
  });

  return {
    blockCharIds,
    speakerNames,
    policy,
    impliesInquiry,
    explicitBlockCharacterIds,
    dialogueRule: buildDialogueRule({policy, speakerNames}),
    summaryOnlyRule: buildSummaryOnlyRule(policy),
  };
}
