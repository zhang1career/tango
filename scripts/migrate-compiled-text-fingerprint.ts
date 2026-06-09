#!/usr/bin/env npx tsx
/**
 * 为已汇编场景回填 story.tw 成稿正文指纹 compiledTextFingerprint。
 *
 * 用法: npx tsx scripts/migrate-compiled-text-fingerprint.ts [gameId]
 */
import {readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseTwee} from '../src/engine/TweeParser';
import {hashScenePassageFullText, readScenePassageFullText} from '../src/utils/compiled-text-fingerprint';
import {getChapterAvailableSceneIds} from '../src/utils/chapter-scene';
import {toPassageId} from '../src/schema/story-framework';
import type {StoryFramework} from '../src/schema/story-framework';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = resolve(root, 'assets/games');

function migrateGame(gameId: string) {
  const base = resolve(gamesDir, gameId);
  const fmPath = resolve(base, 'story-fm.json');
  const storyPath = resolve(base, 'story.tw');
  if (!existsSync(fmPath)) {
    console.warn(`skip ${gameId}: no story-fm.json`);
    return;
  }
  if (!existsSync(storyPath)) {
    console.warn(`skip ${gameId}: no story.tw`);
    return;
  }

  const fm = JSON.parse(readFileSync(fmPath, 'utf-8')) as StoryFramework;
  const story = parseTwee(readFileSync(storyPath, 'utf-8'));
  let updated = 0;

  fm.chapters = (fm.chapters ?? []).map((ch, chi) => {
    const sceneMeta = {...(ch.sceneMeta ?? {})};
    for (const sceneId of getChapterAvailableSceneIds(ch)) {
      const prev = sceneMeta[sceneId] ?? {};
      const lookupKeys = [toPassageId(chi, sceneId)];
      const fullText = readScenePassageFullText(story, sceneId, chi, lookupKeys);
      const hasCompiled = !!prev.compiledFingerprint;
      const hasStoryText = !!fullText.trim();
      if (!hasCompiled && !hasStoryText) continue;
      const compiledTextFingerprint = hashScenePassageFullText(fullText);
      if (prev.compiledTextFingerprint === compiledTextFingerprint) continue;
      sceneMeta[sceneId] = {...prev, compiledTextFingerprint};
      updated++;
    }
    return {
      ...ch,
      sceneMeta: Object.keys(sceneMeta).length ? sceneMeta : undefined,
    };
  });

  writeFileSync(fmPath, `${JSON.stringify(fm, null, 2)}\n`, 'utf-8');
  console.log(`done ${gameId}: updated ${updated} sceneMeta entries`);
}

const arg = process.argv[2];
if (arg) {
  migrateGame(arg);
} else {
  for (const ent of readdirSync(gamesDir, {withFileTypes: true})) {
    if (ent.isDirectory() && !ent.name.startsWith('.')) migrateGame(ent.name);
  }
}
