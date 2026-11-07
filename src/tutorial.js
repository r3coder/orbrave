// First-visit guide UI for the orb page: a spotlight that dims everything but one part of the
// screen for a few seconds with a short note beside it, and a banner under the title that stays
// up until orbs/guide.js takes it down. When each one shows is decided in orbs/guide.js ("tutorial" section);
// this file only draws them. Nothing here takes clicks: the page keeps working underneath.

const SHOW_MS = 8000; // a spotlight goes away by itself after this…
const GRACE_MS = 1200; // …or on the first press anywhere once it has been up this long

const queue = [];
let current = null;
let idleCb = null;

// True while a spotlight is up or waiting its turn: the next guide step holds back until it is
// over, so two notes never share the screen. onIdle(fn) runs fn each time the last one has gone.
export const busy = () => !!current || queue.length > 0;
export function onIdle(fn) {
  idleCb = fn;
}

// Dim the screen except `target` (an element, or a function returning one, so a target moved by
// the phone layout is looked up when it shows) and put `text` next to it. Spotlights queue up.
// `wait`: ms to let the target finish sliding in before it is measured. `onDone` runs once it has
// gone (or was skipped). A null `text` dims without a note; `lift` (elements) stay bright above
// the dimming while it is up, e.g. the banner that already says what to do.
export function spotlight(target, text, { wait = 0, onDone = null, lift = [] } = {}) {
  queue.push({ target, text, wait, onDone, lift });
  if (!current) next();
}

function next() {
  const item = queue.shift();
  if (!item) {
    idleCb?.();
    return;
  }
  current = item;
  setTimeout(() => show(item), item.wait);
}

// Take every note down at once: the one on screen fades, the queued ones never show (their onDone
// still runs, so whatever waited on them lets go), and the banner goes. Used by the guide skip.
export function dismissAll() {
  const waiting = queue.splice(0);
  for (const item of waiting) item.onDone?.();
  if (current) {
    if (current.close) current.close();
    else current.cancelled = true; // still in its `wait`: show() drops it
  }
  banner(null);
}

function show(item) {
  if (item.cancelled) {
    current = null;
    item.onDone?.();
    next();
    return;
  }
  const el = typeof item.target === 'function' ? item.target() : item.target;
  const r0 = el?.getBoundingClientRect();
  // nothing to point at (hidden on this layout): skip it
  if (!r0 || !r0.width || !r0.height) {
    current = null;
    item.onDone?.();
    next();
    return;
  }
  const hole = document.createElement('div');
  hole.className = 'tut-hole';
  const tip = document.createElement('div');
  tip.className = 'tut-tip';
  tip.setAttribute('role', 'status');
  tip.textContent = item.text ?? '';
  if (item.text == null) tip.hidden = true;
  document.body.append(hole, tip);
  const lifted = item.lift.map((x) => (typeof x === 'function' ? x() : x)).filter(Boolean);
  lifted.forEach((x) => x.classList.add('tut-lift'));

  // follow the target while it is up (layouts move: slots slide in, the window is resized)
  let raf = 0;
  const place = () => {
    const r = el.getBoundingClientRect();
    const pad = 8;
    Object.assign(hole.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
    });
    // the note: above the target if there is room, else below, else beside it (tall targets)
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 16;
    let x = r.left + r.width / 2 - tw / 2, y;
    if (r.top - pad - gap - th >= 8) y = r.top - pad - gap - th;
    else if (r.bottom + pad + gap + th <= innerHeight - 8) y = r.bottom + pad + gap;
    else {
      y = r.top + r.height / 2 - th / 2;
      x = r.left - pad - gap - tw >= 8 ? r.left - pad - gap - tw : r.right + pad + gap;
    }
    tip.style.left = `${Math.max(8, Math.min(innerWidth - tw - 8, x))}px`;
    tip.style.top = `${Math.max(8, Math.min(innerHeight - th - 8, y))}px`;
    raf = requestAnimationFrame(place);
  };
  place();
  requestAnimationFrame(() => {
    hole.classList.add('on');
    tip.classList.add('on');
  });

  const shownAt = performance.now();
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    removeEventListener('pointerdown', onPress, true);
    hole.classList.remove('on');
    tip.classList.remove('on');
    setTimeout(() => {
      lifted.forEach((x) => x.classList.remove('tut-lift'));
      cancelAnimationFrame(raf);
      hole.remove();
      tip.remove();
      current = null;
      item.onDone?.();
      next();
    }, 400);
  };
  const onPress = () => performance.now() - shownAt > GRACE_MS && close();
  item.close = close;
  const timer = setTimeout(close, SHOW_MS);
  addEventListener('pointerdown', onPress, true);
}

// The banner under the title (no dimming). banner(text) shows or updates it, banner(null) hides it.
let bannerEl = null;
export function banner(text) {
  if (!text) {
    if (!bannerEl) return;
    const el = bannerEl;
    bannerEl = null;
    el.classList.remove('on');
    setTimeout(() => el.remove(), 400);
    return;
  }
  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.className = 'tut-banner';
    bannerEl.setAttribute('role', 'status');
    document.body.append(bannerEl);
    requestAnimationFrame(() => bannerEl?.classList.add('on'));
  }
  bannerEl.textContent = text;
  return bannerEl;
}

// A step-by-step tour the player walks through themselves (the stems' ? button): the same dimming
// and note as a spotlight, but the note has a title, "n / N" and ◀ / ▶ / ✕, and stays up until
// closed. While it is up a clear layer keeps clicks off the page (the parts it points at are only
// shown, not pressed). ← / → / Enter step, Esc closes.
// steps: [{ target, title, text }] — target: an element, an array of them (pointed at together),
// or a function returning either, looked up when the step shows; a step with nothing on screen
// to point at is passed over. labels: { prev, next, done, close }.
let tourEnd = null;
export function tour(steps, labels) {
  tourEnd?.();
  const els = (s) => {
    const t = typeof s.target === 'function' ? s.target() : s.target;
    return (Array.isArray(t) ? t : [t]).filter((e) => e?.isConnected && e.getBoundingClientRect().width);
  };
  const box = (list) => {
    const rs = list.map((e) => e.getBoundingClientRect());
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    return new DOMRect(l, t, Math.max(...rs.map((r) => r.right)) - l, Math.max(...rs.map((r) => r.bottom)) - t);
  };
  // the steps that have something to point at right now (looked up again on each move)
  const live = () => steps.filter((s) => els(s).length);
  const catcher = document.createElement('div');
  catcher.className = 'tut-catch';
  const hole = document.createElement('div');
  hole.className = 'tut-hole';
  const tip = document.createElement('div');
  tip.className = 'tut-tip tut-tour';
  tip.setAttribute('role', 'dialog');
  tip.innerHTML = `<div class="tour-head"><b class="tour-title"></b><button type="button" class="ghost tour-x"></button></div>
    <p class="tour-text"></p>
    <div class="tour-foot"><span class="tour-n"></span><button type="button" class="ghost tour-prev"></button><button type="button" class="tour-next go"></button></div>`;
  const q = (c) => tip.querySelector(c);
  q('.tour-x').textContent = '✕';
  q('.tour-x').setAttribute('aria-label', labels.close);
  q('.tour-prev').textContent = labels.prev;
  document.body.append(catcher, hole, tip);

  let step = null, raf = 0;
  const go = (d) => {
    const list = live();
    if (!list.length) return end();
    const at = step ? list.indexOf(step) : -1;
    const i = at < 0 ? 0 : at + d;
    if (i >= list.length) return end();
    step = list[Math.max(0, i)];
    const n = list.indexOf(step);
    els(step)[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    q('.tour-title').textContent = step.title;
    q('.tour-text').textContent = step.text;
    q('.tour-n').textContent = `${n + 1} / ${list.length}`;
    q('.tour-prev').disabled = n === 0;
    q('.tour-next').textContent = n === list.length - 1 ? labels.done : labels.next;
    q('.tour-next').focus({ preventScroll: true });
  };
  // follow the target (the grid scrolls, the song cursor redraws cells, the window resizes)
  const place = () => {
    raf = requestAnimationFrame(place);
    const list = step && els(step);
    if (!list?.length) return;
    const r = box(list), pad = 6;
    Object.assign(hole.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
    });
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
    let x = r.left + r.width / 2 - tw / 2, y;
    if (r.bottom + pad + gap + th <= innerHeight - 8) y = r.bottom + pad + gap;
    else if (r.top - pad - gap - th >= 8) y = r.top - pad - gap - th;
    else {
      y = r.top + r.height / 2 - th / 2;
      x = r.left - pad - gap - tw >= 8 ? r.left - pad - gap - tw : r.right + pad + gap;
    }
    tip.style.left = `${Math.max(8, Math.min(innerWidth - tw - 8, x))}px`;
    tip.style.top = `${Math.max(8, Math.min(innerHeight - th - 8, y))}px`;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  function end() {
    if (tourEnd !== end) return;
    tourEnd = null;
    removeEventListener('keydown', onKey, true);
    hole.classList.remove('on');
    tip.classList.remove('on');
    catcher.remove();
    setTimeout(() => {
      cancelAnimationFrame(raf);
      hole.remove();
      tip.remove();
    }, 350);
  }
  tourEnd = end;
  q('.tour-x').onclick = end;
  q('.tour-prev').onclick = () => go(-1);
  q('.tour-next').onclick = () => go(1);
  addEventListener('keydown', onKey, true);
  go(0);
  place();
  requestAnimationFrame(() => {
    hole.classList.add('on');
    tip.classList.add('on');
  });
}
