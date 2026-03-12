import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { formatJsonCompact } from './src/utils/json-format';

const DEFAULT_GAMES_BASE_PATH = 'assets/games';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gamesBasePath = env.GAMES_BASE_PATH ?? env.VITE_GAMES_BASE_PATH ?? DEFAULT_GAMES_BASE_PATH;
  const portRaw = env.PORT ?? env.VITE_PORT;
  const port = portRaw ? (parseInt(portRaw, 10) || undefined) : undefined;
  const cwd = process.cwd();

  function gamesDir(): string {
    return resolve(cwd, gamesBasePath);
  }

  function gameAssetPath(gameId: string, name: string): string {
    const fileName = name === 'game-content' ? 'story.tw' : `${name}.json`;
    return resolve(cwd, gamesBasePath, gameId, fileName);
  }

  return {
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
                const writePath = resolve(cwd, gamesBasePath, gameId, `${resource}.json`);
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
        mkdirSync(distGamesDir, { recursive: true });
        const files = ['story.tw', 'story-fm.json', 'story-characters.json', 'story-rules.json', 'story-features.json', 'story-events.json', 'story-scenes.json', 'story-maps.json', 'story-items.json', 'story-metadata.json'];
        if (existsSync(srcGamesDir)) {
          for (const gid of readdirSync(srcGamesDir, { withFileTypes: true }).filter((d: { isDirectory: () => boolean }) => d.isDirectory()).map((d: { name: string }) => d.name)) {
            const gameSrc = resolve(srcGamesDir, gid);
            const gameDst = resolve(distGamesDir, gid);
            mkdirSync(gameDst, { recursive: true });
            for (const f of files) {
              const src = resolve(gameSrc, f);
              if (existsSync(src)) copyFileSync(src, resolve(gameDst, f as string));
            }
          }
        }
      },
    },
  ],
  base: './',
  };
});
