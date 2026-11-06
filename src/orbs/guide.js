// The step-by-step guide (tools come out one by one) and the first-visit hints. tutorial.js draws the notes.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { VA0, VOL_DEFAULT, VR, VSWEEP, drawVolume, nowCycle, setVolume, volFocus, volRing, volValue, volume, vpt } from './audio.js';
import { getAudioContext } from '@strudel/web';
import { LAYERS, byId } from '../orbCatalog.js';
import { ot } from '../orbsI18n.js';
import { isPhone } from '../phoneLayout.js';
import {
  spotlight, banner, busy as tutBusy, onIdle as onTutIdle, dismissAll as tutDismissAll,
} from '../tutorial.js';
import { $, S, active, forget, ui } from './state.js';
import { instant, onlyIds, pickX, rain, rainAdd } from './field.js';
import { bump, coreCenter, slotEls } from './drag.js';
import { freshOrb, rootOf } from './slots.js';

// ---------- tutorial: tools show up one by one as the player goes ----------
// Counted from the player's own moves only (presets and the restored session don't count):
// `thrown` = orbs put into the song, `moves` = orbs put in or taken out. Each step unlocks a part
// of the page (a body class) and points at it once (tutorial.js spotlight: the rest dims for a
// moment), except the preset step, which keeps a note under the title instead.
//   1  the combo note is over         the stash on the right (nothing new unlocks: it is always there)
//   2  5 thrown / 1 min after 1        the slots under the field, only 약하게 / 세게 live    (.roll-ready)
//   3  7 thrown / 1 min after 2        the 변주 slot comes alive (✎ 악보 with it)               (.midi-ready)
//   4  9 thrown / 1 min after 3        "save it as a preset" under the title, until a preset is saved or 4 more moves
//   5  preset saved / 15 moves / 1 min without a change after 4
//                                    loop WAV / loop share / server share                      (.share-ready)
//   6  one of those used / 3 more thrown / 30 s after 5
//                                    the Strudel code links; 📂 스템 열기 and the 🎛 편집 slot
//                                    come out quietly with it                                  (.song-ready)
//   7  3 min of playing after 6 without opening the stems: points at 📂 스템 열기
//      (opening the stems first skips this note)
//   8  the stems opened (wide screens): what stem mode is, ? for more, ↩ 루프 모드로 to go back
// A step never starts while another note is still up (tutorial.js busy): it waits its turn.
// The progress is remembered across reloads; the volume-knob tip after the first orb is separate.
const TUT_KEY = 'orbTutorial';
const IDLE_MS = 60_000, SONG_AFTER_MS = 180_000, CODE_AFTER_MS = 30_000;
// steps 2–4 also come by themselves this long after the step before
const STEP_AFTER_MS = 60_000;
const stepTimeUp = () => Date.now() - tut.at >= STEP_AFTER_MS;
// played: ms the song has been playing with the page in view (counted by the 2 s check below)
const tut = { step: 0, thrown: 0, moves: 0, thrownAt: 0, movesAt: 0, at: 0, banner: false, bannerMoves: 0, used: false, combo: false, played: 0, playedAt: 0 };
try {
  Object.assign(tut, JSON.parse(localStorage.getItem(TUT_KEY)) ?? {});
  // from before the step-by-step guide: the slots, or everything, were already out
  if (!tut.step && localStorage.getItem('orbToolsReady')) tut.step = 6;
  else if (!tut.step && localStorage.getItem('orbRollReady')) tut.step = 3;
} catch {}
if (tut.step >= 1) tut.combo = true; // got past the combo note before it existed
// Combo orbs stay out of the rain until the volume-knob tip after the first orb has run; then
// one combo is dropped on purpose and, a quarter of the way down the field, it stops and gets
// explained (tut.combo). The stash note (step 1) follows straight after.
// The mouse resting on any combo orb (field, stash, slot, search) before then explains it on the spot.
S.comboDue = false; // the volume tip is over: drop the combo
S.comboOrb = null; // the rain entry of that combo while it falls
let comboTelling = false; // the combo note is up or queued
const comboHeld = () => !tut.combo && !onlyIds;
// o: a rain entry (it waits in place while the note is up), or el: any other orb's ball
function explainCombo(o, el = null) {
  if (tut.combo || comboTelling) return;
  comboTelling = true;
  if (o) {
    o.told = true;
    o.hold = true;
  }
  // a rain orb's element has no size (its parts hang off its centre): point at the ball
  spotlight(() => (o ? o.el.querySelector('.ball') ?? o.el : el), ot('tutCombo'), {
    onDone: () => {
      if (o) o.hold = false;
      S.comboOrb = null;
      comboTelling = false;
      // the orb was gone before the note could show (it waited behind another): keep it for next time
      if (!(o ? o.el : el)?.isConnected) return;
      tut.combo = true;
      saveTut();
      tutCheck();
    },
  });
}
function hoverCombo(id, el) {
  if (tut.combo || comboTelling || !byId[id]?.combo) return;
  const o = rain.find((r) => r.id === id);
  explainCombo(o ?? null, o ? null : el);
}
function dropCombo(size) {
  const shown = new Set(rain.map((q) => rootOf(q.id)));
  const pool = LAYERS.filter((l) => l.combo && !shown.has(l.id) && !l.combo.every((c) => active.has(c)) && (!S.opening || instant(l)));
  if (!pool.length) return null;
  const id = freshOrb(pool[Math.floor(Math.random() * pool.length)].id);
  forget(id);
  rainAdd(id, pickX(size.w), -40);
  return rain.at(-1);
}
const saveTut = () => {
  try {
    localStorage.setItem(TUT_KEY, JSON.stringify(tut));
  } catch {}
};
let lastChange = Date.now(); // the last orb put in or taken out (this visit)
// the ⇪ button on a phone (one of two, whichever shows), else the loop's save / share row
const shareTarget = () => [...document.querySelectorAll('.m-export-btn')].find((b) => b.getBoundingClientRect().width) ?? $('wavBtn').parentElement;
// several elements as one spotlight target: the spotlight only reads its box
const unionBox = (ids) => ({
  getBoundingClientRect() {
    const rs = ids.map((id) => $(id).getBoundingClientRect()).filter((r) => r.width);
    if (!rs.length) return new DOMRect();
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    return new DOMRect(l, t, Math.max(...rs.map((r) => r.right)) - l, Math.max(...rs.map((r) => r.bottom)) - t);
  },
});
// 코드 · (직접수정) strudel.cc · 라이선스
const codeLinks = unionBox(['codeToggle', 'strudelBtn', 'licenseBtn']);
const TUT = [
  null,
  { when: () => tut.combo, show: () => spotlight(ui.stash, ot(isPhone.matches ? 'tutStashPhone' : 'tutStash'), { wait: 300 }) },
  {
    // the slots come out with only 약하게 / 세게 live (변주 and 🎛 편집 stay dimmed for now;
    // a phone has had the row all along)
    when: () => tut.thrown >= 5 || stepTimeUp(), cls: 'roll-ready',
    show: () => {
      if (!isPhone.matches) bump(ui.slots, 'intro');
      spotlight(unionBox(['slotQuieter', 'slotLouder']), ot('tutSlots'), { wait: isPhone.matches ? 500 : 800 });
    },
  },
  {
    // 변주 comes alive, ✎ 악보 beside it
    when: () => tut.thrown >= 7 || stepTimeUp(), cls: 'midi-ready',
    show: () => {
      bump(slotEls.vary, 'intro');
      spotlight($('varyWrap'), ot('tutVary'), { wait: 700 });
    },
  },
  {
    when: () => tut.thrown >= 9 || stepTimeUp(),
    show: () => {
      tut.banner = true;
      tut.bannerMoves = tut.moves;
      const el = banner(ot(isPhone.matches ? 'tutPresetPhone' : 'tutPreset'));
      // dim everything but the preset bar (📁 on a phone) for a moment, banner kept lit
      spotlight(() => (isPhone.matches ? document.querySelector('.m-presets-btn') : $('presetbar')), null, { wait: 400, lift: [el] });
    },
  },
  {
    when: () => tut.used || tut.moves >= 15 || Date.now() - Math.max(lastChange, tut.at) >= IDLE_MS, cls: 'share-ready',
    show: () => spotlight(shareTarget, ot('tutShare'), { wait: 500 }),
  },
  {
    // the set is Strudel code underneath: where to see it, and to take it to strudel.cc
    // (on a phone those links sit in the ⋯ menu, so the note points at that)
    // 📂 스템 열기 and the 🎛 편집 slot come out with it, without a note of their own.
    when: () => tut.used || tut.thrown >= tut.thrownAt + 3 || Date.now() - tut.at >= CODE_AFTER_MS, cls: 'song-ready',
    show: () => isPhone.matches
      ? spotlight(() => document.querySelector('.m-menu-btn'), ot('tutCodePhone'), { wait: 500 })
      : spotlight(codeLinks, ot('tutCode'), { wait: 500 }),
  },
  {
    // 📂 스템 열기 has been out since 6 and still not opened after 3 min of playing: point at it.
    // Opening the stems before then skips this note (tutEvent). The stems are for wide screens:
    // on a phone the button stays hidden and this just passes.
    when: () => tut.played - tut.playedAt >= SONG_AFTER_MS,
    show: () => isPhone.matches || spotlight($('stemReopen'), ot('tutSong'), { wait: 500 }),
  },
  {
    // the stems were opened: what stem mode is, ? for more, and the way back to the loop
    when: () => tut.used && document.body.classList.contains('stem-open'),
    show: () => spotlight(unionBox(['stemHelp', 'stemClose']), ot('tutStemClose'), { wait: 600 }),
  },
];
const TUT_LAST = TUT.length - 1;
// v2 put the Strudel-code note (6) before the stems (now 7): progress saved before that moves up
// one past 6, so the stems button a returning visitor already had stays out
if (!tut.v) {
  if (tut.step >= 6) tut.step++;
  tut.v = 2;
  saveTut();
}
for (let i = 1; i <= tut.step && i <= TUT_LAST; i++) if (TUT[i].cls) document.body.classList.add(TUT[i].cls);
function tutCheck() {
  // the preset note goes once a preset is saved or after four more moves
  if (tut.banner && (tut.step > 4 || tut.moves >= tut.bannerMoves + 4)) {
    tut.banner = false;
    banner(null);
    saveTut();
  }
  const s = TUT[tut.step + 1];
  // one note at a time: a step that is due waits until the note on screen has gone
  if (!s || tutBusy() || !s.when()) return;
  tut.step++;
  Object.assign(tut, { at: Date.now(), thrownAt: tut.thrown, movesAt: tut.moves, playedAt: tut.played, used: false });
  if (s.cls) document.body.classList.add(s.cls);
  saveTut();
  s.show();
  tutCheck(); // the banner may go with this step
}
// what the steps wait for besides orbs: a preset saved (step 5), a save / share button used
// (step 6), the stems opened (step 8; opened during 6, the 📂 note (7) is skipped)
function tutEvent(name) {
  if (name === 'stems' && tut.step === 6) {
    Object.assign(tut, { step: 7, at: Date.now(), thrownAt: tut.thrown, movesAt: tut.moves, playedAt: tut.played });
  }
  if ((name === 'preset' && tut.step === 4) || (name === 'share' && tut.step === 5) || (name === 'stems' && tut.step === 7)) {
    tut.used = true;
    saveTut();
    tutCheck();
  }
}
setInterval(() => {
  if (tut.step >= TUT_LAST || document.hidden) return;
  if (S.playing) {
    tut.played += 2000;
    saveTut();
  }
  tutCheck();
}, 2000);
// a step held back by a note on screen comes as soon as that note has gone
onTutIdle(() => tut.step < TUT_LAST && tutCheck());
// skip ahead to step n without pointing at anything (n = TUT_LAST: everything out at once)
function tutUpTo(n) {
  for (let i = 1; i <= n; i++) if (TUT[i].cls) document.body.classList.add(TUT[i].cls);
  if (tut.step >= n) return;
  Object.assign(tut, { step: n, at: Date.now(), thrownAt: tut.thrown, movesAt: tut.moves, playedAt: tut.played, used: false });
  if (n > 4) tut.banner = false, banner(null);
  saveTut();
}
const revealRoll = () => tutUpTo(TUT_LAST);

function countMove(n = 1) {
  tut.moves += n;
  lastChange = Date.now();
  saveTut();
  tutCheck();
}

// ---------- first visit: throw hint, then the volume tip ----------

// Until the first orb ever goes into the song, the hint stays up and a see-through orb keeps
// flying from the field into the player. The first orb then wiggles the volume dial for 2s with
// a "turn the knob" tip that fades out. Remembered across reloads, so all of it shows once.
const FIRST_ORB_KEY = 'orbFirstOrb';
let firstOrbDone = false;
try {
  firstOrbDone = !!localStorage.getItem(FIRST_ORB_KEY);
} catch {}
S.ghostTimer = 0;
function ghostThrow() {
  S.ghostTimer = 0;
  if (firstOrbDone) return;
  const f = ui.field.getBoundingClientRect();
  const c = coreCenter();
  if (f.width && f.height && !document.hidden) {
    const el = document.createElement('i');
    el.className = 'ghost-orb';
    // a new colour each throw, from anywhere in the field
    el.style.setProperty('--acc', `hsl(${Math.floor(Math.random() * 360)} 85% 62%)`);
    document.body.append(el);
    const x0 = f.left + f.width * (0.12 + Math.random() * 0.76), y0 = f.top + f.height * (0.12 + Math.random() * 0.7);
    // a slight arc, like a throw: up a little on the way, then into the player
    const mx = (x0 + c.x) / 2, my = Math.min(y0, c.y) - 40;
    const at = (x, y, s) => `translate(${x}px, ${y}px) scale(${s})`;
    el.animate([
      { transform: at(x0, y0, 1), opacity: 0 },
      { transform: at(x0, y0, 1.05), opacity: 0.45, offset: 0.2 },
      { transform: at(mx, my, 0.95), opacity: 0.45, offset: 0.6 },
      { transform: at(c.x, c.y, 0.6), opacity: 0 },
    ], { duration: 1600, easing: 'ease-in-out' }).finished.then(() => el.remove(), () => el.remove());
  }
  S.ghostTimer = setTimeout(ghostThrow, 2600);
}
function showVolumeTip() {
  // dial and sound: slowly down to 15% of where it was, then back up to the default 60% over 5s,
  // so the change is heard. Touching the dial (setVolume) ends the demo at once.
  const t0 = performance.now();
  const from = volValue, low = volValue * 0.15;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 5000);
    const e = 0.5 - 0.5 * Math.cos((k < 0.5 ? k * 2 : k * 2 - 1) * Math.PI); // eases 0→1 in each half
    const v = k < 0.5 ? from + (low - from) * e : low + (VOL_DEFAULT - low) * e;
    if (k >= 1) return setVolume(VOL_DEFAULT);
    drawVolume(v);
    ui.sats.style.setProperty('--neon', Math.sin(k * Math.PI).toFixed(3)); // brightest at the quietest
    volume?.gain.setTargetAtTime(v * v * 1.25, getAudioContext().currentTime, 0.03);
    S.volDemo = requestAnimationFrame(step);
  };
  cancelAnimationFrame(S.volDemo);
  document.body.classList.add('vol-demo');
  S.volDemo = requestAnimationFrame(step);
  const r = volRing.getBoundingClientRect();
  if (!r.width) return;
  volFocus(5000); // the note is up ~5s (volTip keyframes)
  const tip = document.createElement('div');
  tip.className = 'vol-tip';
  tip.textContent = ot('volHint');
  // bottom-right of the player, just past the dial's end where the knob lives
  const [ex, ey] = vpt(VA0 + VSWEEP, VR + 14);
  tip.style.left = r.left + (ex / 240) * r.width + 'px';
  tip.style.top = r.top + (ey / 240) * r.height + 'px';
  document.body.append(tip);
  const over = tip.getBoundingClientRect().right - (innerWidth - 8);
  if (over > 0) tip.style.left = parseFloat(tip.style.left) - over + 'px';
  tip.addEventListener('animationend', (e) => e.animationName === 'volTip' && tip.remove());
}
// = pressed three times quickly (not while typing): the whole guide is skipped at once — the
// first-orb hint and volume tip, the combo note and every step, with all their tools out
function skipTutorial() {
  clearTimeout(S.ghostTimer);
  S.ghostTimer = 0;
  if (!firstOrbDone) {
    firstOrbDone = true;
    document.body.classList.add('first-orb-done');
    try {
      localStorage.setItem(FIRST_ORB_KEY, '1');
    } catch {}
  }
  if (S.comboOrb) S.comboOrb.hold = false;
  S.comboOrb = null;
  S.comboDue = true;
  tut.combo = true;
  tut.banner = false;
  tutUpTo(TUT_LAST);
  saveTut();
  // after the step is at the end: the dropped notes' callbacks then find nothing left to show
  tutDismissAll();
}
let eqPresses = [];
addEventListener('keydown', (e) => {
  if (e.key !== '=' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const now = performance.now();
  eqPresses = eqPresses.filter((at) => now - at < 800);
  eqPresses.push(now);
  if (eqPresses.length < 3) return;
  eqPresses = [];
  skipTutorial();
});
// boot: a restored session with orbs already counts as done (no tip on load)
function checkFirstOrb({ boot = false } = {}) {
  if (firstOrbDone || !active.size) return;
  firstOrbDone = true;
  document.body.classList.add('first-orb-done');
  clearTimeout(S.ghostTimer);
  try {
    localStorage.setItem(FIRST_ORB_KEY, '1');
  } catch {}
  if (!boot) {
    afterFirstSound(() => {
      if (tut.step >= TUT_LAST) return; // the guide was skipped (= = =) before it sounded
      showVolumeTip();
      setTimeout(() => (S.comboDue = true), 6500); // once the tip has faded
    });
    setTimeout(() => (S.comboDue = true), 30_000); // the tip was skipped (song emptied before it sounded)
  }
}
// Wait until the song is playing and has reached the bar the first orb comes in on, then let it
// be heard for a moment before running fn (the dip has to start from the song already sounding).
function afterFirstSound(fn) {
  const at = Math.min(...[...active.values()].map((a) => a.at ?? 0));
  const wait = () => {
    if (!active.size) return; // emptied again before it ever sounded: skip the tip
    if (S.playing && S.repl && nowCycle() >= at) setTimeout(fn, 1200);
    else setTimeout(wait, 100);
  };
  wait();
}
if (firstOrbDone) document.body.classList.add('first-orb-done');

export {
  FIRST_ORB_KEY, TUT_KEY, checkFirstOrb, comboHeld, countMove, dropCombo, explainCombo, firstOrbDone,
  ghostThrow, hoverCombo, revealRoll, tut, tutEvent,
};
