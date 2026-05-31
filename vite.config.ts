import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname, normalize } from 'node:path';
import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {normalizeMediaSavePath, CUSTOM_MEDIA_FS_DIR} from './src/config/media-paths';
import { formatJsonCompact } from './src/utils/json-format';
import { bundleStoryTwForProd } from './src/utils/bundle-game-for-prod';

const DEFAULT_GAMES_BASE_PATH = 'assets/games';

function gameAssetFileName(resource: string): string {
  if (resource === 'game-content') return 'story.tw';
  if (resource === 'story-bundle') return 'story_bundle.json';
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

  function fetchBinaryUrl(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? httpsRequest : httpRequest;
      client(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBinaryUrl(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`下载失败 HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject).end();
    });
  }

  function validateGameRelativePath(inputPath: string, gameDirPath: string): string {
    const normalizedPath = normalize(inputPath.replace(/\\/g, '/').replace(/^\/+/, ''));
    if (
      !normalizedPath ||
      normalizedPath.startsWith('..') ||
      normalizedPath.includes('/../') ||
      normalizedPath.includes('\\..\\')
    ) {
      throw new Error(`非法路径: ${inputPath}`);
    }
    const outPath = resolve(gameDirPath, normalizedPath);
    if (!outPath.startsWith(gameDirPath)) throw new Error(`非法路径: ${inputPath}`);
    return outPath;
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
        server.middlewares.use('/api/games', (req, res, next) => {
          const mediaMatch = req.url?.match(/^\/([^/]+)\/media(?:\?|$)/);
          if (!mediaMatch || req.method !== 'POST') return next();
          const gameId = mediaMatch[1];
          if (!gameId) return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body) as {
                path?: string;
                contentBase64?: string;
                sourceUrl?: string;
              };
              const inputPath = String(payload.path ?? '').trim();
              if (!inputPath) throw new Error('path 不能为空');
              const {fsSubPath, root} = normalizeMediaSavePath(inputPath);
              const baseDir = root === 'custom'
                ? resolve(cwd, CUSTOM_MEDIA_FS_DIR)
                : resolve(cwd, gamesBasePath, gameId);
              if (root === 'game') mkdirSync(baseDir, { recursive: true });
              const outPath = validateGameRelativePath(fsSubPath, baseDir);
              mkdirSync(dirname(outPath), { recursive: true });
              if (payload.sourceUrl) {
                const url = String(payload.sourceUrl).trim();
                if (!/^https?:\/\//i.test(url)) throw new Error('sourceUrl 必须是 http(s) URL');
                const buf = await fetchBinaryUrl(url);
                writeFileSync(outPath, buf);
              } else if (payload.contentBase64) {
                writeFileSync(outPath, Buffer.from(String(payload.contentBase64), 'base64'));
              } else {
                throw new Error('contentBase64 或 sourceUrl 至少提供一个');
              }
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
      },
    },
    {
      name: 'api-games',
      configureServer(server) {
        server.middlewares.use('/api/games', (req, res, next) => {
          const match = req.url?.match(/^\/([^/]+)\/(story-[a-z-]+|game-content)(?:\?|$)/);
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
      },
    },
  ],
  base,
  };
});
