const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arcade', {
  getGames: () => ipcRenderer.invoke('get-games'),
  launch: (id) => ipcRenderer.invoke('launch-game', id),
  pickExe: () => ipcRenderer.invoke('pick-exe'),
  pickArt: (id, slot) => ipcRenderer.invoke('pick-art', id, slot),
  saveGame: (game) => ipcRenderer.invoke('save-game', game),
  deleteGame: (id) => ipcRenderer.invoke('delete-game', id),
  moveGame: (id, delta) => ipcRenderer.invoke('move-game', id, delta),
  openGamesFolder: () => ipcRenderer.invoke('open-games-folder'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  quit: () => ipcRenderer.invoke('quit-app'),
  onExit: (cb) => ipcRenderer.on('game-exited', cb),
  onError: (cb) => ipcRenderer.on('launch-error', (_e, msg) => cb(msg)),
});
