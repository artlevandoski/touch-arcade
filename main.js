const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');

app.setName('Touch Arcade');

// Games and artwork live in the project folder (next to Touch Arcade.exe when packaged),
// so copying the folder moves everything. Program files can be replaced without touching them.
const dataDir = app.isPackaged
  ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath))
  : __dirname;
const configPath = path.join(dataDir, 'games.json');
const artDir = path.join(dataDir, 'artwork');
const gamesDir = path.join(dataDir, 'games');

// Keep Electron's own profile and cache files in the project folder too,
// so nothing is written to %APPDATA%.
const profileDir = path.join(dataDir, 'userdata');
app.setPath('userData', profileDir);
app.setPath('sessionData', profileDir);
app.setPath('crashDumps', path.join(profileDir, 'crashes'));

let win = null;
let gameRunning = false;

/* ---------- data file versioning ---------- */

// Bump DATA_VERSION and add a step to MIGRATIONS whenever the shape of games.json changes.
// MIGRATIONS[n] upgrades a file from version n to n + 1.
const DATA_VERSION = 2;
const MIGRATIONS = [
  // 0 -> 1: files from before versioning existed; make sure every game has an id
  (raw) => ({ ...raw, games: (raw.games || []).map((g, i) => ({ ...g, id: g.id || `game-${i}` })) }),
  // 1 -> 2: games inside the launcher folder are stored with relative paths so the folder can move
  (raw) => ({
    ...raw,
    games: (raw.games || []).map((g) => {
      const o = { ...g };
      for (const k of ['exe', 'cwd']) if (o[k] && path.isAbsolute(o[k])) o[k] = toStoredPath(o[k]);
      return o;
    }),
  }),
];

function migrate(raw) {
  const from = Number(raw.version) || 0;
  if (from > DATA_VERSION) {
    throw new Error('games.json was saved by a newer version of Touch Arcade. Please update the launcher.');
  }
  let out = raw;
  for (let v = from; v < DATA_VERSION; v++) out = MIGRATIONS[v](out);
  out.version = DATA_VERSION;
  return { raw: out, changed: from !== DATA_VERSION, from };
}

// If the previous version stored games in %APPDATA%\touch-arcade, bring them into the
// project folder the first time (only when no games.json exists here yet). The originals stay put.
function importLegacyData() {
  if (fs.existsSync(configPath)) return;
  const old = path.join(app.getPath('appData'), 'touch-arcade');
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(old, 'games.json'), 'utf8'));
    if (!raw.games || !raw.games.length) return;
    fs.copyFileSync(path.join(old, 'games.json'), configPath);
    const art = path.join(old, 'artwork');
    if (fs.existsSync(art)) fs.cpSync(art, artDir, { recursive: true });
  } catch { /* nothing to import */ }
}

/* ---------- config helpers ---------- */

const safeId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || `game-${Date.now().toString(36)}`;

// Paths inside the launcher folder are saved relative to it ("games/Foo/Foo.exe"), so the whole
// folder can move to another drive or PC. Paths elsewhere stay absolute.
function toStoredPath(full) {
  const rel = path.relative(dataDir, full);
  if (rel && rel.split(path.sep)[0] !== '..' && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  return full;
}

function resolveExe(p) {
  if (!p) return p;
  const full = path.resolve(dataDir, p); // relative paths are relative to the launcher folder
  if (fs.existsSync(full) || !path.isAbsolute(p)) return full;
  // An absolute path saved on another PC or drive: look for the same game in our games folder
  const m = p.replace(/\\/g, '/').match(/(?:^|\/)games\/(.+)$/i);
  if (m) {
    const alt = path.join(gamesDir, m[1]);
    if (fs.existsSync(alt)) return alt;
  }
  return full;
}

function readRaw() {
  if (!fs.existsSync(configPath)) return { version: DATA_VERSION, title: 'Touch Arcade', games: [] };
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')); // throws on bad JSON so we never overwrite it
  const m = migrate(parsed);
  if (m.changed) {
    fs.copyFileSync(configPath, path.join(dataDir, `games.before-v${DATA_VERSION}.bak`));
    writeRaw(m.raw);
  }
  m.raw.games = (m.raw.games || []).map((g, i) => ({ ...g, id: g.id || `game-${i}` }));
  return m.raw;
}

function writeRaw(raw) {
  fs.mkdirSync(dataDir, { recursive: true });
  raw.version = DATA_VERSION;
  if (fs.existsSync(configPath)) fs.copyFileSync(configPath, configPath + '.bak');
  const tmp = configPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(raw, null, 2));
  fs.renameSync(tmp, configPath);
}

function artUrl(file) {
  if (!file) return null;
  const full = path.isAbsolute(file) ? file : path.join(artDir, file);
  return fs.existsSync(full) ? pathToFileURL(full).href : null;
}

function loadConfig() {
  const raw = readRaw();
  const games = raw.games.map((g) => ({
    ...g,
    exeMissing: !g.exe || !fs.existsSync(resolveExe(g.exe)),
    coverUrl: artUrl(g.cover),
    backgroundUrl: artUrl(g.background),
    logoUrl: artUrl(g.logo),
  }));
  return { title: raw.title || 'Arcade', games };
}

function splitArgs(text) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

const FIELDS = ['title', 'description', 'exe', 'cwd', 'watchProcess', 'cover', 'background', 'logo', 'accent'];

function cleanGame(g, old = {}) {
  const out = { ...old, id: safeId(g.id) };
  for (const k of FIELDS) {
    const v = typeof g[k] === 'string' ? g[k].trim() : '';
    if (v) out[k] = v; else delete out[k];
  }
  if (out.exe) out.exe = toStoredPath(resolveExe(out.exe));
  if (out.cwd) out.cwd = toStoredPath(resolveExe(out.cwd));
  const tags = Array.isArray(g.tags) ? g.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  if (tags.length) out.tags = tags; else delete out.tags;
  if (typeof g.argsText === 'string') {
    const args = splitArgs(g.argsText);
    if (args.length) out.args = args; else delete out.args;
  }
  return out;
}

function wrap(fn) {
  try { return { ok: true, ...(fn() || {}) }; } catch (e) { return { ok: false, error: e.message }; }
}

/* ---------- window and launching ---------- */

function createWindow() {
  win = new BrowserWindow({
    title: 'Touch Arcade',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    fullscreen: true,
    backgroundColor: '#0d0a1a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function restoreLauncher() {
  gameRunning = false;
  if (!win || win.isDestroyed()) return;
  win.show();
  win.setFullScreen(true);
  win.focus();
  win.webContents.send('game-exited');
}

// Some games start a second process and the first one exits right away.
// If "watchProcess" is set, wait until that process is gone before returning.
function waitForProcessGone(imageName, done) {
  const check = () => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${imageName}`, '/NH'], (err, out) => {
      if (!err && out.toLowerCase().includes(imageName.toLowerCase())) setTimeout(check, 1500);
      else done();
    });
  };
  setTimeout(check, 4000); // give the real process time to appear
}

/* ---------- IPC ---------- */

ipcMain.handle('get-games', () => {
  try {
    return { ok: true, ...loadConfig() };
  } catch (e) {
    return { ok: false, error: `Could not read games.json: ${e.message}` };
  }
});

ipcMain.handle('launch-game', (_e, id) => {
  if (gameRunning) return { ok: false, error: 'A game is already running.' };
  let game;
  try {
    game = loadConfig().games.find((g) => g.id === id);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!game) return { ok: false, error: 'Game not found.' };
  const exePath = resolveExe(game.exe);
  if (!fs.existsSync(exePath)) return { ok: false, error: `File not found: ${exePath}` };

  gameRunning = true;
  const child = spawn(exePath, game.args || [], {
    cwd: game.cwd ? resolveExe(game.cwd) : path.dirname(exePath),
    stdio: 'ignore',
  });

  child.once('spawn', () => win && win.hide());
  child.once('error', (err) => {
    gameRunning = false;
    win && win.webContents.send('launch-error', err.message);
  });
  child.once('exit', () => {
    if (game.watchProcess) waitForProcessGone(game.watchProcess, restoreLauncher);
    else restoreLauncher();
  });
  return { ok: true };
});

// Browse for the game's program file
ipcMain.handle('pick-exe', async () => {
  fs.mkdirSync(gamesDir, { recursive: true });
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose the game',
    defaultPath: gamesDir,
    properties: ['openFile'],
    filters: [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd'] }, { name: 'All files', extensions: ['*'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const stored = toStoredPath(p);
  return { path: p, stored, inside: stored !== p, name: path.basename(p, path.extname(p)) };
});

// Browse for an image; it is copied into artwork/ so the launcher stays self-contained
ipcMain.handle('pick-art', async (_e, id, slot) => {
  if (!['cover', 'background', 'logo'].includes(slot)) return null;
  const r = await dialog.showOpenDialog(win, {
    title: `Choose the ${slot} image`,
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try {
    const src = r.filePaths[0];
    fs.mkdirSync(artDir, { recursive: true });
    const file = `${safeId(id)}-${slot}${path.extname(src).toLowerCase()}`;
    fs.copyFileSync(src, path.join(artDir, file));
    return { ok: true, file, url: `${artUrl(file)}?v=${Date.now()}` };
  } catch (e) {
    return { ok: false, error: `Could not copy the image: ${e.message}` };
  }
});

ipcMain.handle('save-game', (_e, g) => wrap(() => {
  const raw = readRaw();
  const id = safeId(g.id);
  const i = raw.games.findIndex((x) => x.id === id);
  const cleaned = cleanGame(g, i >= 0 ? raw.games[i] : {});
  if (!cleaned.title || !cleaned.exe) throw new Error('A title and a game file are required.');
  if (i >= 0) raw.games[i] = cleaned; else raw.games.push(cleaned);
  writeRaw(raw);
}));

ipcMain.handle('delete-game', (_e, id) => wrap(() => {
  const raw = readRaw();
  const g = raw.games.find((x) => x.id === id);
  raw.games = raw.games.filter((x) => x.id !== id);
  writeRaw(raw);
  // remove artwork this app copied in (files named "<id>-...")
  if (g) {
    for (const f of [g.cover, g.background, g.logo]) {
      if (f && !path.isAbsolute(f) && f.startsWith(`${safeId(id)}-`)) fs.rmSync(path.join(artDir, f), { force: true });
    }
  }
}));

ipcMain.handle('move-game', (_e, id, delta) => wrap(() => {
  const raw = readRaw();
  const i = raw.games.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= raw.games.length) return;
  [raw.games[i], raw.games[j]] = [raw.games[j], raw.games[i]];
  writeRaw(raw);
}));

ipcMain.handle('open-games-folder', () => {
  fs.mkdirSync(gamesDir, { recursive: true });
  return shell.openPath(gamesDir);
});

ipcMain.handle('open-data-folder', () => shell.openPath(dataDir));

ipcMain.handle('quit-app', () => app.quit());

app.whenReady().then(() => {
  try { importLegacyData(); } catch (e) { console.error('Legacy import failed:', e); }
  createWindow();
});
app.on('window-all-closed', () => app.quit());
