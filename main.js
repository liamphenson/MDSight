const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');

// ── Entries always hidden in the explorer ─────────────────────────────────────
const IGNORED = new Set([
  'node_modules', '.git', '.DS_Store', 'dist', '.next', '__pycache__',
  '.venv', 'venv', '.idea', '.vscode', 'Thumbs.db',
]);

// ── Per-window filesystem watchers ────────────────────────────────────────────
// Maps webContents.id → chokidar FSWatcher
const watchers = new Map();

// ── Window factory ────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'dist', 'index.html'));

  // Capture the id now — win.webContents is already destroyed by the
  // time the 'closed' event fires, so reading it there would throw.
  const webContentsId = win.webContents.id;

  // Stop any watcher belonging to this window when it closes
  win.on('closed', () => {
    const watcher = watchers.get(webContentsId);
    if (watcher) { watcher.close(); watchers.delete(webContentsId); }
  });

  return win;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Always target the window that is currently focused. Capture it BEFORE
// awaiting any dialog so that focus-loss doesn't change the reference.
function focused() {
  return BrowserWindow.getFocusedWindow();
}

// ── Application menu ──────────────────────────────────────────────────────────
function buildMenu() {
  const FILE_FILTERS = [
    {
      name: 'Text & Code Files',
      extensions: [
        'md','markdown','mdx','txt',
        'js','mjs','cjs','jsx','ts','tsx',
        'json','jsonc','json5',
        'css','scss','sass','less',
        'html','htm','xml','svg',
        'py','rb','sh','bash','zsh',
        'rs','go','c','h','cpp','cc','cxx','hpp',
        'java','kt','kts','swift','php',
        'yaml','yml','toml',
        'sql','lua','r','vim','hs','ex','exs','ml','clj',
      ],
    },
    { name: 'All Files', extensions: ['*'] },
  ];

  const template = [
    {
      label: 'MDSight',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click() {
            const win = focused();
            if (win) win.webContents.send('menu-new');
          },
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click() { createWindow(); },
        },
        { type: 'separator' },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          async click() {
            const win = focused();
            if (!win) return;
            const { canceled, filePaths } = await dialog.showOpenDialog(win, {
              filters: FILE_FILTERS,
              properties: ['openFile'],
            });
            if (!canceled && filePaths.length) {
              const content = fs.readFileSync(filePaths[0], 'utf-8');
              win.webContents.send('file-opened', { path: filePaths[0], content });
            }
          },
        },
        {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+Shift+O',
          async click() {
            const win = focused();
            if (!win) return;
            const { canceled, filePaths } = await dialog.showOpenDialog(win, {
              properties: ['openDirectory'],
            });
            if (!canceled && filePaths.length) {
              win.webContents.send('folder-opened', {
                path: filePaths[0],
                name: path.basename(filePaths[0]),
              });
            }
          },
        },
        { type: 'separator' },
        {
          // Save: renderer owns the current-file state and decides whether
          // to save in-place or prompt. Main just delivers the signal.
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click() {
            const win = focused();
            if (win) win.webContents.send('menu-save');
          },
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click() {
            const win = focused();
            if (win) win.webContents.send('menu-save-as');
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC: native dialogs (invoked by renderer) ─────────────────────────────────
ipcMain.handle('show-save-dialog', async (event, { defaultPath }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    filters: [{ name: 'All Files', extensions: ['*'] }],
    defaultPath: defaultPath || 'untitled.md',
  });
  return canceled ? null : filePath;
});

ipcMain.handle('open-folder-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths.length) return null;
  return { path: filePaths[0], name: path.basename(filePaths[0]) };
});

// ── IPC: file system ──────────────────────────────────────────────────────────
ipcMain.on('save-file', (_, { path: filePath, content }) => {
  fs.writeFileSync(filePath, content, 'utf-8');
});

ipcMain.handle('read-directory', (_, dirPath) => {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(e => !IGNORED.has(e.name) && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDir: e.isDirectory(),
        ext: e.isDirectory() ? '' : path.extname(e.name).toLowerCase().slice(1),
      }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
  } catch { return []; }
});

ipcMain.handle('read-file', (_, filePath) => {
  try { return fs.readFileSync(filePath, 'utf-8'); }
  catch { return null; }
});

// ── IPC: filesystem watching ──────────────────────────────────────────────────
ipcMain.on('watch-root', (event, rootPath) => {
  const id = event.sender.id;

  // Close any previous watcher for this window
  if (watchers.has(id)) { watchers.get(id).close(); watchers.delete(id); }

  const watcher = chokidar.watch(rootPath, {
    // Mirror the same ignore rules as read-directory
    ignored: (filePath) => {
      const base = path.basename(filePath);
      return base.startsWith('.') || IGNORED.has(base);
    },
    ignoreInitial: true,   // don't fire for the initial scan
    depth: 99,
    persistent: true,
  });

  // For any structural change, tell the renderer which parent directory changed
  // so it can surgically reload just that cached entry.
  const notify = (changedPath) => {
    if (event.sender.isDestroyed()) return;
    event.sender.send('fs-change', { changedDir: path.dirname(changedPath) });
  };

  watcher.on('add',       notify);
  watcher.on('unlink',    notify);
  watcher.on('addDir',    notify);
  watcher.on('unlinkDir', notify);

  watchers.set(id, watcher);
});

ipcMain.on('unwatch-root', (event) => {
  const id = event.sender.id;
  if (watchers.has(id)) { watchers.get(id).close(); watchers.delete(id); }
});

// ── IPC: window chrome ────────────────────────────────────────────────────────
ipcMain.on('set-title', (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setTitle(title);
});

ipcMain.on('new-window', () => createWindow());

// Close all watchers cleanly on quit
app.on('before-quit', () => {
  for (const watcher of watchers.values()) watcher.close();
  watchers.clear();
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
