# ORBRAVE

개 야무지게 순시간에 만들어버린 바이브코딩 하하

Live: https://r3coder.github.io/orbrave/

Build a set by throwing orbs into a player: each orb is one part (drums, bass, chords, leads, FX, moods, EQ …), and the whole set is live [Strudel](https://strudel.cc) (TidalCycles for JS) code that you can save as WAV or stems, share, or open on strudel.cc. Next to it, an endless player where an algorithm composes one song after another, so the music never ends.

- `index.html`: the orb page (main page). Its code: `src/orbs.js` (entry: toolbar and boot) and `src/orbs/*.js`, one file per feature (state, audio, guide, list, field, drag, variations, customOrbs, slots, presets, share, stems, visuals, search). They load in a chain, each importing the one before it first, so they run in the same order as one file; values more than one file changes live on `S` in `src/orbs/state.js`
- `play.html`: ∞ endless generative player
- `night-shift.html`: the hand-written track "Night Shift" (live-coding editor)

## How it works

| File | Role |
|---|---|
| `src/composer.js` | Seed (32-bit) → one full song. Genre, BPM, key/scale, chord progression, drums, bassline, melody, arpeggio, sounds, and **arrangement** (number of peaks, which sections sit between them, section lengths) are all random |
| `src/main.js` | Playback engine, UI (floating genre picker: click = next song, double-click = play now; volume ring; click a section block to jump; previous/next song, share), visualizer |
| `src/samples.js` | Sample bank loading + preloading of pitched instruments (all keys) |
| `src/render.js` + `render.html` | **Song download**: renders the current song to WAV offline in a hidden iframe. It's a separate Strudel instance, so live playback keeps going during the render (about 5–8x real time) |
| `src/i18n.js` | Korean / English / Japanese |
| `src/mixTrim.js` | **Mix balance table** (generated). Matches each sample's and each instrument's K-weighted loudness, puts each part per genre at its target level relative to the kick, and evens out loudness between genres |
| `tools/mix.html` | Dev-only tool that builds the table above. On the dev server, open `/tools/mix.html` → run all → paste the printed table into `src/mixTrim.js`. Rerun it after changing samples, sounds, or genres. Not included in the deployed build |
| `tools/orb-levels.html` | Dev-only level check for orbs. On the dev server, open `/tools/orb-levels.html?run`: every sound orb is rendered alone and compared with its category's median loudness (or the target an orb names with `level`), and the orbs to check (default: the newest batches) that are off get `TRIM` entries to paste into `src/orbCatalog.js`. Results are cached by orb code, so reruns only measure new or changed orbs. "new styles only" in `tools/mix.html` does the same for a new song genre |

- `tools/analyze/`: **Reference-track analyzer** (Python, local only). Splits real tracks you put in `analysis/tracks/<genre>/` into stems and saves statistics per genre: a 16-step hit grid, swing, BPM, key, stem loudness, and form (see below).
- `vite.config.js` patches superdough's node pool, which isn't keyed by AudioContext, so it can't reuse a node from another context. Without the patch, from the second WAV save onward some instruments would be silent.

- The same seed + genre always produces the same song. The URL `#<seed>.<genre>` is a share link.
- Every line of a song is placed at absolute cycle positions with `.sect(start, len)`. The live code always holds **the current song + the next song**, so the handoff happens with no gap at all. As soon as the next song starts, the song after it is generated and queued.
- Tempo also switches on the scheduler clock through a `cps` event at the song's start position.
- Genres (10): techno, house, acid, trance, dnb, breakbeat, lofi, synthwave, ambient, dubtechno. Each genre's drum grid, bass, progressions, sounds, and arrangement rules (with the sources they come from) are in [docs/GENRES.md](docs/GENRES.md)
- Orb page: 816 orbs (622 sound orbs plus combos, moods, EQ, keys and tempos) on one frame (124 BPM, A minor). Counts per category and sound family, the scale each orb uses, the batches the catalogue is built from, spawn balance, levels and how to add orbs are in [docs/ORBS.md](docs/ORBS.md)

## Development

```bash
npm install
npm run dev
```

## Reference-track analysis (`tools/analyze`)

A tool that pulls numbers from real tracks in each genre, used to tune the composer and mix targets. It isn't part of the deployed site.

**Not in the repo:** the whole `analysis/` folder (reference tracks, the multi-GB stem cache, and the results) and the venv (`tools/analyze/.venv/`, ~5 GB with CUDA PyTorch) are git-ignored. Create the venv yourself with the steps below; `analysis/` is created when you add tracks and run the analyzer.

Setup (Python 3.10–3.12, Windows, NVIDIA GPU; on CPU only, drop the `--index-url` and it just runs slower):

```bash
python -m venv tools/analyze/.venv
tools/analyze/.venv/Scripts/python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
tools/analyze/.venv/Scripts/python -m pip install -r tools/analyze/requirements.txt
```

Run it after putting tracks you own (wav/flac/mp3/ogg/aiff) in `analysis/tracks/<genre>/`. Use the same genre folder names as the composer (`techno`, `dnb` …):

```bash
tools/analyze/.venv/Scripts/python tools/analyze/analyze.py
```

| Step | How |
|---|---|
| Stem separation | Demucs `htdemucs_ft` → drums / bass / other / vocals (cached in `analysis/out/.cache`, reused on reruns) |
| Beats / downbeats | [beat_this](https://github.com/CPJKU/beat_this) → bar grid (4/4 assumed) |
| Drum grid | Spectral-flux onsets in the kick (30–120 Hz), snare (1.2–5 kHz), and hats (8–16 kHz) bands of the drum stem → probability of a hit on each of the 16 steps in a bar, velocity, swing |
| Bass | Onsets and pYIN pitch of the bass stem → step grid, notes per bar, scale-degree distribution, repeated-note / octave-jump ratios |
| Key | Krumhansl key profiles, plus how often each scale degree is used (useful for spotting modes) |
| Levels | K-weighted loudness (LUFS) of each stem → loudness relative to drums (a reference for the `TARGETS` in `tools/mix.js`) |
| Form | Per-bar stem energy → boundaries where the layer mix changes (snapped to 4-bar phrases) → intro / break / groove / peak / outro |

Per track it also reports one chord per bar (Roman numerals on the detected key) and the most common 4-bar loops, per-section stem level / brightness / attack / sustain (filter sweeps show up as rising brightness), and sidechain pumping depth. Tempo uses a per-genre BPM range to fix 2/3, 3/2, ½ and 2× tracker errors.

`tools/analyze/report.py` turns the output into per-genre data sheets in `analysis/genres/<genre>/data.md` (+ figures). The hand-written analysis of the current reference set (Creative Commons netlabel tracks, listed in `analysis/tracks/SOURCES.md`) is in `analysis/genres/README.md` (local only, not in the repo).

Output: `analysis/out/<genre>/profile.json` (genre aggregate), `<track>.json`, PNG plots, and a report in `analysis/out/index.html`. Patterns read as `x` = hit in 60%+ of bars, `o` = 25%+. Only statistics are written out; stems stay in the local cache. Nothing is downloaded from streaming services; use files you own.

Accuracy (checked against 12 songs this site generated, 2 each of techno/house/ukgarage/dnb/dubstep/breakbeat, where the true grid is known from the code):
- **BPM** was exact on all 12. The 16th grid is fitted to the drum hits, so tracker jitter and double-time sections don't affect it.
- **Hit probability per step**: mean error 0.13–0.16 (kick, snare, hats, bass). Straight genres (techno, house, dubstep) come out almost exact. UKG and DnB kicks have false hits from sub-bass bleed into the drum stem.
- **Section boundaries** mostly match within 4 bars. The 4-bar sections right before a drop (builds) are labelled `groove`.

Limits:
- Drum voices are told apart by frequency band and spectral shape, not by a trained transcription model, so snares, claps and rims count as one voice, and percussion lands in the hats row.
- Getting beat 1 of the bar wrong shifts the whole grid by one beat. In validation, 1–2 of the 12 songs came out one beat off, so check the plot when a pattern looks odd.
- For more accurate drum transcription, you can add a trained model such as [ADTOF](https://github.com/MZehren/ADTOF). Its model license is CC BY-NC-SA, so check that it fits your use.

## Build and deploy

```bash
npm run build
```

Upload the whole `dist/` folder (including `render.html`, which the save feature uses) to any static hosting (Nginx, Apache, S3, Cloudflare Pages, Netlify, GitHub Pages, etc.). The site itself needs no server; only preset sharing uses the API below. Asset paths are relative (`base: './'`), so it also works under a sub-path like `example.com/algorave/`.

### GitHub Pages

`.github/workflows/deploy.yml` builds and deploys on every push to `main`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**. The site appears at `https://r3coder.github.io/orbrave/`.

GitHub Pages is static only, so the preset API runs separately on `https://r3c0d3r.mooo.com/orbrave/api` (set in `.env.production` as `VITE_PRESET_API`; dev still uses the built-in `/api`). If that server is down, the player quietly falls back to generated songs; only sharing fails.

### Preset server (`r3c0d3r.mooo.com`)

The API needs only the `server/` folder (no dependencies, Node 18+); the site's static files come from GitHub Pages.

```bash
PORT=3800 HOST=127.0.0.1 TRUST_PROXY=1 PRESET_DATA_DIR=./data PRESET_ALLOWED_ORIGINS=https://r3coder.github.io node server/index.mjs
```

- `PRESET_ALLOWED_ORIGINS` lists the sites allowed to call the API (CORS + share POSTs), comma-separated, origin only (no repo path).
- It must be served over **HTTPS**: a Pages (https) page can't call an http API (mixed content).
- Nginx (TLS) forwards a sub-path to the server's `/api/`, inside the existing `server_name r3c0d3r.mooo.com` block:

  ```nginx
  location /orbrave/api/ {
      client_max_body_size 64k;
      proxy_pass http://127.0.0.1:3800/api/;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
  ```

  Presets are stored as JSON files in `PRESET_DATA_DIR` (default `server/data/`).

- Admin page (list / delete uploaded songs and custom orbs): served by this server itself at `/admin/` (`server/admin/`, not part of the site build, so it is not on GitHub Pages). Set `ADMIN_TOKEN=<password>` to turn it on, and forward it next to the API:

  ```nginx
  location /orbrave/admin/ {
      proxy_pass http://127.0.0.1:3800/admin/;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
  ```

  Then open `https://r3c0d3r.mooo.com/orbrave/admin/`. The admin API only takes requests from that same origin.

Nginx example:

```nginx
server {
  listen 80;
  server_name algorave.example.com;
  root /var/www/infinite-algorave/dist;
  location / { try_files $uri $uri/ /index.html; }
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
}
```

Notes:
- **Use HTTPS.** Browser audio features (AudioWorklet, clipboard) only work in a secure context (HTTPS or localhost).
- Samples (`src/samples.js`):
  - **Drums are self-hosted** in `public/samples/` (about 12.5 MB of FLAC; the ~2 MB of `fx_*` and ~2.5 MB of pitched instruments load only when an orb that plays them is picked; copied to `dist/samples/`), all **CC0** except the Wurlitzer. Sources, and what was left out and why, are in [public/samples/SOURCES.md](public/samples/SOURCES.md):
    - [MckAudio/MckSamplePacks](https://github.com/MckAudio/MckSamplePacks): TR-8 recordings of the 909/808/707/606/727 voices (banks `TR909` … `TR727`) and an analog RD-6 (`RD6`)
    - [Karoryfer Big Rusty Drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums): acoustic kit (`Kit`), plus `kitbreak`, an original break played on that kit and cut into 32 slices (it replaces the Amen break)
    - `fx_*`: impacts, sub drops, reversed crashes/snares and sweeps made by this project (`tools/samples/build_fx.py`), sized to the orb page's 4-bar blocks
    - Pitched instruments for the orb page (`tools/samples/build_pitched.py`): bass guitars `swagbass` and `growlybass` (Karoryfer Samples, CC0), `uprightbass` (D. Smolken, CC0), and the `wurli` Wurlitzer EP200 by Greg Sullivan (**CC BY 3.0, attribution required**, shown in the site's credits)
    - To rebuild: `node tools/samples/download.mjs <dir>`, then `tools/analyze/.venv/Scripts/python -I tools/samples/build_bank.py <dir> public/samples` and `... -I tools/samples/build_fx.py public/samples` and `build_pitched.py <dir> public/samples` (they add their keys back to `strudel.json`). `tools/samples/trims.py` recomputes the per-sample loudness trims without a browser
  - Loaded at runtime from GitHub raw (if your server sets a CSP, allow `raw.githubusercontent.com` in `connect-src`):
    - [VCSL](https://github.com/sgossner/VCSL) (CC0): marimba, kalimba, conga, shakers, steinway and more
    - [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3), Alexander Holm (**CC-BY 3.0, attribution required**, shown in the site's credits)
    - Maps (json) come from [felixroos/dough-samples](https://github.com/felixroos/dough-samples)
- Font: [Dalmoori (달무리)](https://github.com/RanolP/dalmoori-font) by RanolP, Apache-2.0. Font files and license are in `public/fonts/`.
- **License:** Strudel is AGPL-3.0, so if you deploy this publicly you must make this site's source code available to users too (for example, a public repo link in the footer). That's why `package.json` is also set to AGPL-3.0-or-later.
