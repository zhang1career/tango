import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname, normalize } from 'node:path';
import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import {CUSTOM_MEDIA_FS_DIR, GENERATED_MEDIA_FS_DIR} from './src/config/media-paths';
import { formatJsonCompact } from './src/utils/json-format';
import { bundleStoryTwForProd } from './src/utils/bundle-game-for-prod';
import {applyBgmVolumeUpdates, normalizeBgmVolumesMap, parseBgmMixVolume} from './src/utils/bgm-volumes';
import {
  bgmEventVolumesFsPath,
  ensureParentDir,
  isMp3LogicalPath,
  isWavLogicalPath,
  normalizeLogicalMediaPath,
  readBgmVolumeFromFile,
  readBgmVolumesFromFile,
  resolveMediaToFsPath,
} from './src/utils/media-logical-path';
import { runBgmMixFfmpeg } from './src/utils/run-bgm-mix';

const DEFAULT_GAMES_BASE_PATH = 'assets/games';

function gameAssetFileName(resource: string): string {
  if (resource === 'game-content') return 'story.tw';
  return `${resource}.json`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gamesBasePath = env.GAMES_BASE_PATH ?? env.VITE_GAMES_BASE_PATH ?? DEFAULT_GAMES_BASE_PATH;
  const portRaw = env.PORT ?? env.VITE_PORT;
  const port = portRaw ? (parseInt(portRaw, 10) || undefined) : undefined;
  const baseRaw = env.VITE_BASE_PATH ?? './';
  const base = baseRaw === './' ? './' : (baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`);
  const isProdBuild = (env.VITE_APP_MODE?.trim() || 'dev') === 'prod';
  const cwd = process.cwd();

  function gamesDir(): string {
    return resolve(cwd, gamesBasePath);
  }

  function gameAssetPath(gameId: string, resource: string): string {
    return resolve(cwd, gamesBasePath, gameId, gameAssetFileName(resource));
  }

  function copyDirectoryRecursive(srcDir: string, dstDir: string): void {
    mkdirSync(dstDir, { recursive: true });
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const src = resolve(srcDir, entry.name);
      const dst = resolve(dstDir, entry.name);
      if (entry.isDirectory()) {
        copyDirectoryRecursive(src, dst);
      } else if (entry.isFile()) {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
      }
    }
  }

  return {
  build: {
    emptyOutDir: true,
  },
  resolve: {
    alias: { '@': resolve(cwd, 'src') },
  },
  server: port ? { port } : undefined,
  plugins: [
    react(),
    {
      name: 'api-games-list-create',
      configureServer(server) {
        server.middlewares.use('/api/games/list', (req, res, next) => {
          if (req.method !== 'GET') return next();
          try {
            const dir = gamesDir();
            if (!existsSync(dir)) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify([]));
              return;
            }
            const ids = readdirSync(dir, { withFileTypes: true })
              .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
              .map((d: { name: string }) => d.name);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ids));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String((e as Error).message) }));
          }
        });
        server.middlewares.use('/api/games/create', (req, res, next) => {
          if (req.method !== 'POST') return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const { gameId } = JSON.parse(body) as { gameId?: string };
              const id = (gameId && String(gameId).trim()) || '';
              if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: '游戏ID只能包含字母、数字、下划线、横线' }));
                return;
              }
              const dirPath = resolve(cwd, gamesBasePath, id);
              if (existsSync(dirPath)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: '该游戏ID已存在' }));
                return;
              }
              mkdirSync(dirPath, { recursive: true });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String((e as Error).message) }));
            }
          });
        });
        server.middlewares.use('/api/games/import-zip', (req, res, next) => {
          if (req.method !== 'POST') return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body) as {
                gameId?: string;
                files?: Array<{path?: string; contentBase64?: string}>;
              };
              const gameId = String(payload.gameId ?? '').trim();
              if (!/^[a-zA-Z0-9_-]+$/.test(gameId)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'gameId 非法' }));
                return;
              }
              if (!Array.isArray(payload.files) || payload.files.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'files 不能为空' }));
                return;
              }
              const gameDirPath = resolve(cwd, gamesBasePath, gameId);
              if (existsSync(gameDirPath)) rmSync(gameDirPath, { recursive: true, force: true });
              mkdirSync(gameDirPath, { recursive: true });
              for (const file of payload.files) {
                const inputPath = String(file.path ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
                if (!inputPath) throw new Error('文件路径不能为空');
                const normalizedPath = normalize(inputPath);
                if (
                  normalizedPath.startsWith('..') ||
                  normalizedPath.includes('/../') ||
                  normalizedPath.includes('\\..\\')
                ) {
                  throw new Error(`非法路径: ${inputPath}`);
                }
                const outPath = resolve(gameDirPath, normalizedPath);
                if (!outPath.startsWith(gameDirPath)) throw new Error(`非法路径: ${inputPath}`);
                mkdirSync(dirname(outPath), { recursive: true });
                const contentBase64 = String(file.contentBase64 ?? '');
                writeFileSync(outPath, Buffer.from(contentBase64, 'base64'));
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String((e as Error).message) }));
            }
          });
        });
        server.middlewares.use('/api/media/bgm-volumes', (req, res, next) => {
          const configPath = bgmEventVolumesFsPath(cwd);
          if (req.method === 'GET') {
            try {
              const volumes = normalizeBgmVolumesMap(
                readBgmVolumesFromFile(
                  cwd,
                  (p) => readFileSync(p, 'utf-8'),
                  existsSync
                )
              );
              res.writeHead(200, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({ok: true, volumes}));
            } catch (e) {
              res.writeHead(500, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({ok: false, error: String((e as Error).message)}));
            }
            return;
          }
          if (req.method !== 'POST') return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body) as {updates?: Record<string, unknown>};
              const rawUpdates = payload.updates ?? {};
              const updates: Record<string, number> = {};
              for (const [filename, value] of Object.entries(rawUpdates)) {
                const volume = parseBgmMixVolume(value);
                if (volume == null) {
                  res.writeHead(400, {'Content-Type': 'application/json'});
                  res.end(JSON.stringify({ok: false, error: `非法音量: ${filename}`}));
                  return;
                }
                updates[filename] = volume;
              }
              const current = readBgmVolumesFromFile(
                cwd,
                (p) => readFileSync(p, 'utf-8'),
                existsSync
              );
              const volumes = normalizeBgmVolumesMap(applyBgmVolumeUpdates(current, updates));
              ensureParentDir(configPath, mkdirSync);
              writeFileSync(configPath, formatJsonCompact(volumes) + '\n', 'utf-8');
              res.writeHead(200, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({ok: true, volumes}));
            } catch (e) {
              res.writeHead(400, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({ok: false, error: String((e as Error).message)}));
            }
          });
        });
        server.middlewares.use('/api/media/mix-bgm', (req, res, next) => {
          if (req.method !== 'POST') return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body) as {
                gameId?: string;
                sceneBgmPath?: string;
                eventBgmPath?: string;
                outputPath?: string;
                sceneVolume?: number;
                eventVolume?: number;
              };
              const gameId = String(payload.gameId ?? '').trim();
              if (!/^[a-zA-Z0-9_-]+$/.test(gameId)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'gameId 非法' }));
                return;
              }
              const sceneBgmPath = normalizeLogicalMediaPath(String(payload.sceneBgmPath ?? ''));
              const eventBgmPath = normalizeLogicalMediaPath(String(payload.eventBgmPath ?? ''));
              const outputPath = normalizeLogicalMediaPath(String(payload.outputPath ?? ''));
              if (!sceneBgmPath || !eventBgmPath || !outputPath) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: '场景/事件/输出路径均不能为空' }));
                return;
              }
              if (!isWavLogicalPath(sceneBgmPath) || !isWavLogicalPath(eventBgmPath)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: '合成输入仅支持 .wav' }));
                return;
              }
              if (!isMp3LogicalPath(outputPath)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: '合成输出须为 .mp3' }));
                return;
              }
              const sceneResolved = resolveMediaToFsPath(sceneBgmPath, gameId, cwd);
              const eventResolved = resolveMediaToFsPath(eventBgmPath, gameId, cwd);
              const outResolved = resolveMediaToFsPath(outputPath, gameId, cwd);
              if (!sceneResolved.ok) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: sceneResolved.error }));
                return;
              }
              if (!eventResolved.ok) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: eventResolved.error }));
                return;
              }
              if (!outResolved.ok) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: outResolved.error }));
                return;
              }
              if (!existsSync(sceneResolved.fsPath)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  ok: false,
                  error: `找不到场景背景音乐文件:\n${sceneResolved.fsPath}`,
                }));
                return;
              }
              if (!existsSync(eventResolved.fsPath)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  ok: false,
                  error: `找不到事件背景音乐文件:\n${eventResolved.fsPath}`,
                }));
                return;
              }
              const readVolume = (wavPath: string) =>
                readBgmVolumeFromFile(
                  wavPath,
                  cwd,
                  (p) => readFileSync(p, 'utf-8'),
                  existsSync
                );
              const sceneVolume =
                parseBgmMixVolume(payload.sceneVolume) ?? readVolume(sceneBgmPath);
              const eventVolume =
                parseBgmMixVolume(payload.eventVolume) ?? readVolume(eventBgmPath);
              ensureParentDir(outResolved.fsPath, mkdirSync);
              const mixResult = runBgmMixFfmpeg({
                sceneFsPath: sceneResolved.fsPath,
                eventFsPath: eventResolved.fsPath,
                outputFsPath: outResolved.fsPath,
                sceneVolume,
                eventVolume,
              });
              if (!mixResult.ok) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: mixResult.error }));
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: true,
                outputPath,
                outputFsPath: outResolved.fsPath,
                sceneVolume,
                eventVolume,
              }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String((e as Error).message) }));
            }
          });
        });
      },
    },
    {
      name: 'api-games',
      configureServer(server) {
        server.middlewares.use('/api/games', (req, res, next) => {
          const match = req.url?.match(/^\/([^/]+)\/(story-[a-z0-9-]+|game-content)(?:\?|$)/);
          if (!match) return next();
          const [, gameId, resource] = match;
          if (!gameId || !resource) return next();

          const isGameContent = resource === 'game-content';
          const outPath = gameAssetPath(gameId, isGameContent ? 'game-content' : resource);

          const handleGet = () => {
            try {
              if (!existsSync(outPath)) {
                if (resource === 'story-items') {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end('[]');
                  return;
                }
                if (resource === 'story-features') {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ battle: {} }));
                  return;
                }
                if (resource === 'story-journal') {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ themes: [], entries: [] }));
                  return;
                }
                if (resource === 'story-outline') {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ version: '1', rollingHorizonChapters: 5, archivedChapterIds: [], chapters: [] }));
                  return;
                }
                if (resource === 'story-foreshadowing') {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ threads: [] }));
                  return;
                }
                if (resource === 'story-canon') {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ version: '1', scenes: {} }));
                  return;
                }
                if (resource === 'story-generation-traces') {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ entries: [] }));
                  return;
                }
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
              }
              const data = readFileSync(outPath, 'utf-8');
              res.writeHead(200, {
                'Content-Type': isGameContent ? 'text/plain; charset=utf-8' : 'application/json',
              });
              res.end(data);
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String((e as Error).message) }));
            }
          };

          if (req.method !== 'GET') {
            if (isGameContent) {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  mkdirSync(resolve(cwd, gamesBasePath, gameId), { recursive: true });
                  writeFileSync(outPath, body, 'utf-8');
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: true }));
                } catch (e) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: false, error: String((e as Error).message) }));
                }
              });
              return;
            }
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                mkdirSync(resolve(cwd, gamesBasePath, gameId), { recursive: true });
                const writePath = gameAssetPath(gameId, resource);
                writeFileSync(writePath, formatJsonCompact(parsed), 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
              } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String((e as Error).message) }));
              }
            });
            return;
          }
          handleGet();
        });
      },
    },
    {
      name: 'game-content',
      closeBundle() {
        const outDir = resolve(cwd, 'dist');
        const srcGamesDir = gamesDir();
        const distGamesDir = resolve(outDir, gamesBasePath);
        if (existsSync(distGamesDir)) {
          rmSync(distGamesDir, { recursive: true, force: true });
        }
        mkdirSync(distGamesDir, { recursive: true });
        if (existsSync(srcGamesDir)) {
          for (const gid of readdirSync(srcGamesDir, { withFileTypes: true }).filter((d: { isDirectory: () => boolean }) => d.isDirectory()).map((d: { name: string }) => d.name)) {
            const gameSrc = resolve(srcGamesDir, gid);
            const gameDst = resolve(distGamesDir, gid);
            mkdirSync(gameDst, { recursive: true });
            if (isProdBuild) {
              writeFileSync(resolve(gameDst, 'story.tw'), bundleStoryTwForProd(gameSrc), 'utf-8');
              const mediaSrc = resolve(gameSrc, 'media');
              if (existsSync(mediaSrc)) {
                copyDirectoryRecursive(mediaSrc, resolve(gameDst, 'media'));
              }
            } else {
              copyDirectoryRecursive(gameSrc, gameDst);
            }
          }
        }
        const srcCustomMediaDir = resolve(cwd, CUSTOM_MEDIA_FS_DIR);
        const distCustomMediaDir = resolve(outDir, CUSTOM_MEDIA_FS_DIR);
        if (existsSync(distCustomMediaDir)) {
          rmSync(distCustomMediaDir, { recursive: true, force: true });
        }
        if (existsSync(srcCustomMediaDir)) {
          copyDirectoryRecursive(srcCustomMediaDir, distCustomMediaDir);
        }
        const srcGeneratedMediaDir = resolve(cwd, GENERATED_MEDIA_FS_DIR);
        const distGeneratedMediaDir = resolve(outDir, GENERATED_MEDIA_FS_DIR);
        if (existsSync(distGeneratedMediaDir)) {
          rmSync(distGeneratedMediaDir, { recursive: true, force: true });
        }
        if (existsSync(srcGeneratedMediaDir)) {
          copyDirectoryRecursive(srcGeneratedMediaDir, distGeneratedMediaDir);
        }
      },
    },
  ],
  base,
  };
});
