# Turns the vocal tracks rendered from tools/vocals/phrases.ustx into the files the Teto orbs play:
# one file per bar of each line and pitch (server/vocals/<line>_<bar>[_dn4|_up3].flac, 24 kHz
# mono, bar 1-4; a chord line's three voices mixed into one), played as teto_<line>_<bar>[_dn4|_up3]
# (src/vocals.js), and src/vocalLines.json: for each line its gain trim, and for each
# bar the eighth each note starts on and where that note sits in the bar's file (begin / end, as
# fractions of it, the same for all three pitches).
#   python -I tools/vocals/build_vocals.py <dir of exported wavs> server/vocals
# The files are never part of the site or the repository (git-ignored): the share server serves
# them (server/vocals.mjs), so copy the folder to the server's VOCAL_DIR. Wavs are found by track
# name: <anything>_<track>.wav, as OpenUtau's "Export Wav Files" names them.
#
# A bar of a line is a word: the orbs build a 4-bar part from the bars of different lines (bar n of
# every line is written over the same chord), and play each bar note by note with Strudel's
# begin/end, so the words follow tempo orbs (src/orbCatalog.js). Only sung words are published,
# never single syllables. A bar's file runs from PRE seconds before its first beat to PRE seconds
# before the next bar's (the last bar: RELEASE past its end); notes are sung detached
# (make_ustx.py), so those cuts fall in silence. A note starts with its consonant a little ahead of
# the beat (UTAU preutterance): its begin is PRE seconds before the beat and the orbs play it that
# much early (.early()), so the vowel lands on the beat at any tempo. Its end is the next note's
# begin when the next note follows straight on, or RELEASE after the note when a rest follows (at
# most the end of the bar's file).
#
# The voice is Kasane Teto (UTAU voicebank, (C) 小山乃舞世 / TWINDRILL): free for non-commercial
# use only, and the voicebank itself may not be redistributed. These files are sung lines (works
# made with the voicebank), not the voicebank, and are not covered by the project's AGPL or CC0
# terms: see tools/vocals/NOTICE.txt.
import sys, os, json, shutil, numpy as np, soundfile as sf, pyloudnorm as pyln
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from make_ustx import LINES, OUTPUTS, PITCHES  # noqa: E402  (importing writes nothing)

SRC, OUT = sys.argv[1], sys.argv[2]
LINES_JSON = os.path.join(HERE, '..', '..', 'src', 'vocalLines.json')
SR = 24000  # a voice has next to nothing above 12 kHz; a third of the size of 44.1 kHz FLAC
BPM = 124
BAR = 60 / BPM * 4
E8 = BAR / 8
LEAD_IN = BAR  # the parts start on bar 2 of the ustx
PRE = 0.08  # seconds of consonant kept ahead of each note (the orbs play notes this much early)
RELEASE = 0.3  # seconds kept after a note that a rest follows
TARGET = -20.0  # LUFS each line's gain trim aims at (the orbs' own gains sit on top)


def load(track):
    hits = [f for f in os.listdir(SRC) if f.lower().endswith(f'_{track}.wav'.lower())]
    if len(hits) != 1:
        sys.exit(f'expected one wav for track {track} in {SRC}, found {hits}')
    x, sr = sf.read(os.path.join(SRC, hits[0]), always_2d=True)
    x = x.mean(1)
    g = np.gcd(sr, SR)
    return resample_poly(x, SR // g, sr // g) if sr != SR else x


def t(eighth):
    return LEAD_IN + eighth * E8


def bar_window(notes, bar):
    """the bar's file: from PRE before its first beat to PRE before the next bar's (or past the end)"""
    end = t(8 * bar + 8) - PRE if bar < 3 else t(max(s + n for s, n, _, _ in notes)) + RELEASE
    return t(8 * bar) - PRE, end


def bar_timings(notes, bar, w0, w1):
    """for the notes of one bar: their eighth in the bar, and begin / end in its file (seconds from w0)"""
    at, begins, ends = [], [], []
    for j, (s, n, _, _) in enumerate(notes):
        if s // 8 != bar:
            continue
        nxt = notes[j + 1][0] if j + 1 < len(notes) else None
        b = t(s) - PRE
        e = t(nxt) - PRE if nxt == s + n else min(t(s + n) + RELEASE, t(nxt) - PRE if nxt is not None else w1)
        at.append(s % 8)
        begins.append(b - w0)
        ends.append(min(e, w1) - w0)
    return at, begins, ends


def main():
    folder = OUT
    if os.path.isdir(folder):
        shutil.rmtree(folder)  # earlier cuts (slices per eighth or note) go
    os.makedirs(folder)
    # the licence notice travels with the files (they are not AGPL / CC0): tools/vocals/NOTICE.txt
    shutil.copy(os.path.join(HERE, 'NOTICE.txt'), os.path.join(folder, 'NOTICE.txt'))
    meter = pyln.Meter(SR)
    lines, size, count = {}, 0, 0
    for name, parts in OUTPUTS.items():
        notes = LINES[parts[0]]  # a chord's voices share one rhythm
        line0 = t(notes[0][0]) - PRE
        line1 = t(max(s + n for s, n, _, _ in notes)) + RELEASE
        bars, gain = [], None
        for suffix in PITCHES:
            x = sum(load(p + suffix) for p in parts) / len(parts) ** 0.5
            whole = x[int(round(line0 * SR)):int(round(line1 * SR))]
            norm = 10 ** (-1 / 20) / np.abs(whole).max()  # one level for the whole line: its bars keep their balance
            if gain is None:  # one gain trim for all pitches, from the line as written
                gain = 10 ** ((TARGET - meter.integrated_loudness(whole * norm)) / 20)
            for bar in range(4):
                w0, w1 = bar_window(notes, bar)
                i0, i1 = int(round(w0 * SR)), int(round(w1 * SR))
                # the render may stop before the last bar's release: pad, so begin / end stay true fractions
                y = np.pad(x[i0:i1], (0, max(0, i1 - i0 - len(x[i0:i1])))) * norm
                y[:int(SR * 0.003)] *= np.linspace(0, 1, int(SR * 0.003))
                y[-int(SR * 0.02):] *= np.linspace(1, 0, int(SR * 0.02))
                rel = f'{name}_{bar + 1}{suffix}.flac'
                sf.write(os.path.join(OUT, rel), y, SR, format='FLAC', subtype='PCM_16')
                size += os.path.getsize(os.path.join(OUT, rel))
                count += 1
                if suffix == '':
                    at, begins, ends = bar_timings(notes, bar, w0, w1)
                    assert at, f'{name}: bar {bar + 1} has no notes'
                    dur = len(y) / SR
                    # the bar's lyrics, for the word picker (src/orbs/slots.js): a held vowel shown once
                    text = ''.join(ly for s, n, _, ly in notes if s // 8 == bar)
                    bars.append({'at': at, 'b': [round(v / dur, 4) for v in begins], 'e': [round(v / dur, 4) for v in ends], 'text': text})
        lines[name] = {'gain': round(gain, 3), 'bars': bars}
        print(f'teto_{name:10} {len(notes):2} notes, gain {gain:.2f}')
    with open(LINES_JSON, 'w', encoding='utf-8') as f:
        f.write('{"//": "written by tools/vocals/build_vocals.py: per vocal line, a gain trim to even out the lines '
                'and, for each of its 4 bars (a file of its own), the eighth each note starts on (at) and where it '
                'sits in the bar\'s file (b, e: fractions of it) and its lyrics (text); notes play pre seconds early", ')
        f.write(f'"pre": {PRE}, "lines": {json.dumps(lines, separators=(",", ":"))}}}\n')
    print(f'{count} files, {size / 1048576:.1f} MB')


main()
