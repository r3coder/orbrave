# Builds the short FX one-shots in public/samples/fx and adds their keys to strudel.json.
#   python -I tools/samples/build_fx.py public/samples
# Run it after build_bank.py (which rewrites strudel.json without these keys).
#
# Every sound is either synthesised here or made from CC0 hits already in the bank (crashes,
# snares), so the results carry no outside rights. Each one fits inside a 4-bar orb block:
#   fx_impact    a hit with a long tail, for the first beat of a block
#   fx_subdrop   a sine falling A1 -> A0 (tuned to the A frame), for the first beat
#   fx_revcr     reversed crash + room, exactly one bar at 124 BPM: play it with .fit() on the
#                last bar of a block and it lands on the next downbeat at any tempo
#   fx_revsd     reversed snare/clap + room, half a bar (the last half bar of a block)
#   fx_upsweep   a one-bar noise sweep upward (the last bar of a block)
#   fx_downsweep a one-bar noise sweep downward (the first bar of a block)
import sys, os, json, numpy as np, soundfile as sf
from scipy.signal import fftconvolve, butter, sosfilt, resample_poly

OUT = sys.argv[1]
SR = 44100
BAR = 4 * 60 / 124  # the orb frame's tempo; .fit() stretches to whatever tempo is playing
rng = np.random.default_rng(2615)


def read(path):
    x, sr = sf.read(os.path.join(OUT, path), always_2d=True)
    if sr != SR:  # the TR-8 hits are 48 kHz
        g = np.gcd(sr, SR); x = resample_poly(x, SR // g, sr // g, axis=0)
    return x if x.shape[1] == 2 else np.repeat(x, 2, 1)


def room(seconds, bright=6000, dark=1500):
    # synthetic stereo room: decorrelated noise, decaying and darkening over time
    n = int(SR * seconds); t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t * 6.9 / seconds)[:, None]
    lo = sosfilt(butter(2, dark, 'low', fs=SR, output='sos'), ir, axis=0)
    hi = sosfilt(butter(2, bright, 'low', fs=SR, output='sos'), ir, axis=0)
    mix = np.clip(t / seconds * 1.5, 0, 1)[:, None]  # the tail loses its highs
    ir = hi * (1 - mix) + lo * mix
    ir[: int(SR * 0.008)] = 0  # pre-delay
    return ir / np.sqrt((ir ** 2).sum(0))


def wet(x, ir, mix):
    y = np.stack([fftconvolve(x[:, c], ir[:, c]) for c in range(2)], 1)
    y *= np.abs(x).max() / np.abs(y).max()
    out = np.zeros((len(y), 2)); out[: len(x)] += x * (1 - mix)
    return out + y * mix


def fade(x, a=0.0, b=0.0):
    x = x.copy()
    if a: n = int(SR * a); x[:n] *= (np.linspace(0, 1, n) ** 2)[:, None]
    if b: n = int(SR * b); x[-n:] *= (np.linspace(1, 0, n) ** 2)[:, None]
    return x


def fit(x, seconds):
    n = int(round(SR * seconds))
    return x[:n] if len(x) >= n else np.concatenate([x, np.zeros((n - len(x), 2))])


def norm(x, db=-1):
    return x * (10 ** (db / 20) / np.abs(x).max())


def glide(f0, f1, seconds, curve=4.0):
    # sine whose pitch falls exponentially from f0 to f1 (phase-continuous)
    t = np.arange(int(SR * seconds)) / SR
    f = f1 + (f0 - f1) * np.exp(-t * curve / seconds * 3)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def env(seconds, attack, decay):
    t = np.arange(int(SR * seconds)) / SR
    return np.minimum(t / attack, 1) * np.exp(-t / decay)


def decay(seconds, k):
    return np.exp(-np.arange(int(round(SR * seconds))) / SR * k / seconds)[:, None]


def stereo(m, width=0.0):
    if not width: return np.stack([m, m], 1)
    d = np.roll(m, int(SR * 0.0007))
    return np.stack([m, m * (1 - width) + d * width], 1)


def sweep(seconds, f0, f1, amp, q=4.0, tilt=0.0):
    # white noise through a band-pass whose centre glides f0 -> f1 (time-varying SVF)
    n = int(SR * seconds); u = np.linspace(0, 1, n)
    fc = f0 * (f1 / f0) ** u
    g = np.tan(np.pi * np.minimum(fc, SR * 0.45) / SR); k = 1 / q
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2
    out = np.zeros((n, 2)); noise = rng.standard_normal((n, 2))
    for c in range(2):
        ic1 = ic2 = 0.0; v = noise[:, c]; o = out[:, c]
        for i in range(n):
            v3 = v[i] - ic2
            v1 = a1[i] * ic1 + a2[i] * v3
            v2 = ic2 + a2[i] * ic1 + a3[i] * v3
            ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
            o[i] = v1 + tilt * (v[i] - k * v1 - v2)  # band + a little high-pass air
    return out * amp(u)[:, None]


def tanh_sat(x, drive):
    return np.tanh(x * drive) / np.tanh(drive)


fx = {}

# --- impacts ----------------------------------------------------------------
L = 2.6
sub = glide(220, 55, L, 3) * env(L, 0.002, 0.7)
click = sosfilt(butter(2, 3000, 'low', fs=SR, output='sos'), rng.standard_normal(int(SR * L))) * env(L, 0.0005, 0.02)
tail = room(2.2, 5000, 900)
base = stereo(tanh_sat(sub, 2.5) + 0.6 * click)
fx['impact'] = [
    norm(fade(wet(base, tail, 0.35)[: int(SR * L)], b=0.3)),
    # bright: the kit crash on top of the boom
    norm(fade(wet(fit(base * 0.9, L) + 0.5 * fit(read('Kit/cr/00.flac'), L), tail, 0.3)[: int(SR * L)], b=0.3)),
    # dark: a noise burst whose low-pass closes from 8 kHz to 200 Hz, over the boom
    norm(fade(wet(base * 0.8 + 0.7 * sweep(L, 6000, 150, lambda u: np.exp(-u * 9), q=1.2), tail, 0.4)[: int(SR * L)], b=0.3)),
]

# --- sub drops (A1 -> A0 and A2 -> A0) -------------------------------------------
for f0, sec in ((55, 2.0), (110, 2.4)):
    t = np.arange(int(SR * sec)) / SR
    f = f0 * 2 ** (-np.log2(f0 / 27.5) * (t / sec) ** 0.7)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(t / 0.004, 1) * (1 - t / sec) ** 1.5
    fx.setdefault('subdrop', []).append(norm(fade(stereo(tanh_sat(s, 2.0)), b=0.1)))

# --- reversed crashes, one bar at 124 BPM ------------------------------------------
crashes = ['Kit/cr/00.flac', 'TR909/cr/00.flac', 'TR808/cr/00.flac', 'RD6/cr/03.flac']
for i, p in enumerate(crashes):
    x = wet(read(p), room(1.6, 7000, 2500), 0.45)
    # a decay shape on top of the crash's own, so long crashes swell too; reversed, the far
    # tail becomes a slow fade-in that peaks on the next downbeat
    x = fade(fit(x, BAR) * decay(BAR, 3.5), b=BAR * 0.3)[::-1]
    fx.setdefault('revcr', []).append(norm(fade(x, b=0.003)))

# --- reversed snares, half a bar ---------------------------------------------------
for p, size in (('Kit/sd/00.flac', 1.4), ('TR909/sd/00.flac', 1.1), ('TR808/cp/00.flac', 1.2)):
    x = wet(read(p), room(size, 6000, 1800), 0.6)
    x = fade(fit(x, BAR / 2) * decay(BAR / 2, 3), b=BAR * 0.15)[::-1]
    fx.setdefault('revsd', []).append(norm(fade(x, b=0.003)))

# --- sweeps, one bar ---------------------------------------------------------------
fx['upsweep'] = [
    norm(fade(sweep(BAR, 250, 9000, lambda u: 0.1 + u ** 2, q=3, tilt=0.15), a=0.05, b=0.01)),
    # resonant, with a rising sine an octave apart under it (A3 -> A5)
    norm(fade(sweep(BAR, 400, 12000, lambda u: 0.1 + u ** 3, q=8, tilt=0.1)
              + stereo(0.25 * np.sin(2 * np.pi * np.cumsum(220 * 4 ** np.linspace(0, 1, int(SR * BAR))) / SR)
                       * np.linspace(0, 1, int(SR * BAR)) ** 2, 0.5), a=0.05, b=0.01)),
]
fx['downsweep'] = [
    norm(fade(sweep(BAR, 9000, 200, lambda u: (1 - u) ** 2, q=3, tilt=0.15), b=0.05)),
    norm(fade(sweep(BAR, 12000, 300, lambda u: np.exp(-u * 4), q=7, tilt=0.1), b=0.05)),
]

with open(os.path.join(OUT, 'strudel.json')) as f:
    strudel = json.load(f)
for k in [k for k in strudel if k.startswith('fx_')]:
    del strudel[k]
size = 0
for snd, xs in fx.items():
    paths = []
    for i, x in enumerate(xs):
        p = f'fx/{snd}/{i:02d}.flac'; full = os.path.join(OUT, p)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        sf.write(full, x, SR, format='FLAC', subtype='PCM_16')
        size += os.path.getsize(full); paths.append(p)
    strudel[f'fx_{snd}'] = paths
with open(os.path.join(OUT, 'strudel.json'), 'w') as f:
    json.dump(strudel, f, indent=1)
print({k: len(v) for k, v in fx.items()}, 'files', sum(map(len, fx.values())), 'KiB', size // 1024)
