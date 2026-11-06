// Client for the preset server (the server itself lives elsewhere; contract: docs/PRESET_API.md).
// The base URL comes from VITE_PRESET_API at build time and defaults to `/api` on the same origin.
import { fromWire, toWire } from './orbPreset.js';

const BASE = (import.meta.env.VITE_PRESET_API || '/api').replace(/\/+$/, '');
const TIMEOUT = 6000;

async function request(path, init = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal: ctl.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// Shared presets the server offers (newest first), already checked against this catalogue.
// `mix`: instead of the newest, `limit` picked at random, well-liked and recent ones more often.
// Throws when the server is missing or unreachable (the orb page shows that the server is down).
export async function fetchPresets({ limit = 200, mix = false } = {}) {
  const body = await request(`/presets?limit=${limit}${mix ? '&order=mix' : ''}`);
  if (!Array.isArray(body?.presets)) throw new Error('not a preset server');
  return body.presets.map(fromWire).filter(Boolean);
}

// The same, but resolves to [] when the server is missing or unreachable, so callers can fall back quietly.
export async function listPresets(opts) {
  try {
    return await fetchPresets(opts);
  } catch (e) {
    console.info('preset server unavailable:', e.message);
    return [];
  }
}

// one preset by id (share links), or null
export async function getPreset(id) {
  try {
    return fromWire(await request(`/presets/${encodeURIComponent(id)}`));
  } catch {
    return null;
  }
}

// Publish a local preset; resolves to the stored preset (with the server's id) or throws.
// `extra` is what the share dialog asks: { kind, author, description, agree, website }.
export async function uploadPreset(p, extra = {}) {
  // `client`: this browser's random id, so the server limits shares per browser, not per network
  const saved = fromWire(await request('/presets', { method: 'POST', body: JSON.stringify({ ...toWire(p, extra), client: voterId() ?? '' }) }));
  if (!saved) throw new Error('bad response');
  return saved;
}

// ---------- custom orbs (🎛 편집) uploaded on their own ----------
// The server keeps each as { id, createdAt, orb: { id, base, name, color, e }, author }.
// fetchOrbs resolves to those records (the orb page checks each definition itself).
export async function fetchOrbs({ limit = 60, mix = true } = {}) {
  const body = await request(`/orbs?limit=${limit}${mix ? '&order=mix' : ''}`);
  if (!Array.isArray(body?.orbs)) throw new Error('not an orb server');
  return body.orbs.filter((r) => r && typeof r === 'object' && r.orb);
}
// Publish one custom orb definition; resolves to the stored record or throws with the server's message.
export async function uploadOrb(orb, { author = '', agree = false, website = '' } = {}) {
  return request('/orbs', { method: 'POST', body: JSON.stringify({ orb, author, agree, website, client: voterId() ?? '' }) });
}

// ---------- 👍 / 👎 ----------
// Each browser gets one random voter id (localStorage), so the server keeps one vote per
// browser and preset. The votes themselves never come back: lists only carry a coarse weight
// `w` (1 = no votes) that decides how often a preset comes up.

const VOTER_KEY = 'orbVoter';
const VOTES_KEY = 'orbVotes'; // { presetId: 1 | -1 } — what this browser voted, to light the buttons

// ids the server hands out (261104-k3j9x2abq0); presets saved or imported here have other ids
export const isSharedId = (id) => /^\d{6}-[a-z0-9]{10}$/.test(String(id ?? ''));

function voterId() {
  try {
    let id = localStorage.getItem(VOTER_KEY);
    if (!/^[a-z0-9-]{16,40}$/.test(id ?? '')) {
      id = crypto.randomUUID?.() ?? [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(VOTER_KEY, id);
    }
    return id;
  } catch {
    return null; // no storage (private window etc.): no voting
  }
}

function readVotes() {
  try {
    const v = JSON.parse(localStorage.getItem(VOTES_KEY));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

// this browser's vote on a preset: 1, -1 or 0
export const myVote = (id) => readVotes()[id] ?? 0;
export const canVote = (id) => isSharedId(id) && !!voterId();

// Send a vote (1, -1, or 0 to take it back); resolves to the vote now stored, or throws.
export async function votePreset(id, v) {
  const voter = voterId();
  if (!voter || !isSharedId(id)) throw new Error('cannot vote');
  await request(`/presets/${encodeURIComponent(id)}/vote`, { method: 'POST', body: JSON.stringify({ voter, v }) });
  const all = readVotes();
  if (v) all[id] = v;
  else delete all[id];
  try {
    localStorage.setItem(VOTES_KEY, JSON.stringify(all));
  } catch {}
  return v;
}

const weightOf = (p) => (Number.isFinite(p?.w) && p.w > 0 ? p.w : 1);

// one preset at random, a well-liked one more often (weight `w`)
export function weightedPick(list) {
  let r = Math.random() * list.reduce((s, p) => s + weightOf(p), 0);
  for (const p of list) if ((r -= weightOf(p)) < 0) return p;
  return list.at(-1);
}

// The list in a random order where well-liked and recent presets tend to come first
// (weighted shuffle: each gets the key rand^(1/weight), highest first).
export function weightedOrder(list) {
  const now = Date.now();
  const DAY = 86_400_000;
  return list
    .map((p) => {
      const age = Math.max(0, (now - (Date.parse(p.createdAt) || 0)) / DAY);
      return [Math.random() ** (1 / (weightOf(p) * (1 + 2 * Math.exp(-age / 3)))), p];
    })
    .sort((a, b) => b[0] - a[0])
    .map((x) => x[1]);
}
