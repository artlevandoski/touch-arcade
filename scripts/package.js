// Builds a ready-to-share "Touch Arcade" folder (and zip) from the unpacked build.
// Run with: npm run package
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const src = path.join(dist, 'win-unpacked');
const out = path.join(dist, 'Touch Arcade');
const zip = path.join(dist, 'Touch Arcade.zip');

if (!fs.existsSync(path.join(src, 'Touch Arcade.exe'))) {
  console.error('dist\\win-unpacked\\Touch Arcade.exe was not found. Run "npm run dist:folder" first.');
  process.exit(1);
}

// Keep the empty games.json in step with the version the launcher expects
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const version = Number((mainJs.match(/const DATA_VERSION = (\d+)/) || [])[1] || 1);

fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.cpSync(src, out, { recursive: true });

// Empty data: no games, no images
fs.writeFileSync(path.join(out, 'games.json'), JSON.stringify({ version, title: 'Touch Arcade', games: [] }, null, 2));
fs.mkdirSync(path.join(out, 'artwork'));
fs.mkdirSync(path.join(out, 'games'));
fs.writeFileSync(path.join(out, 'games', 'Put your game folders here.txt'),
  'Copy each game\'s folder in here, then use Manage games > Add a game in the launcher.\r\nGames kept in this folder keep working when the whole Touch Arcade folder moves to another drive or PC.\r\n');
fs.writeFileSync(path.join(out, 'artwork', 'Your game images go here.txt'),
  'Cover, background and logo images you pick in the launcher are copied into this folder.\r\n');

fs.writeFileSync(path.join(out, 'Read Me.txt'), [
  'TOUCH ARCADE',
  '',
  'To start: double-click "Touch Arcade.exe". Nothing needs to be installed.',
  '',
  'Add your games:',
  '  1. Copy each game\'s folder into the "games" folder here (this keeps everything portable).',
  '  2. Tap "Manage games" (top right), then "Add a game", then Browse next to "Game file" and pick the game\'s .exe.',
  '  3. Add a title and, if you like, a cover, background and logo image.',
  '  4. Tap Save, then Done.',
  '     (A game kept outside this folder works, but will not follow the folder to another drive or PC.)',
  '',
  'Play: swipe to pick a game, then tap it again or tap Play. The launcher returns when the game closes.',
  'Exit: tap "Exit" (top right), or press Esc on a keyboard.',
  '',
  'Notes:',
  '  - Keep this folder somewhere normal such as C:\\Touch Arcade, not Program Files.',
  '    Your games, game list (games.json) and images (artwork) all stay inside this folder.',
  '  - To move to another PC, copy this whole folder.',
  '  - If Windows says "Windows protected your PC", click "More info", then "Run anyway".',
  '    The app is not code-signed, so Windows shows that for any new program.',
  '',
].join('\r\n'));

// Zip it so it can be sent as one file
try {
  if (process.platform === 'win32') {
    const q = (p) => p.replace(/'/g, "''");
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Compress-Archive -LiteralPath '${q(out)}' -DestinationPath '${q(zip)}' -Force`], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-qr', zip, 'Touch Arcade'], { cwd: dist, stdio: 'inherit' });
  }
  console.log(`\nDone.\n  Folder: ${out}\n  Zip:    ${zip}`);
} catch (e) {
  console.log(`\nFolder created: ${out}\nCould not make the zip automatically (${e.message}). Right-click the folder and choose Send to > Compressed folder.`);
}
