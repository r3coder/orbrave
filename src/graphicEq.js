// The custom moods' graphic EQ (🎛 편집 on a mood orb): Strudel has no peaking EQ per sound, so
// the EQ sits on the master bus, a peaking filter per 1/3-octave band (server/orbEditSpec.mjs
// EQ_FREQS). The live player (orbs/audio.js) and the WAV renderer (offline.js) both put one
// between superdough's output and the limiter. A band at 0 dB passes the sound unchanged.
import { EQ_FREQS } from '../server/orbEditSpec.mjs';

// Q of a 1/3-octave band
const Q = Math.SQRT2 ** (2 / 3) / (2 ** (1 / 3) - 1);

// { input, output, set(gains) }: gains in dB per band (null = flat)
export function makeGraphicEq(ac, gains = null) {
  const nyq = ac.sampleRate / 2;
  const bands = EQ_FREQS.filter((f) => f < nyq * 0.95).map((f) => new BiquadFilterNode(ac, { type: 'peaking', frequency: f, Q }));
  for (let i = 1; i < bands.length; i++) bands[i - 1].connect(bands[i]);
  let last = null;
  const set = (g) => {
    const key = g ? g.map((x) => x.toFixed(2)).join(',') : '';
    if (key === last) return;
    last = key;
    bands.forEach((b, i) => {
      const db = g?.[i] ?? 0;
      // glide there, so a change doesn't click
      if (ac instanceof OfflineAudioContext) b.gain.value = db;
      else b.gain.setTargetAtTime(db, ac.currentTime, 0.03);
    });
  };
  set(gains);
  return { input: bands[0], output: bands[bands.length - 1], set };
}
