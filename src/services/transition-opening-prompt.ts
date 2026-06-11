/**
 * 章节保存时：根据跨章过渡上下文，AI 生成目标场景的过场动画提示词
 */

import type {ChapterTransition, FrameworkChapter, StoryFramework} from '@/schema/story-framework';
import type {GameScene} from '@/schema/game-scene';
import {chatCompletion, previewText, requireAigcConfig} from '@/engine/story-generation/llm';
import {getAiBlocks, getLeadingRawBlock} from '@/utils/passage-blocks';
import {getChapterNarrativeTask} from '@/utils/story-outline-fm';
import {appendGenerationTrace} from '@/utils/story-engine-files';
import {getAIGCModel} from '@/config';
import type {GenerationTracePhase} from '@/schema/story-generation-traces';

function truncate(text: string, max: number): string {
  const c = text.replace(/\s+/g, ' ').trim();
  return c.length > max ? `${c.slice(0, max)}…` : c;
}

function sceneBrief(ch: FrameworkChapter, scene: GameScene): Record<string, unknown> {
  const raw = getLeadingRawBlock(scene);
  const aiSummaries = getAiBlocks(scene)
    .map((b) => b.summary)
    .filter(Boolean);
  return {
    id: scene.id,
    name: scene.name,
    narrativeTask: getChapterNarrativeTask(ch, scene.id) || undefined,
    contentSummary:
      aiSummaries.join(' ') || (raw?.text?.trim() ? truncate(raw.text, 220) : undefined),
  };
}

function chapterBrief(ch: FrameworkChapter): Record<string, unknown> {
  return {
    id: ch.id,
    title: ch.title,
    theme: ch.theme || undefined,
    narrativeGoal: ch.narrativeGoal || undefined,
    startSceneId: ch.startSceneId || undefined,
  };
}

const TRANSITION_PROMPT_SYSTEM = `你是叙事游戏的过场动画创作顾问。根据起跳场景、过渡链接文案与目标场景，输出一段中文过场动画提示词（供视频/动画制作参考，非玩家可见文案）。

须涵盖：
- 转场类型与情绪弧线（时间/空间/心理过渡）
- 起幅画面（起跳场景末态的可拍摄意象）
- 过渡动作（1–2 个可执行的镜头运动、叠化或意象蒙太奇）
- 落幅画面（目标场景定场）
- 建议时长（3–8 秒）
- 禁忌（勿剧透目标章核心悬念）

要求：具象、可拍摄，约 80–200 字；只输出提示词正文，不要 JSON、标题或解释。`;

async function generateOneTransitionPrompt(input: {
  fromChapter: FrameworkChapter;
  fromScene: GameScene;
  targetChapter: FrameworkChapter;
  targetScene: GameScene;
  transition: ChapterTransition;
}): Promise<string> {
  const userPayload = {
    linkDisplayText: input.transition.displayText?.trim() || undefined,
    fromChapter: chapterBrief(input.fromChapter),
    fromScene: sceneBrief(input.fromChapter, input.fromScene),
    targetChapter: chapterBrief(input.targetChapter),
    targetScene: sceneBrief(input.targetChapter, input.targetScene),
  };

  const out = await chatCompletion(
    [
      {role: 'system', content: TRANSITION_PROMPT_SYSTEM},
      {role: 'user', content: JSON.stringify(userPayload, null, 2)},
    ],
    {temperature: 0.35}
  );

  const prompt = out.replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!prompt) throw new Error('模型未返回有效提示词');
  return prompt;
}

export interface TransitionPromptFailure {
  fromSceneId: string;
  fromSceneName: string;
  targetChapterTitle: string;
  targetSceneId: string;
  reason: string;
}

export interface ApplyTransitionOpeningPromptsResult {
  fw: StoryFramework;
  failures: TransitionPromptFailure[];
  generatedCount: number;
}

export async function applyTransitionOpeningAnimationPrompts(
  gameId: string,
  fw: StoryFramework
): Promise<ApplyTransitionOpeningPromptsResult> {
  const scenes = [...(fw.scenes ?? [])];
  const sceneIndex = new Map(scenes.map((s, i) => [s.id, i]));
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  const failures: TransitionPromptFailure[] = [];
  let generatedCount = 0;

  const transitions: Array<{
    fromChapter: FrameworkChapter;
    transition: ChapterTransition;
  }> = [];
  for (const ch of fw.chapters) {
    for (const tr of ch.transitions ?? []) {
      transitions.push({fromChapter: ch, transition: tr});
    }
  }

  if (transitions.length === 0) {
    return {fw, failures, generatedCount: 0};
  }

  let aigcReady = true;
  try {
    requireAigcConfig();
  } catch (e) {
    aigcReady = false;
    const reason = (e as Error).message;
    for (const {fromChapter, transition} of transitions) {
      const fromScene = sceneMap.get(transition.fromSceneId);
      const targetCh = fw.chapters.find((c) => c.id === transition.toChapterId);
      const startSceneId = targetCh?.startSceneId?.trim();
      if (!startSceneId) continue;
      const idx = sceneIndex.get(startSceneId);
      if (idx !== undefined) {
        scenes[idx] = {...scenes[idx]!, openingAnimationPrompt: undefined};
      }
      failures.push({
        fromSceneId: transition.fromSceneId,
        fromSceneName: fromScene?.name ?? transition.fromSceneId,
        targetChapterTitle: targetCh?.title ?? transition.toChapterId,
        targetSceneId: startSceneId,
        reason,
      });
    }
    return {
      fw: {...fw, scenes},
      failures,
      generatedCount: 0,
    };
  }

  for (const {fromChapter, transition} of transitions) {
    const fromScene = sceneMap.get(transition.fromSceneId);
    const targetCh = fw.chapters.find((c) => c.id === transition.toChapterId);
    const startSceneId = targetCh?.startSceneId?.trim();
    if (!fromScene || !targetCh || !startSceneId) continue;
    const targetScene = sceneMap.get(startSceneId);
    if (!targetScene) continue;
    const idx = sceneIndex.get(startSceneId);
    if (idx === undefined) continue;

    try {
      const prompt = await generateOneTransitionPrompt({
        fromChapter,
        fromScene,
        targetChapter: targetCh,
        targetScene,
        transition,
      });
      scenes[idx] = {...scenes[idx]!, openingAnimationPrompt: prompt};
      generatedCount++;

      const phases: GenerationTracePhase[] = [{name: 'transition_prompt', outputPreview: previewText(prompt)}];
      await appendGenerationTrace(gameId, {
        id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        kind: 'transition_prompt',
        sceneId: startSceneId,
        sceneName: targetScene.name,
        chapterId: targetCh.id,
        model: getAIGCModel(),
        phases,
      });
    } catch (e) {
      scenes[idx] = {...scenes[idx]!, openingAnimationPrompt: undefined};
      failures.push({
        fromSceneId: transition.fromSceneId,
        fromSceneName: fromScene.name,
        targetChapterTitle: targetCh.title,
        targetSceneId: startSceneId,
        reason: (e as Error).message,
      });
    }
  }

  return {
    fw: {...fw, scenes},
    failures,
    generatedCount,
  };
}
