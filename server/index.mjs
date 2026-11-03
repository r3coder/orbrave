// Production server: the built site (dist/) plus the preset API under /api, no dependencies.
//   npm run build && node server/index.mjs
// Environment:
//   PORT=8080                    port to listen on
//   HOST=127.0.0.1               address to bind (default: all interfaces); use 127.0.0.1 behind a proxy
//   PRESET_DATA_DIR=server/data  where shared presets are stored (plain JSON files)
//   PRESET_MAX_PER_DAY=2000      shares accepted per day (also caps files per folder)
//   TRUST_PROXY=1                behind Nginx etc.: take the client address from X-Forwarded-For
//   PRESET_ALLOWED_ORIGINS=https://user.github.io   other sites allowed to use the API (CORS), comma-separated
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPresetApi } from './presetApi.mjs';

// fileURLToPath instead of import.meta.dirname so the server also runs on Node 18
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || undefined;

const api = createPresetApi({
  dataDir: resolve(ROOT, process.env.PRESET_DATA_DIR || 'server/data'),
  maxPerDay: Number(process.env.PRESET_MAX_PER_DAY) || 2000,
  trustProxy: process.env.TRUST_PROXY === '1',
  allowedOrigins: (process.env.PRESET_ALLOWED_ORIGINS || '').split(','),
});

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.flac': 'audio/flac', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};

async function serveStatic(req, res) {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (path.includes('\0')) return res.writeHead(400).end();
  let file = resolve(DIST, '.' + path);
  if (file !== DIST && !file.startsWith(DIST + sep)) return res.writeHead(403).end(); // no ../ escapes
  let st = await stat(file).catch(() => null);
  if (st?.isDirectory()) {
    file = join(file, 'index.html');
    st = await stat(file).catch(() => null);
  }
  if (!st?.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('not found');
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': st.size,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  if (req.url === '/api' || req.url.startsWith('/api/')) {
    req.url = req.url.slice(4) || '/';
    return api(req, res);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405, { Allow: 'GET, HEAD' }).end();
  serveStatic(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
})
  .on('clientError', (_e, socket) => socket.destroy())
  .listen(PORT, HOST, () => console.log(`orb algorave on http://${HOST ?? 'localhost'}:${PORT}`));
