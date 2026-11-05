# Genre spec

The rules `src/composer.js` follows for each genre. Step numbers are **0-based on a 16-step grid** (one bar = 16 sixteenths; beats at 0, 4, 8, 12).
Sources are listed at the bottom of each genre. Where guides disagreed, I used the value most of them shared.

Across genres: a song rolls its section lengths once (intro, build, drop, break) and reuses them, and each section kind keeps the same layers every time it returns.

**Reference-track corrections** (from the analysis of Creative Commons tracks in `analysis/genres`, kept locally and not in the repo) override the guides where they disagreed: per-genre tempo ranges, longer main sections (24–48 bars instead of 16–24) with DJ-style intros, more static harmony, measured swing, and **sidechain ducking** (the kick carries `duckorbit(2)` and the ducked parts sit on orbit 2; depth and recovery per genre below). Lines starting with *Analysis* list what changed. Fills are kept small: at most one extra kick or snare hit closing an 8-bar phrase, and a quiet one-bar snare pickup in only about a quarter of builds (no machine-gun rolls).

## Song forms

Each genre has its own form (`FORMS` in `src/composer.js`) and decides which parts play in each section (`SECTION_LAYERS`). Bars in brackets are the options a song picks from.

| Genre | Form | What changes between sections |
|---|---|---|
| techno | intro [16/32] → groove 16 → main [16/24] → (strip or breakdown 8 → main) ×2–3 → outro 16 | Layers come and go one at a time. **strip** drops the kick while hats, bass and stabs keep rolling. **breakdown** is a filtered stab + noise sweep. No builds, risers or rolls |
| house | intro [16/32] → groove 16 → main [32/48] → (break 8) → (build 4) → main2 → (groove 8) → outro 16 | Drums-only intro and outro for DJs. The break keeps bass + chords. The rare build is 4 bars |
| acid | intro [16/32] → groove 16 → main → (break or strip [8/16] → main) ×1–2 → (groove 16) → outro 16 | The 303 starts alone and never stops. Drums come and go around it |
| trance | intro 16 → groove 32 → (breakdown) → build 8 → drop 32 → (groove 16) → breakdown [16/32] → build 8 → drop2 32 → outro 16 | Kick + rolling bass groove first. The breakdown introduces the melody, and the drop brings it back on the lead |
| dnb | intro [16/32] → groove [16/32] → (build 8) → drop [32/48] → (groove 16 → drop 16) → breakdown or groove → build 8 → drop2 → outro or groove | The bass is the switch: grooves are drums + pads only. Some drops come in without a build |
| breakbeat | intro 16 → groove 16 → main [24/32] → groove 8 → main2 → (break or breakdown 8 → build 4 → main2) → outro 16 | The break groove runs without bass. A section is "full" when the bass comes in |
| synthwave | intro [8/16] → (verse → chorus) ×2–3 → (bridge → chorus) → (chorus) → outro 8 | A pop song. Verses on pads + arps, choruses add the lead, the bridge drops the drums |
| lofi | sample [4/8] → (verse → (chorus) → dropout or sample) ×2–3 → outro or sample | A loop: the beat drops in and out under the sample |
| ambient | dawn → 1–3 long textures (swell / drift / glow, 24–32 bars) → fade | Slow changes in filter and density |
| dubtechno | intro [16/32] → groove 16 → main [24/32] → (strip or break [8/16] → main) ×1–2 → outro 16 | The echoing chord runs from the first bar and opens its filter over the song. **strip** drops the kick, **break** leaves the chords and bass alone in their echoes |

---

## techno
- **Tempo**: 128–138 (Detroit 125–135, Berlin 135–145)
- **Drums**: four-on-the-floor kick, **no swing** (at most 3–5% on hats). Clap/rim on 2 and 4. 16th closed hats with an **open hat on every offbeat** (2, 6, 10, 14). Sparse percussion (909 rim, low toms, shaker)
- **Bass**: root on the **offbeat**, after the kick ("oompa" rhythm), or a low rumble
- **Harmony**: phrygian/minor. **Two-note stabs** (root + ♭2 or ♭7) off the beat, dub-chord echoes. No sustained supersaw pads
- **Arrangement**: kick-driven, elements added one at a time. Breakdown is kick-only or a noise sweep. **No snare rolls**
- *Analysis*: tempo 124–134. Intro is drums only (16–32 bars); 3–4 peaks of 16–24 bars with 8-bar breaks. Loops are mostly one chord. Chords/lead/arp ducked ~6 dB (depth .25, recovers over .6 beat)
- Sources: [MusicRadar techno guide](https://musicradar.com/news/techno-guide-2023), [Attack – rolling techno](https://www.attackmagazine.com/technique/beat-dissected/rolling-techno/), [BeatKey techno](https://beatkey.pages.dev/how-to-make-techno-music)

## house (deep / classic)
- **Tempo**: 118–126
- **Drums**: four-on-the-floor kick, clap on 2 and 4, closed hats on 8ths, **open hat on the offbeat**, conga/bongo/shaker/tambourine. **Swing 55–65%**
- **Bass**: root on beat 1 with moves to the 5th or octave, sitting between the kicks
- **Harmony**: **always 7th/9th chords** (triads are too thin). Organ, Rhodes, piano **stabs on the offbeats**. Progressions i7–♭VII–♭VI–V7, i7–IV7 (dorian), i–♭VII–♭VI–♭VII, IV–I gospel
- **Lead**: mostly none
- *Analysis*: tempo 118–128. Hats fill every 16th (`house16`); swing drawn from 0–20% (most reference tracks were nearly straight). Bass is a long, round sub (`deep`). Intro is drums only; two long peaks (32–48 bars) with 8-bar breaks. Bass and chords ducked ~3 dB
- Sources: [EDMProd classic deep house](https://www.edmprod.com/how-to-make-classic-deep-house/), [BeatKey house beat](https://beatkey.pages.dev/how-to-make-a-house-beat), [Mode Audio deep house](https://modeaudio.com/magazine/deep-house-5-production-essentials)

## acid (Chicago acid house / acid techno)
- **Tempo**: 122–138
- **Drums**: TR-808/909/707, 4/4 kick, clap on 2 and 4, offbeat open hat, **minimal percussion**
- **Bass**: TB-303 16-step line with **accents and slides** as the core, octave jumps, high resonance, filter sweeps
- **Harmony**: the 303 carries it. Chords are absent or a thin pad
- *Analysis*: tempo 118–134; mixolydian allowed (half the reference tracks were major). The 303 sat as loud as the drums with a **separate sub** under it, so a sine sub now follows the chord roots. Tracks open with the **303 alone** and keep it through breaks; filter sweeps span 8–32 bars. Peaks 32–48 bars
- Sources: [Wikipedia – Acid house](https://en.wikipedia.org/wiki/Acid_house), [MusicTech 303 bassline](https://musictech.com/guides/essential-guide/how-to-create-a-chicago-style-acid-house-bassline)

## trance (uplifting)
- **Tempo**: 136–140 (138 is the center)
- **Drums**: kick 0/4/8/12, clap 4/12, offbeat open hat, 16th hats in builds, percussion 1/5/9/13
- **Bass**: **rolling 16ths in the gaps between kicks** (~ r r r) or offbeat 8ths, sidechain pumping
- **Harmony**: i–♭VI–♭III–♭VII (Am–F–C–G), i–♭VI–i–V, ♭VI–♭III–♭VII–i. Supersaw lead, **16th pluck arps (root–3rd–5th–oct–5th–3rd)**, long-attack pads
- **Arrangement**: **long breakdown (32–64 bars, no drums or bass)**, then build (riser, snare roll), then drop
- *Analysis*: tempo 136–142. A 32-bar kick + rolling-bass groove comes before the first build; drops are 32 bars. The rolling bass is **ducked hard (~10–15 dB, depth .7)** on every kick
- Sources: [BeatKey trance](https://beatkey.pages.dev/how-to-make-trance-music), [Music Production Wiki trance](https://musicproductionwiki.com/articles/how-to-make-trance)

## dnb
- **Tempo**: 170–176
- **Drums**: **two-step: kick 0 and 10, snare 4 and 12**. **Ghost snares** at ~25% (the 16th before each main snare), rim/shaker ghosts, ride/open hat. In grooves and drops a **chopped break** (`kitbreak` slices of an original CC0 acoustic-kit break, placed by kick/snare/ghost role, each slice cutting off the last) replaces the hats, layered over the programmed kick and snare
- **Bass**: **half-time** feel (bass moves at ~85 BPM). Sub sine plus a reese (detuned saws, filter sweep) with **long notes**
- **Harmony**: liquid i–♭VII–♭VI–♭VII, i–♭VI–♭VII–iv, min9/min11. Dark styles loop two chords, i–♭VII
- *Analysis*: tempo 172–178. **The bass is held back until the first drop** (intro, a 32-bar drums+pads groove and the build have no bass); pads run through intro and grooves. Drops 32–48 bars, breaks 16–32
- Sources: [BeatKey DnB](https://beatkey.pages.dev/how-to-make-drum-and-bass), [MusicRadar jungle/DnB grooves](https://www.musicradar.com/how-to/how-to-program-6-different-jungle-and-drum-n-bass-grooves)

## breakbeat (big beat / nu skool)
- **Tempo**: 125–135
- **Drums**: built on funk breaks. **Syncopated kick** (with offbeats such as 0, 2, 10, 13), backbeat snare 4/12 plus **16th ghost snares**, 16th hats. Grooves and drops add a **chopped break** in place of the hats (same as dnb, funkier templates)
- **Bass**: deep, not melodic
- **Harmony**: **one chord, or a very simple loop** (i–♭VII, i–iv)
- *Analysis*: the synth/pad layer sat as loud as the drums, so its mix target is −3 LU (was −7). Drops 16–32 bars, 2–3 peaks
- Sources: [Wikipedia – Breakbeat](https://Wikipedia.com/wiki/Breakbeat), [Ethan Hein – Funky Drummer](https://www.ethanhein.com/wp/2023/building-the-funky-drummer-beat/), [NI – best drum breaks](https://www.native-instruments.com/blogs/blog/best-drum-breaks)

## lofi (hip hop)
- **Tempo**: 75–94
- **Drums**: boom bap. Kick 0/6/10 strong, 3/14 soft. Snare 4/12. **Heavy swing, measured on the 16ths: off-16ths 25–35% of a 16th late** (`swingBy(0.25–0.35, 8)`). Soft rim 7/15. Imperfect velocities
- **Bass**: sub on the root
- **Harmony**: **minor keys, always m7/m9/maj7** (triads discouraged). im7–♭VII–♭VI–♭VII, im9–♭VImaj7–♭VII–im9, im7–IV7, im7–♭IIImaj7–♭VI–♭VII. Rhodes/piano. Melodies are 2–4 note slow phrases
- **Texture**: **vinyl crackle** throughout
- *Analysis*: form is a loop, not verse/chorus: sample only (8) → beat (16–32) → 8-bar dropout (chords + bass) → beat → outro. Bass uses the 3rd and 5th as passing notes. Bass and chords ducked ~6 dB
- Sources: [BeatKey lofi hip hop](https://beatkey.pages.dev/how-to-make-lofi-hip-hop-music), [mastering.com lofi](https://mastering.com/lofi-hip-hop/), [Mode Audio lofi](https://modeaudio.com/magazine/lofi-hip-hop-5-production-essentials)

## synthwave
- **Tempo**: 96–118
- **Drums**: TR-707 and the acoustic kit (the reference sound is LinnDrum/Roland). Four-on-the-floor kick, **gated-reverb snare** on 2 and 4, 8th/16th hats, **three descending tom hits at the end of each 16-bar phrase**
- **Bass**: 8th/16th root pulses
- **Harmony**: **minor key**. Am–F–C–G (i–♭VI–♭III–♭VII), Dm–B♭–C–Dm (i–♭VI–♭VII–i), Am–C–G–F. Juno-style saw pads with slow attack. **16th up or up/down arps run through almost every section**, saw lead
- *Analysis*: one-chord vamps and i–v loops added. 8-bar intro straight into a 32–48 bar main section, **no build**. Bass ducked ~3 dB
- Sources: [BeatKey synthwave](https://beatkey.pages.dev/how-to-make-synthwave-music), [MusicTech gated reverb](https://musictech.com/tutorials/tips/how-to-create-authentic-vintage-drum-gated-reverb-for-synthwave-chillwave-music-styles)

## ambient
- **Tempo**: free time or 60–80
- **Drums**: **none**
- **Harmony**: **chords change every 4–16 bars**. maj7/m7/sus2/add9/m9, wide voicings. Lydian is the signature mode. Avoid leading tones
- **Layers**: sub drone, slow-attack pad, high shimmer (bells, piano)
- **Motion**: very slow LFO on the filter, long reverb (4–8 s), long delay (60–80% feedback)
- *Analysis*: all reference tracks were minor and mostly held one chord, so dorian/minor now outweigh lydian and progressions lean static (i, i–♭III, i–♭VI). 1–3 long sections (24–32 bars) between dawn and fade
- Sources: [BeatKey ambient](https://beatkey.pages.dev/how-to-make-ambient-music), [MusicRadar generative drone](https://www.musicradar.com/tuition/tech/how-to-create-a-generative-evolving-ambient-drone-sound-in-ableton-live-590880), [Synthtopia – Eno generative](https://www.synthtopia.com/content/2019/04/24/twenty-techniques-for-generative-music-inspired-by-brian-eno/)

## dubtechno
- **Tempo**: 120–130
- **Drums**: soft four-on-the-floor kick (909/808, low and round), rim or soft clap on 2 and 4, 16th hats that keep moving, a shaker or rim for percussion. Fills almost never
- **Bass**: a short sub note on the offbeats, under the chord rather than a melody
- **Harmony**: **one minor chord** (m7, m9 or a bare root + 7th), sometimes a second chord for two bars (i–♭III, i–v). The chord is a **short stab into long, filtered echoes** (delay feedback ~0.6–0.7, reverb), off the beat. A slow filter opens over a whole section
- **Texture**: tape hiss / vinyl crackle under everything
- *Analysis* (6 tracks, 123–130 BPM, median 124): 83% minor; the commonest 4-bar loops are a single chord (`i i i i`, `♭III ♭III ♭III ♭III`). Hats fill almost every 16th with **~19% swing** (most other genres measured near 0). The chord layer plays from bar 1 in 89% of bars; bass sits ~9 dB under the drums and is **ducked hard (~12 dB)**, chords ~3 dB. Sections: intro 8, groove ~14, peak 32, break ~12, outro ~12 bars
- Sources: [Attack – Basic Channel-style dub techno](https://www.attackmagazine.com/technique/beat-dissected/basic-channel-style-dub-techno/), [Attack – dub techno synth chords](https://www.attackmagazine.com/technique/synth-secrets/dub-techno-synth-chords/), [AudioTent – dub techno chord sound design](https://www.audiotent.com/production-tips/dub-techno-chord-sound-design)
