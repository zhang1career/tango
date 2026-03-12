/**
 * 行为 id 生成 - 人物行为库与事件行为库复用
 * 格式：ownerId.b_100, ownerId.b_200, ...（步进 100）
 */

import type {GameBehavior} from '../schema/game-behavior';
import {toCascadedSubId} from './cascadedId';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 获取下一批行为 id：<ownerId>.b_100, .b_200, ... */
export function assignBehaviorIds(
  ownerId: string,
  existing: GameBehavior[],
  count: number
): string[] {
  const reDot = new RegExp(`^${escapeRegExp(ownerId)}\\.b_(\\d+)$`);
  const reUnderscore = new RegExp(`^${escapeRegExp(ownerId)}_b_(\\d+)$`);
  let max = 0;
  for (const b of existing) {
    const m = b.id.match(reDot) ?? b.id.match(reUnderscore);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    max += 100;
    ids.push(toCascadedSubId(ownerId, 'b', max));
  }
  return ids;
}
