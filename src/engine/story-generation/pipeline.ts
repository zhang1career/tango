import type {GenerationTracePhase} from '@/schema/story-generation-traces';
import type {StoryCanon} from '@/schema/story-canon';
import type {StoryForeshadowing} from '@/schema/story-foreshadowing';
import {STORY_CANON_VERSION} from '@/schema/story-canon';
import {buildGenerationContextPayload} from './context';
import {getGenerationAuditMode, getGenerationAuditRetries} from '@/config';
import {chatCompletion, previewText, requireAigcConfig} from './llm';
import type {GenerateBlockInput, GenerateBlockResult, StoryGenerationBundle} from './types';
import {collectPrecedingRawTextsAtBlockIndex} from './raw-context';
import {stripAiTextOverlappingRaw} from '@/utils/strip-ai-raw-overlap';

const WRITE_SYSTEM_BASE = `你是文字冒险游戏编剧。遵守块级规格与真相层约束，完成有限演义扩写。
- behaviorLibrary 是对话互动素材，不要嵌入 passage 正文。
- raw 块已单独展示，严禁复述 raw 中的对白与史料。
- 必须体现 anchors；遵守 forbidden。
- 对白仅允许 constraint 中列出的角色发言；无列名角色时写纯旁白。
- 正文须为多行：叙述段 2–3 句后换行；每一句对白单独成行（问一行、答一行），不要把多轮对话挤在同一段。
输出纯正文，无 markdown，无 [[链接]]。`;

function parseJsonFromModel<T>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : text.trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function runPlanPhase(input: GenerateBlockInput): Promise<{plan: string; phase: GenerationTracePhase}> {
  const {possibility, constraint} = buildGenerationContextPayload(
    input.bundle,
    input.scene,
    input.chapter,
    input.aiBlock,
    input.passageBlockIndex
  );
  const system = `你是叙事引擎的「规划师」。根据真相层与块级规格，输出 JSON：
{"beats":["本块要完成的 2-4 个微观节拍"],"mustHonor":["必须遵守的约束摘要"],"risks":["可能违背的 continuity 风险"]}
只输出 JSON。`;
  const user = `场景 ${input.scene.id} / 块 ${input.aiBlockIndex + 1}

【可能性资源】
${JSON.stringify(possibility, null, 2)}

【约束】
${JSON.stringify(constraint, null, 2)}`;
  const out = await chatCompletion(
    [
      {role: 'system', content: system},
      {role: 'user', content: user},
    ],
    {temperature: 0.2}
  );
  return {
    plan: out,
    phase: {name: 'plan', outputPreview: previewText(out)},
  };
}

async function runWritePhase(
  input: GenerateBlockInput,
  planJson: string
): Promise<{text: string; phase: GenerationTracePhase}> {
  const {possibility, constraint} = buildGenerationContextPayload(
    input.bundle,
    input.scene,
    input.chapter,
    input.aiBlock,
    input.passageBlockIndex
  );
  const precedingRaw = collectPrecedingRawTextsAtBlockIndex(input.scene, input.passageBlockIndex);
  const system = WRITE_SYSTEM_BASE;
  const user = `【规划】
${planJson}

【可能性】
${JSON.stringify(possibility, null, 2)}

【约束】
${JSON.stringify(constraint, null, 2)}

请生成本块正文：`;
  const raw = await chatCompletion(
    [
      {role: 'system', content: system},
      {role: 'user', content: user},
    ],
    {temperature: 0.35}
  );
  const deduped = stripAiTextOverlappingRaw(raw, precedingRaw);
  if (!deduped) throw new Error('生成正文与 raw 高度重复');
  return {text: deduped, phase: {name: 'write', outputPreview: previewText(deduped)}};
}

async function runAuditPhase(
  input: GenerateBlockInput,
  draft: string
): Promise<{pass: boolean; feedback: string; phase: GenerationTracePhase}> {
  const {constraint} = buildGenerationContextPayload(
    input.bundle,
    input.scene,
    input.chapter,
    input.aiBlock,
    input.passageBlockIndex
  );
  const system = `你是叙事审校。检查草稿是否违背约束、遗漏 anchors、复述 raw、引入 forbidden 内容。
输出 JSON：{"pass":true|false,"issues":["…"],"fixHint":"若不通过，给写手的修订方向"}`;
  const user = `【约束】
${JSON.stringify(constraint, null, 2)}

【草稿】
${draft}`;
  const out = await chatCompletion(
    [
      {role: 'system', content: system},
      {role: 'user', content: user},
    ],
    {temperature: 0.1}
  );
  const parsed = parseJsonFromModel<{pass?: boolean; issues?: string[]; fixHint?: string}>(out);
  const pass = parsed?.pass === true;
  return {
    pass,
    feedback: parsed?.fixHint ?? out,
    phase: {
      name: 'audit',
      verdict: pass ? 'pass' : 'fail',
      outputPreview: previewText(out),
    },
  };
}

async function settleCanon(
  input: GenerateBlockInput,
  generatedText: string,
  canon: StoryCanon
): Promise<StoryCanon> {
  const system = `你是图书管理员。根据本场新增正文，更新场景状态快照。输出 JSON：
{"facts":["客观事实"],"openQuestions":["未解问题"],"characterStates":{"人物id":{"emotion":"…","knows":["…"]}}}`;
  const user = `场景 ${input.scene.id} 新正文：
${generatedText}

已有 canon：
${JSON.stringify(canon.scenes[input.scene.id] ?? {}, null, 2)}`;
  const out = await chatCompletion(
    [
      {role: 'system', content: system},
      {role: 'user', content: user},
    ],
    {temperature: 0.1}
  );
  const parsed = parseJsonFromModel<{
    facts?: string[];
    openQuestions?: string[];
    characterStates?: StoryCanon['scenes'][string]['characterStates'];
  }>(out);
  const next: StoryCanon = {
    ...canon,
    version: STORY_CANON_VERSION,
    scenes: {
      ...canon.scenes,
      [input.scene.id]: {
        lastUpdatedAt: new Date().toISOString(),
        facts: parsed?.facts,
        openQuestions: parsed?.openQuestions,
        characterStates: parsed?.characterStates,
      },
    },
  };
  return next;
}

function markForeshadowingPlanted(
  foreshadowing: StoryForeshadowing,
  sceneId: string,
  blockIndex: number,
  anchors: string[] | undefined
): StoryForeshadowing {
  if (!anchors?.length) return foreshadowing;
  const threads = foreshadowing.threads.map((t) => {
    if (t.status !== 'planned') return t;
    const hit = anchors.some((a) => a.includes(t.title) || t.title.includes(a));
    if (!hit) return t;
    return {
      ...t,
      status: 'planted' as const,
      plantedIn: {sceneId, blockIndex},
    };
  });
  return {threads};
}

export async function generatePassageBlock(input: GenerateBlockInput): Promise<GenerateBlockResult> {
  if (!import.meta.env.DEV) throw new Error('叙事生成仅支持开发模式');
  requireAigcConfig();

  const phases: GenerationTracePhase[] = [];
  const {plan, phase: planPhase} = await runPlanPhase(input);
  phases.push(planPhase);

  const auditMode = getGenerationAuditMode();
  const maxAuditRetries = getGenerationAuditRetries();
  let draft = '';
  let lastFeedback = '';
  for (let attempt = 0; attempt <= maxAuditRetries; attempt++) {
    const writeUserSuffix = lastFeedback ? `\n\n【审校修订要求】\n${lastFeedback}` : '';
    const {possibility, constraint} = buildGenerationContextPayload(
      input.bundle,
      input.scene,
      input.chapter,
      input.aiBlock,
      input.passageBlockIndex
    );
    const system = `${WRITE_SYSTEM_BASE}${writeUserSuffix ? '\n根据审校意见修订上一稿。' : ''}`;
    const user = `【规划】${plan}\n【可能性】${JSON.stringify(possibility)}\n【约束】${JSON.stringify(constraint)}\n${writeUserSuffix}\n请生成本块正文：`;
    const raw = await chatCompletion(
      [
        {role: 'system', content: system},
        {role: 'user', content: user},
      ],
      {temperature: attempt > 0 ? 0.25 : 0.35}
    );
    const precedingRaw = collectPrecedingRawTextsAtBlockIndex(input.scene, input.passageBlockIndex);
    draft = stripAiTextOverlappingRaw(raw, precedingRaw);
    if (!draft) throw new Error('生成正文与 raw 高度重复');
    phases.push({name: attempt === 0 ? 'write' : `write_retry_${attempt}`, outputPreview: previewText(draft)});

    if (auditMode === 'skip') {
      phases.push({name: 'audit', verdict: 'skipped'});
      break;
    }

    const audit = await runAuditPhase(input, draft);
    phases.push(audit.phase);
    if (audit.pass) break;
    lastFeedback = audit.feedback;
    if (attempt === maxAuditRetries) {
      if (auditMode === 'warn') {
        phases.push({
          name: 'audit_override',
          verdict: 'warn',
          outputPreview: previewText(`审校未通过，已采用末稿：${audit.feedback}`),
        });
        break;
      }
      throw new Error(`审校未通过：${audit.feedback}`);
    }
  }

  let canon = await settleCanon(input, draft, input.bundle.canon);
  const foreshadowing = markForeshadowingPlanted(
    input.bundle.foreshadowing,
    input.scene.id,
    input.aiBlockIndex,
    input.aiBlock.anchors
  );

  phases.push({name: 'canon_settle', verdict: 'ok'});

  return {generatedText: draft, phases, canon, foreshadowing};
}

export async function loadGenerationBundle(
  fw: import('@/schema/story-framework').StoryFramework,
  gameId: string,
  loaders: {
    outline: () => Promise<import('@/schema/story-outline').StoryOutline>;
    foreshadowing: () => Promise<StoryForeshadowing>;
    canon: () => Promise<StoryCanon>;
    policy: () => Promise<import('./types').TextPolicyBundle>;
  }
): Promise<StoryGenerationBundle> {
  const [outline, foreshadowing, canon, policy] = await Promise.all([
    loaders.outline(),
    loaders.foreshadowing(),
    loaders.canon(),
    loaders.policy(),
  ]);
  return {fw, outline, foreshadowing, canon, policy};
}
