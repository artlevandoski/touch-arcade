const $ = (s) => document.querySelector(s);
const GAP = 40;
let games = [], idx = 0, dx = 0, busy = false, bgFlip = false;

const track = $('#track'), stage = $('#stage');

function hueFrom(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/* ---------- Carousel ---------- */

function buildCards() {
  track.innerHTML = '';
  games.forEach((g, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.i = i;
    if (g.coverUrl) {
      const img = document.createElement('img');
      img.src = g.coverUrl; img.alt = g.title;
      card.append(img);
    } else {
      const h = hueFrom(g.title);
      card.style.background = `linear-gradient(160deg, hsl(${h} 70% 45%), hsl(${(h + 60) % 360} 60% 14%))`;
      const t = document.createElement('div');
      t.className = 'fallback'; t.textContent = g.title;
      card.append(t);
    }
    track.append(card);
  });
}

function layout() {
  const cardW = track.firstElementChild ? track.firstElementChild.offsetWidth : 300;
  const pitch = cardW + GAP;
  const x = stage.clientWidth / 2 - cardW / 2 - idx * pitch + dx;
  track.style.transform = `translateX(${x}px)`;
}

function setBackground(url) {
  const [on, off] = bgFlip ? [$('#bgB'), $('#bgA')] : [$('#bgA'), $('#bgB')];
  bgFlip = !bgFlip;
  on.style.backgroundImage = url ? `url("${url}")` : 'none';
  on.classList.add('on');
  off.classList.remove('on');
}

function select(i) {
  idx = Math.max(0, Math.min(games.length - 1, i));
  dx = 0;
  const g = games[idx];
  document.querySelectorAll('.card').forEach((c, n) => c.classList.toggle('active', n === idx));
  document.documentElement.style.setProperty('--accent', g.accent || `hsl(${hueFrom(g.title)} 85% 62%)`);
  $('#gameTitle').textContent = g.logoUrl ? '' : g.title;
  $('#gameDesc').textContent = g.description || '';
  const logo = $('#logo');
  logo.hidden = !g.logoUrl;
  if (g.logoUrl) { logo.src = g.logoUrl; logo.alt = g.title; }
  $('#tags').replaceChildren(...(g.tags || []).map((t) => Object.assign(document.createElement('span'), { textContent: t })));
  setBackground(g.backgroundUrl);
  layout();
}

function refreshMain() {
  buildCards();
  const has = games.length > 0;
  $('#playBtn').hidden = !has;
  if (has) {
    select(Math.min(idx, games.length - 1));
  } else {
    setBackground(null);
    $('#logo').hidden = true;
    $('#tags').replaceChildren();
    $('#gameTitle').textContent = 'No games yet';
    $('#gameDesc').textContent = 'Tap Manage games to add your first one.';
  }
}

async function reload() {
  const data = await window.arcade.getGames();
  if (!data.ok) { toast(data.error); return false; }
  games = data.games;
  return true;
}

async function launch() {
  if (busy || !games.length) return;
  busy = true;
  const g = games[idx];
  $('#overlayText').textContent = `Starting ${g.title}`;
  $('#overlay').hidden = false;
  const res = await window.arcade.launch(g.id);
  if (!res.ok) { $('#overlay').hidden = true; busy = false; toast(res.error); }
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 5000);
}

let onYes = null;
function ask(msg, yesLabel, cb) {
  $('#confirmMsg').textContent = msg;
  $('#confirmYes').textContent = yesLabel;
  onYes = cb;
  $('#confirm').hidden = false;
}
$('#confirmNo').addEventListener('click', () => ($('#confirm').hidden = true));
$('#confirmYes').addEventListener('click', () => { $('#confirm').hidden = true; if (onYes) onYes(); });

/* Swipe and tap on the carousel (touch, pen and mouse) */
let down = null;
stage.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, t: performance.now(), moved: false, card: e.target.closest('.card') };
  track.classList.add('dragging');
});
window.addEventListener('pointermove', (e) => {
  if (!down) return;
  const d = e.clientX - down.x;
  if (Math.abs(d) > 10) down.moved = true;
  if (down.moved) { dx = d; layout(); }
});
window.addEventListener('pointerup', (e) => {
  if (!down) return;
  track.classList.remove('dragging');
  const d = e.clientX - down.x;
  const v = d / Math.max(1, performance.now() - down.t); // px per ms
  const pitch = track.firstElementChild.offsetWidth + GAP;
  if (down.moved) {
    select(idx - Math.round((d + v * 180) / pitch));
  } else if (down.card) {
    const i = Number(down.card.dataset.i);
    i === idx ? launch() : select(i);
  }
  down = null;
});
window.addEventListener('pointercancel', () => { down = null; track.classList.remove('dragging'); if (games.length) select(idx); });

$('#playBtn').addEventListener('click', launch);
$('#exitBtn').addEventListener('click', () => ask('Close the launcher?', 'Exit', () => window.arcade.quit()));

window.addEventListener('keydown', (e) => {
  if (!$('#confirm').hidden) { if (e.key === 'Escape') $('#confirm').hidden = true; return; }
  if (!$('#manager').hidden || !$('#overlay').hidden) return;
  if (e.key === 'ArrowLeft') select(idx - 1);
  else if (e.key === 'ArrowRight') select(idx + 1);
  else if (e.key === 'Enter') launch();
  else if (e.key === 'Escape') $('#exitBtn').click();
});
window.addEventListener('resize', () => games.length && layout());
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.arcade.onExit(() => { $('#overlay').hidden = true; busy = false; });
window.arcade.onError((msg) => { $('#overlay').hidden = true; busy = false; toast(msg); });

/* ---------- Manage games ---------- */

const SLOTS = [
  { key: 'cover', label: 'Cover (tall card)' },
  { key: 'background', label: 'Background (fullscreen)' },
  { key: 'logo', label: 'Logo (transparent PNG)' },
];
const slotEls = {};
let cur = null, accentTouched = false;

function buildSlots() {
  for (const s of SLOTS) {
    const wrap = document.createElement('div');
    wrap.className = 'slot';
    const label = document.createElement('span');
    label.textContent = s.label;
    const preview = document.createElement('div');
    preview.className = 'preview' + (s.key === 'logo' ? ' logo' : '');
    const btns = document.createElement('div');
    btns.className = 'btns';
    const browse = document.createElement('button');
    browse.textContent = 'Browse';
    const clear = document.createElement('button');
    clear.textContent = 'Clear';
    browse.addEventListener('click', async () => {
      const res = await window.arcade.pickArt(cur.id, s.key);
      if (!res) return;
      if (!res.ok) return toast(res.error);
      cur[s.key] = res.file;
      cur[`${s.key}Url`] = res.url;
      renderSlots();
    });
    clear.addEventListener('click', () => { cur[s.key] = ''; cur[`${s.key}Url`] = null; renderSlots(); });
    btns.append(browse, clear);
    wrap.append(label, preview, btns);
    $('#slots').append(wrap);
    slotEls[s.key] = preview;
  }
}

function renderSlots() {
  for (const s of SLOTS) {
    const url = cur[`${s.key}Url`];
    slotEls[s.key].style.backgroundImage = url ? `url("${url}")` : 'none';
  }
}

function renderList() {
  $('#mgrList').replaceChildren(...games.map((g) => {
    const b = document.createElement('button');
    b.className = 'item' + (cur && cur.id === g.id ? ' sel' : '');
    b.textContent = g.title;
    b.addEventListener('click', () => showForm(g));
    return b;
  }));
}

const isNew = () => !games.some((g) => g.id === cur.id);

function showForm(g) {
  cur = { ...g };
  accentTouched = !!g.accent;
  $('#fTitle').value = g.title || '';
  $('#fDesc').value = g.description || '';
  $('#fTags').value = (g.tags || []).join(', ');
  $('#fExeText').textContent = g.exe || 'Nothing chosen';
  renderExeNote();
  $('#fAccent').value = /^#[0-9a-f]{6}$/i.test(g.accent || '') ? g.accent : '#ff5d8f';
  $('#fArgs').value = (g.args || []).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
  $('#fWatch').value = g.watchProcess || '';
  $('#mgrUp').disabled = $('#mgrDown').disabled = isNew();
  $('#mgrForm').hidden = false;
  $('#mgrEmpty').hidden = true;
  $('#mgrForm').scrollTop = 0;
  renderSlots();
  renderList();
}

function renderExeNote() {
  const exe = cur.exe || '';
  const absolute = /^([a-zA-Z]:[\\/]|[\\/]{2}|\/)/.test(exe);
  let msg;
  if (!exe) msg = 'Tip: put the game in the games folder first, so it travels with the launcher.';
  else if (cur.exeMissing) msg = 'This file was not found. Browse to the game again.';
  else if (absolute) msg = 'This game is outside the launcher folder, so this entry will not follow the folder to another PC or drive. Move the game into the games folder to make it portable.';
  else msg = 'Portable: saved relative to the launcher folder, so it works on any drive.';
  $('#exeNote').textContent = msg;
}

function showEmpty() {
  cur = null;
  $('#mgrForm').hidden = true;
  $('#mgrEmpty').hidden = false;
  renderList();
}

async function openManager(selectId) {
  await reload();
  $('#manager').hidden = false;
  const g = games.find((x) => x.id === selectId) || games[0];
  g ? showForm(g) : showEmpty();
}

function closeManager() {
  $('#manager').hidden = true;
  refreshMain();
}

function collect() {
  return {
    ...cur,
    title: $('#fTitle').value.trim(),
    description: $('#fDesc').value.trim(),
    tags: $('#fTags').value.split(',').map((t) => t.trim()).filter(Boolean),
    argsText: $('#fArgs').value,
    watchProcess: $('#fWatch').value.trim(),
    accent: accentTouched ? $('#fAccent').value : '',
  };
}

$('#manageBtn').addEventListener('click', () => openManager(games[idx] && games[idx].id));
$('#mgrClose').addEventListener('click', closeManager);
$('#openGames').addEventListener('click', () => window.arcade.openGamesFolder());
$('#openData').addEventListener('click', () => window.arcade.openDataFolder());
$('#fAccent').addEventListener('input', () => { accentTouched = true; });

$('#mgrAdd').addEventListener('click', () => {
  showForm({ id: `game-${Date.now().toString(36)}`, title: '', exe: '' });
  $('#fTitle').focus();
});

$('#pickExe').addEventListener('click', async () => {
  const res = await window.arcade.pickExe();
  if (!res) return;
  cur.exe = res.stored;
  cur.exeMissing = false;
  $('#fExeText').textContent = res.stored;
  renderExeNote();
  if (!$('#fTitle').value.trim()) $('#fTitle').value = res.name;
});

$('#mgrSave').addEventListener('click', async () => {
  const g = collect();
  if (!g.title) return toast('Add a title first.');
  if (!g.exe) return toast('Choose the game file first.');
  const res = await window.arcade.saveGame(g);
  if (!res.ok) return toast(res.error);
  await reload();
  showForm(games.find((x) => x.id === g.id));
  toast(`Saved ${g.title}`);
});

async function move(delta) {
  const res = await window.arcade.moveGame(cur.id, delta);
  if (!res.ok) return toast(res.error);
  await reload();
  renderList();
}
$('#mgrUp').addEventListener('click', () => move(-1));
$('#mgrDown').addEventListener('click', () => move(1));

$('#mgrDelete').addEventListener('click', () => {
  const name = cur.title || 'this game';
  ask(`Delete ${name}? The game itself is not touched.`, 'Delete', async () => {
    if (!isNew()) {
      const res = await window.arcade.deleteGame(cur.id);
      if (!res.ok) return toast(res.error);
    }
    await reload();
    games[0] ? showForm(games[0]) : showEmpty();
  });
});

/* ---------- Start ---------- */

buildSlots();
(async function init() {
  if (await reload()) refreshMain();
})();
