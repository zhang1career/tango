import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { formatJsonCompact } from './src/utils/json-format';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gameContentPath = env.VITE_GAME_CONTENT_PATH ?? env.GAME_CONTENT_PATH ?? 'assets/story.tw';
  const portRaw = env.PORT ?? env.VITE_PORT;
  const port = portRaw ? (parseInt(portRaw, 10) || undefined) : undefined;

  return {
  server: port ? { port } : undefined,
  plugins: [
    react(),
    {
      name: 'save-story-maps',
      configureServer(server) {
        server.middlewares.use('/api/save-story-maps', (req, res, next) => {
          if (req.method === 'GET') {
            try {
              const outPath = resolve(process.cwd(), 'assets/story-maps.json');
              if (!existsSync(outPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
              }
              const data = readFileSync(outPath, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(data);
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
            return;
          }
          if (req.method !== 'POST') return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const maps = JSON.parse(body);
              const outPath = resolve(process.cwd(), 'assets/story-maps.json');
              writeFileSync(outPath, formatJsonCompact(maps), 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
          });
        });
      },
    },
    {
      name: 'save-story-events',
      configureServer(server) {
        server.middlewares.use('/api/story-events', (req, res, next) => {
          if (req.method === 'GET') {
            try {
              const outPath = resolve(process.cwd(), 'assets/story-events.json');
              if (!existsSync(outPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
              }
              const data = readFileSync(outPath, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(data);
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
            return;
          }
          if (req.method !== 'POST') return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const events = JSON.parse(body);
              const outPath = resolve(process.cwd(), 'assets/story-events.json');
              writeFileSync(outPath, formatJsonCompact(events), 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
          });
        });
      },
    },
    {
      name: 'save-story-items',
      configureServer(server) {
        server.middlewares.use('/api/story-items', (req, res, next) => {
          if (req.method === 'GET') {
            try {
              const outPath = resolve(process.cwd(), 'assets/story-items.json');
              if (!existsSync(outPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
              }
              const data = readFileSync(outPath, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(data);
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
            return;
          }
          if (req.method !== 'POST') return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const items = JSON.parse(body);
              const outPath = resolve(process.cwd(), 'assets/story-items.json');
              writeFileSync(outPath, formatJsonCompact(items), 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
          });
        });
      },
    },
    {
      name: 'story-metadata',
      configureServer(server) {
        server.middlewares.use('/api/story-metadata', (req, res, next) => {
          const outPath = resolve(process.cwd(), 'assets/story-metadata.json');
          if (req.method === 'GET') {
            try {
              if (!existsSync(outPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
              }
              const data = readFileSync(outPath, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(data);
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
            return;
          }
          if (req.method !== 'POST') return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const metadata = JSON.parse(body);
              writeFileSync(outPath, formatJsonCompact(metadata), 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
          });
        });
      },
    },
    {
      name: 'save-story-characters',
      configureServer(server) {
        server.middlewares.use('/api/story-characters', (req, res, next) => {
          const outPath = resolve(process.cwd(), 'assets/story-characters.json');
          if (req.method === 'GET') {
            try {
              if (!existsSync(outPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
              }
              const data = readFileSync(outPath, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(data);
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
            return;
          }
          if (req.method !== 'POST') return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const characters = JSON.parse(body);
              writeFileSync(outPath, formatJsonCompact(characters), 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
          });
        });
      },
    },
    {
      name: 'game-content',
      configureServer(server) {
        server.middlewares.use('/api/game-content', (req, res, next) => {
          if (req.method !== 'GET') return next();
          const path = gameContentPath;
          const absPath = resolve(process.cwd(), path);
          try {
            if (!existsSync(absPath)) {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end(`故事文件不存在: ${path}`);
              return;
            }
            const data = readFileSync(absPath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(data);
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(String((e as Error).message));
          }
        });
      },
      closeBundle() {
        const outDir = resolve(process.cwd(), 'dist');
        const assetsDir = resolve(process.cwd(), 'assets');
        const distAssets = resolve(outDir, 'assets');
        if (existsSync(assetsDir)) {
          mkdirSync(distAssets, { recursive: true });
          const storyPath = resolve(assetsDir, 'story.tw');
          if (existsSync(storyPath)) {
            copyFileSync(storyPath, resolve(distAssets, 'story.tw'));
          }
        }
      },
    },
  ],
  base: './',
  };
});
