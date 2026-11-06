// Shared presets as plain JSON files, one per preset, split into one folder per day:
//   <dataDir>/presets/2026-11/04/261104-k3j9x2abq0.json
// The id carries its date, so a lookup goes straight to its file, the newest presets are the
// newest folders, and no single folder grows past one day's uploads (capped by maxPerDay).
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validatePreset } from './presetSchema.mjs';

const ID = /^(\d{2})(\d{2})(\d{2})-[a-z0-9]{10}$/;
const CACHE = 500; // newest presets kept in memory for the list (GET /presets returns at most this)
const VOTER = /^[a-z0-9-]{16,40}$/;
const VOTE_SAVE_MS = 2000; // votes are written to disk at most this often

// How often a preset comes up on the pages, from its 👍 / 👎 balance: 1 with no votes,
// doubling every 3 net 👍 up to 4×, halving every 3 net 👎 down to ¼×. The counts themselves
// never leave the server; lists only carry this coarse weight.
export function voteWeight(up, down) {
  const s = Math.max(-6, Math.min(6, up - down));
  return Math.round(2 ** (s / 3) * 100) / 100;
}

const pad = (n) => String(n).padStart(2, '0');
const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789';
const randomId = (n) => [...randomBytes(n)].map((b) => ALPHA[b % 36]).join('');

// `folder` / `check`: the same store holds uploaded custom orbs (folder 'orbs', checked with
// validateOrbUpload) next to the presets; `check` turns a stored record back into its clean fields.
const checkPreset = (rec) => validatePreset({ ...rec, agree: true });
export function createPresetStore(dataDir, { maxPerDay = 2000, folder = 'presets', check = checkPreset, votesName = 'votes.json' } = {}) {
  const root = join(dataDir, folder);
  const dirOf = (id) => {
    const m = ID.exec(id);
    return m && join(root, `20${m[1]}-${m[2]}`, m[3]);
  };
  let cache = null; // newest first
  const perDay = new Map(); // 'YYMMDD' -> files in that folder

  // Votes: one file, <dataDir>/votes.json = { presetId: { voterId: 1 | -1 } }, kept in memory
  // and written back (temp file + rename) a moment after the last change.
  const votesFile = join(dataDir, votesName);
  let votes = null;
  let voteTimer = null;
  let voteWrite = Promise.resolve();
  async function loadVotes() {
    if (votes) return votes;
    try {
      const raw = JSON.parse(await readFile(votesFile, 'utf8'));
      votes = new Map();
      for (const [id, by] of Object.entries(raw ?? {})) {
        if (!ID.test(id) || !by || typeof by !== 'object') continue;
        const m = new Map(Object.entries(by).filter(([k, v]) => VOTER.test(k) && (v === 1 || v === -1)));
        if (m.size) votes.set(id, m);
      }
    } catch {
      votes ??= new Map();
    }
    return votes;
  }
  function saveVotesSoon() {
    if (voteTimer) return;
    voteTimer = setTimeout(() => {
      voteTimer = null;
      const data = JSON.stringify(Object.fromEntries([...votes].map(([id, m]) => [id, Object.fromEntries(m)])));
      voteWrite = voteWrite.then(async () => {
        const tmp = join(dataDir, `.votes.${randomId(6)}.tmp`);
        try {
          await mkdir(dataDir, { recursive: true });
          await writeFile(tmp, data, { mode: 0o644 });
          await rename(tmp, votesFile);
        } catch (e) {
          await rm(tmp, { force: true });
          console.error('[preset store] votes not saved', e);
        }
      });
    }, VOTE_SAVE_MS);
    voteTimer.unref?.();
  }
  const tally = (id) => {
    const m = votes?.get(id);
    let up = 0;
    for (const v of m?.values() ?? []) up += v > 0;
    return { up, down: (m?.size ?? 0) - up };
  };
  const weightOf = (id) => {
    if (!votes?.has(id)) return 1;
    const { up, down } = tally(id);
    return voteWeight(up, down);
  };

  // a stored file, re-checked on the way out so a hand-edited or damaged file never reaches a page
  async function readRecord(file) {
    try {
      const rec = JSON.parse(await readFile(file, 'utf8'));
      if (!ID.test(rec?.id ?? '')) return null;
      return { id: rec.id, createdAt: String(rec.createdAt ?? ''), ...check(rec) };
    } catch {
      return null;
    }
  }

  const subdirs = async (dir) => (await readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();

  // the newest `max` records on disk, newest first (stops reading once it has them)
  async function loadCache(max = CACHE) {
    const out = [];
    for (const month of await subdirs(root)) {
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      for (const day of await subdirs(join(root, month))) {
        if (!/^\d{2}$/.test(day)) continue;
        const dir = join(root, month, day);
        const files = (await readdir(dir).catch(() => [])).filter((f) => ID.test(f.replace(/\.json$/, '')) && f.endsWith('.json'));
        const recs = (await Promise.all(files.map((f) => readRecord(join(dir, f))))).filter(Boolean);
        out.push(...recs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        if (out.length >= max) return out.slice(0, max);
      }
    }
    return out;
  }

  async function countDay(key, dir) {
    if (!perDay.has(key)) {
      perDay.clear(); // only today's count is ever needed
      perDay.set(key, (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json')).length);
    }
    return perDay.get(key);
  }

  return {
    // The newest `limit` presets, or with `mix` `limit` of the cached ones picked at random:
    // well-liked (weight) and recent (first few days) ones more often, the same weighting the
    // pages use (weighted shuffle: each gets the key rand^(1/weight), highest first).
    async list(limit = 200, { mix = false } = {}) {
      cache ??= await loadCache();
      await loadVotes();
      const n = Math.max(1, Math.min(CACHE, limit));
      const all = cache.map((r) => ({ ...r, w: weightOf(r.id) }));
      if (!mix) return all.slice(0, n);
      const now = Date.now();
      return all
        .map((r) => {
          const age = Math.max(0, (now - (Date.parse(r.createdAt) || 0)) / 86_400_000);
          return [Math.random() ** (1 / (r.w * (1 + 2 * Math.exp(-age / 3)))), r];
        })
        .sort((a, b) => b[0] - a[0])
        .slice(0, n)
        .map((x) => x[1]);
    },

    // One vote per voter id and preset: 1 (👍), -1 (👎), or 0 to take it back. Voting again
    // replaces the earlier vote, so it never adds up. Resolves to false when there is no such preset.
    async vote(id, voter, v) {
      if (!VOTER.test(voter ?? '') || ![1, -1, 0].includes(v)) throw Object.assign(new Error('평가 값이 올바르지 않아요'), { status: 400 });
      if (!(await this.get(id))) return false;
      await loadVotes();
      let m = votes.get(id);
      if (v === 0) {
        if (!m?.delete(voter)) return true;
        if (!m.size) votes.delete(id);
      } else {
        if (m?.get(voter) === v) return true;
        if (!m) votes.set(id, (m = new Map()));
        m.set(voter, v);
      }
      saveVotesSoon();
      return true;
    },

    async get(id) {
      const dir = typeof id === 'string' && dirOf(id);
      return dir ? readRecord(join(dir, `${id}.json`)) : null;
    },

    // For the admin page: `limit` records from `offset` on, newest first, with their vote
    // counts; `more` when there are older ones still. Pages inside the in-memory list come from
    // it; deeper ones are read from disk.
    async page(offset = 0, limit = 50) {
      const o = Math.max(0, Math.floor(offset) || 0);
      const n = Math.max(1, Math.min(200, Math.floor(limit) || 50));
      const recs = o + n + 1 <= CACHE ? (cache ??= await loadCache()) : await loadCache(o + n + 1);
      await loadVotes();
      const items = recs.slice(o, o + n).map((r) => ({ ...r, ...tally(r.id) }));
      return { items, more: recs.length > o + n };
    },

    // Deletes one record (its file and its votes). Resolves to false when there is no such record.
    async remove(id) {
      const dir = typeof id === 'string' && dirOf(id);
      if (!dir) return false;
      try {
        await rm(join(dir, `${id}.json`));
      } catch (e) {
        if (e.code === 'ENOENT') return false;
        throw e;
      }
      cache = null; // read again on the next list, so the one after the cut moves up
      await loadVotes();
      if (votes.delete(id)) saveVotesSoon();
      return true;
    },

    // `clean` must already have passed validatePreset
    async add(clean) {
      const now = new Date();
      const key = `${pad(now.getUTCFullYear() % 100)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
      const id = `${key}-${randomId(10)}`;
      const dir = dirOf(id);
      if ((await countDay(key, dir)) >= maxPerDay) {
        const e = new Error('오늘은 공유가 너무 많아서 더 받을 수 없어요. 내일 다시 시도해 주세요');
        e.status = 503;
        throw e;
      }
      const rec = { id, createdAt: now.toISOString(), ...clean };
      await mkdir(dir, { recursive: true });
      // write a temp file and rename it, so a reader never sees half a preset
      const tmp = join(dir, `.${id}.${randomId(6)}.tmp`);
      try {
        await writeFile(tmp, JSON.stringify(rec, null, 1), { flag: 'wx', mode: 0o644 });
        await rename(tmp, join(dir, `${id}.json`));
      } catch (e) {
        await rm(tmp, { force: true });
        throw e;
      }
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
      if (cache) cache = [rec, ...cache].slice(0, CACHE);
      return rec;
    },
  };
}
