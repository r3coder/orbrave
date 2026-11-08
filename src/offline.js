// Offline rendering of a Strudel pattern into an AudioBuffer, plus a loudness meter.
// Used by the download renderer (render.js) and the dev mix-balancing tool (tools/mix.js).
// Both run in their own page/iframe, because rendering swaps superdough's global
// audio context to an OfflineAudioContext.
import { makeGraphicEq } from './graphicEq.js';
import { superdough, initAudio, setAudioContext, setSuperdoughAudioController, getSuperdoughAudioController } from '@strudel/web';

const SAMPLE_RATE = 44100;
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function renderOffline(pattern, { start, end, cps, eq = null, tail = 3, limiter = true, sampleRate = SAMPLE_RATE, onProgress } = {}) {
  const seconds = (end - start) / cps + tail;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  try {
    setAudioContext(ctx);
    setSuperdoughAudioController(null);
    await initAudio();

    if (limiter || eq) {
      // same master chain as the live player: a custom mood's graphic EQ, then the limiter
      const master = getSuperdoughAudioController().output.destinationGain;
      let out = master;
      master.disconnect();
      if (eq) {
        const g = makeGraphicEq(ctx, eq);
        out.connect(g.input);
        out = g.output;
      }
      if (limiter) out = out.connect(new DynamicsCompressorNode(ctx, { threshold: -8, knee: 6, ratio: 12, attack: 0.003, release: 0.25 }));
      out.connect(ctx.destination);
    }

    // Schedule just ahead of the render position instead of all at once: every scheduled
    // voice sits in the graph until it plays, so scheduling a whole song up front makes
    // each render quantum process thousands of idle nodes (quadratic slowdown).
    let next = start;
    const scheduleUntil = async (until) => {
      for (; next < Math.min(until, end); next++) {
        const haps = pattern
          .queryArc(next, Math.min(next + 1, end), { _cps: cps }) // one big query is very slow in Strudel
          .filter((h) => h.hasOnset())
          .sort((a, b) => a.whole.begin - b.whole.begin);
        for (const hap of haps) {
          hap.ensureObjectValue();
          const t = (hap.whole.begin.valueOf() - start) / cps;
          await superdough(hap.value, t, hap.duration / cps, cps, t).catch(() => {});
        }
      }
    };
    await scheduleUntil(start + 2);
    for (let c = start + 1; c < end; c++) {
      ctx.suspend((c - start) / cps).then(async () => {
        await scheduleUntil(c + 2);
        onProgress?.((c - start) / (end - start));
        await tick(); // keep a live scheduler on the same thread running smoothly
        ctx.resume();
      });
    }
    return await ctx.startRendering();
  } finally {
    setAudioContext(null);
    setSuperdoughAudioController(null);
  }
}

// ITU-R BS.1770 style loudness: K-weighting (high shelf +4 dB at ~1.7 kHz, high-pass at
// ~38 Hz), then mean square per 400 ms block. Returns LUFS-like values:
// `integrated` over the blocks above an absolute gate, `momentary` = loudest block,
// and the sample `peak` in dBFS.
export async function loudness(buffer) {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = new AudioBufferSourceNode(ctx, { buffer });
  const shelf = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 1681, gain: 4 });
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 38, Q: 0.5 });
  src.connect(shelf).connect(hp).connect(ctx.destination);
  src.start();
  const k = await ctx.startRendering();

  const block = Math.round(0.4 * k.sampleRate);
  const hop = Math.round(0.1 * k.sampleRate);
  const chans = [...Array(k.numberOfChannels)].map((_, i) => k.getChannelData(i));
  const blocks = [];
  for (let s = 0; s + block <= k.length; s += hop) {
    let sum = 0;
    for (const c of chans) for (let i = s; i < s + block; i++) sum += c[i] * c[i];
    blocks.push(sum / block);
  }
  const lufs = (ms) => -0.691 + 10 * Math.log10(ms || 1e-12);
  const gated = blocks.filter((ms) => lufs(ms) > -70);
  const mean = gated.length ? gated.reduce((a, b) => a + b, 0) / gated.length : 1e-12;
  let peak = 0;
  for (const c of buffer.numberOfChannels ? [...Array(buffer.numberOfChannels)].map((_, i) => buffer.getChannelData(i)) : [])
    for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  return {
    integrated: lufs(mean),
    momentary: lufs(Math.max(...blocks, 1e-12)),
    peak: 20 * Math.log10(peak || 1e-9),
  };
}
