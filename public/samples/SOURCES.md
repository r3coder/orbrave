# Drum samples: sources and licenses

Every file in this folder is released under **CC0 1.0** (public domain dedication) by
its original author. The files were trimmed, faded, peak-normalized and converted to
16-bit FLAC by `tools/samples/build_bank.py`; that processing adds no new rights.

| Bank keys | Source | Author | License |
|---|---|---|---|
| `TR909_*`, `TR808_*`, `TR707_*`, `TR606_*`, `TR727_*` | [MckAudio/MckSamplePacks](https://github.com/MckAudio/MckSamplePacks), folder `TR8/`: one-shots recorded from a Roland TR-8 (circuit-modelled 909/808/707/606/727 voices) | MckAudio | [CC0 1.0](https://github.com/MckAudio/MckSamplePacks/blob/main/LICENSE) |
| `RD6_*` | same repository, folder `RD6/`: an analog RD-6 drum machine | MckAudio | CC0 1.0 |
| `Kit_*` | [Karoryfer Big Rusty Drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums): acoustic kit, close mic mixed with overheads | Karoryfer Samples | [CC0 1.0](https://github.com/sfzinstruments/karoryfer.big-rusty-drums/blob/master/LICENSE) |
| `kitbreak` | An original 2-bar funk break played with the `Kit_*` hits at 136 BPM and cut into 32 sixteenth slices (pattern written for this project, not copied from a record) | this project | made only from the CC0 `Kit_*` hits |

Left out on purpose: the `DR5/` and `RX5/` folders of MckSamplePacks. Those machines play
back factory PCM sample ROMs, so their recordings carry the manufacturers' sample rights
and the CC0 dedication cannot cover them.

The names `TR909`, `TR808` and so on only say which classic voice a sound models. These are
not Roland's own samples, and this project is not affiliated with Roland.
