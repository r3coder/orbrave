# Builds the pitched instruments in public/samples (bass guitars, upright bass, Wurlitzer) and
# adds them to strudel.json as note maps ({"A1": ["swagbass/A1.flac"], ...}).
#   python -I tools/samples/build_pitched.py <download dir> public/samples
# Run it after build_bank.py (which rewrites strudel.json without these keys). The download dir
# gets one velocity layer and round robin per sampled note from each source repository.
#
# Sources (all on github.com/sfzinstruments):
#   swagbass     karoryfer.swagbass       bass guitar, flatwounds, fingered   CC0 1.0
#   growlybass   karoryfer.growlybass     Squier Jazz Bass, staccato          CC0 1.0
#   uprightbass  dsmolken.double-bass     1958 Rubner double bass, pizzicato  CC0 1.0
#   wurli        GregSullivan.E-Pianos    Wurlitzer EP200                     CC BY 3.0 (credit Greg Sullivan)
import sys, os, re, json, urllib.request, urllib.parse, numpy as np, soundfile as sf
from scipy.signal import resample_poly

DL, OUT = sys.argv[1], sys.argv[2]
SR = 44100
NOTE = {'c': 0, 'db': 1, 'd': 2, 'eb': 3, 'e': 4, 'f': 5, 'gb': 6, 'g': 7, 'ab': 8, 'a': 9, 'bb': 10, 'b': 11}
NAME = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

# repo, file pattern (note, optional dynamic), preferred dynamics, octave shift of the file names
# (Karoryfer basses name notes an octave high: their "a1" is A0 at 27.5 Hz; checked by pitch
# detection), seconds kept, fade-out seconds
INST = {
    'swagbass': ('karoryfer.swagbass', r'^notes/([a-g]b?\d)_f_rr1\.wav$', None, -1, 2.5, 0.4),
    'growlybass': ('karoryfer.growlybass', r'^staccato/([a-g]b?\d)_staccato_rr1\.wav$', None, -1, 1.0, 0.05),
    'uprightbass': ('dsmolken.double-bass', r'^pizz/pizz_([a-g]b?\d)_fa\.wav$', None, 0, 3.0, 0.5),
    'wurli': ('GregSullivan.E-Pianos', r'^Wurlitzer EP200/Samples/([a-g]b?\d)(f|mp|ff|pp)\.flac$', ['f', 'mp', 'ff', 'pp'], 0, 2.5, 0.4),
}


def fetch(inst):
    repo, rx, dyn, *_ = INST[inst]
    tree = json.load(urllib.request.urlopen(f'https://api.github.com/repos/sfzinstruments/{repo}/git/trees/master?recursive=1'))['tree']
    picks = {}
    for x in tree:
        m = re.match(rx, x['path'])
        if not m:
            continue
        rank = dyn.index(m.group(2)) if dyn else 0
        if m.group(1) not in picks or rank < picks[m.group(1)][0]:
            picks[m.group(1)] = (rank, x['path'])
    os.makedirs(os.path.join(DL, inst), exist_ok=True)
    out = {}
    for note, (_, path) in sorted(picks.items()):
        local = os.path.join(DL, inst, note + os.path.splitext(path)[1])
        if not os.path.exists(local):
            urllib.request.urlretrieve(f'https://raw.githubusercontent.com/sfzinstruments/{repo}/master/{urllib.parse.quote(path)}', local)
        out[note] = local
    return out


def clean(x, sr, keep, fade):
    x = x.mean(1)  # every source here is a mono instrument (DI basses, the Wurlitzer's own output)
    if sr != SR:
        g = np.gcd(sr, SR); x = resample_poly(x, SR // g, sr // g)
    pk = np.abs(x).max()
    start = max(0, int(np.argmax(np.abs(x) > pk * 0.02)) - int(SR * 0.002))
    x = x[start:start + int(SR * keep)].copy()
    f = min(int(SR * fade), len(x) // 2); x[-f:] *= np.linspace(1, 0, f) ** 2
    return x * (10 ** (-1 / 20) / np.abs(x).max())


with open(os.path.join(OUT, 'strudel.json')) as f:
    strudel = json.load(f)
size = 0
for inst, (repo, rx, dyn, octave, keep, fade) in INST.items():
    files = fetch(inst)
    notes = {}
    for note, path in files.items():
        midi = 12 * (int(note[-1]) + 1 + octave) + NOTE[note[:-1]]
        key = f'{NAME[midi % 12]}{midi // 12 - 1}'
        x, sr = sf.read(path, always_2d=True)
        rel = f'{inst}/{key}.flac'; full = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        sf.write(full, clean(x, sr, keep, fade), SR, format='FLAC', subtype='PCM_16')
        size += os.path.getsize(full)
        notes[key] = [rel]
    strudel[inst] = dict(sorted(notes.items(), key=lambda kv: 12 * int(kv[0][-1]) + NAME.index(kv[0][:-1])))
    print(inst, len(notes), list(strudel[inst]))
with open(os.path.join(OUT, 'strudel.json'), 'w') as f:
    json.dump(strudel, f, indent=1)
print('KiB', size // 1024)
