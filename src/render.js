// Offline renderer that runs inside a hidden iframe (render.html).
// It has its own Strudel/superdough instance, so swapping the global audio context
// to an OfflineAudioContext here never interrupts the live player in the parent page.
import { initStrudel, Pattern, registerZZFXSounds } from '@strudel/web';
import { loadSampleBanks } from './samples.js';
import { renderOffline } from './offline.js';

Pattern.prototype.sect = function (a, len) {
  return this.late(a).filterWhen((t) => t >= a && t < a + len);
};

// the orb page (render.html?orbs) gates parts with .songPart() and also plays ZZFX synths
// on top of the shared banks
Pattern.prototype.songPart = function (s0, len, a, b) {
  return this.filterWhen((t) => {
    const p = (((t - s0) % len) + len) % len;
    return t >= s0 && p >= a && p < b;
  });
};
const orbs = new URLSearchParams(location.search).has('orbs');
const ready = initStrudel({
  prebake: () => {
    if (!orbs) return loadSampleBanks();
    registerZZFXSounds();
    return loadSampleBanks();
  },
});
const post = (msg, transfer) => parent.postMessage({ source: 'algorave-render', ...msg }, location.origin, transfer);
const tick = () => new Promise((r) => setTimeout(r, 0));
// downloads render at 32 kHz instead of 44.1 kHz: ~27% smaller files, still clean up to 16 kHz
const DOWNLOAD_RATE = 32000;

addEventListener('message', async (e) => {
  if (e.origin !== location.origin || e.data?.type !== 'render') return;
  const { id, code, start, end, cps } = e.data;
  try {
    const repl = await ready;
    const pattern = await repl.evaluate(code, false);
    const buffer = await renderOffline(pattern, {
      start, end, cps,
      sampleRate: DOWNLOAD_RATE,
      onProgress: (value) => post({ type: 'progress', id, value }),
    });
    const wav = await encodeWav(buffer);
    post({ type: 'done', id, wav }, [wav]);
  } catch (err) {
    post({ type: 'error', id, message: String(err?.message ?? err) });
  }
});

// 16-bit PCM WAV, encoded in slices so the shared main thread never stalls for long
async function encodeWav(buffer) {
  const ch = [buffer.getChannelData(0), buffer.getChannelData(1)];
  const frames = buffer.length;
  const out = new ArrayBuffer(44 + frames * 4);
  const v = new DataView(out);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + frames * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 2, true); // stereo
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, frames * 4, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (const c of ch) {
      const s = Math.max(-1, Math.min(1, c[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
    if (i % 100000 === 0) await tick();
  }
  return out;
}
