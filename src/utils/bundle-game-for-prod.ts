/**
 * prod 构建：将运行时需要的 JSON 合并进 story.tw，dist 仅保留 story.tw + media/
 */

import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseTwee} from '../engine/TweeParser';
import {serializeStory, serializeStorySugarcube} from '../engine/TweeSerializer';

function readJsonFile(path: string): unknown | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf-8')) as unknown;
}

/** 从开发目录读取 story.tw，并把 events/items/features 写入 StoryData */
export function bundleStoryTwForProd(gameDir: string): string {
  const storyPath = resolve(gameDir, 'story.tw');
  const raw = readFileSync(storyPath, 'utf-8');
  const story = parseTwee(raw);
  const meta: Record<string, unknown> = {...(story.metadata ?? {})};

  const events = readJsonFile(resolve(gameDir, 'story-events.json'));
  if (Array.isArray(events)) meta.events = events;

  const items = readJsonFile(resolve(gameDir, 'story-items.json'));
  if (Array.isArray(items)) meta.items = items;

  const features = readJsonFile(resolve(gameDir, 'story-features.json'));
  if (features && typeof features === 'object' && !Array.isArray(features)) {
    meta.features = features;
  }

  story.metadata = meta;
  return meta.format === 'SugarCube'
    ? serializeStorySugarcube(story)
    : serializeStory(story);
}
