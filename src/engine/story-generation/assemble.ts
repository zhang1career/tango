import type {GenerationTracePhase} from '@/schema/story-generation-traces';
import type {GameScene} from '@/schema/game-scene';
import {getScenePassageBlocks} from '@/utils/passage-blocks';
import {chatCompletion, previewText} from './llm';
import type {AssembleSceneResult} from './types';

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

type Segment = {kind: 'raw' | 'ai'; rendered: string; plain: string};

async function stitchTransition(leftPlain: string, rightPlain: string): Promise<string> {
  const system = `你是汇编编辑。在两段已有正文之间插入极简过渡（1-2 句），使衔接自然。
硬性要求：
- 不得修改、复述、概括左右两段原文的任何句子；
- 只输出过渡句本身，不要输出左右原文；
- 过渡句风格与原文一致，不要用元叙述。`;
  const user = `【上文末段】
${leftPlain.slice(-400)}

【下文首段】
${rightPlain.slice(0, 400)}

请只输出过渡句：`;
  return (
    await chatCompletion(
      [
        {role: 'system', content: system},
        {role: 'user', content: user},
      ],
      {temperature: 0.2}
    )
  ).trim();
}

export async function assembleScenePassage(scene: GameScene): Promise<AssembleSceneResult> {
  if (!import.meta.env.DEV) throw new Error('汇编仅支持开发模式');

  const blocks = getScenePassageBlocks(scene);
  const segments: Segment[] = [];
  for (const block of blocks) {
    if (block.type === 'raw') {
      const text = block.text?.trim();
      if (text) segments.push({kind: 'raw', plain: text, rendered: wrapRawPassageBlock(text)});
      continue;
    }
    const gen = block.generatedText?.trim();
    if (!gen) {
      throw new Error(
        `AI 块缺少 generatedText，请先在「场景」中点击「生成内容」（summary: ${(block.summary ?? '').slice(0, 40)}…）`
      );
    }
    segments.push({kind: 'ai', plain: gen, rendered: gen});
  }

  if (segments.length === 0) throw new Error(`场景 ${scene.id} 无有效片段`);

  const phases: GenerationTracePhase[] = [];
  const parts: string[] = [segments[0].rendered];

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    const needsStitch =
      (prev.kind === 'ai' && curr.kind === 'ai') || (prev.kind === 'raw' && curr.kind === 'ai');
    if (needsStitch) {
      const bridge = await stitchTransition(prev.plain, curr.plain);
      if (bridge) {
        phases.push({name: `stitch_${i}`, outputPreview: previewText(bridge)});
        parts.push(bridge);
      }
    }
    parts.push(curr.rendered);
  }

  return {passageText: parts.join('\n\n'), phases};
}
