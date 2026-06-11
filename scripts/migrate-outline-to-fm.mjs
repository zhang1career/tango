#!/usr/bin/env node
/**
 * 一次性迁移：story-outline.json 章级内容 → story-fm.json；outline 仅保留进度字段。
 * 用法: node scripts/migrate-outline-to-fm.mjs [gameId...]
 * 无参数时迁移 assets/games 下全部含 story-outline.json 的游戏。
 */

import {readFileSync, writeFileSync, readdirSync, existsSync} from 'fs';
import {resolve, join} from 'path';

const root = resolve(import.meta.dirname, '..');
const gamesDir = resolve(root, 'assets/games');

function formatJsonCompact(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

function migrateGame(gameId) {
  const base = join(gamesDir, gameId);
  const fmPath = join(base, 'story-fm.json');
  const outlinePath = join(base, 'story-outline.json');
  if (!existsSync(fmPath)) {
    console.warn(`skip ${gameId}: no story-fm.json`);
    return;
  }
  if (!existsSync(outlinePath)) {
    console.log(`skip ${gameId}: no story-outline.json`);
    return;
  }

  const fm = JSON.parse(readFileSync(fmPath, 'utf8'));
  const outline = JSON.parse(readFileSync(outlinePath, 'utf8'));
  const chapters = fm.chapters ?? [];
  const outlineChapters = Array.isArray(outline.chapters) ? outline.chapters : [];
  const byId = new Map(outlineChapters.map((c) => [String(c.chapterId ?? c.id ?? ''), c]));

  for (const ch of chapters) {
    const oc = byId.get(ch.id);
    if (!oc) continue;
    if (typeof oc.narrativeGoal === 'string' && oc.narrativeGoal.trim()) {
      ch.narrativeGoal = oc.narrativeGoal.trim();
    }
    if (!ch.theme && typeof oc.theme === 'string' && oc.theme.trim()) {
      ch.theme = oc.theme.trim();
    }
    const beats = Array.isArray(oc.beats) ? oc.beats : [];
    const tasks = {...(ch.narrativeTasks ?? {})};
    for (const b of beats) {
      const sceneId = typeof b.sceneId === 'string' ? b.sceneId.trim() : '';
      const summary = String(b.summary ?? b.intent ?? '').trim();
      if (sceneId && summary) tasks[sceneId] = summary;
    }
    if (Object.keys(tasks).length) ch.narrativeTasks = tasks;
  }

  const slimOutline = {
    version: String(outline.version ?? '1'),
    rollingHorizonChapters:
      Number(outline.rollingHorizonChapters) > 0 ? Math.round(Number(outline.rollingHorizonChapters)) : 5,
    ...(outline.progressAnchorChapterId ? {progressAnchorChapterId: outline.progressAnchorChapterId} : {}),
    ...(Array.isArray(outline.archivedChapterIds) && outline.archivedChapterIds.length
      ? {archivedChapterIds: outline.archivedChapterIds.map(String).filter(Boolean)}
      : {}),
  };

  writeFileSync(fmPath, formatJsonCompact(fm));
  writeFileSync(outlinePath, formatJsonCompact(slimOutline));
  console.log(`migrated ${gameId}`);
}

const ids = process.argv.slice(2);
if (ids.length) {
  for (const id of ids) migrateGame(id);
} else {
  for (const ent of readdirSync(gamesDir, {withFileTypes: true})) {
    if (ent.isDirectory()) migrateGame(ent.name);
  }
}
