# Drum samples: sources and licenses

Every file in this folder is released under **CC0 1.0** (public domain dedication) by
its original author, except `wurli` (CC BY 3.0) and the `teto_*` vocals (non-commercial only), see below. The files were trimmed, faded, peak-normalized and converted to
16-bit FLAC by `tools/samples/build_bank.py` (`build_fx.py` and `build_pitched.py` for `fx_*` and the
pitched instruments; those keep one velocity layer per note and fold to mono); that processing adds no new rights.

| Bank keys | Source | Author | License |
|---|---|---|---|
| `TR909_*`, `TR808_*`, `TR707_*`, `TR606_*`, `TR727_*` | [MckAudio/MckSamplePacks](https://github.com/MckAudio/MckSamplePacks), folder `TR8/`: one-shots recorded from a Roland TR-8 (circuit-modelled 909/808/707/606/727 voices) | MckAudio | [CC0 1.0](https://github.com/MckAudio/MckSamplePacks/blob/main/LICENSE) |
| `RD6_*` | same repository, folder `RD6/`: an analog RD-6 drum machine | MckAudio | CC0 1.0 |
| `Kit_*` | [Karoryfer Big Rusty Drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums): acoustic kit, close mic mixed with overheads | Karoryfer Samples | [CC0 1.0](https://github.com/sfzinstruments/karoryfer.big-rusty-drums/blob/master/LICENSE) |
| `kitbreak` | An original 2-bar funk break played with the `Kit_*` hits at 136 BPM and cut into 32 sixteenth slices (pattern written for this project, not copied from a record) | this project | made only from the CC0 `Kit_*` hits |
| `fx_*` | Short effects for the orb page's 4-bar blocks (impacts, sub drops, reversed crashes and snares, noise sweeps), synthesised by `tools/samples/build_fx.py`; the impacts, reversed crashes and reversed snares also use the CC0 `Kit_*`, `TR909_*`, `TR808_*` and `RD6_*` hits above | this project | CC0 1.0 (synthesised here, or made only from the CC0 hits above) |
| `swagbass` | Bass guitar (flatwounds, fingered), one velocity layer per sampled note: [karoryfer.swagbass](https://github.com/sfzinstruments/karoryfer.swagbass) | Karoryfer Samples (played and mapped by D. Smolken) | CC0 1.0 |
| `growlybass` | Squier Jazz Bass, staccato: [karoryfer.growlybass](https://github.com/sfzinstruments/karoryfer.growlybass) | Karoryfer Samples | CC0 1.0 |
| `uprightbass` | 1958 Otto Rubner double bass, pizzicato: [dsmolken.double-bass](https://github.com/sfzinstruments/dsmolken.double-bass) | D. Smolken | CC0 1.0 |
| `wurli` | Wurlitzer EP200 electric piano: [GregSullivan.E-Pianos](https://github.com/sfzinstruments/GregSullivan.E-Pianos) | Greg Sullivan | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/): **credit Greg Sullivan** |

## Vocals: not CC0

| Bank keys | Source | Author | License |
|---|---|---|---|
| `teto_*` | 4-bar phrases written for this project (`tools/vocals/make_ustx.py`), sung by the Kasane Teto UTAU voicebank (重音テト OU用日本語統合ライブラリー) in [OpenUtau](https://github.com/openutau/OpenUtau), with natural pitch from the F0 model of Saitou et al. 2004 ([openutau-mcp](https://github.com/r3coder/openutau-mcp)), as sung words: one 24 kHz file per bar of each line, sung as written, 4 semitones down and 3 up (`_dn4`, `_up3`), each note detached (a short rest before the next) so it can be re-timed on its own; chord lines are three voices mixed (`tools/vocals/build_vocals.py`). 14 lines (6 sung, 4 scat, 4 chords) × 4 bars × 3 pitches: 168 files, **not in this folder**: served by the share server only (`server/vocals.mjs`) | voice: 小山乃舞世 / TWINDRILL; melodies and lyrics: this project | audio: [重音テト音声ライブラリー使用許諾条件](https://kasaneteto.jp/guideline/voice.html), **non-commercial use only**, no reuse outside this project; melodies and lyrics (the notes in `make_ustx.py`): CC0 1.0 |

These are sung words made with the voicebank, not the voicebank: no voicebank recording is used
directly, never single syllables. They are **not** covered by this project's AGPL-3.0 or the CC0 terms
above, and they are **not distributed** with this repository or the built site: they live only on
ORBRAVE's share server, which plays them to the orb page (`server/vocals.mjs`, `src/vocals.js`), and the
vocal orbs stay hidden without it. Terms: [tools/vocals/NOTICE.txt](../../tools/vocals/NOTICE.txt).

Left out on purpose: the `DR5/` and `RX5/` folders of MckSamplePacks. Those machines play
back factory PCM sample ROMs, so their recordings carry the manufacturers' sample rights
and the CC0 dedication cannot cover them.

The names `TR909`, `TR808` and so on only say which classic voice a sound models. These are
not Roland's own samples, and this project is not affiliated with Roland.
