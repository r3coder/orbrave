// The preset API (contract: docs/PRESET_API.md) as one request handler, shared by the
// standalone server (server/index.mjs) and the Vite dev server (tools/presetDevApi.js).
//   GET  /presets?limit=N   newest shared presets (&order=mix: N picked at random, weighted)
//   GET  /presets/<id>      one preset
//   POST /presets           share one (JSON body, validated by presetSchema.mjs)
//   POST /presets/<id>/vote 👍 / 👎 from one browser: { voter, v: 1 | -1 | 0 }
//   GET  /orbs?limit=N      newest uploaded custom orbs (&order=mix: N picked at random)
//   POST /orbs              upload one custom orb ({ orb, author, agree }, validateOrbUpload)
//   /admin/...              for the admin page (server/admin/, same origin only: no CORS): list and
//                           delete songs and orbs, with `Authorization: Bearer <adminToken>`; off
//                           when no token is set
//     GET    /admin/presets?offset=0&limit=50    GET    /admin/orbs?offset=0&limit=50
//     DELETE /admin/presets/<id>                 DELETE /admin/orbs/<id>
// `req.url` is the part after /api, e.g. "/presets?limit=50".
import { timingSafeEqual, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { LIMITS, PresetError, validateOrbUpload, validatePreset } from './presetSchema.mjs';
import { createPresetStore } from './presetStore.mjs';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};
// JSON out, gzipped when the browser takes it and it is worth it (lists shrink 5–10×)
const send = (res, status, body) => {
  const json = Buffer.from(JSON.stringify(body));
  const gz = json.length >= 1024 && /\bgzip\b/.test(res.req?.headers['accept-encoding'] ?? '');
  const vary = [res.getHeader('Vary'), 'Accept-Encoding'].filter(Boolean).join(', ');
  res.writeHead(status, { ...HEADERS, Vary: vary, ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(gz ? gzipSync(json) : json);
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
function rateLimiter({
  max = 5, windowMs = 10 * 60_000, gapMs = 15_000,
  tooMany = '잠시 뒤에 다시 공유해 주세요 (10분에 5번까지)', tooSoon = '방금 공유했어요. 조금 뒤에 다시 시도해 주세요',
} = {}) {
  const hits = new Map();
  setInterval(() => {
    const cut = Date.now() - windowMs;
    for (const [k, v] of hits) if (!v.length || v.at(-1) < cut) hits.delete(k);
  }, windowMs).unref();
  const recent = (key) => (hits.get(key) ?? []).filter((t) => t > Date.now() - windowMs);
  // check: throws when this address is over the limit; record: counts one more hit
  const check = (key) => {
    const v = recent(key);
    if (v.length >= max) throw new HttpError(429, tooMany);
    if (v.length && Date.now() - v.at(-1) < gapMs) throw new HttpError(429, tooSoon);
  };
  const record = (key) => hits.set(key, [...recent(key), Date.now()]);
  return Object.assign((key) => { check(key); record(key); }, { check, record });
}

// allowedOrigins: other sites whose pages may use this API (CORS), e.g. ['https://user.github.io'].
// Origins are compared as scheme://host[:port], so a GitHub Pages sub-path needs no extra entry.
// adminToken: the password of the admin page (ADMIN_TOKEN); without one the /admin routes answer 404.
export function createPresetApi({ dataDir, trustProxy = false, maxPerDay, rate, allowedOrigins = [], adminToken = '' } = {}) {
  if (!dataDir) throw new Error('createPresetApi: dataDir is required');
  const allowed = new Set(allowedOrigins.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean));
  const store = createPresetStore(dataDir, { maxPerDay });
  const orbStore = createPresetStore(dataDir, { maxPerDay, folder: 'orbs', check: (rec) => validateOrbUpload({ ...rec, agree: true }), votesName: 'orb-votes.json' });
  // Shares and votes are limited per browser (the random id the page keeps in localStorage,
  // sent along as `client` / `voter`) inside one address, so many people behind one network
  // (a venue's Wi-Fi, a school) don't use up each other's turns; a much looser cap per address
  // stops one machine from making up ids. A request without an id counts as the address alone.
  const limit = rateLimiter(rate);
  const netLimit = rateLimiter({ max: 40, windowMs: 10 * 60_000, gapMs: 0, tooMany: '이 네트워크에서 공유가 너무 많아요. 잠시 뒤에 다시 해 주세요' });
  const voteNetLimit = rateLimiter({ max: 1500, windowMs: 10 * 60_000, gapMs: 0, tooMany: '이 네트워크에서 평가가 너무 많아요. 잠시 뒤에 다시 해 주세요' });
  const BROWSER = /^[a-z0-9-]{16,40}$/;
  const browserKey = (req, id) => (typeof id === 'string' && BROWSER.test(id) ? `${clientKey(req)}|${id}` : clientKey(req));
  // both checked first, so a refused try doesn't count against the other
  const limitBoth = (perBrowser, perNet, req, id) => {
    const k = browserKey(req, id), n = clientKey(req);
    perBrowser.check(k);
    perNet.check(n);
    perBrowser.record(k);
    perNet.record(n);
  };
  // votes from one address: plenty for someone listening along, too few to swing the list
  // wrong admin passwords from one address: 10, then that address is shut out for 15 minutes
  // (even with the right one, so guessing on stays pointless); only wrong tries are recorded
  const adminFails = rateLimiter({ max: 10, windowMs: 15 * 60_000, gapMs: 0, tooMany: '비밀번호를 너무 많이 틀렸어요. 15분 뒤에 다시 해 주세요' });
  const tokenHash = adminToken ? createHash('sha256').update(String(adminToken)).digest() : null;
  const voteLimit = rateLimiter({ max: 60, windowMs: 10 * 60_000, gapMs: 300, tooMany: '평가를 너무 많이 했어요. 잠시 뒤에 다시 해 주세요', tooSoon: '조금 천천히 눌러 주세요' });

  // Behind the proxy the address is the LAST entry of X-Forwarded-For: the one the proxy itself
  // appended (Nginx's $proxy_add_x_forwarded_for keeps whatever the client sent in front of it,
  // so the first entries are the client's to make up and must never be used as the limit key).
  const clientKey = (req) => {
    const fwd = trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1).trim();
    return fwd || req.socket.remoteAddress || 'unknown';
  };

  // A voter id is made up by the browser, so one machine could vote as many "browsers" as it
  // likes. Per preset, only the first VOTERS_PER_NET voter ids from one address count within a
  // day (kept in memory only); those may still change or take back their vote.
  const VOTERS_PER_NET = 3, VOTER_DAY = 86_400_000;
  const netVoters = new Map(); // `${presetId}|${address}` -> Map(voter id -> when it last voted)
  const liveVoters = (key) => {
    const m = netVoters.get(key);
    if (!m) return null;
    const cut = Date.now() - VOTER_DAY;
    for (const [k, t] of m) if (t < cut) m.delete(k);
    if (!m.size) netVoters.delete(key);
    return m.size ? m : null;
  };
  setInterval(() => {
    for (const key of [...netVoters.keys()]) liveVoters(key);
  }, 3_600_000).unref();
  const voterKey = (req, id) => `${id}|${clientKey(req)}`;
  const checkNetVoter = (req, id, voter) => {
    const m = liveVoters(voterKey(req, id));
    if (m && !m.has(voter) && m.size >= VOTERS_PER_NET) throw new HttpError(429, '이 네트워크에서는 이 노래를 이미 여러 번 평가했어요');
  };
  const recordNetVoter = (req, id, voter) => {
    const key = voterKey(req, id);
    const m = liveVoters(key) ?? new Map();
    m.set(voter, Date.now());
    netVoters.set(key, m);
  };

  const sameHost = (req, origin) => {
    try {
      const host = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host;
      return new URL(origin).host === host;
    } catch {
      return false;
    }
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

  // CORS for one route: an allowed origin gets the header, and a preflight is answered here
  // (true when it was, so the handler stops)
  const cors = (req, res, { methods, headers = 'Content-Type', maxAge = '86400' }) => {
    const origin = req.headers.origin;
    const ok = !!origin && allowed.has(origin);
    if (ok) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method !== 'OPTIONS') return false;
    if (!ok) send(res, 403, { error: 'origin not allowed' });
    else {
      res.writeHead(204, { 'Access-Control-Allow-Methods': methods, 'Access-Control-Allow-Headers': headers, 'Access-Control-Max-Age': maxAge });
      res.end();
    }
    return true;
  };

  // custom orbs uploaded on their own: a list to read, and one upload at a time (same limits
  // and checks as a preset share)
  async function handleOrbs(req, res, url) {
    if (cors(req, res, { methods: 'GET, POST' })) return;
    try {
      if (req.method === 'GET') {
        const n = Number(url.searchParams.get('limit')) || 100;
        return send(res, 200, { orbs: await orbStore.list(n, { mix: url.searchParams.get('order') === 'mix' }) });
      }
      if (req.method === 'POST') {
        if (!sameOrigin(req)) throw new HttpError(403, '다른 사이트에서는 올릴 수 없어요');
        if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'JSON으로 보내 주세요');
        let body;
        try {
          body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBody(req, LIMITS.orbBody)));
        } catch (e) {
          if (e.status) throw e;
          throw new HttpError(400, '데이터를 읽을 수 없어요');
        }
        if (body?.website) throw new HttpError(400, '요청을 처리할 수 없어요');
        const clean = validateOrbUpload(body);
        limitBoth(limit, netLimit, req, body?.client);
        return send(res, 201, await orbStore.add(clean));
      }
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { error: 'method not allowed' });
    } catch (e) {
      if (e instanceof PresetError) return send(res, 400, { error: e.message });
      if (e.status) return send(res, e.status, { error: e.message });
      console.error('[orb api]', e);
      return send(res, 500, { error: '서버 오류로 저장하지 못했어요' });
    }
  }

  // the admin page: list and delete what was uploaded. Every request carries the token.
  async function handleAdmin(req, res, url) {
    const m = /^\/admin\/(presets|orbs)(?:\/([^/]+))?\/?$/.exec(url.pathname);
    if (!tokenHash || !m) return send(res, 404, { error: 'not found' });
    // the admin page is served next to the API (server/adminPage.mjs): nothing from another
    // site, not even an allowed one, gets in (no CORS headers, and a cross-site Origin is refused)
    const origin = req.headers.origin;
    if (req.method === 'OPTIONS' || (origin && !sameHost(req, origin))) return send(res, 403, { error: 'origin not allowed' });
    const which = m[1] === 'orbs' ? orbStore : store;
    const id = m[2] ?? '';
    try {
      const key = clientKey(req);
      adminFails.check(key);
      const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
      if (!timingSafeEqual(createHash('sha256').update(given).digest(), tokenHash)) {
        adminFails.record(key);
        throw new HttpError(401, '관리자 비밀번호가 맞지 않아요');
      }
      if (req.method === 'GET' && !id) {
        return send(res, 200, await which.page(Number(url.searchParams.get('offset')), Number(url.searchParams.get('limit'))));
      }
      if (req.method === 'DELETE' && id) {
        return (await which.remove(id)) ? send(res, 200, { ok: true }) : send(res, 404, { error: '이미 없어요' });
      }
      res.setHeader('Allow', id ? 'DELETE' : 'GET');
      return send(res, 405, { error: 'method not allowed' });
    } catch (e) {
      if (e.status) return send(res, e.status, { error: e.message });
      console.error('[admin api]', e);
      return send(res, 500, { error: '서버 오류' });
    }
  }

  return async function handle(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://local');
    if (url.pathname.startsWith('/admin/')) return handleAdmin(req, res, url);
    if (/^\/orbs\/?$/.test(url.pathname)) return handleOrbs(req, res, url);
    const m = /^\/presets(?:\/([^/]+)(\/vote)?)?\/?$/.exec(url.pathname);
    if (!m) return next ? next() : send(res, 404, { error: 'not found' });
    const id = m[1] ?? ''; // ids are [a-z0-9-] only, so no decoding is needed (anything else is a 404)
    const isVote = !!m[2];
    // CORS preflight (a JSON POST from another origin sends one first)
    if (cors(req, res, { methods: isVote ? 'POST' : id ? 'GET' : 'GET, POST' })) return;
    try {
      if (isVote) {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return send(res, 405, { error: 'method not allowed' });
        }
        if (!sameOrigin(req)) throw new HttpError(403, '다른 사이트에서는 평가할 수 없어요');
        if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'JSON으로 보내 주세요');
        let body;
        try {
          body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBody(req, 512)));
        } catch (e) {
          if (e.status) throw e;
          throw new HttpError(400, '데이터를 읽을 수 없어요');
        }
        limitBoth(voteLimit, voteNetLimit, req, body?.voter);
        // (a vote taken back is always let through; a new one only from the first few voter ids)
        const counts = typeof body?.voter === 'string' && body?.v !== 0;
        if (counts) checkNetVoter(req, id, body.voter);
        const ok = await store.vote(id, body?.voter, body?.v);
        if (ok && counts) recordNetVoter(req, id, body.voter);
        return ok ? send(res, 200, { ok: true, v: body.v }) : send(res, 404, { error: '찾을 수 없는 프리셋이에요' });
      }
      if (req.method === 'GET' && !id) {
        const n = Number(url.searchParams.get('limit')) || 200;
        const mix = url.searchParams.get('order') === 'mix';
        return send(res, 200, { presets: await store.list(n, { mix }) });
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
        limitBoth(limit, netLimit, req, body?.client);
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
