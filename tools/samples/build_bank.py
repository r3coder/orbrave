# Builds the CC0 drum bank in public/samples from the recordings fetched by download.mjs.
#   python -I tools/samples/build_bank.py <download dir> public/samples
# Also writes kitbreak-loop.flac (the whole break, for listening) into the download dir.
import sys, os, json, glob, numpy as np, soundfile as sf
DL, OUT = sys.argv[1], sys.argv[2]
MCK, RUSTY = os.path.join(DL, 'mck'), os.path.join(DL, 'rusty', 'Samples')

def mck(folder, *nums):
    out = []
    for n in nums:
        g = glob.glob(os.path.join(MCK, folder, f'{n:03d}*.wav'))
        assert len(g) == 1, (folder, n, g)
        out.append(g[0])
    return out

def tr8(folder, *nums): return mck('TR8/' + folder, *nums)
def rd6(folder, *nums): return mck('RD6/' + folder, *nums)

# Big Rusty Drums: close mic + overheads mixed into one stereo hit
def rusty(art, close, files, oh=0.6):
    out = []
    for f in files:
        c = os.path.join(RUSTY, art, close, f); o = os.path.join(RUSTY, art, 'oh', f)
        assert os.path.exists(c) and os.path.exists(o), (c, o)
        out.append(('mix', c, o, oh))
    return out

def rr(pre, vls, rrs): return [f'{pre}_vl{v}_rr{r}.flac' for v in vls for r in rrs]

def rfiles(art, close, pattern):
    fs = [os.path.basename(p) for p in glob.glob(os.path.join(RUSTY, art, close, pattern))]
    vl = lambda f: int(f.split('_vl')[1].split('_')[0])
    return sorted(fs, key=vl)

BANK = {
  'TR909_bd': tr8('BD', 4, 5, 6, 12, 13, 14), 'TR909_sd': tr8('SD', 5, 6, 7, 11, 12), 'TR909_cp': tr8('PERC', 19, 20),
  'TR909_rim': tr8('PERC', 9), 'TR909_hh': tr8('HATS', 8, 10), 'TR909_oh': tr8('HATS', 7, 9), 'TR909_cr': tr8('HATS', 20, 21),
  'TR909_rd': tr8('HATS', 26, 27), 'TR909_lt': tr8('TOMS', 10, 16), 'TR909_mt': tr8('TOMS', 11, 17), 'TR909_ht': tr8('TOMS', 12, 18),
  'TR808_bd': tr8('BD', 1, 2, 3, 7, 8), 'TR808_sd': tr8('SD', 1, 2, 3, 4), 'TR808_cp': tr8('PERC', 17, 18, 22, 23),
  'TR808_rim': tr8('PERC', 8), 'TR808_hh': tr8('HATS', 2, 4), 'TR808_oh': tr8('HATS', 1, 3, 5), 'TR808_cr': tr8('HATS', 17, 18),
  'TR808_cb': tr8('PERC', 33, 34), 'TR808_sh': tr8('PERC', 26, 27), 'TR808_perc': tr8('PERC', 10, 11, 24) + tr8('TOMS', 19, 20, 21),
  'TR808_lt': tr8('TOMS', 1, 4, 7, 31), 'TR808_mt': tr8('TOMS', 2, 5, 32), 'TR808_ht': tr8('TOMS', 3, 6, 33),
  'TR707_bd': tr8('BD', 9, 10, 11), 'TR707_sd': tr8('SD', 8, 9, 10), 'TR707_cp': tr8('PERC', 21), 'TR707_rim': tr8('PERC', 12, 13),
  'TR707_hh': tr8('HATS', 12), 'TR707_oh': tr8('HATS', 11), 'TR707_cr': tr8('HATS', 22, 23), 'TR707_rd': tr8('HATS', 28, 29),
  'TR707_tb': tr8('PERC', 36), 'TR707_lt': tr8('TOMS', 25, 28), 'TR707_mt': tr8('TOMS', 26, 29), 'TR707_ht': tr8('TOMS', 27, 30),
  'TR606_bd': tr8('BD', 15, 16, 17), 'TR606_sd': tr8('SD', 13, 14, 15, 16), 'TR606_hh': tr8('HATS', 14, 16), 'TR606_oh': tr8('HATS', 13, 15),
  'TR606_cr': tr8('HATS', 24, 25), 'TR606_lt': tr8('TOMS', 34, 35, 37, 38), 'TR606_ht': tr8('TOMS', 36, 39),
  'TR727_perc': tr8('PERC', 1, 2, 3, 4, 5, 6, 7, 14, 15, 16, 29, 30, 31, 32, 35), 'TR727_sh': tr8('PERC', 28),
  'RD6_bd': rd6('BD', 1, 2, 3, 4, 5, 6), 'RD6_sd': rd6('SD', 1, 2, 3, 4, 5, 6, 7),
  'RD6_cp': rd6('CLAP', 2, 3, 4, 5, 6, 7) + rd6('SD', 8, 9, 10, 11, 12), 'RD6_hh': rd6('HATS', 1, 2, 3, 4),
  'RD6_oh': rd6('HATS', 6, 7, 8, 10), 'RD6_cr': rd6('HATS', 12, 13, 14, 15), 'RD6_lt': rd6('TOMS', 1, 2, 3, 4, 5, 12),
  'RD6_ht': rd6('TOMS', 6, 7, 8, 9, 10, 11),
  # acoustic kit (Big Rusty Drums); soft layers last so index 0 is always a full hit
  'Kit_bd': rusty('kick_24/kick', 'kick', rr('k', [14], [1, 2, 3, 4]) + rr('k', [12], [1, 2]) + rr('k', [10], [1])),
  'Kit_sd': rusty('snare_14/center', 'top', rr('sn_center', [10], [1, 2, 3, 4]) + rr('sn_center', [8], [1, 2]) + rr('sn_center', [6], [1, 2])),
  'Kit_rim': rusty('snare_14/sidestick', 'top', rfiles('snare_14/sidestick', 'top', '*_rr1.flac')[-2:])
           + rusty('snare_14/rimshot', 'top', rfiles('snare_14/rimshot', 'top', '*_rr1.flac')[-2:]),
  'Kit_hh': rusty('hihat_14/tc', 'cl', rr('ht_tc', [8, 7, 6, 5], [1]), oh=0.5),
  'Kit_oh': rusty('hihat_14/open', 'cl', rfiles('hihat_14/open', 'cl', '*_rr1.flac')[-2:], oh=0.5)
          + rusty('hihat_14/qo', 'cl', rfiles('hihat_14/qo', 'cl', '*_rr1.flac')[-2:], oh=0.5),
  'Kit_lt': rusty('tom_18/center', 'cl', rfiles('tom_18/center', 'cl', '*_rr1.flac')[-2:]),
  'Kit_ht': rusty('tom_15/center', 'cl', rfiles('tom_15/center', 'cl', '*_rr1.flac')[-2:]),
  'Kit_rd': rusty('ride_22/rd', 'cl', rfiles('ride_22/rd', 'cl', '*_rr1.flac')[-2:], oh=1.0),
  'Kit_cr': rusty('crash_17/cr', 'cl', rfiles('crash_17/cr', 'cl', '*_rr1.flac')[-2:], oh=1.0),
}
CAP = {'bd': 1.6, 'cr': 2.5, 'rd': 2.0, 'oh': 1.2}

def load(src):
    if isinstance(src, tuple):
        _, c, o, w = src
        a, sr = sf.read(c, always_2d=True); b, sr2 = sf.read(o, always_2d=True); assert sr == sr2
        n = min(len(a), len(b)); return a[:n, :1] + w * b[:n, :2], sr
    return sf.read(src, always_2d=True)

def clean(x, sr, cap, norm=True):
    m = np.abs(x).max(1); pk = m.max()
    start = max(0, int(np.argmax(m > pk * 0.02)) - int(sr * 0.0005))
    x = x[start:]
    w = max(1, int(sr * 0.005)); e = np.sqrt(np.convolve((x ** 2).mean(1), np.ones(w) / w, 'same'))
    nz = np.nonzero(e > e.max() * 10 ** (-50 / 20))[0]
    end = min(len(x), nz[-1] + int(sr * 0.02), int(sr * cap))
    x = x[:end].copy()
    f = min(int(sr * 0.015), end // 4); x[-f:] *= (np.linspace(1, 0, f) ** 2)[:, None]
    return x * (10 ** (-1 / 20) / np.abs(x).max()) if norm else x

def write(path, x, sr):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, x, sr, format='FLAC', subtype='PCM_16')

def build_break():
    # An original 2-bar funk break played on the acoustic kit at 136 BPM, cut into 32
    # sixteenth slices (used like a chopped break: one slice per step, cut group 1).
    sr = 44100; step = 60 / 136 / 4
    kit = {k: [clean(*load(s), 3.0, norm=False) for s in BANK[f'Kit_{k}']] for k in ('bd', 'sd', 'hh', 'oh')}
    rng = np.random.default_rng(7)
    #       0      1    2    3    4      5    6    7    8    9    10     11   12     13   14   15
    pat = ['K h', '', 'h', 'g', 'S h', '', 'h', 'g', 'h', 'K', 'K h', 'g', 'S h', '', 'O', 'g',
           'K h', '', 'K h', '', 'S h', 'g', 'h', 'g', 'h', 'K', 'h', 'g', 'S h', '', 'S h', 'g']
    n = int(sr * step * 32)
    loop = np.zeros((n + sr * 3, 2))
    def put(x, at, gain):
        i = int(at * sr); loop[i:i + len(x)] += gain * x[:len(loop) - i]
    for i, ev in enumerate(pat):
        t = i * step
        for tok in ev.split():
            if tok == 'K': put(kit['bd'][rng.integers(0, 4)], t, 1.0)
            if tok == 'S': put(kit['sd'][rng.integers(0, 4)], t, 0.9)
            if tok == 'g': put(kit['sd'][rng.integers(6, 8)], t + rng.uniform(0, .004), 0.5)
            if tok == 'h': put(kit['hh'][rng.integers(0, 3)], t + rng.uniform(0, .003), 0.45 if i % 4 == 0 else 0.3)
            if tok == 'O': put(kit['oh'][0], t, 0.4)
    loop[:len(loop) - n] += loop[n:]; loop = loop[:n]  # wrap the tail onto the start: seamless loop
    loop *= 10 ** (-1 / 20) / np.abs(loop).max()
    two = np.concatenate([loop, loop]); paths = []
    for i in range(32):
        a, b = int(i * step * sr), int((i + 1) * step * sr) + int(sr * 0.03)
        sl = two[a:b].copy(); f = int(sr * 0.012); sl[-f:] *= np.linspace(1, 0, f)[:, None]
        p = f'kitbreak/{i:02d}.flac'; write(os.path.join(OUT, p), sl, sr); paths.append(p)
    write(os.path.join(DL, 'kitbreak-loop.flac'), loop, sr)
    toks = [set(e.split()) for e in pat]
    kinds = {'K': [i for i, t in enumerate(toks) if 'K' in t and 'S' not in t],
             'S': [i for i, t in enumerate(toks) if 'S' in t],
             'G': [i for i, t in enumerate(toks) if t and not ({'K', 'S'} & t)]}
    return paths, kinds

strudel = {}
for key, srcs in BANK.items():
    bank, snd = key.split('_')
    paths = []
    for i, src in enumerate(srcs):
        x, sr = load(src); x = clean(x, sr, CAP.get(snd, 1.2))
        p = f'{bank}/{snd}/{i:02d}.flac'; write(os.path.join(OUT, p), x, sr); paths.append(p)
    strudel[key] = paths
strudel['kitbreak'], kinds = build_break()
with open(os.path.join(OUT, 'strudel.json'), 'w') as f: json.dump(strudel, f, indent=1)
size = sum(os.path.getsize(p) for p in glob.glob(os.path.join(OUT, '**', '*.flac'), recursive=True))
print('keys', len(strudel), 'files', sum(len(v) for v in strudel.values()), 'MB', round(size / 2**20, 2))
print('counts', {k: len(v) for k, v in strudel.items()})
print('break kinds', kinds)
