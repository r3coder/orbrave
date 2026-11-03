// Dev-only mix balancing (open /tools/mix.html on the dev server).
// 1. samples: render every drum/percussion one-shot on quarter notes, measure its
//    K-weighted loudness, and compute a gain that brings it to SAMPLE_REF.
// 1b. kinds:  same for every sound recipe that can fill a melodic/bass part (KIND_REF).
// 2. roles:   for each style, render each part of a song's main section on its own and
//    move its level (relative to the kick, or to the chords in drum-less styles) to TARGETS.
// 3. _mix:    render the whole main section and even out loudness between styles.
// The result is printed as the contents of src/mixTrim.js.
import { initStrudel, Pattern } from '@strudel/web';
import { loadSampleBanks } from '../src/samples.js';
import { renderOffline, loudness } from '../src/offline.js';
import { generateSong, STYLE_NAMES, drumSampleKeys } from '../src/composer.js';
import { MIX_TRIM } from '../src/mixTrim.js';

Pattern.prototype.sect = function (a, len) {
  return this.late(a).filterWhen((t) => t >= a && t < a + len);
};

const SAMPLE_REF = -20; // LUFS (integrated) for a sample hit on quarter notes at gain 1
const KIND_REF = -20; // LUFS integrated for a chords/lead/arp/bass recipe in a main section
const KIND_SONGS = 8;
const MIX_REF = -13; // LUFS integrated for a main section, before the limiter
const MIX_REF_SOFT = -17; // ambient sits lower
const SONGS_PER_STYLE = 4;
const CYCLES = 2;

// part levels in LU relative to the reference part (kick, or chords where there is no kick)
const BASE = { kick: 0, bass: -1, snare: -2, ghost: -14, hats: -12, ohat: -13, perc: -14, toms: -6, breaks: -5, chords: -7, lead: -6, arp: -10, riser: -12, crackle: -24 };
const TARGETS = {
  techno: { perc: -15, chords: -10, bass: -2 },
  house: { chords: -5, perc: -13, hats: -11 },
  acid: { bass: 0, chords: -10 },
  trance: { lead: -4, arp: -8, bass: -2 },
  dnb: { bass: 0, snare: -1, hats: -11 },
  breakbeat: { snare: -1, hats: -10, chords: -3 },
  lofi: { chords: -3, snare: -1, hats: -11, crackle: -22 },
  synthwave: { chords: -6, lead: -5, arp: -9, snare: -1 },
  ambient: { ref: 'chords', chords: 0, bass: -4, arp: -5, lead: -3, perc: -12 },
};
const targetFor = (style, role) => (TARGETS[style]?.[role] ?? BASE[role]);

const logEl = document.getElementById('log');
const log = (...a) => { logEl.textContent += a.join(' ') + '\n'; console.log(...a); };
const tick = () => new Promise((r) => setTimeout(r, 0));
const dbToGain = (db) => Math.pow(10, db / 20);
const gainToDb = (g) => 20 * Math.log10(g);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x) => +x.toFixed(3);

const repl = await initStrudel({ prebake: loadSampleBanks });

async function measure(code, start, end, cps, tail = 0.5) {
  const pattern = await repl.evaluate(code, false);
  const buffer = await renderOffline(pattern, { start, end, cps, tail, limiter: false });
  return loudness(buffer);
}

async function measureSamples() {
  const keys = drumSampleKeys();
  log(`— samples: ${keys.length} one-shots`);
  for (const key of keys) {
    // quarter notes at 120 BPM: long-tailed hits (tambourine, cymbals) are judged with
    // their tails overlapping, the way they sound in a pattern
    const m = await measure(`$: s("${key}*4")`, 0, 2, 0.5);
    if (!Number.isFinite(m.integrated) || m.integrated < -70) {
      log(`  ${key}: silent/missing, skipped`);
      continue;
    }
    MIX_TRIM.samples[key] = round(Math.min(40, Math.max(0.05, dbToGain(SAMPLE_REF - m.integrated))));
    await tick();
  }
  log('  done');
}

async function measureKinds() {
  const levels = {};
  for (const style of STYLE_NAMES) {
    for (let i = 0; i < KIND_SONGS; i++) {
      const song = generateSong(((i + 1) * 2246822519) >>> 0, 0, [style]);
      const sec = mainSection(song);
      for (const part of sec.parts) {
        if (!part.kind || (levels[part.kind]?.length ?? 0) >= 4) continue;
        const m = await measure(part.code, sec.start, sec.start + Math.min(CYCLES, sec.len), song.cps);
        if (Number.isFinite(m.integrated) && m.integrated > -70) (levels[part.kind] ??= []).push(m.integrated);
      }
    }
  }
  log(`— kinds: ${Object.keys(levels).length} sound recipes`);
  for (const [kind, xs] of Object.entries(levels)) {
    const l = median(xs);
    MIX_TRIM.kinds[kind] = round(Math.min(40, Math.max(0.05, dbToGain(KIND_REF - l))));
    log(`  ${kind.padEnd(34)} ${l.toFixed(1)} LUFS → ×${MIX_TRIM.kinds[kind]}`);
  }
}

// the section with the fullest arrangement stands in for the song's mix
const mainSection = (song) =>
  ['drop2', 'main2', 'drop', 'main', 'chorus', 'glow', 'swell', 'drift'].map((n) => song.sections.find((s) => s.name === n)).find(Boolean) ?? song.sections[0];

async function measureRoles(style, apply) {
  const corr = {}; // role -> dB corrections across songs
  const levels = {};
  for (let i = 0; i < SONGS_PER_STYLE; i++) {
    const song = generateSong(((i + 1) * 2654435761) >>> 0, 0, [style]);
    const sec = mainSection(song);
    const end = sec.start + Math.min(CYCLES, sec.len);
    const byRole = {};
    for (const part of sec.parts) {
      const m = await measure(part.code, sec.start, end, song.cps);
      if (!Number.isFinite(m.integrated) || m.integrated < -60) continue;
      // two lines of the same role (e.g. hats + hats2) sum in power
      byRole[part.role] = byRole[part.role] === undefined ? m.integrated : 10 * Math.log10(10 ** (byRole[part.role] / 10) + 10 ** (m.integrated / 10));
    }
    const refRole = TARGETS[style]?.ref ?? 'kick';
    const ref = byRole[refRole];
    if (ref === undefined) continue;
    for (const [role, lufs] of Object.entries(byRole)) {
      const rel = lufs - ref;
      (levels[role] ??= []).push(rel);
      if (role !== refRole) (corr[role] ??= []).push(targetFor(style, role) - rel);
    }
  }
  const row = Object.entries(levels).map(([role, xs]) => `${role} ${median(xs).toFixed(1)} (→${targetFor(style, role)})`).join(' · ');
  log(`  ${style.padEnd(9)} ${row}`);
  if (!apply) return;
  const roles = (MIX_TRIM.roles[style] ??= {});
  for (const [role, xs] of Object.entries(corr)) {
    roles[role] = round(Math.min(10, Math.max(0.05, (roles[role] ?? 1) * dbToGain(median(xs)))));
  }
}

async function measureMix(style, apply) {
  const vals = [];
  for (let i = 0; i < SONGS_PER_STYLE; i++) {
    const song = generateSong(((i + 1) * 2654435761) >>> 0, 0, [style]);
    const sec = mainSection(song);
    const code = sec.parts.map((p) => p.code).join('\n');
    const m = await measure(code, sec.start, sec.start + Math.min(CYCLES, sec.len), song.cps);
    vals.push(m.integrated);
  }
  const lufs = median(vals);
  const ref = style === 'ambient' ? MIX_REF_SOFT : MIX_REF;
  log(`  ${style.padEnd(9)} ${lufs.toFixed(1)} LUFS (→${ref})`);
  if (!apply) return;
  const roles = (MIX_TRIM.roles[style] ??= {});
  roles._mix = round((roles._mix ?? 1) * dbToGain(ref - lufs));
}

function printTable() {
  const out = `export const MIX_TRIM = ${JSON.stringify(MIX_TRIM, null, 2)};\n`;
  window.__mixTrim = out;
  log('\n// ---- src/mixTrim.js ----\n' + out);
}

async function run(apply) {
  logEl.textContent = '';
  const t0 = performance.now();
  if (apply) {
    // role trims are corrected starting from their current values, so a part that the measured
    // main sections happen not to use this time keeps its last trim instead of resetting to 1
    for (const table of [MIX_TRIM.samples, MIX_TRIM.kinds]) for (const k of Object.keys(table)) delete table[k];
    await measureSamples();
    await measureKinds();
  }
  // two passes: a part's level can depend on others through shared reverb/delay buses
  for (let pass = 1; pass <= (apply ? 2 : 1); pass++) {
    log(`— part levels (LU vs reference${apply ? `, pass ${pass}` : ''})`);
    for (const st of STYLE_NAMES) await measureRoles(st, apply);
  }
  if (apply) {
    log('— part levels after');
    for (const st of STYLE_NAMES) await measureRoles(st, false);
  }
  log('— main-section loudness');
  for (const st of STYLE_NAMES) await measureMix(st, apply);
  if (apply) {
    log('— loudness after');
    for (const st of STYLE_NAMES) await measureMix(st, false);
    printTable();
  }
  log(`finished in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  window.__mixDone = true;
}

document.getElementById('run').onclick = () => run(true);
document.getElementById('report').onclick = () => run(false);
