// The admin page: lists the songs and custom orbs people uploaded, newest first, and deletes
// them. Not part of the site build: the preset server serves it itself at /admin/
// (server/adminPage.mjs), next to its /api, so it talks to ../api/admin/... on its own origin
// (behind Nginx: /orbrave/admin/ -> /orbrave/api/). The admin password (ADMIN_TOKEN on the
// server) goes along as a bearer token and is kept for this tab only. Plain browser JS, no build.
const BASE = new URL('../api', location.href).href;
const TOKEN_KEY = 'orbAdminToken';
const PAGE = 50;
const $ = (id) => document.getElementById(id);

let token = '';
try {
  token = sessionStorage.getItem(TOKEN_KEY) ?? '';
} catch {}
let tab = 'presets';
let offset = 0;

async function api(path, init = {}) {
  const res = await fetch(BASE + '/admin/' + path, { ...init, headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status });
  return body;
}

const when = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
};
function cell(cls, ...parts) {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  td.append(...parts);
  return td;
}
const small = (text) => Object.assign(document.createElement('small'), { textContent: text });

const COLS = {
  presets: ['제목', '저자', '내용', '올린 때', ''],
  orbs: ['오브', '만든 사람', '바꾼 값', '올린 때', ''],
};
function row(rec) {
  const tr = document.createElement('tr');
  if (tab === 'presets') {
    const kind = rec.kind === 'stem' ? '스템' : '루프';
    tr.append(
      cell('', rec.name, small(rec.id)),
      cell('', rec.author || '—'),
      cell('', `${kind} · 오브 ${rec.layers?.length ?? 0}개 · 👍 ${rec.up} 👎 ${rec.down}`, small((rec.layers ?? []).join(', ')), ...(rec.description ? [small(rec.description)] : [])),
    );
  } else {
    const o = rec.orb ?? {};
    const sw = Object.assign(document.createElement('span'), { className: 'swatch' });
    sw.style.background = o.color || 'transparent';
    tr.append(
      cell('', sw, o.name || `(${o.base})`, small(`원본: ${o.base} · ${o.id} · 기록 ${rec.id}`)),
      cell('', rec.author || '—'),
      cell('', small(Object.entries(o.e ?? {}).map(([k, v]) => `${k}=${v}`).join(' '))),
    );
  }
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'del';
  del.textContent = '삭제';
  // first click arms it, a second within 3 s deletes
  let armed = null;
  const disarm = () => {
    armed = null;
    del.classList.remove('armed');
    del.textContent = '삭제';
  };
  del.addEventListener('click', async () => {
    if (!armed) {
      del.classList.add('armed');
      del.textContent = '정말 삭제';
      armed = setTimeout(disarm, 3000);
      return;
    }
    clearTimeout(armed);
    del.disabled = true;
    try {
      await api(`${tab}/${encodeURIComponent(rec.id)}`, { method: 'DELETE' });
      tr.classList.add('gone');
      del.textContent = '삭제됨';
    } catch (e) {
      $('err').textContent = e.message;
      del.disabled = false;
      disarm();
      if (e.status === 401) logout();
    }
  });
  tr.append(cell('when', when(rec.createdAt)), cell('act', del));
  return tr;
}

async function load(more = false) {
  if (!more) offset = 0;
  $('err').textContent = '';
  $('more').hidden = true;
  $('reload').disabled = true;
  try {
    const { items, more: hasMore } = await api(`${tab}?offset=${offset}&limit=${PAGE}`);
    if (!more) {
      $('rows').innerHTML = '';
      $('thead').innerHTML = `<tr>${COLS[tab].map((c) => `<th>${c}</th>`).join('')}</tr>`;
    }
    for (const r of items) $('rows').append(row(r));
    offset += items.length;
    $('more').hidden = !hasMore;
    $('count').textContent = `${offset}개${hasMore ? ' 이상' : ''}`;
    return true;
  } catch (e) {
    if (e.status === 401 || e.status === 404 || e.status === 429) {
      logout(e.status === 404 ? '이 서버에는 관리 기능이 꺼져 있어요 (ADMIN_TOKEN)' : e.message);
      return false;
    }
    $('err').textContent = e.message;
    return false;
  } finally {
    $('reload').disabled = false;
  }
}

function showMain(on) {
  $('login').hidden = on;
  $('main').hidden = !on;
  $('tabs').hidden = !on;
  $('logout').hidden = !on;
}
function logout(msg = '') {
  token = '';
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
  showMain(false);
  $('loginErr').textContent = msg;
  $('token').value = '';
  $('token').focus();
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  token = $('token').value;
  $('loginErr').textContent = '';
  showMain(true);
  if (await load()) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {}
  }
});
$('logout').addEventListener('click', () => logout());
$('reload').addEventListener('click', () => load());
$('more').addEventListener('click', () => load(true));
for (const b of document.querySelectorAll('#tabs button')) {
  b.addEventListener('click', () => {
    if (b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    for (const x of document.querySelectorAll('#tabs button')) x.classList.toggle('on', x === b);
    load();
  });
}

if (token) {
  showMain(true);
  load();
} else $('token').focus();
