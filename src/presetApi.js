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

// Every shared preset the server offers (newest first), already checked against this catalogue.
// Resolves to [] when the server is missing or unreachable, so callers can fall back quietly.
export async function listPresets({ limit = 200 } = {}) {
  try {
    const body = await request(`/presets?limit=${limit}`);
    return (Array.isArray(body?.presets) ? body.presets : []).map(fromWire).filter(Boolean);
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
  const saved = fromWire(await request('/presets', { method: 'POST', body: JSON.stringify(toWire(p, extra)) }));
  if (!saved) throw new Error('bad response');
  return saved;
}
