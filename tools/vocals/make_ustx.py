# Writes an OpenUtau project (tools/vocals/phrases.ustx) of the vocal lines for the three Teto
# orbs, each a 4-bar line written for the orb page's frame: 124 BPM, A natural minor,
# Am9 - Fmaj7 - Cmaj7 - G6. Every line is sung three times, as written, 4 semitones down and 3
# up (track suffixes _dn4 / _up3: Teto's voice breaks on A5 when a note starts from silence), so a key orb can pick the nearest one and move it at most 2
# semitones with .speed() (see keyTail in src/orbCatalog.js). Chord lines are three voices, one
# track each (_v1 low … _v3 high), mixed back into one file by build_vocals.py.
#   python -I tools/vocals/make_ustx.py
# tools/vocals/render.ps1 runs this, sings it with the headless renderer (ou-render from openutau-mcp, with natural
# pitch) and cuts the files. By hand: open it in OpenUtau with the Kasane Teto
# "OU用日本語統合ライブラリー" voicebank installed, then File > Export > "Export Wav Files" (one file
# per track). Every part starts at bar 2 (one bar of lead-in, so a first consonant sung ahead of the
# beat isn't cut off).
#
# Notes sit on an eighth-note grid. Every note on a beat is a tone of that bar's chord; off-beat
# notes may pass between them. Melodies and lyrics are original to this project and dedicated to the
# public domain (CC0 1.0); the audio sung from them with the Teto voicebank is not (see NOTICE.txt).
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TPQ = 480  # ticks per quarter (OpenUtau's resolution)
E8 = TPQ // 2
LEAD_IN = 4 * TPQ  # one bar
SINGER = '重音テト OU用日本語統合ライブラリー'
# track suffix: semitones
PITCHES = {'': 0, '_dn4': -4, '_up3': 3}
# Notes are sung detached: a note that runs into the next stops GAP ticks early (about 0.1 s at
# 124 BPM), so the next one starts from silence with its own consonant ("- ka", not "a ka") and at
# its own pitch. The orbs play a line note by note at any tempo and key (src/orbCatalog.js); sung
# legato, every note began with the end of the one before (its vowel, and the glide from its
# pitch), which came apart into a blip of the wrong pitch whenever the notes were re-spaced.
# GAP covers the PRE seconds each note is played early (build_vocals.py), with room to spare.
GAP = 96

# name: [(start in eighths, length in eighths, MIDI note, lyric)], 32 eighths = 4 bars
# A4 = 69. Am9 = A C E G B, Fmaj7 = F A C E, Cmaj7 = C E G B, G6 = G B D E.
SINGLES = {
    # ----- sung lines (the 노래 orb) -----
    # "ひかりのなかで / おどりつづけて / いま": in the light, keep dancing, now
    'hikari': [
        (0, 1, 64, 'ひ'), (1, 1, 67, 'か'), (2, 2, 69, 'り'), (4, 1, 67, 'の'), (5, 1, 69, 'な'), (6, 1, 72, 'か'), (7, 4, 72, 'で'),
        (12, 1, 69, 'お'), (13, 1, 72, 'ど'), (14, 2, 76, 'り'),
        (16, 1, 76, 'つ'), (17, 1, 74, 'づ'), (18, 2, 72, 'け'), (20, 4, 71, 'て'),
        (26, 2, 74, 'い'), (28, 4, 71, 'ま'),
    ],
    # "かぜのなかで / きみをよぶ / ららら / ああ": in the wind I call you
    'kaze': [
        (0, 1, 69, 'か'), (1, 1, 72, 'ぜ'), (2, 2, 76, 'の'), (4, 1, 76, 'な'), (5, 1, 74, 'か'), (6, 2, 72, 'で'),
        (10, 1, 69, 'き'), (11, 1, 72, 'み'), (12, 2, 72, 'を'), (14, 1, 76, 'よ'), (15, 3, 76, 'ぶ'),
        (20, 1, 71, 'ら'), (21, 1, 72, 'ら'), (22, 2, 76, 'ら'),
        (24, 4, 74, 'あ'), (28, 4, 71, 'あ'),
    ],
    # "そらをみあげて / ゆめをかぞえる / いつか / とどく": looking up at the sky, counting dreams, someday they'll reach
    'sora': [
        (0, 1, 72, 'そ'), (1, 1, 71, 'ら'), (2, 2, 69, 'を'), (4, 1, 72, 'み'), (5, 1, 74, 'あ'), (6, 1, 76, 'げ'), (7, 3, 76, 'て'),
        (11, 1, 72, 'ゆ'), (12, 1, 69, 'め'), (13, 1, 72, 'を'), (14, 1, 76, 'か'), (15, 1, 74, 'ぞ'),
        (16, 2, 72, 'え'), (18, 2, 71, 'る'), (20, 1, 67, 'い'), (21, 1, 69, 'つ'), (22, 2, 72, 'か'),
        (24, 1, 74, 'と'), (25, 1, 71, 'ど'), (26, 6, 67, 'く'),
    ],
    # "ねえ きこえる / ぼくらの / りずむ / ららら": hey, can you hear it, our rhythm
    'nee': [
        (0, 2, 69, 'ね'), (2, 2, 72, 'え'), (4, 1, 76, 'き'), (5, 1, 74, 'こ'), (6, 1, 72, 'え'), (7, 3, 69, 'る'),
        (11, 1, 72, 'ぼ'), (12, 1, 69, 'く'), (13, 1, 72, 'ら'), (14, 2, 76, 'の'),
        (16, 2, 76, 'り'), (18, 2, 72, 'ず'), (20, 4, 67, 'む'),
        (26, 1, 74, 'ら'), (27, 1, 71, 'ら'), (28, 2, 67, 'ら'),
    ],
    # "まだねむらない / このまちで / ひとりきり / ねえ": the town that doesn't sleep yet, all alone, hey
    'mada': [
        (0, 1, 69, 'ま'), (1, 1, 72, 'だ'), (2, 1, 76, 'ね'), (3, 1, 74, 'む'), (4, 1, 72, 'ら'), (5, 1, 71, 'な'), (6, 2, 69, 'い'),
        (10, 1, 72, 'こ'), (11, 1, 74, 'の'), (12, 1, 76, 'ま'), (13, 1, 74, 'ち'), (14, 2, 72, 'で'),
        (16, 1, 76, 'ひ'), (17, 1, 74, 'と'), (18, 1, 72, 'り'), (19, 1, 71, 'き'), (20, 4, 72, 'り'),
        (26, 1, 74, 'ね'), (27, 1, 71, 'え'), (28, 4, 67, 'え'),
    ],
    # "あしたは / はれるかな / たぶん / ねえ": will it be sunny tomorrow? maybe
    'ashita': [
        (0, 1, 72, 'あ'), (1, 1, 74, 'し'), (2, 1, 76, 'た'), (3, 3, 72, 'は'),
        (8, 1, 69, 'は'), (9, 1, 72, 'れ'), (10, 1, 76, 'る'), (11, 1, 74, 'か'), (12, 4, 72, 'な'),
        (16, 2, 76, 'た'), (18, 2, 72, 'ぶ'), (20, 4, 71, 'ん'),
        (24, 4, 74, 'ね'), (28, 4, 67, 'え'),
    ],

    # ----- scat hooks (the 라라라 orb) -----
    # a "ら ら る" hook
    'rara': [
        (0, 1, 69, 'ら'), (1, 1, 72, 'ら'), (2, 2, 76, 'ら'), (5, 1, 74, 'る'), (6, 2, 76, 'ら'),
        (8, 1, 72, 'ら'), (9, 1, 69, 'ら'), (10, 2, 72, 'ら'), (13, 1, 76, 'る'), (14, 2, 72, 'ら'),
        (16, 1, 67, 'ら'), (17, 1, 72, 'ら'), (18, 2, 76, 'ら'), (21, 1, 74, 'る'), (22, 2, 71, 'ら'),
        (24, 2, 74, 'ら'), (26, 1, 71, 'ら'), (27, 1, 69, 'る'), (28, 4, 67, 'ら'),
    ],
    # "ぱ" on the off-beats
    'pa': [
        (1, 1, 76, 'ぱ'), (2, 1, 72, 'ぱ'), (3, 1, 76, 'ぱ'), (5, 1, 74, 'ぱ'), (6, 1, 76, 'ぱ'), (7, 1, 72, 'ぱ'),
        (9, 1, 72, 'ぱ'), (10, 1, 77, 'ぱ'), (11, 1, 76, 'ぱ'), (13, 1, 72, 'ぱ'), (14, 1, 69, 'ぱ'), (15, 1, 72, 'ぱ'),
        (17, 1, 76, 'ぱ'), (18, 1, 72, 'ぱ'), (19, 1, 76, 'ぱ'), (21, 1, 74, 'ぱ'), (22, 1, 71, 'ぱ'), (23, 1, 72, 'ぱ'),
        (24, 2, 74, 'ぱ'), (26, 2, 71, 'ぱ'), (28, 4, 67, 'ぱ'),
    ],
    # "わ" long-short-long, falling a step each bar
    'wawa': [
        (0, 3, 76, 'わ'), (3, 1, 74, 'わ'), (4, 4, 72, 'わ'),
        (8, 3, 72, 'わ'), (11, 1, 74, 'わ'), (12, 4, 69, 'わ'),
        (16, 3, 71, 'わ'), (19, 1, 72, 'わ'), (20, 4, 67, 'わ'),
        (24, 3, 71, 'わ'), (27, 1, 72, 'わ'), (28, 4, 74, 'わ'),
    ],
    # "しゅ び だ" scat
    'shubi': [
        (0, 1, 72, 'しゅ'), (1, 1, 74, 'び'), (2, 2, 76, 'だ'), (5, 1, 74, 'しゅ'), (6, 2, 72, 'び'),
        (8, 2, 69, 'だ'), (11, 1, 72, 'しゅ'), (12, 1, 76, 'び'), (13, 3, 72, 'だ'),
        (16, 1, 71, 'しゅ'), (17, 1, 72, 'び'), (18, 2, 76, 'だ'), (21, 1, 74, 'しゅ'), (22, 2, 72, 'び'),
        (24, 2, 71, 'だ'), (27, 1, 72, 'しゅ'), (28, 1, 74, 'び'), (29, 3, 71, 'だ'),
    ],
}

# ----- chord lines (the 화음 orb): three voices on one rhythm -----
# voicings: (low, middle, high) per bar, moving by step between the chords
MID = [(69, 72, 76), (69, 72, 77), (67, 72, 76), (67, 71, 74)]  # Am · F · C · G, around C5
LOW = [(64, 69, 72), (65, 69, 72), (64, 67, 72), (62, 67, 71)]  # the same a third/fourth lower
# name: (voicing, one bar's rhythm [(start, length, lyric)], repeated in every bar)
CHORDS = {
    'ch_aah': (MID, [(0, 8, 'あ')]),
    'ch_mm': (LOW, [(0, 8, 'ん')]),
    'ch_pulse': (MID, [(0, 1, 'あ'), (2, 1, 'あ'), (4, 1, 'あ'), (6, 1, 'あ')]),
    'ch_sync': (LOW, [(0, 3, 'わ'), (3, 3, 'わ'), (6, 2, 'わ')]),
}


def chord_voices(voicing, rhythm):
    return [[(b * 8 + s, n, voicing[b][v], lyric) for b in range(4) for s, n, lyric in rhythm] for v in range(3)]


# every line as sung: singles, and each chord voice as <chord>_v1 … _v3
LINES = dict(SINGLES)
for _name, (_voicing, _rhythm) in CHORDS.items():
    for _v, _notes in enumerate(chord_voices(_voicing, _rhythm)):
        LINES[f'{_name}_v{_v + 1}'] = _notes
# Each bar of a line is a word of its own: the orbs mix bar 1 of one line with bar 2 of another and
# so on (every line's bar n is written over the same chord, so any mix fits). So no note may run
# over a barline: a note held into the next bar stops at the end of its own.
LINES = {name: [(s, min(n, 8 - s % 8), tone, lyric) for s, n, tone, lyric in notes] for name, notes in LINES.items()}
# the lines the orbs play (one file per bar and pitch; a chord's voices mixed): name -> its tracks
OUTPUTS = {**{n: [n] for n in SINGLES}, **{c: [f'{c}_v{v}' for v in (1, 2, 3)] for c in CHORDS}}

CHORD_PCS = [{9, 0, 4, 7, 11}, {5, 9, 0, 4}, {0, 4, 7, 11}, {7, 11, 2, 4}]


def check(name, notes):
    end = 0
    for s, n, tone, _ in notes:
        assert s >= end, f'{name}: notes overlap at eighth {s}'
        assert s + n <= 32, f'{name}: runs past bar 4'
        if s % 2 == 0:
            assert tone % 12 in CHORD_PCS[s // 8], f'{name}: eighth {s} ({tone}) is not a chord tone'
        end = s + n


def sung(notes):
    """(start, ticks sung, tone, lyric): a note that runs into the next one stops GAP ticks early."""
    nxt = [notes[k + 1][0] for k in range(len(notes) - 1)] + [None]
    return [(s, n * E8 - (GAP if b == s + n else 0), tone, lyric) for (s, n, tone, lyric), b in zip(notes, nxt)]


def note_yaml(s, ticks, tone, lyric):
    # ou-render's tuner (openutau-mcp) rewrites pitch and vibrato with natural pitch before rendering
    return f'''  - position: {s * E8}
    duration: {ticks}
    tone: {tone}
    lyric: {lyric}
    pitch:
      data:
      - {{x: -25, y: 0, shape: io}}
      - {{x: 25, y: 0, shape: io}}
      snap_first: true
    vibrato: {{length: 0, period: 175, depth: 25, in: 10, out: 10, shift: 0, drift: 0, vol_link: 0}}
    tuning: 0
    phoneme_expressions: []
    phoneme_overrides: []
'''


def main():
    with open(os.path.join(HERE, 'ustx_header.yaml'), encoding='utf-8') as f:
        out = f.read().rstrip('\n') + '\n'
    out += 'exp_secondary: 5\nkey: 0\ntime_signatures:\n- bar_position: 0\n  beat_per_bar: 4\n  beat_unit: 4\n'
    out += 'tempos:\n- position: 0\n  bpm: 124\ntracks:\n'
    tracks = [(name + suffix, notes, shift) for name, notes in LINES.items() for suffix, shift in PITCHES.items()]
    for name, notes in LINES.items():
        check(name, notes)
    for name, _, _ in tracks:
        out += f'''- singer: {SINGER}
  phonemizer: OpenUtau.Plugin.Builtin.JapanesePresampPhonemizer
  renderer_settings:
    renderer: WORLDLINE-R
  track_name: {name}
  track_color: Blue
  mute: false
  solo: false
  volume: 0
  pan: 0
  track_expressions: []
  voice_color_names:
  - ""
'''
    out += 'voice_parts:\n'
    for i, (name, notes, shift) in enumerate(tracks):
        out += f'- duration: {32 * E8}\n  name: {name}\n  comment: ""\n  track_no: {i}\n  position: {LEAD_IN}\n  notes:\n'
        out += ''.join(note_yaml(s, ticks, tone + shift, lyric) for s, ticks, tone, lyric in sung(notes))
        out += '  curves: []\n  masked_curves: []\n'
    out += 'wave_parts: []\n'
    path = os.path.join(HERE, 'phrases.ustx')
    with open(path, 'w', encoding='utf-8-sig', newline='\n') as f:
        f.write(out)
    print(f'{path}: {len(OUTPUTS)} lines ({len(SINGLES)} single, {len(CHORDS)} chords), {len(tracks)} tracks')


if __name__ == '__main__':
    main()
