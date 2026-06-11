/**
 * 一次性修复 story.tw 中 give/take 重复膨胀（需先修复 TweeParser 再运行）
 * 用法: node scripts/repair-story-tw.mjs [gameId]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// 通过 tsx 运行时直接 import TS；纯 node 时回退到 vite 预构建较麻烦，故用动态加载
const gameId = process.argv[2] ?? 'game_export';
const storyPath = resolve(__dirname, `../assets/games/${gameId}/story.tw`);

async function main() {
  const { parseTwee, serializeStorySugarcube } = await import('../src/engine/index.ts');
  const before = readFileSync(storyPath, 'utf-8');
  console.log(`[repair] ${gameId}/story.tw before: ${(before.length / 1024 / 1024).toFixed(2)} MB`);
  const story = parseTwee(before);
  console.log(`[repair] passages: ${story.passages.size}`);
  const out = serializeStorySugarcube(story);
  writeFileSync(storyPath, out, 'utf-8');
  console.log(`[repair] after: ${(out.length / 1024).toFixed(1)} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
