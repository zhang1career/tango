#!/usr/bin/env node
/**
 * 迁移 story-scenes.json：hints → 结构化 AI 块字段
 * 用法: node scripts/migrate-passage-blocks.mjs [gameId]
 */
import {readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = resolve(root, 'assets/games');

function splitHints(hints) {
  const patch = {constraints: hints};
  const curve = hints.match(/曲线[：:]\s*[^；;]+/);
  if (curve) patch.emotion = curve[0];
  if (/第一人称|第三人称|限知/.test(hints)) {
    patch.perspective = hints.match(/(第一人称[^；;]*|第三人称[^；;]*|限知[^；;]*)/)?.[0];
  }
  if (/白描|对白极少/.test(hints)) {
    patch.style = hints.match(/(白描[^；;]*|对白极少[^；;]*)/)?.[0] ?? '白描为主';
  }
  if (/第一人称|我/.test(hints)) patch.voice = '第一人称';
  if (/勿复述|不得|禁止/.test(hints)) {
    const m = hints.match(/勿[^；;]+|不得[^；;]+|禁止[^；;]+/);
    if (m) patch.forbidden = [m[0]];
  }
  return patch;
}

function migrateBlock(block) {
  if (block?.type !== 'ai') return block;
  const {hints, ...rest} = block;
  const next = {
    type: 'ai',
    summary: rest.summary ?? '',
    wordCount: rest.wordCount ?? 200,
    priority: rest.priority ?? 'medium',
    ...rest,
  };
  delete next.hints;
  if (hints?.trim()) {
    const h = splitHints(hints.trim());
    next.emotion = next.emotion ?? h.emotion;
    next.perspective = next.perspective ?? h.perspective;
    next.style = next.style ?? h.style;
    next.voice = next.voice ?? h.voice;
    next.forbidden = next.forbidden ?? h.forbidden;
    next.constraints = next.constraints ?? h.constraints;
  }
  return next;
}

function migrateScenes(scenes) {
  if (!Array.isArray(scenes)) return scenes;
  return scenes.map((scene) => ({
    ...scene,
    passageBlocks: Array.isArray(scene.passageBlocks)
      ? scene.passageBlocks.map(migrateBlock)
      : scene.passageBlocks,
  }));
}

function migrateGame(gameId) {
  const path = resolve(gamesDir, gameId, 'story-scenes.json');
  if (!existsSync(path)) {
    console.warn(`skip ${gameId}: no story-scenes.json`);
    return;
  }
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  const migrated = migrateScenes(raw);
  writeFileSync(path, `${JSON.stringify(migrated, null, 2)}\n`, 'utf-8');
  console.log(`migrated ${path}`);
}

const arg = process.argv[2];
if (arg) {
  migrateGame(arg);
} else {
  for (const name of readdirSync(gamesDir, {withFileTypes: true})) {
    if (name.isDirectory()) migrateGame(name.name);
  }
}
