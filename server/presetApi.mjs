// The preset API (contract: docs/PRESET_API.md) as one request handler, shared by the
// standalone server (server/index.mjs) and the Vite dev server (tools/presetDevApi.js).
//   GET  /presets?limit=N   newest shared presets
//   GET  /presets/<id>      one preset
//   POST /presets           share one (JSON body, validated by presetSchema.mjs)
// `req.url` is the part after /api, e.g. "/presets?limit=50".
import { LIMITS, PresetError, validatePreset } from './presetSchema.mjs';
import { createPresetStore } from './presetStore.mjs';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};
const send = (res, status, body) => {
  res.writeHead(status, HEADERS);
  res.end(JSON.stringify(body));
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// read at most `limit` bytes of body, or fail with 413 without buffering the rest
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (declared > limit) return reject(new HttpError(413, '보내는 데이터가 너무 커요'));
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, '보내는 데이터가 너무 커요'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Sliding-window limit per client address: a few shares per window, and a short gap between two.
function rateLimiter({ max = 5, windowMs = 10 * 60_000, gapMs = 15_000 } = {}) {
  const hits = new Map();
  setInterval(() => {
    const cut = Date.now() - windowMs;
    for (const [k, v] of hits) if (!v.length || v.at(-1) < cut) hits.delete(k);
  }, windowMs).unref();
  return (key) => {
    const now = Date.now();
    const v = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (v.length >= max) throw new HttpError(429, '잠시 뒤에 다시 공유해 주세요 (10분에 5번까지)');
    if (v.length && now - v.at(-1) < gapMs) throw new HttpError(429, '방금 공유했어요. 조금 뒤에 다시 시도해 주세요');
    v.push(now);
    hits.set(key, v);
  };
}

// allowedOrigins: other sites whose pages may use this API (CORS), e.g. ['https://user.github.io'].
// Origins are compared as scheme://host[:port], so a GitHub Pages sub-path needs no extra entry.
export function createPresetApi({ dataDir, trustProxy = false, maxPerDay, rate, allowedOrigins = [] } = {}) {
  if (!dataDir) throw new Error('createPresetApi: dataDir is required');
  const allowed = new Set(allowedOrigins.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean));
  const store = createPresetStore(dataDir, { maxPerDay });
  const limit = rateLimiter(rate);

  const clientKey = (req) => {
    const fwd = trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    return fwd || req.socket.remoteAddress || 'unknown';
  };

  // a browser posting from another site is refused, unless that site is in allowedOrigins
  const sameOrigin = (req) => {
    const origin = req.headers.origin;
    if (!origin || allowed.has(origin)) return true;
    try {
      const host = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host;
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  };

  return async function handle(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://local');
    const m = /^\/presets(?:\/([^/]*))?\/?$/.exec(url.pathname);
    if (!m) return next ? next() : send(res, 404, { error: 'not found' });
    const id = m[1] ?? ''; // ids are [a-z0-9-] only, so no decoding is needed (anything else is a 404)
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    // CORS preflight (a JSON POST from another origin sends one first)
    if (req.method === 'OPTIONS') {
      if (!origin || !allowed.has(origin)) return send(res, 403, { error: 'origin not allowed' });
      res.writeHead(204, {
        'Access-Control-Allow-Methods': id ? 'GET' : 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      return res.end();
    }
    try {
      if (req.method === 'GET' && !id) {
        const n = Number(url.searchParams.get('limit')) || 200;
        return send(res, 200, { presets: await store.list(n) });
      }
      if (req.method === 'GET') {
        const p = await store.get(id);
        return p ? send(res, 200, p) : send(res, 404, { error: '찾을 수 없는 프리셋이에요' });
      }
      if (req.method === 'POST' && !id) {
        if (!sameOrigin(req)) throw new HttpError(403, '다른 사이트에서는 공유할 수 없어요');
        if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'JSON으로 보내 주세요');
        const raw = await readBody(req, LIMITS.body);
        let body;
        try {
          body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
        } catch {
          throw new HttpError(400, '데이터를 읽을 수 없어요');
        }
        // honeypot: a field the page keeps hidden and empty, which form-filling bots fill in
        if (body?.website) throw new HttpError(400, '요청을 처리할 수 없어요');
        const clean = validatePreset(body); // throws PresetError with a message for the user
        limit(clientKey(req));
        return send(res, 201, await store.add(clean));
      }
      res.setHeader('Allow', id ? 'GET' : 'GET, POST');
      return send(res, 405, { error: 'method not allowed' });
    } catch (e) {
      if (e instanceof PresetError) return send(res, 400, { error: e.message });
      if (e.status) return send(res, e.status, { error: e.message });
      console.error('[preset api]', e);
      return send(res, 500, { error: '서버 오류로 저장하지 못했어요' });
    }
  };
}
