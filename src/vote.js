// 👍 / 👎 for a shared preset, beside the play button on the orb page and the player.
// One vote per browser (see votePreset in presetApi.js); pressing the lit one again takes it
// back. The counts are never shown: they only change how often the preset comes up.
import { getLang } from './i18n.js';
import { canVote, myVote, votePreset } from './presetApi.js';
import './vote.css';

const TXT = {
  ko: { up: '좋아요', down: '별로예요', undo: '평가 취소', fail: '평가를 보내지 못했어요' },
  en: { up: 'I like it', down: 'Not for me', undo: 'Take back my vote', fail: 'Could not send the vote' },
  ja: { up: 'いいね', down: 'いまいち', undo: '評価を取り消す', fail: '評価を送れませんでした' },
};
const tx = (k) => (TXT[getLang()] ?? TXT.en)[k];

const THUMB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 21h4V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>';

// Fills `box` with the two buttons; returns set(preset | null) to point them at a preset
// (null, or one the server doesn't know, hides them).
export function mountVote(box) {
  box.classList.add('vote');
  box.hidden = true;
  const mk = (v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = v > 0 ? 'vote-up' : 'vote-down';
    b.innerHTML = THUMB;
    b.dataset.v = v;
    b.addEventListener('pointerdown', (e) => e.stopPropagation()); // not a grab on the player
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      send(v);
    });
    return b;
  };
  const up = mk(1);
  const down = mk(-1);
  box.append(up, down);
  let id = null;
  let busy = false;

  function paint() {
    const mine = id ? myVote(id) : 0;
    for (const b of [up, down]) {
      const on = Number(b.dataset.v) === mine;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      b.title = on ? tx('undo') : tx(b === up ? 'up' : 'down');
      b.setAttribute('aria-label', b.title);
    }
  }

  async function send(v) {
    if (!id || busy) return;
    const target = id;
    const next = myVote(target) === v ? 0 : v;
    busy = true;
    box.classList.add('busy');
    try {
      await votePreset(target, next);
      if (id === target) {
        paint();
        const b = v > 0 ? up : down;
        b.classList.remove('pop');
        void b.offsetWidth;
        if (next) b.classList.add('pop');
      }
    } catch (e) {
      console.info('vote failed:', e.message);
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
      box.title = tx('fail');
      setTimeout(() => (box.title = ''), 2500);
    } finally {
      busy = false;
      box.classList.remove('busy');
    }
  }

  box.addEventListener('mouseenter', paint); // tooltips follow a language switch

  return function set(preset) {
    id = preset && canVote(preset.id) ? preset.id : null;
    box.hidden = !id;
    if (id) paint();
  };
}
