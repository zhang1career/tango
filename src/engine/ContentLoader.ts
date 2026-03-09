/**
 * 统一内容加载器 - 支持 Twee 格式
 */

import {getContentPath} from '@/config';
import type {Story} from '@/types';
import {parseTwee} from './TweeParser';

export type FetchContent = (path: string) => Promise<string>;

export async function loadStory(
  fetchContent?: FetchContent,
  overrides?: { path?: string }
): Promise<Story> {
  const path = overrides?.path ?? getContentPath();

  if (!fetchContent) {
    throw new Error('请提供 fetchContent 函数以加载游戏内容');
  }

  const raw = await fetchContent(path);
  const story = parseTwee(raw);
  if (!story?.passages?.size) {
    throw new Error('故事内容为空或格式错误');
  }
  return story;
}
