# Orb catalogue

What the orb page (`index.html`, `src/orbs.js`) offers, as built by `src/orbCatalog.js`. Counts are
from the catalogue as of 2026-11-05 (816 orbs). To refresh them, see [Recounting](#recounting).

## The musical frame

Every orb plugs into one frame, so any set of orbs plays together:

- **124 BPM**, 4/4, one cycle = one bar. Patterns loop on a **4-bar grid** (bar 1 of the loop is cycle 0, 4, 8 …).
- **A natural minor** (Strudel `minor` = aeolian), progression **Am9 – Fmaj7 – Cmaj7 – G6**, one chord per bar.
- Key orbs switch it to **A major** (Amaj7 – F#m7 – Dmaj7 – E7) and/or another root; tempo orbs change the BPM.
- Delays use `__DT__`, a dotted eighth at the current tempo.

## Totals

| | Orbs |
|---|---|
| Sound orbs (play a part) | **622** |
| Combos (several orbs at once) | 91 |
| Moods (effect on every part, or mutes) | 50 |
| EQ moods (tone of every part) | 9 |
| Keys (12 roots × minor / major) | 24 |
| Tempos | 20 |
| **All** | **816** |

373 sound orbs play samples; the rest are synthesised (superdough synths, ZZFX chip sounds, noise).

## Sound orbs by category and family

A *family* is the machine or instrument an orb is played on (`familyOf` in `src/orbCatalog.js`).
Families decide how often an orb falls (see [Spawn balance](#spawn-balance)).

| Category | TR909 | TR808 | TR707 | TR606 | TR727 | RD6 | Kit | kitbreak | Bass guitar | Upright | Wurlitzer | Piano | Organ | Sampled (VCSL …) | Synth | ZZFX | Block FX | Other scales | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kick | 8 | 2 | 2 | 1 | – | 6 | 6 | – | – | – | – | – | – | 8 | 2 | 4 | – | – | **39** |
| snare | 5 | 4 | 4 | 2 | – | 3 | 8 | – | – | – | – | – | – | 9 | 1 | 4 | – | – | **40** |
| hat | 5 | 4 | 4 | 4 | 4 | 3 | 3 | – | – | – | – | – | – | 16 | 1 | 4 | – | – | **48** |
| perc | 2 | 5 | 6 | 4 | 2 | 1 | 4 | 1 | – | – | – | – | – | 30 | 1 | 4 | – | – | **60** |
| bass | – | – | – | – | – | – | – | – | 6 | 4 | – | 2 | 2 | 2 | 55 | 12 | – | 24 | **107** |
| pad | – | – | – | – | – | – | – | – | – | – | 3 | 4 | 4 | 15 | 25 | 7 | – | – | **58** |
| arp | – | – | – | – | – | – | – | – | – | – | 1 | 1 | 2 | 32 | 18 | 7 | – | 22 | **83** |
| lead | – | – | – | – | – | – | – | – | – | – | 1 | 3 | 3 | 38 | 31 | 12 | – | 20 | **108** |
| fx | 1 | 1 | 1 | 1 | 3 | 1 | 1 | – | – | – | – | – | – | 14 | 10 | 12 | 6 | – | **51** |
| texture | 1 | 2 | – | – | 1 | – | – | – | – | – | – | – | – | 12 | 7 | 5 | – | – | **28** |
| **Total** | 22 | 18 | 17 | 12 | 10 | 14 | 22 | 1 | 6 | 4 | 5 | 10 | 11 | 176 | 151 | 71 | 6 | 66 | **622** |

Families: drum machines are the self-hosted CC0 bank (TR-8 models of the 909/808/707/606/727 and an
RD-6), **Kit** the Big Rusty Drums acoustic kit, **kitbreak** an original break played on it.
**Sampled** covers VCSL instruments and other one-off samples; **Bass guitar**,
**Upright**, **Wurlitzer**, **Piano** (Salamander) and **Organ** (VCSL Renaissance and pipe organs) are pitched instruments with a sample per note
(`public/samples/SOURCES.md`, `src/licenses.js`). **Other scales** groups the orbs that play a
five- or six-note scale (see below), whatever instrument they use, so the set can be tuned as one.

## Pitch: what scale each orb uses

| Category | Scale `A?:minor` | Other scale | Chord progression | Sample `speed` only | No pitch | Total |
|---|---|---|---|---|---|---|
| bass | **83** | **24** | – | – | – | 107 |
| arp | **61** | **22** | – | – | – | 83 |
| lead | **88** | **20** | – | – | – | 108 |
| pad | **21** | – | **37** | – | – | 58 |
| fx | 13 | – | – | – | 38 | 51 |
| texture | 3 | – | 1 | – | 24 | 28 |
| kick | – | – | – | 9 | 30 | 39 |
| snare | – | – | – | 6 | 34 | 40 |
| hat | – | – | – | – | 48 | 48 |
| perc | – | – | – | 20 | 40 | 60 |
| **Total** | **269** | **66** | **38** | **35** | **214** | **622** |

- **Scale** — notes are scale degrees, `n("0 2 4 …").scale("A2:minor")`. The root is always **A**, only the
  octave differs: A1–A2 bass, A3 arps, A4–A5 melodies and pitched effects (laser, coin …).
- **Other scale** — five- and six-note scales whose notes all sit inside the frame's scale, so they
  never clash with the progression; each has a major partner it switches to under a major key orb:

  | Family | Under minor | Under major | Orbs (bass / arp / lead) | Character |
  |---|---|---|---|---|
  | pentatonic | minor pentatonic (A C D E G) | major pentatonic (A B C# E F#) | 5 / 5 / 4 | open, no half steps |
  | blues | minor blues (adds E♭) | major blues (adds C) | 5 / 4 / 4 | the blue note only on weak steps, as a passing tone |
  | japanese | hirajoshi (A B C E F) | ionian pentatonic (A C# D E G#) | 4 / 5 / 3 | half steps, koto-like |
  | suspended | egyptian (A B D E G) | ritusen (A B D E F#) | 4 / 3 / 4 | no third, floating |
  | malkos | malkos raga (A C D F G) | major pentatonic | 3 / 3 / 2 | minor sixth, no fifth: dark, heavy |
  | vietnamese | vietnamese 1 (A C D E F) | major pentatonic | 3 / 2 / 3 | minor sixth over the fifth: lyrical |

  Their lines are built bar by bar in that scale: on-beat notes are chord tones of the bar that the
  scale has, off-beat notes move along the scale (checked: every on-beat note of all 66 orbs, seeds 1–3,
  is a chord tone in both minor and major).
- **Chord progression** — `chord("<Am9 F^7 C^7 G6>").voicing()`; every pad works this way except the 14
  voiced pads of the line-variation batch, which spell each bar's chord tones as scale degrees (see below). All its notes
  are in A natural minor, so pads and scale orbs always agree.
- **Sample `speed`** — a kick, tom or snare sample played slightly higher or lower (`.speed(0.8–1.2)`).
  It colours the sound and is not tied to the key.
- **No pitch** — drums, noise and samples played as recorded.
- A **key orb** rewrites every `:minor"` to `:major"` and swaps the progression, or moves everything to
  another root. So the frame is always natural minor or major; the other-scale orbs pick notes from inside it.
  Modes that would change the frame (dorian, phrygian …) only appear in the song generator (`docs/GENRES.md`).

## Kinds of sound in each category

The `kind` label on each orb, grouped (counts in brackets where more than one).

| Category | Kinds |
|---|---|
| kick | 909 (5), RD6 (6 incl. a long one), Kit (6 incl. soft ones), concert bass drum (4), 808 (2), 707 (2), 606, dub (soft, low-passed) |
| snare | Kit (7), clap (6), 808 (4), 707 (4), RD6 (2), 606 (2), 909 (3), dub rim with echo |
| hat | 16th / 8th hats on every machine, cabasa (3), open hat, rides (909, 707, Kit), swung 16ths (dub techno) |
| perc | toms on every machine (incl. 606/Kit toms and tom fills ×5), 707/808/909 percussion, conga, bongo, darbuka, cajon, frame drum, timpani, anvil, brake drum, guiro, the chopped break |
| bass | other scales: pentatonic, blues, japanese, suspended, malkos, vietnamese (24, on saw, sine, square, triangle, FM, chip triangle, bass guitars, upright incl. a walking line); synth: saw (5), fm (4), dirty (4), square (3), triangle (3), sine (2), acid (3), wub/wobble (3), supersaw, sub; chip (ZZFX) (4); sampled: finger, finger long, staccato, upright, upright walk; dub sub |
| pad | chords on saw/supersaw (8), marimba (3), chip (3), Rhodes-like FM piano (2), piano (3), vibraphone, square, triangle; dub chord (2); Wurlitzer stabs / tremolo / lofi |
| arp | other scales (22: balafon, dan tranh, harp, vibraphone, handchimes, marimba, glockenspiel, clavisynth, FM piano, strumstick, tubular bells, kalimba-like FM, Wurlitzer, synths); xylophone (5), harp (4), sawtooth (3), balafon, vibraphone, sine, square (2 each), tubular bells (2), marimba, belltree, handchimes, strumstick, FM bells, Wurlitzer |
| lead | other scales (20: sax, saxello, recorders, dan tranh tremolo, xylophone, chip square / triangle, synths, Wurlitzer); recorder (7), sax (3), saxello (2), sawtooth (3), sine, triangle, xylophone (2 each), chip square / triangle / sawtooth, dan tranh, supersaw, square, whistle, Wurlitzer |
| fx | risers and a downlifter, crashes on each machine (6), chip effects (laser, coin, jump, zap ×2, invaders, bleep, space), boom, hoover, rave stab, whistle (2), quijada, flexatone, vibraslap, glitch; block FX: impact, sub drop, reverse crash, reverse snare, sweep up, sweep down |
| texture | vinyl crackle, dust, rain, clicks, bubbles, tinks, glass, bells, shimmer, hum, drone, didgeridoo, maracas, hat flicks, tape hiss |

## Helper orbs

| Kind | Count | What it does |
|---|---|---|
| Combo | 91 | Adds several orbs at once. Sizes: 2 (5), 3 (32), 4 (20), 5 (30), 6 (4). Includes one set per drum machine, key-themed sets, a drop (reverse crash + impact + sweep down), a dub techno groove (6) and two instrument sets (house, late-night jazz) |
| Mood | 50 | An effect appended to every part — four hand-made scenes (underwater, broken radio, cave, dizzy echo) and generated ones: muffled, thin, broken, crushed, talking (formant), wide, spinning (auto-pan), echo, breathing (filter LFO), swing, holes, 8-bit, and two-effect mixes — or a mute: drums only, no drums, no bass, no melody |
| EQ | 9 | Moods of the EQ sub-type (`eq: true`, category `mood`) that change only the tone: bass, sub and punch boosts, treble and air boosts, a smile curve (lows + highs), mids only (telephone), a low cut and a high cut. A part's own filter wins over the EQ's (`eqFx` in `src/orbPreset.js`) |
| Key | 24 | Every root A … G#, minor and major |
| Tempo | 20 | 70, 74, 78, 82, 86, 90, 96, 100, 104, 108 BPM (darker orbs) and 128, 132, 136, 140, 144, 148, 152, 160, 168, 174 BPM (paler orbs) |

How many of one kind can play at once: up to 3 leads, basses, percussion or FX, up to 3 moods and
3 EQ orbs (they stack apart), up to 4 tempo orbs, one of everything else (adding another replaces the oldest).

## How the catalogue is built

`LAYERS` is assembled in batches, each with its own random seed and appended after the previous ones,
so adding a batch never changes an existing orb's id, name or sound (saved presets refer to orbs by id).

| Batch | Function | What it adds |
|---|---|---|
| Hand-made | `HANDMADE` | 30 orbs: 19 core sounds (kick, clap, hats, bass lines, pad, piano, arp, lead, riser, crackle …), 2 tempos, 4 combos and 5 moods (underwater, broken radio, cave, dizzy echo, a drums-off breather) |
| 1st | `generateOrbs` | Drums on every machine, synth basses/pads/arps/leads, FX, textures, moods, tempos, combos |
| 2nd | `generateMore` | VCSL instruments, ZZFX chip sounds, more FX and textures |
| 3rd | `MODE_ORBS`, `generateModeCombos` | The 24 key orbs and key-themed combos |
| 4th | `generateMachines` | Rides, crashes, tom fills and the 707 kit; one combo per machine |
| 5th | `generateBlockFx` | 6 block FX + a drop combo (tag `spot`) |
| 6th | `generateDubTechno` | 7 dub techno parts + a combo (tag `dubtechno`) |
| 7th | `generateInstruments` | 5 sampled basses, 5 Wurlitzer orbs, 2 combos (tag `instruments`) |
| 8th | `generateScales` | 33 other-scale basses, arps and leads (tag `scales`, family `other scales`) |
| 9th | `generateScales(…, ALT_ORBS_2, 2619)` | 33 more: the malkos and vietnamese scales, and new instruments in the four older scale families (same tag and family) |
| 10th | `generateVariations` | 132 line variations: 36 basses, 22 chords, 24 arpeggios, 50 melodies (tag `variations`, see below) |
| 11th | `generateAcoustic` | 38 concert-percussion orbs: 6 hats, 14 percussion, 10 effects, 8 textures (tag `acoustic`, see below) |
| 12th | `generateVibes` | 81 chip / ambient / world orbs for every category (tag `vibes`, see below) |
| EQ | `EQ_ORBS` | 9 EQ moods (category `mood`, `eq: true`), appended last |

**Block FX** (`spot`) are accents: in the stem grid they get a single block (impacts and down-sweeps on
the drop's first block, reversed sounds and up-sweeps on the build-up's last block) and they fall rarely.

## Line variations (10th batch)

`generateVariations` (seed 2620) brings bass and lead to 100, pad to 50 and arp to 75. Each orb is a
line generator × an instrument (`VAR_BASS`, `VAR_PAD`, `VAR_ARPS`, `VAR_LEADS`); the kind line names both
(`bass · funk · finger`, `melody · call & response · harmonica`).

| Category | Line generators | Instruments |
|---|---|---|
| bass (36) | the song generator's bass rhythms (`composer.js`, tokens r/o/f/t over each bar's chord) in 11 styles: house, lofi, dnb, offbeat, rolling, drive, disco, funk, breaks, dub, tresillo; a TB-303 motif with slides and accents (`.velocity`); broken chords; walking (chord tones, then a step into the next root on beat 4); Euclidean rhythms; a riff with a fill in bar 4 | composer recipes (deep, rumble, pluck, reese, pulse, dub sub, acid …), FM, 8-bit, chip, pipe-organ pedal, piano, bass guitars, upright |
| pad (22) | `chord().voicing()` with the composer's chord rhythms (house, dub, trance gate, lofi, charleston, synthwave, skank, pluck), the fourth bar now and then on another; or *voiced*: each bar's chord tones as scale degrees, the nearest voicing above a fixed degree so the voices move little, with inversions, a left-hand root (ballad, stride) or a triad only | organs (Renaissance 4′/8′/full, pipe organ), bowed vibraphone, recorders, harmonica, piano, marimba, composer organ / dub chord / air pad / e-piano, brass, clav, saws |
| arp (24) | shapes up, down, alberti, pinky, converge, leap, pedal, wave, cascade over the bar's chord tones, played straight, as triplets, gated by a Euclidean rhythm, with ratchets, rotating one step per bar, or with every other note an octave up | glockenspiel, marimba, handchimes, clavisynth, balafon, folk harp, strumstick, piano, xylophones, organs, dan tranh, trance saw, square pluck, FM bell, chip, supersaw |
| lead (50) | a motif (rhythm + contour) fitted to each bar's chord: sequence (moved with the chord, an answer in bar 4), call & response, mirror (inverted, then backwards), offbeat (displaced by a step), octave answer, ornaments (grace notes, turns, trills between beats), hook (a half-bar riff twice), leaps between chord tones, 16th runs | ocarina-like flutes, harmonicas (Special 20, Super 64), tenor sax vibrato, saxello, recorders (soprano to bass), organs, dan tranh, bowed vibraphone, piano, composer leads (blip, saw, supersaw, FM, soft, bells), brass, PWM, sync, chip |

Checked in Node with Strudel (seeds 1–5, minor and major): every note is in the scale, every pad note
is a chord tone, and every on-beat note is a chord tone except the walking basses' approach note on
beat 4. VCSL instruments stored in folders with a comma in the name (kalimbas, ocarinas, psaltery, the
Kawai and Steinway pianos, the modern and rope-tension snares, shakers, hand bells, train whistle)
can't be used: Chromium refuses those files.

## Concert percussion (11th batch)

`generateAcoustic` (seed 2621, `PERC_ORBS`) uses the VCSL concert percussion no orb used yet:

| Category | Orbs |
|---|---|
| hat (6) | suspended-cymbal rides (stick, 8ths, offbeat, bell, soft bell), finger cymbal |
| perc (14) | two concert toms (stick, mallet, rim, rolls, a hi–low groove and a call), timpani (high, low, hand-tuned, rolls) |
| fx (10) | gong, gong scrape, big gong, clash cymbals, cymbal swells (2 and 4 bars, ending on the loop), siren, ball whistle |
| texture (8) | ocean drum (2), bowed cymbals (2), cymbal roll, timpani rumble; glass and bowed-vibraphone drones on each bar's root (and fifth) |

These recordings are quiet (several needed ×10–40 over the gains other orbs use), so the batch's
gains were set from the level tool and every orb sits within ±2 dB of its category median.

**tom_mallet fix:** `vcsl.json` lists `tom_mallet` without its top folder, so its two orbs (perc20,
perc24) never sounded. `loadSampleBanks` (`src/samples.js`) registers it again with the full paths.
perc20 had drawn the mallet roll, which its rhythm cuts off before it swells, so it now plays the
hardest mallet hit; both got a level trim.

## Chip, ambient and world (12th batch)

`orbTaste.js` sorts orbs into vibes (dance, organic, chip, ambient; world orbs fall outside the taste, see Spawn balance) and, when the player turns
orbs down, explores the vibes the song doesn't have. Chip and ambient were the smallest, and kick, snare and
hat had only dance and organic, so exploring the drums swung between those two. `generateVibes` (seed 2622,
`VIBE_DRUMS`, `VIBE_LINES`) adds 40 chip, 32 ambient and 9 world orbs:

| Category | Chip | Ambient | World |
|---|---|---|---|
| kick | ZZFX sine / triangle drops, crunch, noise thump | soft `sbd` heartbeat, sine kick with echo, bass drum in a big room | cajon bass, conga tumba, darbuka doum |
| snare | ZZFX noise, crushed noise, square tom-snare, tan | soft noise brush, woodblock echo, snap in a big room | darbuka tek, cajon slap, conga quinto slap |
| hat | noise 16ths, open, square tick, crushed | triangle shimmer, soft pink-noise air, wind chimes | agogo, bongo ghost notes, cajon ghost notes |
| perc | toms, cowbell, blips, bongo | glass taps, log drum echo, sine drops | – |
| bass / pad / arp / lead | 3 / 4 / 5 / 4 ZZFX lines | 4 / 4 / 3 / 4 soft, drone, air, echo, bowed lines | – |
| fx / texture | power-up, explosion, hit, warp / rain, bubbles, static, crickets | air swell, space drop, tubular bell and glass swells / air pad | – |

Chip drums play ZZFX on `freq`, not `note`, so a key orb never moves them. The lines reuse the tenth batch's
generators, and the kind labels carry the words `orbTaste` reads. Dominant vibe over all sound orbs after the
batch: dance 187, organic 185, world 96, ambient 81, chip 73 (before: 187 / 185 / 87 / 49 / 33). Since the
other-scale orbs take their vibe from their instrument (see Spawn balance), 66 of those world orbs moved:
dance 200, organic 215, ambient 98, world 36, chip 73. Those 36 world orbs are now left out of the taste.

## Spawn balance

Falling orbs are picked in two steps (`spawnWeights` in `src/orbs.js`):

1. **Category**, by a fixed share (`CAT_SHARE`: kick 28, snare 29, hat 31, perc 39, bass 34, pad 23,
   arp 28, lead 29, fx 27, texture 14, combo 87, mood 50, key 24, tempo 20). A category the song is
   missing counts 4×; combos, moods, keys and tempos count ¼×. Adding orbs to a category does **not**
   make it fall more often. Once the song has a mood, moods are held at a fixed **8%** of all drops
   (`MOOD_SHARE`) instead of the ¼×, since several are worth trying. Custom orbs don't fall at all (`CUSTOM_RAIN` 0): they show only in ✦ 커스텀 오브.
2. **Family** inside the category, weighted by **√(orbs in the family)**, then evenly inside the family.
   A big new family comes up somewhat more often but cannot crowd out the others (20 brush hats would
   take about 22% of hat drops, not 38%). Block FX fall at 0.15× their family weight. The other-scale
   orbs are one family per category held at **30%** of it (`SCALE_SHARE`), however many there are, times
   the taste's scale knob (below).
   EQ orbs are their own family inside the moods (√9 against √50), so about 30% of mood drops are EQ.
3. **Taste** (`src/orbTaste.js`), inside each category only, so the shares above never move:
   - Every sound orb has a **vibe** on four axes (dance, organic, chip, ambient), read from its
     family (`FAMILY_VIBE`) and words in its kind label (`WORDS`). Combos take their parts' average;
     drawn orbs take their instrument's. Other-scale orbs take the vibe of what they are played on (`inst`,
     read as the family `familyOf` would give that instrument): the scale is not a vibe. Moods, keys and tempos have none and are left alone (their
     drops keep the plain weights, and turning them down or putting them in changes nothing).
     An orb belongs to each vibe by the square of that component (a sine bass ≈ 0.4 dance, 0.6 ambient).
   - **Turn-downs** raise an exploration level `t` (0 … 1) and add to a penalty for each vibe of the orb:
     grabbed from the field and let go anywhere but the song (strong); heard on hover for ≥ 0.6 s
     and left (medium); tried in a slot (편집, 변주, 약하게 / 세게) and then sent back to the
     field (weak). An orb that fit the song counts more. Orbs that fall out the bottom and orbs put in
     the stash count for nothing. `t` halves every 45 s, the penalties every 60 s; putting an orb in
     keeps 30% of `t` and half the penalties.
   - **Scale knob**: turning down an other-scale orb adds to its own penalty (`scaleFull` 2.5, halving
     every 60 s) and counts only half towards `t` and its vibe, since it may be the scale that was not
     wanted. The family's 30% is cut by up to 70% (`scaleCut`): 22 / 13 / 9% after one, two, three strong
     turn-downs, 17% a minute later. Putting an other-scale orb in clears it; any other orb halves it.
     `level().scale` shows the factor.
   - **World orbs** (36: hand drums, balafon, dan tranh, strumstick, belltree, quijada, didgeridoo, the
     tresillo pluck): the words and families are also read on a world axis, and an orb whose strongest
     axis is world gets no vibe (`isWorld`). Too few for a vibe of their own (exploring would repeat them),
     they fall at their plain weight (step 2) whatever the player does, and turning them down or putting
     them in changes nothing, except the scale knob for the six world other-scale orbs. A little world
     in another orb (the TR727's 0.3) is left out of its vibe.
   - Each category first gets a **target share per vibe** (`targetShares`), so a vibe with many orbs
     doesn't win just by size:
     - *fit side*: the plain shares × `e^(1.6 × the vibe's share of the song)`, capped at 55% (or the
       plain share, when that is already higher);
     - *explore side*: even over the vibes the category has and the song lacks;
     - the two are mixed by `1 − (1 − t)²`; every vibe is cut by its penalty (to 15% at full), so
       turning down the new direction too moves on to the vibes not yet tried;
     - a vibe already falling on screen is divided by `1 + 0.15 × its orbs falling`.
   - Inside a vibe the orbs keep their plain weights, leaning (fading with `t`) towards the ones that fit
     the song: mean similarity, the cosine of vibes +0.35 for combo mates. The vibe's total doesn't move.
   - 12% of each category ignores taste, so nothing ever stops falling. Kept for the session only.

   Measured (sound drops, nothing falling): with a dance song (909 kick and hats, acid bass, supersaw
   chords) dance is 55% (43% without taste); after one strong turn-down of a fitting orb 33%, two 20%,
   three 14%, back to 35% 80 s later. No pitched category goes over 45% of one vibe while exploring.
   Two more turn-downs of organic orbs then moved the drops on to world, chip and ambient (26 / 15 / 13%; measured while world was still a vibe).
   Drums only have dance and organic orbs, so their exploring goes to the other of the two. Tuning lives
   in `TUNE`; in the dev console `__orbs.taste.level()` shows the current state.

## Levels

Each sound orb is matched to the **median loudness of its category** (K-weighted LUFS, rendered alone for
4 bars with variation seeds 1–3); `TRIM` in `src/orbCatalog.js` holds the corrections. Category medians:

| kick | snare | hat | perc | bass | pad | arp | lead | fx | texture |
|---|---|---|---|---|---|---|---|---|---|
| −17.6 | −27.6 | −26.0 | −25.8 | −25.2 | −27.9 | −32.4 | −31.6 | −35.0 | −45.1 |

Block FX follow the kick instead (impact and sub drop −3 dB, reversed sounds −8 dB, sweeps −10 dB).
All orbs (the other-scale batch included) sit within ±2 dB except three very quiet recordings (two concert bass drums and the guiro),
which the ×20 cap on corrections leaves a few dB under.

## Adding orbs

1. Add a batch in `src/orbCatalog.js` after the last one, with its own `rng` seed (`generateX(existing)`).
   New samples go in `public/samples` (see `tools/samples/`) and in `public/samples/SOURCES.md` and
   `src/licenses.js`.
2. Make sure `familyOf` puts the new orbs in a sensible family (add a sampled instrument to
   `INSTRUMENT_FAMILY`).
   Check its **vibe** too (`src/orbTaste.js`): a new family needs a line in `FAMILY_VIBE`, a new kind of
   sound a word in `WORDS`, or it falls as plain synth / sampled. The small vibes (chip, ambient)
   repeat the same orbs while exploring, so new orbs there are the most welcome. Per-vibe counts:
   `__orbs.LAYERS.filter((l) => l.code && !l.combo).reduce((t, l) => (__orbs.taste.memberOf(l)?.forEach((x, i) => (t[i] += x)), t), [0, 0, 0, 0])`
   (dance, organic, chip, ambient); `__orbs.taste.isWorld(l)` for the world orbs.
3. Open `/tools/orb-levels.html?run` on the dev server and paste the printed `TRIM` entries.
4. Listen with the test mode: `/?only=new` (or `?only=fx`, `?only=dub`, `?only=inst`, `?only=scale`, `?only=var`, `?only=ac`, `?only=vibe`, `?only=id1,id2`)
   drops only those orbs. Give new orbs a `tag` so they show up there.

## Recounting

On the dev server's orb page, in the browser console:

```js
const o = __orbs, sound = o.LAYERS.filter((l) => l.code && !['combo', 'mood', 'mode', 'tempo'].includes(l.cat));
console.table(Object.groupBy(sound, (l) => l.cat)); // per category
console.table(sound.reduce((t, l) => ((t[l.cat] ??= {})[l.family] = (t[l.cat][l.family] ?? 0) + 1, t), {})); // category × family
```
