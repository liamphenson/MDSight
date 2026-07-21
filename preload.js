const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Editor / file ───────────────────────────────────────────────────────────
  onMenuNew:    (cb) => ipcRenderer.on('menu-new',     cb),
  onMenuSave:   (cb) => ipcRenderer.on('menu-save',    cb),
  onMenuSaveAs: (cb) => ipcRenderer.on('menu-save-as', cb),
  onFileOpened: (cb) => ipcRenderer.on('file-opened',  (_e, data) => cb(data)),

  saveFile:       (filePath, content)  => ipcRenderer.send('save-file', { path: filePath, content }),
  showSaveDialog: (opts)               => ipcRenderer.invoke('show-save-dialog', opts),
  setTitle:       (title)              => ipcRenderer.send('set-title', title),
  newWindow:      ()                   => ipcRenderer.send('new-window'),

  // ── Explorer ────────────────────────────────────────────────────────────────
  onFolderOpened:   (cb)        => ipcRenderer.on('folder-opened', (_e, data) => cb(data)),
  openFolderDialog: ()          => ipcRenderer.invoke('open-folder-dialog'),
  readDirectory:    (dirPath)   => ipcRenderer.invoke('read-directory', dirPath),
  readFile:         (filePath)  => ipcRenderer.invoke('read-file', filePath),
  watchRoot:        (rootPath)  => ipcRenderer.send('watch-root', rootPath),
  unwatchRoot:      ()          => ipcRenderer.send('unwatch-root'),
  onFsChange:       (cb)        => ipcRenderer.on('fs-change', (_e, data) => cb(data)),
});
