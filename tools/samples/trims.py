# Offline stand-in for the `samples` part of tools/mix.html: K-weighted loudness of each
# one-shot played on quarter notes at 120 BPM (2 cycles + 0.5 s tail, as in mix.js), and the
# gain that brings it to SAMPLE_REF. The browser tool stays the reference; this exists so the
# drum bank can be re-trimmed without a browser.
#   python -I tools/samples/trims.py calibrate <calib.json> <dir>   fit OFFSET against known trims
#   python -I tools/samples/trims.py bank public/samples <OFFSET>   print trims for the bank
import sys, os, json, math, urllib.request, numpy as np, soundfile as sf
from scipy.signal import lfilter, resample_poly

SR = 48000
SAMPLE_REF = -20.0

def biquad_highshelf(f0, gain_db, sr):
    # Web Audio API highshelf (Audio EQ Cookbook, S = 1)
    A = 10 ** (gain_db / 40); w0 = 2 * math.pi * f0 / sr; alpha = math.sin(w0) / 2 * math.sqrt((A + 1 / A) * (1 / 1 - 1) + 2)
    c = math.cos(w0); sA = 2 * math.sqrt(A) * alpha
    b = [A * ((A + 1) + (A - 1) * c + sA), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sA)]
    a = [(A + 1) - (A - 1) * c + sA, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sA]
    return np.array(b) / a[0], np.array(a) / a[0]

def biquad_highpass(f0, q_db, sr):
    # Web Audio API highpass: Q is given in dB
    Q = 10 ** (q_db / 20); w0 = 2 * math.pi * f0 / sr; alpha = math.sin(w0) / (2 * Q); c = math.cos(w0)
    b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + alpha, -2 * c, 1 - alpha]
    return np.array(b) / a[0], np.array(a) / a[0]

HS = biquad_highshelf(1681, 4, SR)
HP = biquad_highpass(38, 0.5, SR)

def load(path):
    x, sr = sf.read(path, always_2d=True, dtype='float64')
    if sr != SR:
        g = math.gcd(sr, SR); x = resample_poly(x, SR // g, sr // g, axis=0)
    if x.shape[1] == 1: x = np.repeat(x, 2, axis=1)  # mono plays on both channels
    return x[:, :2]

def measure(x):
    n = int(SR * 4.5); out = np.zeros((n, 2))
    for k in range(8):
        i = int(k * 0.5 * SR); m = min(len(x), n - i)
        out[i:i + m] += x[:m]
    k = lfilter(*HP, lfilter(*HS, out, axis=0), axis=0)
    block, hop = int(0.4 * SR), int(0.1 * SR)
    ms = [np.sum(k[s:s + block] ** 2) / block for s in range(0, n - block + 1, hop)]
    lufs = lambda v: -0.691 + 10 * math.log10(v or 1e-12)
    gated = [v for v in ms if lufs(v) > -70]
    return lufs(sum(gated) / len(gated)) if gated else -120

def trim(l, offset):
    return round(min(40, max(0.05, 10 ** ((SAMPLE_REF - (l + offset)) / 20))), 3)

if sys.argv[1] == 'calibrate':
    items = json.load(open(sys.argv[2])); d = sys.argv[3]; os.makedirs(d, exist_ok=True)
    rows = []
    for it in items:
        f = os.path.join(d, it['k'].replace(':', '_') + os.path.splitext(it['url'].split('?')[0])[1])
        if not os.path.exists(f):
            try: urllib.request.urlretrieve(it['url'].replace(' ', '%20'), f)
            except Exception as e: print('skip', it['k'], e); continue
        try: l = measure(load(f))
        except Exception as e: print('skip', it['k'], e); continue
        target = SAMPLE_REF - 20 * math.log10(it['t'])  # browser-measured loudness
        rows.append((it['k'], it['t'], target - l))
    offs = np.array([r[2] for r in rows]); ok = [r for r in rows if 0.05 < r[1] < 40]
    o = np.median([r[2] for r in ok])
    print('n', len(rows), 'median offset', round(o, 2), 'p10/p90', np.percentile(offs, [10, 90]).round(2))
    for k, t, e in sorted(rows, key=lambda r: abs(r[2] - o))[-8:]: print('  outlier', k, t, round(e - o, 2))
else:
    root = sys.argv[2]; off = float(sys.argv[3])
    bank = json.load(open(os.path.join(root, 'strudel.json')))
    out = {}
    for key, files in bank.items():
        for i, p in enumerate(files): out[f'{key}:{i}'] = trim(measure(load(os.path.join(root, p))), off)
    print(json.dumps(out))
