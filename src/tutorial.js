// First-visit guide UI for the orb page: a spotlight that dims everything but one part of the
// screen for a few seconds with a short note beside it, and a banner under the title that stays
// up until orbs.js takes it down. When each one shows is decided in orbs.js ("tutorial" section);
// this file only draws them. Nothing here takes clicks: the page keeps working underneath.

const SHOW_MS = 8000; // a spotlight goes away by itself after this…
const GRACE_MS = 1200; // …or on the first press anywhere once it has been up this long

const queue = [];
let current = null;

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
  if (!item) return;
  current = item;
  setTimeout(() => show(item), item.wait);
}

function show(item) {
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
