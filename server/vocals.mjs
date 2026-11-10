// The Teto vocal words (tools/vocals/build_vocals.py), served by the share server under /api/vocals
// and never published with the site or the repository: the voice is under the voicebank's terms
// (non-commercial, no redistribution; tools/vocals/NOTICE.txt), so its files live only on this
// server, in VOCAL_DIR (default server/vocals, git-ignored). The orb page plays them when it can
// reach the server (src/vocals.js), and leaves the vocal orbs out when it can't.
//   GET /vocals                  {"vocals": true} when there are files to play, else false
//   GET /vocals/<word>.flac      one word ("hikari_2_dn4.flac"); no listing of the folder
// Other sites get the files only when they are in allowedOrigins (CORS, like the preset API).
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const WORD = /^[a-z0-9_]{1,40}\.flac$/;

export function createVocals({ dir, allowedOrigins = [] }) {
  const allowed = new Set(allowedOrigins.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean));
  let have = false; // whether the folder has any words: once it has, not checked again
  const any = async () => (have ||= await readdir(dir).then((f) => f.some((n) => WORD.test(n)), () => false));

  // a page from another site is refused unless it is allowed; an allowed one gets the CORS header
  const origin = (req, res) => {
    const o = req.headers.origin;
    if (!o) return true;
    try {
      if (new URL(o).host === req.headers.host) return true;
    } catch {}
    if (!allowed.has(o)) return false;
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    return true;
  };

  // (req, res) with req.url relative to the API ("/vocals/…"); resolves to false for other paths
  return async function vocals(req, res) {
    const path = new URL(req.url, 'http://local').pathname;
    if (path !== '/vocals' && !path.startsWith('/vocals/')) return false;
    if (!origin(req, res)) {
      res.writeHead(403).end();
      return true;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Max-Age': '86400' }).end();
      return true;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return true;
    }
    if (path === '/vocals' || path === '/vocals/') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ vocals: await any() }));
      return true;
    }
    const name = path.slice('/vocals/'.length);
    const st = WORD.test(name) ? await stat(join(dir, name)).catch(() => null) : null;
    if (!st?.isFile()) {
      res.writeHead(404).end();
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'audio/flac',
      'Content-Length': st.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=86400',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(join(dir, name)).pipe(res);
    return true;
  };
}
