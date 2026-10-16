# CLAUDE.md

Touch Arcade is a fullscreen, touch-friendly game launcher for Windows, built with Electron 33.
It is plain JavaScript with no framework, bundler, test suite or linter. The README is written for
end users. Keep it in sync when behavior they can see changes.

## Commands

- `npm start` runs the app in development (`electron .`). Data is read from the project folder.
- `npm run dist` builds the single-file portable `dist/Touch Arcade.exe`.
- `npm run dist:folder` builds `dist/win-unpacked/`.
- `npm run package` runs `dist:folder`, then `scripts/package.js`, and produces `dist/Touch Arcade/` and `dist/Touch Arcade.zip`.

Builds set `ELECTRON_CACHE`/`ELECTRON_BUILDER_CACHE` to `./.cache` and turn off code signing.
If a build fails with a symbolic link error, the fix is Windows Developer Mode or an Administrator terminal.

## Layout

- `main.js` is the main process: it reads, writes and migrates `games.json`, resolves paths, launches games, and holds every `ipcMain.handle`.
- `preload.js` exposes `window.arcade` through `contextBridge`. This is the only bridge between the UI and the main process.
- `renderer/` contains `index.html`, `app.js` (carousel, Manage screen, game form) and `style.css`. It has no Node access (`contextIsolation: true`, `nodeIntegration: false`).
- `scripts/package.js` builds the shareable folder with an empty `games.json`, `games/`, `artwork/` and `Read Me.txt`.
- `build/` holds the app icons used by electron-builder. The packaged files are only `main.js`, `preload.js` and `renderer/**`.

When adding an IPC call, add the handler in `main.js`, the method in `preload.js`, and the call in `renderer/app.js`.
Handlers that change data use `wrap()` and return `{ ok, error }` rather than throwing.

## Data and portability (core design rule)

All user data lives in `dataDir`. That is the project folder in development, and the folder next to the exe
when packaged (`PORTABLE_EXECUTABLE_DIR` for the portable build). Nothing may be written to `%APPDATA%`:
Electron's own profile is redirected to `userdata/`.

- `games.json` is the game list. `artwork/` holds images copied in as `<id>-<slot>.<ext>`. `games/` holds the game folders (gitignored).
- Paths inside `dataDir` are stored relative to it with forward slashes (`toStoredPath`). They are resolved with `resolveExe`, which also finds a moved game under `games/` by name.
- Fields saved per game are listed in `FIELDS`, plus `id`, `tags` and `args`. `cleanGame` drops empty values.

## games.json versioning

- `DATA_VERSION` in `main.js` is the current schema version. `MIGRATIONS[n]` upgrades a file from version n to n+1.
- When the shape of the stored data changes, bump `DATA_VERSION` and append a migration. Never edit an existing migration.
- `readRaw` saves a `games.before-v<N>.bak` copy before migrating. It refuses files from a newer version and never overwrites a file that fails to parse.
- `writeRaw` keeps `games.json.bak` and writes through a `.tmp` file and rename.
- `scripts/package.js` reads `DATA_VERSION` from `main.js` with a regex. Keep the line in the form `const DATA_VERSION = <n>;`.

## Launching

Only one game runs at a time (`gameRunning`). The window hides when the game process spawns and comes back
on exit. If `watchProcess` is set, the launcher polls `tasklist` until that process has closed.

## Style

CommonJS, 2-space indent, single quotes, semicolons, short comments explaining why. The user-facing text
in the UI and README is plain and non-technical.
