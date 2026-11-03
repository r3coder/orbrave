"""Reference-track analyzer: turns a folder of real tracks per genre into numbers the composer can use.

    analysis/tracks/<genre>/*.{wav,flac,mp3,ogg,aiff}   (files you own)
      -> analysis/out/<genre>/<track>.json + .png      per-track analysis
      -> analysis/out/<genre>/profile.json + .png      per-genre aggregate
      -> analysis/out/index.html                       visual report

Per track: Demucs stems (drums / bass / other / vocals, cached), beat + downbeat tracking
(beat_this), a 16-step hit grid for kick / snare / hats / bass, swing, BPM, key and pitch-class
use, K-weighted loudness of each stem, per-bar layer activity, and sections found from changes
in that activity. Only statistics are written; stems stay in the local cache.

Run with the venv in tools/analyze (see README):
    tools/analyze/.venv/Scripts/python tools/analyze/analyze.py [--genre dnb] [--force]
"""
import argparse
import html
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import soxr
import librosa
import pyloudnorm as pyln
import torch
import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
SR = 44100
HOP = 256
STEPS = 16
AUDIO_EXT = {'.wav', '.flac', '.mp3', '.ogg', '.aiff', '.aif'}
DEV = 'cuda' if torch.cuda.is_available() else 'cpu'
LAYERS = ['drums', 'bass', 'other', 'vocals']
# frequency bands (Hz) used to pick drum voices out of the drum stem
DRUM_BANDS = {'kick': (30, 120), 'snare': (1200, 5000), 'hats': (8000, 16000)}
ROWS = ['kick', 'snare', 'hats', 'bass']
PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
# Krumhansl-Kessler key profiles
KK_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

_models = {}


def log(*a):
    print(*a, flush=True)


def load(path):
    x, sr = sf.read(str(path), dtype='float32', always_2d=True)
    if sr != SR:
        x = soxr.resample(x, sr, SR).astype(np.float32)
    x = x.T
    if x.shape[0] == 1:
        x = np.repeat(x, 2, 0)
    return np.ascontiguousarray(x[:2])


# ---------------------------------------------------------------- stems / beats

def separate(x, model_name):
    from demucs.apply import apply_model
    from demucs.pretrained import get_model
    if model_name not in _models:
        _models[model_name] = get_model(model_name).to(DEV).eval()
    model = _models[model_name]
    wav = torch.from_numpy(x)
    ref = wav.mean(0)
    m, s = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        out = apply_model(model, ((wav - m) / s)[None], device=DEV, split=True, overlap=.25, shifts=1)[0]
    out = (out * s + m).cpu().numpy()
    return {name: out[i] for i, name in enumerate(model.sources)}


def stems_for(path, x, cache, model_name, force):
    files = {n: cache / f'{n}.flac' for n in LAYERS}
    if not force and all(f.exists() for f in files.values()):
        return {n: load(f) for n, f in files.items()}
    stems = separate(x, model_name)
    cache.mkdir(parents=True, exist_ok=True)
    for n in LAYERS:
        sf.write(str(files[n]), stems[n].T, SR, subtype='PCM_24')
    return stems


def beats_of(x):
    from beat_this.inference import Audio2Beats
    if 'beat' not in _models:
        _models['beat'] = Audio2Beats(device=DEV)
    beats, downbeats = _models['beat'](x.T, SR)
    return np.asarray(beats, float), np.asarray(downbeats, float)


# Tempo ranges per genre folder. Beat trackers often lock onto 2/3, 3/2, 1/2 or 2x the beat in
# syncopated or sparse music; when the tracked tempo falls outside the folder's range and one of
# those ratios brings it inside, the beat grid is rebuilt at that tempo before grid fitting.
GENRE_BPM = {'techno': (120, 150), 'house': (114, 130), 'acid': (115, 150), 'trance': (125, 150), 'dnb': (160, 182),
             'breakbeat': (110, 145), 'lofi': (65, 100), 'synthwave': (78, 130)}


def metrical_prior(beats, genre, duration):
    rng = GENRE_BPM.get(genre)
    p = np.median(np.diff(beats))
    bpm = 60 / p
    if not rng or rng[0] <= bpm <= rng[1]:
        return beats
    for f in (2, .5, 1.5, 2 / 3, 4 / 3, .75):
        if rng[0] <= bpm * f <= rng[1]:
            return np.arange(beats[0], duration, p / f)
    return beats


def steady_beats(beats, anchors, duration):
    """Dance music is played to a click, so fit one exact 16th-note grid to all drum hits
    instead of trusting single tracked beats, which come in 20 ms steps and switch
    to double or half time in some sections. The tracker only sets the rough period (and with it,
    which metrical level counts as the beat) and which 16th of the grid the beat falls on.
    Keeps the tracked beats when no single tempo fits, i.e. the track really changes tempo."""
    p0 = np.median(np.diff(beats))
    if len(anchors) < 32:
        return beats, False
    periods = p0 * (1 + np.linspace(-.04, .04, 801))
    phase = 2 * np.pi * anchors[None, :] / (periods[:, None] / 4)
    fit = np.abs(np.exp(1j * phase).mean(1))
    best = int(np.argmax(fit))
    if fit[best] < .4:
        return beats, False
    p = periods[best]
    sixteenth = p / 4
    t0 = (np.angle(np.exp(1j * phase[best]).mean()) / (2 * np.pi)) % 1 * sixteenth
    # which of the four 16ths in a beat the tracker's beats sit on
    turn = np.angle(np.exp(2j * np.pi * (beats - t0) / p).mean()) / (2 * np.pi)
    k = int(np.round(turn * 4)) % 4
    first = (t0 + k * sixteenth) % p
    return np.arange(first, duration, p), True


def bar_lines(beats, downbeats, harmonic, layers, kicks, duration):
    """Bar lines in 4/4: every 4th beat, at the phase that best matches the detected downbeats.
    The downbeat model often marks every 2nd beat in sparse dance music, so it is backed up by harmonic change (chord and bass changes land on bar lines far more often),
    by layers coming in or dropping out (arrangement changes land on bar lines almost always),
    and by kicks (every style here puts one on beat 1; four-on-the-floor leaves this cue neutral)."""
    if len(beats) < 8:
        raise ValueError('not enough beats found')
    idx = np.abs(downbeats[:, None] - beats[None, :]).argmin(1) if len(downbeats) else np.array([], int)
    votes = np.bincount(idx % 4, minlength=4).astype(float)
    frames = librosa.time_to_frames(beats, sr=SR, hop_length=HOP)
    frames = np.clip(frames, 0, harmonic.shape[1] - 1)
    # column i = the span from beat i to beat i+1; a change at i compares it with the previous beat
    chroma = librosa.util.sync(harmonic, frames, aggregate=np.mean, pad=False)
    chroma = chroma / (np.linalg.norm(chroma, axis=0, keepdims=True) + 1e-9)
    change = np.r_[0, 1 - (chroma[:, 1:] * chroma[:, :-1]).sum(0)]
    hchange = np.array([change[p::4].mean() for p in range(4)])
    level = librosa.util.sync(layers, frames, aggregate=np.mean, pad=False)
    jumps = np.r_[0, np.abs(np.diff(level, axis=1)).sum(0)]
    big = jumps > np.percentile(jumps, 95)
    lchange = np.array([big[p::4].sum() for p in range(4)], float)
    p = np.median(np.diff(beats))
    near = np.abs(kicks[:, None] - beats[None, :]).argmin(1) if len(kicks) else np.array([], int)
    on_beat = np.abs(kicks - beats[near]) < p / 8 if len(kicks) else np.array([], bool)
    kick = np.bincount(near[on_beat] % 4, minlength=4).astype(float)
    kick = (kick - kick.min()) / (kick.max() - kick.min() + 1e-9) if kick.max() > 1.3 * kick.min() else np.zeros(4)
    score = 2 * votes / (votes.max() + 1e-9) + hchange / (hchange.max() + 1e-9) \
        + lchange / (lchange.max() + 1e-9) + kick
    d = beats[int(np.argmax(score))::4]
    bar = np.median(np.diff(d))
    return np.append(d, min(d[-1] + bar, duration))


def to_grid(times, bars):
    """Onset times -> (onset index, bar index, step 0-15, offset from the step in 16ths)."""
    out = []
    for k, t in enumerate(times):
        i = np.searchsorted(bars, t, side='right') - 1
        if i < 0 or i >= len(bars) - 1:
            continue
        pos = (t - bars[i]) / (bars[i + 1] - bars[i]) * STEPS
        step = int(np.round(pos))
        off = pos - step
        if step == STEPS:
            i, step = i + 1, 0
            if i >= len(bars) - 1:
                continue
        out.append((k, i, step, off))
    return out


# ---------------------------------------------------------------- onsets

def band_flux(S, freqs, lo, hi):
    band = S[(freqs >= lo) & (freqs < hi)]
    L = np.log1p(100 * band)
    flux = np.maximum(0, np.diff(L, axis=1, prepend=L[:, :1])).sum(0)
    energy = 10 * np.log10((band.astype(np.float64) ** 2).sum(0) + 1e-12)
    return flux, energy


def pick(flux, energy, delta=.07, floor_db=40):
    """Peak-pick a band's spectral flux; drops peaks in near-silence (floor_db under the band's loud level)."""
    ref = np.percentile(flux[flux > 0], 99) if np.any(flux > 0) else 1
    f = flux / ref
    peaks = librosa.util.peak_pick(f, pre_max=3, post_max=3, pre_avg=20, post_avg=20, delta=delta, wait=6)
    loud = np.percentile(energy, 95)
    after = np.minimum(peaks + 3, len(energy) - 1)
    keep = energy[after] > loud - floor_db
    # ghost peaks from bleed (e.g. bass notes in the kick band) sit far below the real hits
    if keep.any():
        keep &= f[peaks] > .25 * np.percentile(f[peaks[keep]], 90)
    return peaks[keep], f[peaks[keep]]


def drum_onsets(drums, bass):
    mono = drums.mean(0)
    S = np.abs(librosa.stft(mono, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    bands = {name: band_flux(S, freqs, lo, hi) for name, (lo, hi) in DRUM_BANDS.items()}
    # sub bass bleeds into the drum stem; that bleed rises together with a much stronger rise in the bass stem
    bass_flux = band_flux(np.abs(librosa.stft(bass.mean(0), n_fft=2048, hop_length=HOP)), freqs, *DRUM_BANDS['kick'])[0]
    P = S.astype(np.float64) ** 2

    def density(lo, hi):  # mean power per bin in dB, for comparing a hit's spectral balance
        return 10 * np.log10(P[(freqs >= lo) & (freqs < hi)].mean(0) + 1e-12)

    shell, crack, sizzle = density(150, 600), density(1200, 5000), density(5000, 8000)
    picked = {name: pick(flux, energy) for name, (flux, energy) in bands.items()}
    last = len(shell) - 1
    kf, ks = picked['kick']
    win = lambda f, i: f[max(i - 2, 0):i + 3].max()
    real = np.array([win(bands['kick'][0], i) > .2 * win(bass_flux, i) for i in kf], bool)
    picked['kick'] = (kf[real], ks[real]) if len(kf) else (kf, ks)
    # low toms, congas and sub hits share the kick band in released tracks; the kick is the
    # strongest low hit around it, so keep only hits close to the loudest one within ±0.3 s
    kf, ks = picked['kick']
    if len(kf):
        near = np.abs(kf[:, None] - kf[None, :]) <= int(.3 * SR / HOP)
        local = np.where(near, ks[None, :], 0).max(1)
        strong = ks >= .6 * local
        picked['kick'] = (kf[strong], ks[strong])
    kf = picked['kick'][0]
    kick_crack = np.median(crack[np.minimum(kf + 2, last)]) if len(kf) else -np.inf
    frames, strength = picked['snare']
    at = np.minimum(frames + 2, last)
    # a snare or clap has a shell tone (150-600 Hz) well above its sizzle; hats and shakers have
    # almost none. Kicks have shell too, so a hit on a kick only counts as a snare when it adds
    # clearly more crack (1.2-5 kHz) than this track's kicks have on their own.
    on_kick = np.abs(frames[:, None] - kf[None, :]).min(1) <= 5 if len(kf) else np.zeros(len(frames), bool)
    keep = (shell[at] > sizzle[at] + 10) & (shell[at] > np.percentile(shell, 99) - 25) \
        & (~on_kick | (crack[at] > kick_crack + 6)) & (on_kick | (shell[at] > crack[at] + 5))
    picked['snare'] = (frames[keep], strength[keep])
    return {name: (librosa.frames_to_time(f, sr=SR, hop_length=HOP), s) for name, (f, s) in picked.items()}


def bass_onsets_and_notes(bass):
    mono = librosa.to_mono(bass)
    env = librosa.onset.onset_strength(y=mono, sr=SR, hop_length=HOP, fmax=800, n_mels=64)
    frames = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=HOP, backtrack=False, units='frames')
    rms = librosa.feature.rms(y=mono, hop_length=HOP)[0]
    loud = np.percentile(rms, 95) + 1e-9
    frames = frames[rms[np.minimum(frames + 3, len(rms) - 1)] > loud * .05]
    strength = env[frames] / (np.percentile(env, 99) + 1e-9)
    # filter/LFO movement on sustained basses makes weak onsets; real note starts stand out
    if len(frames):
        keep = strength > .3 * np.percentile(strength, 90)
        frames, strength = frames[keep], strength[keep]
    times = librosa.frames_to_time(frames, sr=SR, hop_length=HOP)
    # pitch of each note: median f0 over its first 120 ms
    y = soxr.resample(mono, SR, 11025)
    f0, voiced, _ = librosa.pyin(y, fmin=30, fmax=400, sr=11025, frame_length=2048, hop_length=256)
    ft = librosa.frames_to_time(np.arange(len(f0)), sr=11025, hop_length=256)
    notes = []
    for t in times:
        sel = (ft >= t + .02) & (ft < t + .12) & voiced
        notes.append(float(np.round(librosa.hz_to_midi(np.nanmedian(f0[sel])))) if sel.sum() >= 2 else None)
    return times, strength, notes


# ---------------------------------------------------------------- tonal / level / form

def key_of(x):
    y = soxr.resample(x.mean(0), SR, 22050)
    chroma = librosa.feature.chroma_cqt(y=y, sr=22050, hop_length=4096).mean(1)
    best = None
    for tonic in range(12):
        for mode, prof in (('major', KK_MAJOR), ('minor', KK_MINOR)):
            r = np.corrcoef(np.roll(prof, tonic), chroma)[0, 1]
            if best is None or r > best[2]:
                best = (tonic, mode, r)
    tonic, mode, r = best
    rel = np.roll(chroma, -tonic)
    return {'tonic': PITCHES[tonic], 'tonicIndex': tonic, 'mode': mode, 'confidence': round(float(r), 3),
            'pitchClasses': [round(float(v / rel.max()), 3) for v in rel]}


def lufs(meter, x):
    v = meter.integrated_loudness(x.T)
    return None if not np.isfinite(v) else round(float(v), 2)


def bar_energy(x, bars):
    mono = x.mean(0)
    out = []
    for a, b in zip(bars[:-1], bars[1:]):
        seg = mono[int(a * SR):int(b * SR)]
        out.append(10 * np.log10(np.mean(seg ** 2) + 1e-12) if len(seg) else -120)
    return np.array(out)


def sections(activity, min_len=8):
    """Splits bars where the stem layer mix changes; boundaries snap to 4-bar phrases and
    sit at least 8 bars apart (released tracks vary every few bars without a new section)."""
    n = activity.shape[1]
    feat = np.clip(activity, -40, 0).T / 40  # bars x layers, 0 = loud, -1 = silent
    nov = np.zeros(n)
    w = 4
    for b in range(w, n - w + 1):
        nov[b] = np.abs(feat[b - w:b].mean(0) - feat[b:b + w].mean(0)).sum()
    cands = sorted(range(n), key=lambda b: -nov[b])
    bounds = [0, n]
    for b in cands:
        if nov[b] < .25:
            break
        b4 = int(round(b / 4) * 4)
        if all(abs(b4 - c) >= min_len for c in bounds) and 0 < b4 < n:
            bounds.append(b4)
    bounds.sort()
    on = activity > -15  # a layer is "in" when within 15 dB of its own loud bars
    total = np.clip(activity, -40, 0).mean(0)
    hi = np.percentile(total, 70)
    out = []
    for k, (a, b) in enumerate(zip(bounds[:-1], bounds[1:])):
        layers = [LAYERS[i] for i in range(len(LAYERS)) if on[i, a:b].mean() > .5]
        drums = 'drums' in layers
        full = drums and 'bass' in layers and total[a:b].mean() >= hi - 2
        label = 'peak' if full else ('groove' if drums else 'break')
        if k == 0 and not full:
            label = 'intro'
        elif k == len(bounds) - 2 and not full and b - a <= 32:
            label = 'outro'
        prev = out[-1] if out else None
        # same label and at most one layer different: a level change or a part swap, not a new section
        if prev and prev['label'] == label and len(set(prev['layers']) ^ set(layers)) <= 1:
            prev['bars'] += b - a
            prev['layers'] = sorted(set(prev['layers']) | set(layers), key=LAYERS.index)
        else:
            out.append({'start': a, 'bars': b - a, 'label': label, 'layers': layers})
    return out


# ---------------------------------------------------------------- harmony / timbre / flow

ROMAN = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII']


def bar_chords(harmonic, bars, tonic):
    """One chord per bar from bass+other chroma: best of 24 major/minor triads by cosine match,
    'N' when nothing fits (drums only, noise, unpitched). Returned as Roman numerals on the key's tonic."""
    frames = np.clip(librosa.time_to_frames(bars, sr=SR, hop_length=HOP), 0, harmonic.shape[1] - 1)
    C = librosa.util.sync(harmonic, frames, aggregate=np.mean, pad=False)
    templates, names = [], []
    for root in range(12):
        for q, iv in (('', (0, 4, 7)), ('m', (0, 3, 7))):
            t = np.zeros(12)
            t[[(root + i) % 12 for i in iv]] = 1
            templates.append(t / np.linalg.norm(t))
            rel = (root - tonic) % 12
            names.append(ROMAN[rel].lower() if q == 'm' else ROMAN[rel])
    T = np.array(templates)
    out = []
    for c in C.T:
        n = np.linalg.norm(c)
        if n < 1e-6:
            out.append('N')
            continue
        s = T @ (c / n)
        out.append(names[int(np.argmax(s))] if s.max() > .55 else 'N')
    return out


def common_loops(chords, size=4):
    """Most frequent chord loops on 4-bar phrase boundaries (bars 0-3, 4-7 ...)."""
    counts = {}
    for i in range(0, len(chords) - size + 1, size):
        seg = chords[i:i + size]
        if seg.count('N') > 1:
            continue
        k = ' '.join(seg)
        counts[k] = counts.get(k, 0) + 1
    return sorted(counts.items(), key=lambda kv: -kv[1])[:5]


def per_bar(values, times, bars, fn=np.mean):
    out = []
    for a, b in zip(bars[:-1], bars[1:]):
        sel = (times >= a) & (times < b)
        out.append(float(fn(values[sel])) if sel.any() else np.nan)
    return np.array(out)


def timbre(stem, bars, fmax=None):
    """Per-bar brightness (spectral centroid, Hz), noisiness (spectral flatness), attack
    (onsets per bar) and sustain (share of the bar above half the bar's peak level).
    fmax limits the spectrum (bass: separation hiss above a few kHz would dominate the centroid)."""
    mono = stem.mean(0)
    S = np.abs(librosa.stft(mono, n_fft=2048, hop_length=1024))
    t = librosa.frames_to_time(np.arange(S.shape[1]), sr=SR, hop_length=1024)
    rms = librosa.feature.rms(S=S)[0]
    loud = rms > np.percentile(rms, 95) * .05
    if fmax:
        f = librosa.fft_frequencies(sr=SR, n_fft=2048)
        S = S * (f <= fmax)[:, None]
    cent = librosa.feature.spectral_centroid(S=S, sr=SR)[0]
    flat = librosa.feature.spectral_flatness(S=S)[0]
    cent[~loud] = np.nan
    flat[~loud] = np.nan
    on = librosa.onset.onset_detect(y=mono, sr=SR, hop_length=512, units='time')
    nan_mean = lambda v: np.nanmean(v) if np.isfinite(v).any() else np.nan
    sustain = []
    for a, b in zip(bars[:-1], bars[1:]):
        r = rms[(t >= a) & (t < b)]
        sustain.append(float(np.mean(r > r.max() * .5)) if len(r) and r.max() > 0 else np.nan)
    return {
        'centroid': per_bar(cent, t, bars, nan_mean),
        'flatness': per_bar(flat, t, bars, nan_mean),
        'onsets': np.array([np.sum((on >= a) & (on < b)) for a, b in zip(bars[:-1], bars[1:])], float),
        'sustain': np.array(sustain),
    }


def pumping(stem, beats):
    """Sidechain depth: the stem's level folded over the beat (24 slots); max - min in dB.
    A ducked pad or bass dips right after each kick and swells back before the next."""
    mono = stem.mean(0)
    rms = librosa.feature.rms(y=mono, hop_length=256)[0]
    t = librosa.frames_to_time(np.arange(len(rms)), sr=SR, hop_length=256)
    p = np.median(np.diff(beats))
    loud = rms > np.percentile(rms, 90) * .1
    if loud.sum() < 100:
        return None
    phase = ((t - beats[0]) / p) % 1
    slots = np.array([np.median(rms[loud & (phase >= k / 24) & (phase < (k + 1) / 24)]) for k in range(24)])
    db = 20 * np.log10(slots + 1e-9)
    return round(float(db.max() - db.min()), 1)


def nanround(v, d=0):
    return [None if not np.isfinite(x) else round(float(x), d) for x in v]


def describe_sections(form, activity, tim, chords, bpm):
    """Section-level summary: which stems play and how (level, brightness, density, sustain),
    plus whether brightness/level rise through the section (builds and filter sweeps)."""
    out = []
    for s in form:
        a, b = s['start'], s['start'] + s['bars']
        d = {'label': s['label'], 'start': a, 'bars': b - a, 'seconds': round((b - a) * 240 / bpm, 1), 'stems': {}}
        for i, n in enumerate(LAYERS):
            lv = activity[i, a:b]
            c = tim[n]['centroid'][a:b]
            stem = {'level': round(float(np.mean(lv)), 1)}
            if np.mean(lv) > -20 and np.isfinite(c).any():
                stem.update({
                    'brightness': round(float(np.nanmedian(c))),
                    'onsetsPerBar': round(float(np.mean(tim[n]['onsets'][a:b])), 1),
                    'sustain': round(float(np.nanmean(tim[n]['sustain'][a:b])), 2),
                    'noisy': round(float(np.nanmedian(tim[n]['flatness'][a:b])), 3),
                })
                if b - a >= 4 and np.isfinite(c).sum() >= 4:
                    x = np.arange(b - a)[np.isfinite(c)]
                    stem['brightnessSlope'] = round(float(np.polyfit(x, np.log2(c[np.isfinite(c)]), 1)[0] * (b - a)), 2)
                stem['levelSlope'] = round(float(np.polyfit(np.arange(b - a), lv, 1)[0] * (b - a)), 1) if b - a >= 4 else 0
            d['stems'][n] = stem
        d['chords'] = ' '.join(chords[a:b][:8])
        out.append(d)
    return out


# ---------------------------------------------------------------- per-track analysis

def grid_stats(hits, nbars):
    """hits: list of (bar, step, offset, strength) -> per-step probability over bars where the voice plays."""
    count = np.zeros(STEPS)
    vel = np.zeros(STEPS)
    seen = np.zeros((nbars, STEPS), bool)
    for bar, step, off, s in hits:
        if not seen[bar, step]:
            seen[bar, step] = True
            count[step] += 1
            vel[step] += s
    active = int(seen.any(1).sum())
    prob = count / max(active, 1)
    return {
        'prob': [round(float(v), 3) for v in prob],
        'velocity': [round(float(v), 3) for v in vel / np.maximum(count, 1)],
        'activeBars': active,
        'hitsPerBar': round(float(count.sum() / max(active, 1)), 2),
        'pattern': ''.join('x' if p >= .6 else ('o' if p >= .25 else '.') for p in prob),
    }


def swing_of(hits):
    """Mean lateness of off-16ths (odd steps) against on-16ths, as a percentage of a 16th note.
    0 = straight; 33 ~ triplet feel (the 'MPC 66%' swing)."""
    odd = [o for _, s, o, _ in hits if s % 2 == 1 and abs(o) < .45]
    even = [o for _, s, o, _ in hits if s % 2 == 0 and abs(o) < .45]
    if len(odd) < 16 or len(even) < 16:
        return None
    return round(float((np.median(odd) - np.median(even)) * 100), 1)


def analyze_track(path, genre, args):
    log(f'  {path.name}')
    x = load(path)
    duration = x.shape[1] / SR
    stems = stems_for(path, x, args.out / '.cache' / genre / path.stem, args.model, args.force)
    onsets = drum_onsets(stems['drums'], stems['bass'])
    beats, downbeats = beats_of(x)
    beats = metrical_prior(beats, genre, duration)
    beats, steady = steady_beats(beats, np.sort(np.concatenate([t for t, _ in onsets.values()])), duration)
    harm = librosa.feature.chroma_stft(y=(stems['bass'] + stems['other']).mean(0), sr=SR, hop_length=HOP)
    layers = np.array([librosa.amplitude_to_db(librosa.feature.rms(y=stems[n].mean(0), hop_length=HOP)[0], top_db=None)
                       for n in ('drums', 'bass', 'other')])
    layers = np.clip(layers - layers.max(1, keepdims=True), -40, 0)[:, :harm.shape[1]]
    bars = bar_lines(beats, downbeats, harm, layers, onsets['kick'][0], duration)
    nbars = len(bars) - 1
    bpm = 60 / np.median(np.diff(beats))

    rows = {}
    raw_hits = {}
    for name, (times, strength) in onsets.items():
        raw_hits[name] = [(b, s, o, float(strength[k])) for k, b, s, o in to_grid(times, bars)]
        rows[name] = grid_stats(raw_hits[name], nbars)
    btimes, bstrength, bnotes = bass_onsets_and_notes(stems['bass'])
    bgrid = to_grid(btimes, bars)
    raw_hits['bass'] = [(b, s, o, float(bstrength[k])) for k, b, s, o in bgrid]
    rows['bass'] = grid_stats(raw_hits['bass'], nbars)

    key = key_of(stems['other'] + stems['bass'])
    notes = [bnotes[k] for k, *_ in bgrid if bnotes[k] is not None]
    degrees = np.zeros(12)
    for nn in notes:
        degrees[int(nn - key['tonicIndex']) % 12] += 1
    jumps = np.abs(np.diff(notes)) if len(notes) > 1 else np.array([])

    meter = pyln.Meter(SR)
    levels = {n: lufs(meter, stems[n]) for n in LAYERS}
    levels['mix'] = lufs(meter, x)
    ref = levels['drums']
    rel = {n: (round(levels[n] - ref, 2) if levels[n] is not None and ref is not None else None) for n in LAYERS}

    activity = np.array([bar_energy(stems[n], bars) for n in LAYERS])
    activity -= np.percentile(activity, 90, axis=1, keepdims=True)
    form = sections(activity)
    tim = {n: timbre(stems[n], bars, 3000 if n == 'bass' else None) for n in LAYERS}
    chords = bar_chords(harm, bars, key['tonicIndex'])

    all_hits = [h for name in ('hats', 'snare', 'kick') for h in raw_hits[name]]
    result = {
        'file': path.name,
        'genre': genre,
        'duration': round(duration, 1),
        'bpm': round(float(bpm), 1),
        'steadyTempo': bool(steady),
        'bars': nbars,
        'key': key,
        'swing': {'hats': swing_of(raw_hits['hats']), 'drums': swing_of(all_hits)},
        'grid': rows,
        'bass': {
            'notesPerBar': rows['bass']['hitsPerBar'],
            'degrees': [round(float(v / max(degrees.sum(), 1)), 3) for v in degrees],
            'medianMidi': float(np.median(notes)) if notes else None,
            'repeatRatio': round(float(np.mean(jumps == 0)), 3) if len(jumps) else None,
            'octaveJumpRatio': round(float(np.mean(jumps == 12)), 3) if len(jumps) else None,
        },
        'loudness': levels,
        'relativeToDrums': rel,
        'form': form,
        'activity': np.round(activity, 1).tolist(),
        'chords': chords,
        'chordLoops': common_loops(chords),
        'harmonicBars': round(float(np.mean([c != 'N' for c in chords])), 2),
        'pumping': {n: pumping(stems[n], beats) for n in ('bass', 'other')},
        'timbre': {n: {k: nanround(v, 3 if k == 'flatness' else (2 if k == 'sustain' else 0)) for k, v in tim[n].items()} for n in LAYERS},
        'sectionDetail': describe_sections(form, activity, tim, chords, bpm),
    }
    plot_track(result, stems, x, bars, args.out / genre / f'{path.stem}.png')
    return result


# ---------------------------------------------------------------- aggregation

def median_or_none(vals):
    vals = [v for v in vals if v is not None]
    return round(float(np.median(vals)), 2) if vals else None


def aggregate(genre, tracks):
    prof = {'genre': genre, 'tracks': len(tracks), 'files': [t['file'] for t in tracks]}
    bpms = [t['bpm'] for t in tracks]
    prof['bpm'] = {'median': median_or_none(bpms), 'min': min(bpms), 'max': max(bpms)}
    prof['keys'] = {}
    for t in tracks:
        k = f"{t['key']['tonic']} {t['key']['mode']}"
        prof['keys'][k] = prof['keys'].get(k, 0) + 1
    modes = [t['key']['mode'] for t in tracks]
    prof['minorRatio'] = round(modes.count('minor') / len(modes), 2)
    prof['pitchClasses'] = np.round(np.mean([t['key']['pitchClasses'] for t in tracks], 0), 3).tolist()
    # a track whose bar grid did not lock (drifting tempo, wrong metrical level) smears every
    # hit across all 16 steps; it would flatten the genre average, so rhythm stats skip it
    locked = [t for t in tracks if max(t['grid']['kick']['prob']) >= .5] or tracks
    prof['gridTracks'] = [t['file'] for t in locked]
    prof['swing'] = {k: median_or_none([t['swing'][k] for t in locked]) for k in ('hats', 'drums')}
    prof['grid'] = {}
    for r in ROWS:
        prob = np.mean([t['grid'][r]['prob'] for t in locked], 0)
        prof['grid'][r] = {
            'prob': np.round(prob, 3).tolist(),
            'velocity': np.round(np.mean([t['grid'][r]['velocity'] for t in locked], 0), 3).tolist(),
            'hitsPerBar': median_or_none([t['grid'][r]['hitsPerBar'] for t in locked]),
            'pattern': ''.join('x' if p >= .6 else ('o' if p >= .25 else '.') for p in prob),
        }
    prof['bass'] = {
        'degrees': np.round(np.mean([t['bass']['degrees'] for t in tracks], 0), 3).tolist(),
        **{k: median_or_none([t['bass'][k] for t in tracks]) for k in ('notesPerBar', 'medianMidi', 'repeatRatio', 'octaveJumpRatio')},
    }
    prof['relativeToDrums'] = {n: {'median': median_or_none([t['relativeToDrums'][n] for t in tracks]),
                                   'values': [t['relativeToDrums'][n] for t in tracks]} for n in LAYERS}
    prof['loudness'] = {'mixMedian': median_or_none([t['loudness']['mix'] for t in tracks])}
    secs = [s for t in tracks for s in t['form']]
    lens = {}
    for s in secs:
        lens.setdefault(s['label'], []).append(s['bars'])
    prof['form'] = {
        'sectionsPerTrack': median_or_none([len(t['form']) for t in tracks]),
        'barsBeforeFirstPeak': median_or_none([next((s['start'] for s in t['form'] if s['label'] == 'peak'), None) for t in tracks]),
        'sectionBars': {k: {'median': median_or_none(v), 'counts': {str(b): v.count(b) for b in sorted(set(v))}} for k, v in lens.items()},
        'sequences': [' '.join(f"{s['label']}{s['bars']}" for s in t['form']) for t in tracks],
    }
    loops = {}
    for t in tracks:
        for k, c in t.get('chordLoops', []):
            loops[k] = loops.get(k, 0) + c
    prof['chordLoops'] = sorted(loops.items(), key=lambda kv: -kv[1])[:8]
    prof['harmonicBars'] = median_or_none([t.get('harmonicBars') for t in tracks])
    prof['pumping'] = {n: median_or_none([t.get('pumping', {}).get(n) for t in tracks]) for n in ('bass', 'other')}
    return prof


# ---------------------------------------------------------------- figures

LABEL_COLOR = {'intro': '#9aa5b1', 'break': '#5b8def', 'groove': '#f0b429', 'peak': '#e5484d', 'outro': '#9aa5b1'}


def grid_axes(ax, grid, title):
    m = np.array([grid[r]['prob'] for r in ROWS])
    ax.imshow(m, aspect='auto', cmap='magma', vmin=0, vmax=1)
    ax.set_yticks(range(len(ROWS)), ROWS)
    ax.set_xticks(range(STEPS), [str(i + 1) if i % 4 == 0 else '' for i in range(STEPS)])
    for i in range(len(ROWS)):
        for j in range(STEPS):
            ax.text(j, i, f'{m[i, j]:.1f}'.lstrip('0') if m[i, j] >= .05 else '', ha='center', va='center',
                    fontsize=7, color='white' if m[i, j] < .6 else 'black')
    for j in (3.5, 7.5, 11.5):
        ax.axvline(j, color='white', lw=.6, alpha=.5)
    ax.set_title(title, fontsize=9)


def form_axes(ax, form, nbars):
    for s in form:
        ax.barh(0, s['bars'], left=s['start'], color=LABEL_COLOR[s['label']], edgecolor='white')
        ax.text(s['start'] + s['bars'] / 2, 0, f"{s['label']}\n{s['bars']}", ha='center', va='center', fontsize=7)
    ax.set_xlim(0, nbars)
    ax.set_yticks([])


def plot_track(r, stems, x, bars, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    fig = plt.figure(figsize=(12, 10))
    gs = fig.add_gridspec(5, 2, height_ratios=[3, 1.4, .5, 1.4, 2], width_ratios=[3, 2], hspace=.6)
    ax = fig.add_subplot(gs[0, :])
    y = soxr.resample(x.mean(0), SR, 22050)
    M = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=22050, hop_length=1024, n_mels=96), ref=np.max)
    ax.imshow(M, aspect='auto', origin='lower', cmap='magma', vmin=-70,
              extent=[0, len(y) / 22050, 0, 96])
    for s in r['form']:
        ax.axvline(bars[s['start']], color='white', lw=.8, alpha=.7)
    ax.set_title(f"{r['file']} — {r['bpm']} bpm, {r['key']['tonic']} {r['key']['mode']}, {r['loudness']['mix']} LUFS",
                 fontsize=10)
    ax.set_ylabel('mel')
    ax.set_xlabel('s')
    ax = fig.add_subplot(gs[1, :])
    ax.imshow(np.clip(r['activity'], -40, 0), aspect='auto', cmap='viridis', vmin=-40, vmax=0,
              extent=[0, r['bars'], len(LAYERS) - .5, -.5])
    ax.set_yticks(range(len(LAYERS)), LAYERS)
    ax.set_title('layer energy per bar (dB vs. each stem\'s loud bars)', fontsize=9)
    form_axes(fig.add_subplot(gs[2, :]), r['form'], r['bars'])
    ax = fig.add_subplot(gs[3, :])
    for n, col in (('bass', '#e5484d'), ('other', '#5b8def'), ('vocals', '#30a46c')):
        c = np.array([np.nan if v is None else v for v in r['timbre'][n]['centroid']], float)
        c[np.array(r['activity'][LAYERS.index(n)]) < -20] = np.nan
        ax.plot(np.arange(len(c)) + .5, c, color=col, lw=1, label=n)
    ax.set_yscale('log')
    ax.set_xlim(0, r['bars'])
    ax.legend(fontsize=7, loc='upper right')
    ax.set_title('brightness per bar (spectral centroid, Hz) — rises = filter opening / build', fontsize=9)
    grid_axes(fig.add_subplot(gs[4, 0]), r['grid'],
              f"hit probability per 16th (swing {r['swing']['drums']})")
    ax = fig.add_subplot(gs[4, 1])
    rel = r['relativeToDrums']
    names = [n for n in LAYERS if rel[n] is not None]
    ax.barh(names, [rel[n] for n in names], color='#5b8def')
    ax.axvline(0, color='black', lw=.6)
    ax.set_title('stem loudness vs drums (LU)', fontsize=9)
    ax.invert_yaxis()
    fig.savefig(path, dpi=90, bbox_inches='tight')
    plt.close(fig)


def plot_genre(prof, tracks, path):
    fig = plt.figure(figsize=(12, 3 + .35 * len(tracks)))
    gs = fig.add_gridspec(2, 2, height_ratios=[2.2, .35 * len(tracks) + .4], width_ratios=[3, 2], hspace=.4)
    grid_axes(fig.add_subplot(gs[0, 0]), prof['grid'],
              f"{prof['genre']}: {prof['tracks']} tracks, {prof['bpm']['median']} bpm, swing {prof['swing']['drums']}")
    ax = fig.add_subplot(gs[0, 1])
    for i, n in enumerate(LAYERS):
        vals = [v for v in prof['relativeToDrums'][n]['values'] if v is not None]
        ax.scatter(vals, [i] * len(vals), color='#5b8def', alpha=.6, s=14)
        if vals:
            ax.plot([np.median(vals)] * 2, [i - .3, i + .3], color='#e5484d', lw=2)
    ax.set_yticks(range(len(LAYERS)), LAYERS)
    ax.invert_yaxis()
    ax.axvline(0, color='black', lw=.6)
    ax.set_title('stem loudness vs drums (LU), red = median', fontsize=9)
    ax = fig.add_subplot(gs[1, :])
    longest = max(t['bars'] for t in tracks)
    for i, t in enumerate(tracks):
        for s in t['form']:
            ax.barh(i, s['bars'], left=s['start'], color=LABEL_COLOR[s['label']], edgecolor='white')
    ax.set_yticks(range(len(tracks)), [t['file'][:28] for t in tracks], fontsize=7)
    ax.set_xlim(0, longest)
    ax.invert_yaxis()
    ax.set_xlabel('bars')
    ax.set_title('form (grey intro/outro, blue break, yellow groove, red peak)', fontsize=9)
    fig.savefig(path, dpi=90, bbox_inches='tight')
    plt.close(fig)


def write_report(out, profiles):
    parts = ['<!doctype html><meta charset="utf-8"><title>Genre analysis</title><style>'
             'body{font:14px system-ui;margin:24px;background:#111;color:#ddd}img{max-width:100%;background:#fff;border-radius:6px}'
             'h2{margin-top:40px}code,pre{background:#222;padding:2px 6px;border-radius:4px}details{margin:8px 0}'
             'table{border-collapse:collapse}td,th{padding:3px 10px;border-bottom:1px solid #333;text-align:left}</style>'
             '<h1>Genre analysis</h1>']
    for g, prof in profiles.items():
        parts.append(f'<h2 id="{g}">{html.escape(g)}</h2><img src="{g}/profile.png">')
        rows = ''.join(f"<tr><th>{r}</th><td><code>{prof['grid'][r]['pattern']}</code></td>"
                       f"<td>{prof['grid'][r]['hitsPerBar']}/bar</td></tr>" for r in ROWS)
        parts.append(f'<table>{rows}</table>')
        parts.append(f"<p>keys: {html.escape(json.dumps(prof['keys']))} · minor {prof['minorRatio']} · "
                     f"bass {prof['bass']['notesPerBar']} notes/bar · first peak at bar {prof['form']['barsBeforeFirstPeak']}</p>")
        parts.append('<details><summary>form sequences</summary><pre>' +
                     html.escape('\n'.join(prof['form']['sequences'])) + '</pre></details>')
        parts.append('<details><summary>tracks</summary>' +
                     ''.join(f'<p><img src="{g}/{html.escape(Path(f).stem)}.png" loading="lazy"></p>' for f in prof['files']) +
                     '</details>')
    (out / 'index.html').write_text('\n'.join(parts), encoding='utf-8')


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--tracks', type=Path, default=ROOT / 'analysis' / 'tracks')
    ap.add_argument('--out', type=Path, default=ROOT / 'analysis' / 'out')
    ap.add_argument('--genre', action='append', help='only these genre folders (repeatable)')
    ap.add_argument('--model', default='htdemucs_ft', help='Demucs model (htdemucs_ft, htdemucs, htdemucs_6s)')
    ap.add_argument('--force', action='store_true', help='re-separate and re-analyze cached tracks')
    args = ap.parse_args()
    if not args.tracks.exists():
        sys.exit(f'put tracks in {args.tracks}/<genre>/')
    log(f'device: {DEV}')
    profiles = {}
    for gdir in sorted(p for p in args.tracks.iterdir() if p.is_dir()):
        genre = gdir.name
        if args.genre and genre not in args.genre:
            continue
        files = sorted(p for p in gdir.iterdir() if p.suffix.lower() in AUDIO_EXT)
        if not files:
            continue
        log(f'{genre}: {len(files)} tracks')
        odir = args.out / genre
        odir.mkdir(parents=True, exist_ok=True)
        tracks = []
        for f in files:
            jf = odir / f'{f.stem}.json'
            if jf.exists() and not args.force and jf.stat().st_mtime > f.stat().st_mtime:
                tracks.append(json.loads(jf.read_text(encoding='utf-8')))
                continue
            try:
                r = analyze_track(f, genre, args)
            except Exception as e:  # one broken file should not stop the batch
                log(f'    skipped: {e}')
                continue
            jf.write_text(json.dumps(r, ensure_ascii=False), encoding='utf-8')
            tracks.append(r)
        if not tracks:
            continue
        prof = aggregate(genre, tracks)
        (odir / 'profile.json').write_text(json.dumps(prof, ensure_ascii=False, indent=1), encoding='utf-8')
        plot_genre(prof, tracks, odir / 'profile.png')
        profiles[genre] = prof
        log(f"  kick  {prof['grid']['kick']['pattern']}\n  snare {prof['grid']['snare']['pattern']}\n"
            f"  hats  {prof['grid']['hats']['pattern']}\n  bass  {prof['grid']['bass']['pattern']}")
    # keep genres analyzed in earlier runs in the report
    for pf in sorted(args.out.glob('*/profile.json')):
        profiles.setdefault(pf.parent.name, json.loads(pf.read_text(encoding='utf-8')))
    if profiles:
        write_report(args.out, dict(sorted(profiles.items())))
        log(f'report: {args.out / "index.html"}')


if __name__ == '__main__':
    main()
