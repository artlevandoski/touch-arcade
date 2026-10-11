# Touch Arcade

Touch-friendly fullscreen game launcher for Windows. Swipe the carousel, tap a card to select it,
tap it again (or press Play) to launch. The launcher hides while the game runs and comes back
when the game exits.

## Run
1. Install Node.js (LTS).
2. In this folder: `npm install` then `npm start`.

## Build the Windows program
`npm run dist` creates **dist/Touch Arcade.exe**, a single portable file you can put anywhere.
`npm run dist:folder` instead creates **dist/win-unpacked/**, a plain folder containing `Touch Arcade.exe`.
It starts faster and writes nothing to the Temp folder, because the single-file version unpacks itself
to Temp on every launch.

The build keeps its downloads in `.cache/` inside this project rather than in your user profile.

**If the build stops with "Cannot create symbolic link" or "A required privilege is not held":** Windows
blocks a tool the build unpacks. Fix it once by turning on Developer Mode (Settings > System > For developers)
or by running the terminal as Administrator, then run the build again. Delete the `.cache` folder first if it
was left half-finished.

Keep the project in a normal folder such as `C:\TouchArcade`, not Program Files, because the launcher
writes `games.json` and `artwork` next to itself.

## Make a ready-to-share package
`npm run package` builds everything and produces **dist/Touch Arcade/** and **dist/Touch Arcade.zip**.
The folder holds `Touch Arcade.exe`, an empty `games` folder, an empty `games.json`, an empty `artwork` folder and a short
`Read Me.txt`, with none of your games or images. Send the zip to anyone running 64-bit Windows 10 or 11;
they unzip it and double-click `Touch Arcade.exe`, with no Node.js or other install needed.

## Where your data lives
Everything is stored in this folder, so the whole project is portable. Electron's own cache and profile
files go in `userdata/` here as well, so nothing is written to `%APPDATA%`:

- `games/` holds the games themselves (one folder per game)
- `games.json` is your game list
- `artwork/` holds the cover, background and logo images

When built, `Touch Arcade.exe` keeps the same two items next to itself. Copy the folder (or the .exe plus
`games.json` and `artwork`) to another PC and it works as is. **Manage games > Open launcher folder** shows
you where they are.

### Keeping games portable
Copy each game's folder into `games/`, then use **Manage games > Add a game > Browse**. The Browse window
opens in `games/`, and the launcher saves the game's location relative to the launcher folder
(for example `games/MyGame/MyGame.exe`). That means the whole folder can sit on C: on one PC and G: on another
and every game still launches. A game located outside the launcher folder still works, but its entry
is tied to that exact location, and the Manage screen tells you so.

Entries saved by older versions with full paths inside the launcher folder are converted automatically the first time
the launcher starts. If a full path from another PC or drive no longer exists but the game is in your `games/` folder
under the same name, the launcher finds it there.

If you ran the previous version that stored data in `%APPDATA%\touch-arcade`, your games are copied into
this folder automatically the first time you start, as long as there is no `games.json` here yet.
The originals are left in place.

## Upgrading
Unzip the new version over your existing folder and choose to replace files. The upgrade contains only
program files, so your `games.json` and `artwork/` are never overwritten. Then run `npm install` and
`npm start` (or `npm run dist`).

If a new version changes how `games.json` is stored, the launcher converts it on first start and keeps a
`games.before-v<N>.bak` copy. A `games.json` from a newer launcher than the one you are running is refused
and left unchanged rather than overwritten.

## Add games
Tap **Manage games** (top right). Use **Add a game**, then **Browse** to pick the game's file and the
cover, background and logo images. Images are copied into the `artwork` folder, so the original
files can be moved afterwards. **Save** applies the change; **Move earlier / later** reorders the carousel.

If you have no physical keyboard, Windows needs "Show the touch keyboard when there's no keyboard attached"
turned on (Settings > Time & language > Typing) for text fields.

### Editing games.json by hand
You can still edit `games.json` (a `games.json.bak` copy is kept on each save). Per game:

| field | meaning |
|---|---|
| `id` | unique name (optional) |
| `title`, `description`, `tags` | text shown on the selection screen |
| `exe` | full path to the game's .exe (use `\\` in paths) |
| `args` | optional command line arguments |
| `cwd` | optional working folder (defaults to the exe's folder) |
| `cover` | portrait card image in `artwork` (about 600x840) |
| `background` | fullscreen backdrop in `artwork` (1920x1080 or larger) |
| `logo` | transparent PNG shown instead of the text title |
| `accent` | glow and button color, e.g. `#4fd1c5` |
| `watchProcess` | for games whose exe hands off to another process, e.g. `"Game-Win64.exe"`; the launcher waits for it to close |

## Start at login
Press Win+R, run `shell:startup`, and put a shortcut to `Touch Arcade.exe` there.
