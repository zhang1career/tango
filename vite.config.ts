import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { formatJsonCompact } from './src/utils/json-format';

function gameAssetPath(cwd: string, gameId: string, name: string): string {
  const fileName = name === 'game-content' ? 'story.tw' : `${name}.json`;
  return resolve(cwd, 'assets', 'games', gameId, fileName);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const portRaw = env.PORT ?? env.VITE_PORT;
  const port = portRaw ? (parseInt(portRaw, 10) || undefined) : undefined;
  const cwd = process.cwd();

  return {
  resolve: {
    alias: { '@': resolve(cwd, 'src') },
  },
  server: port ? { port } : undefined,
  plugins: [
    react(),
    {
      name: 'api-games',
      configureServer(server) {
        server.middlewares.use('/api/games', (req, res, next) => {
          const match = req.url?.match(/^\/([^/]+)\/(story-[a-z]+|game-content)(?:\?|$)/);
          if (!match) return next();
          const [, gameId, resource] = match;
          if (!gameId || !resource) return next();

          const isGameContent = resource === 'game-content';
          const outPath = gameAssetPath(cwd, gameId, isGameContent ? 'game-content' : resource);

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
            if (isGameContent) return next();
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                mkdirSync(resolve(cwd, 'assets', 'games', gameId), { recursive: true });
                const writePath = resolve(cwd, 'assets', 'games', gameId, `${resource}.json`);
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
        const assetsDir = resolve(cwd, 'assets');
        const distAssets = resolve(outDir, 'assets');
        const gamesDir = resolve(assetsDir, 'games');
        mkdirSync(distAssets, { recursive: true });
        const files = ['story.tw', 'story-characters.json', 'story-rules.json', 'story-features.json', 'story-events.json', 'story-scenes.json', 'story-maps.json', 'story-items.json', 'story-metadata.json'];
        if (existsSync(gamesDir)) {
          for (const gameId of readdirSync(gamesDir, { withFileTypes: true }).filter((d: { isDirectory: () => boolean }) => d.isDirectory()).map((d: { name: string }) => d.name)) {
            const gameSrc = resolve(gamesDir, gameId);
            const gameDst = resolve(distAssets, 'games', gameId);
            mkdirSync(gameDst, { recursive: true });
            for (const f of files) {
              const src = resolve(gameSrc, f);
              if (existsSync(src)) copyFileSync(src, resolve(gameDst, f));
            }
          }
        }
      },
    },
  ],
  base: './',
  };
});
