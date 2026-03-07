#!/usr/bin/env npx tsx
/**
 * 剧情生成脚本：从框架 JSON + AI 生成 Twee 内容
 *
 * 用法:
 *   npx tsx scripts/generate-story.ts [framework.json] [--output story.tw]
 *
 * 环境变量:
 *   VITE_AIGC_API_KEY  - OpenAI API 密钥（必填，用于 AI 生成）
 *   VITE_AIGC_API_URL - 可选，兼容 OpenAI 的 API 地址
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StoryFramework, FrameworkScene } from '@/schema/story-framework.ts';
import { flattenScenes, validateFramework } from '@/schema/story-framework.ts';

const FRAMEWORK_PATH = process.argv[2] || 'assets/story-framework.example.json';
const OUT_INDEX = process.argv.indexOf('--output');
const OUTPUT_PATH = OUT_INDEX >= 0 ? process.argv[OUT_INDEX + 1] : 'assets/story.tw';

const API_KEY = process.env.AIGC_API_KEY || process.env.VITE_AIGC_API_KEY;
const BASE_URL = process.env.AIGC_API_URL || process.env.VITE_AIGC_API_KEY || 'https://api.openai.com/v1';

// --- Twee 组装 ---

function escapeTweeText(s: string): string {
  return s.replace(/\]\]/g, '\\]\\]');
}

function formatMetadata(actions: NonNullable<FrameworkScene['stateActions']>): string {
  const parts: string[] = [];
  if (actions.set) parts.push(`"set":${JSON.stringify(actions.set)}`);
  if (actions.give) parts.push(`"give":${JSON.stringify(actions.give)}`);
  if (actions.take) parts.push(`"take":${JSON.stringify(actions.take)}`);
  if (actions.add) parts.push(`"rep":${JSON.stringify(actions.add)}`);
  return `{${parts.join(',')}}`;
}

function formatLink(link: FrameworkScene['links'][0]): string {
  const display = link.displayText || link.target;
  const cond = link.condition ? ` ${link.condition}` : '';
  return `[[${escapeTweeText(display)}|${link.target}]]${cond}`;
}

function sceneToTweePassage(
  scene: FrameworkScene,
  generatedText: string
): string {
  const meta = scene.stateActions ? ` ${formatMetadata(scene.stateActions)}` : '';
  const linkLines = scene.links.map(formatLink).join('\n');
  const body = [generatedText.trim(), linkLines].filter(Boolean).join('\n\n');
  return `:: ${scene.id}${meta}\n${body}`;
}

function assembleTwee(
  fw: StoryFramework,
  textMap: Map<string, string>,
  startId: string
): string {
  const lines: string[] = [];

  lines.push(':: StoryTitle');
  lines.push(fw.title);
  lines.push('');

  const storyData: Record<string, unknown> = {
    ifid: randomUUID(),
    format: 'Harlowe',
    start: startId,
    inventory: fw.initialState?.inventory ?? [],
    ...(fw.initialState?.variables && Object.keys(fw.initialState.variables).length > 0
      ? { variables: fw.initialState.variables }
      : {}),
  };
  lines.push(':: StoryData');
  lines.push(JSON.stringify(storyData));
  lines.push('');

  const scenes = flattenScenes(fw);
  for (const scene of scenes) {
    const text = textMap.get(scene.id) ?? scene.summary;
    lines.push(sceneToTweePassage(scene, text));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// --- AI 生成 ---

async function generateSceneText(
  fw: StoryFramework,
  scene: FrameworkScene
): Promise<string> {
  const rules = (fw.rules ?? []).map((r) => `- ${r}`).join('\n');
  const system = `你是一名文字冒险游戏编剧。根据「剧情概要」生成一段可读的剧情正文（旁白+对话），直接输出正文，不要解释。

规则：
${rules || '- 简洁有力，适合文字冒险'}

输出要求：纯正文，不要包含 [[链接]]，链接由系统自动添加。`;

  const ctx = fw.background ? `背景：${fw.background}\n\n` : '';
  const user = `${ctx}场景：${scene.id}
概要：${scene.summary}
${scene.hints ? `写作提示：${scene.hints}` : ''}

请生成该场景的剧情正文：`;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 错误 ${res.status}: ${err}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 未返回正文');
  return content.trim();
}

async function generateAllScenes(fw: StoryFramework): Promise<Map<string, string>> {
  const scenes = flattenScenes(fw);
  const map = new Map<string, string>();

  for (const scene of scenes) {
    process.stderr.write(`生成: ${scene.id} ... `);
    try {
      const text = await generateSceneText(fw, scene);
      map.set(scene.id, text);
      process.stderr.write('OK\n');
    } catch (e) {
      process.stderr.write(`失败，使用概要作为正文\n`);
      map.set(scene.id, scene.summary);
      console.error((e as Error).message);
    }
  }

  return map;
}

// --- 无 AI：直接使用概要 ---

function useSummariesAsText(fw: StoryFramework): Map<string, string> {
  const map = new Map<string, string>();
  for (const scene of flattenScenes(fw)) {
    map.set(scene.id, scene.summary);
  }
  return map;
}

// --- main ---

async function main() {
  const absPath = resolve(process.cwd(), FRAMEWORK_PATH);
  let raw: string;
  try {
    raw = readFileSync(absPath, 'utf-8');
  } catch {
    console.error(`无法读取框架文件: ${absPath}`);
    process.exit(1);
  }

  let fw: StoryFramework;
  try {
    fw = JSON.parse(raw) as StoryFramework;
  } catch (e) {
    console.error('框架 JSON 解析失败:', (e as Error).message);
    process.exit(1);
  }

  const { valid, errors } = validateFramework(fw);
  if (!valid) {
    console.error('框架校验失败:');
    errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }

  let textMap: Map<string, string>;
  if (API_KEY) {
    textMap = await generateAllScenes(fw);
  } else {
    console.error('未设置 VITE_AIGC_API_KEY，使用概要作为剧情正文');
    textMap = useSummariesAsText(fw);
  }

  const startId = flattenScenes(fw)[0]?.id ?? 'Start';
  const twee = assembleTwee(fw, textMap, startId);

  const outPath = resolve(process.cwd(), OUTPUT_PATH);
  writeFileSync(outPath, twee, 'utf-8');
  console.log(`已写入: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
