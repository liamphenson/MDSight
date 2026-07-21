import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
} from '@codemirror/view';
import {
  defaultKeymap,
  historyKeymap,
  history,
  indentWithTab,
} from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { marked } from 'marked';
import hljs from 'highlight.js';

// ═══════════════════════════════════════════════════════════════════════════════
// marked setup
// ═══════════════════════════════════════════════════════════════════════════════
marked.setOptions({ gfm: true, breaks: false });
const mdRenderer = new marked.Renderer();
mdRenderer.code = ({ text, lang }) => {
  let hl = text;
  if (lang && hljs.getLanguage(lang)) {
    try { hl = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value; }
    catch (_) { hl = hljs.highlightAuto(text).value; }
  } else {
    hl = hljs.highlightAuto(text).value;
  }
  return `<pre><code class="hljs language-${lang || 'plaintext'}">${hl}</code></pre>`;
};
marked.use({ renderer: mdRenderer });

// ═══════════════════════════════════════════════════════════════════════════════
// Default document
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULT_DOC = `# Welcome to MDSight

A lightweight Markdown editor for macOS with **live preview**.

## Features

- Real-time rendering as you type
- VSCode-style syntax highlighting for Markdown **and** code files
- Full GFM (GitHub Flavored Markdown) support
- Syntax-highlighted fenced code blocks
- File explorer sidebar — open a folder with **⌘⇧O**
- File open / save via the **File** menu or \`⌘O\` / \`⌘S\`
- Toggle the explorer with **⌘B**
- Preview panel auto-hides for non-Markdown files

## Markdown Cheatsheet

### Emphasis

*italic*, **bold**, ~~strikethrough~~, \`inline code\`

### Code Block

\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
}
greet('World');
\`\`\`

### Blockquote

> "The best way to predict the future is to invent it."
> — Alan Kay

### Table

| Syntax | Description |
|--------|-------------|
| Header | Title       |
| Cell   | Content     |

### Task List

- [x] Build the editor pane
- [x] Wire up live preview
- [x] Add file explorer
- [x] Multi-language syntax highlighting
- [ ] World domination

---

Start editing, or open a folder with **⌘⇧O**.
`;

// ═══════════════════════════════════════════════════════════════════════════════
// Language detection helpers
// ═══════════════════════════════════════════════════════════════════════════════
const MD_EXTS = new Set(['md', 'markdown', 'mdx']);

// Human-readable names for the editor header label
const EXT_LANG_NAME = {
  md: 'Markdown', markdown: 'Markdown', mdx: 'MDX',
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  jsx: 'JavaScript (JSX)',
  ts: 'TypeScript', tsx: 'TypeScript (JSX)',
  json: 'JSON', jsonc: 'JSON', json5: 'JSON5',
  css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less',
  html: 'HTML', htm: 'HTML', xml: 'XML', svg: 'SVG',
  py: 'Python',
  rb: 'Ruby',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell',
  rs: 'Rust',
  go: 'Go',
  c: 'C', h: 'C',
  cpp: 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++',
  java: 'Java',
  kt: 'Kotlin', kts: 'Kotlin',
  swift: 'Swift',
  php: 'PHP',
  yaml: 'YAML', yml: 'YAML',
  toml: 'TOML',
  sql: 'SQL',
  lua: 'Lua',
  r: 'R',
  hs: 'Haskell',
  ex: 'Elixir', exs: 'Elixir',
  clj: 'Clojure',
  ml: 'OCaml',
  vim: 'Vimscript',
  txt: 'Plain Text',
};

function extFromPath(filePath) {
  if (!filePath) return '';
  const parts = filePath.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function isMarkdownExt(ext) {
  return MD_EXTS.has(ext);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOM refs
// ═══════════════════════════════════════════════════════════════════════════════
const editorContainer = document.getElementById('editor-container');
const previewContent  = document.getElementById('preview-content');
const previewPane     = document.getElementById('preview-pane');
const previewDivider  = document.getElementById('divider');
const filenameEl      = document.getElementById('filename');
const modifiedDot     = document.getElementById('modified-dot');
const editorHeader    = document.getElementById('editor-header');

// ═══════════════════════════════════════════════════════════════════════════════
// Preview visibility
// ═══════════════════════════════════════════════════════════════════════════════
function setPreviewVisible(visible) {
  previewPane.classList.toggle('preview-hidden', !visible);
  previewDivider.classList.toggle('preview-hidden', !visible);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Editor state helpers
// ═══════════════════════════════════════════════════════════════════════════════
let currentFilePath = null;
let isModified      = false;
let currentIsMarkdown = true;

function updatePreview(text) {
  previewContent.innerHTML = marked.parse(text);
  previewContent.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.disabled = true; });
}

function setModified(val) {
  isModified = val;
  modifiedDot.classList.toggle('hidden', !val);
}

function setEditorLabel(ext) {
  const lang = EXT_LANG_NAME[ext] || (ext ? ext.toUpperCase() : 'Plain Text');
  editorHeader.textContent = `EDITOR — ${lang}`;
}

function setCurrentFile(filePath) {
  currentFilePath = filePath;
  const name = filePath ? filePath.split('/').pop() : 'untitled.md';
  filenameEl.textContent = name;
  if (window.electronAPI) window.electronAPI.setTitle(`MDSight — ${name}`);
  explorer.setActiveFile(filePath);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CodeMirror — language compartment for hot-swapping
// ═══════════════════════════════════════════════════════════════════════════════
const languageConf = new Compartment();

const updateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged) {
    setModified(true);
    if (currentIsMarkdown) updatePreview(update.state.doc.toString());
  }
});

const editorTheme = EditorView.theme({
  '&': { backgroundColor: '#1e1e1e', color: '#d4d4d4', height: '100%' },
  '.cm-content': {
    padding: '12px 0',
    caretColor: '#aeafad',
    fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code','Menlo','Monaco',monospace",
    fontSize: '14px',
    lineHeight: '1.6',
  },
  '.cm-line': { padding: '0 20px' },
  '.cm-focused': { outline: 'none' },
}, { dark: true });

const cmState = EditorState.create({
  doc: DEFAULT_DOC,
  extensions: [
    history(),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    drawSelection(),
    dropCursor(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    oneDark,
    editorTheme,
    // Language lives in a Compartment so it can be reconfigured at runtime
    languageConf.of(markdown({ base: markdownLanguage, codeLanguages: languages })),
    updateListener,
    EditorView.lineWrapping,
  ],
});

const view = new EditorView({ state: cmState, parent: editorContainer });

// Initialise UI for default (markdown) state
setEditorLabel('md');
setPreviewVisible(true);
updatePreview(DEFAULT_DOC);

// ═══════════════════════════════════════════════════════════════════════════════
// Language switching
// ═══════════════════════════════════════════════════════════════════════════════
async function applyLanguage(ext) {
  const isMd = isMarkdownExt(ext);
  currentIsMarkdown = isMd;
  setPreviewVisible(isMd);
  setEditorLabel(ext || 'md');

  if (isMd) {
    view.dispatch({
      effects: languageConf.reconfigure(
        markdown({ base: markdownLanguage, codeLanguages: languages })
      ),
    });
    return;
  }

  // Search @codemirror/language-data by file extension
  const desc = languages.find(l => l.extensions && l.extensions.includes(ext));
  if (desc) {
    try {
      const langSupport = await desc.load();
      view.dispatch({ effects: languageConf.reconfigure(langSupport) });
    } catch {
      view.dispatch({ effects: languageConf.reconfigure([]) });
    }
  } else {
    // No grammar available — plain text (no highlighting)
    view.dispatch({ effects: languageConf.reconfigure([]) });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Load a file into the editor
// ═══════════════════════════════════════════════════════════════════════════════
async function loadFileIntoEditor(filePath, content) {
  const ext = extFromPath(filePath);

  // Swap content first so the user sees it immediately
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
  setCurrentFile(filePath);
  setModified(false);

  // Then apply the language (may need an async grammar load)
  await applyLanguage(ext);

  // Render preview if markdown
  if (isMarkdownExt(ext)) updatePreview(content);
}

// ═══════════════════════════════════════════════════════════════════════════════
// File-type icon helpers (explorer)
// ═══════════════════════════════════════════════════════════════════════════════
const EXT_COLOUR = {
  md: '#519aba', markdown: '#519aba', mdx: '#519aba',
  js: '#cbcb41', mjs: '#cbcb41', cjs: '#cbcb41',
  ts: '#519aba', tsx: '#519aba', jsx: '#e8b13a',
  json: '#cbcb41', jsonc: '#cbcb41',
  css: '#519aba', scss: '#cd6799', sass: '#cd6799', less: '#2a4f83',
  html: '#e37933', htm: '#e37933',
  py: '#3572a5', rb: '#cc342d',
  sh: '#89e051', bash: '#89e051', zsh: '#89e051',
  rs: '#dea584', go: '#00acd7',
  c: '#555599', h: '#555599',
  cpp: '#f34b7d', cc: '#f34b7d', cxx: '#f34b7d', hpp: '#f34b7d',
  java: '#b07219', kt: '#a97bff', kts: '#a97bff',
  swift: '#e05138', php: '#8892be',
  yaml: '#cb171e', yml: '#cb171e',
  toml: '#9c4221', xml: '#e37933', svg: '#ffb13b',
  sql: '#dad8d8', r: '#198ce7', lua: '#000080', vim: '#019733',
};

const FOLDER_SVG = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none">
  <path d="M1 3.5A.5.5 0 011.5 3h3.086a.5.5 0 01.353.146L5.854 4.1a.5.5 0 00.353.146H13.5a.5.5 0 01.5.5v7a.5.5 0 01-.5.5h-12a.5.5 0 01-.5-.5V3.5z" fill="currentColor"/>
</svg>`;

const FOLDER_OPEN_SVG = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none">
  <path d="M1 3.5A.5.5 0 011.5 3h3.086a.5.5 0 01.353.146L5.854 4.1a.5.5 0 00.353.146H13.5a.5.5 0 01.5.5v.5H1V3.5z" fill="currentColor"/>
  <path d="M1 5.5h13l-1.5 6H2.5L1 5.5z" fill="currentColor"/>
</svg>`;

const CHEVRON_SVG = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
  <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const FILE_SVG = `<svg width="13" height="15" viewBox="0 0 13 15" fill="none">
  <path d="M1 1.5A.5.5 0 011.5 1H8l4 4v9a.5.5 0 01-.5.5h-10A.5.5 0 011 14V1.5z" stroke="currentColor" stroke-width="1.1" fill="none"/>
  <path d="M8 1v3.5a.5.5 0 00.5.5H12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
</svg>`;

function fileIconEl(ext) {
  const div = document.createElement('div');
  div.className = 'item-icon';
  div.innerHTML = FILE_SVG;
  div.style.color = EXT_COLOUR[ext] || '#8a8a8a';
  return div;
}

function folderIconEl(open) {
  const div = document.createElement('div');
  div.className = 'item-icon';
  div.innerHTML = open ? FOLDER_OPEN_SVG : FOLDER_SVG;
  div.style.color = '#dcb67a';
  return div;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Explorer module
// ═══════════════════════════════════════════════════════════════════════════════
const explorer = (() => {
  let rootPath     = null;
  let rootName     = null;
  let activeFile   = null;
  let rootExpanded = true;
  const expanded   = new Set();
  const children   = new Map();

  const pane           = document.getElementById('explorer-pane');
  const emptyEl        = document.getElementById('explorer-empty');
  const treeRoot       = document.getElementById('tree-root');
  const openFolderBtn  = document.getElementById('open-folder-btn');
  const emptyOpenBtn   = document.getElementById('empty-open-btn');
  const collapseAllBtn = document.getElementById('collapse-all-btn');

  function setActiveFile(filePath) {
    activeFile = filePath;
    render();
  }

  async function loadChildren(dirPath) {
    if (children.has(dirPath)) return;
    const entries = await window.electronAPI.readDirectory(dirPath);
    children.set(dirPath, entries || []);
  }

  async function openFolder(folderInfo) {
    // Stop watching the previous root (if any)
    if (window.electronAPI) window.electronAPI.unwatchRoot();

    rootPath = folderInfo.path;
    rootName = folderInfo.name;
    expanded.clear();
    children.clear();
    rootExpanded = true;
    await loadChildren(rootPath);
    emptyEl.classList.add('hidden');
    treeRoot.classList.remove('hidden');
    render();

    // Start watching the new root for filesystem changes
    if (window.electronAPI) window.electronAPI.watchRoot(rootPath);
  }

  // ── Filesystem change handler (debounced) ──────────────────────────────────
  let fsChangeTimer = null;
  const pendingDirs = new Set();

  async function flushFsChanges() {
    const dirs = [...pendingDirs];
    pendingDirs.clear();
    let needsRender = false;

    for (const dir of dirs) {
      if (!children.has(dir)) continue; // not in cache — nothing to update
      // Reload this directory (clear cache entry so loadChildren re-fetches)
      children.delete(dir);
      // Only re-fetch if the directory is currently visible
      if (dir === rootPath || expanded.has(dir)) {
        await loadChildren(dir);
      }
      needsRender = true;
    }

    if (needsRender) render();
  }

  if (window.electronAPI) {
    window.electronAPI.onFsChange(({ changedDir }) => {
      pendingDirs.add(changedDir);
      clearTimeout(fsChangeTimer);
      fsChangeTimer = setTimeout(flushFsChanges, 120);
    });
  }

  function collapseAll() {
    expanded.clear();
    render();
  }

  function render() {
    if (!rootPath) return;
    treeRoot.innerHTML = '';

    const section = document.createElement('div');
    section.className = `tree-section${rootExpanded ? ' open' : ''}`;
    section.innerHTML = `<span class="chevron">${CHEVRON_SVG}</span>`;
    const label = document.createElement('span');
    label.textContent = rootName.toUpperCase();
    label.style.cssText = 'overflow:hidden;text-overflow:ellipsis';
    section.appendChild(label);
    section.addEventListener('click', () => { rootExpanded = !rootExpanded; render(); });
    treeRoot.appendChild(section);

    if (rootExpanded) renderDir(rootPath, 0);
  }

  function renderDir(dirPath, depth) {
    for (const entry of children.get(dirPath) || []) renderEntry(entry, depth);
  }

  function renderEntry(entry, depth) {
    const row = document.createElement('div');
    row.className = 'tree-item' + (entry.isDir ? ' dir' : '');
    if (entry.isDir && expanded.has(entry.path)) row.classList.add('dir-open');
    if (!entry.isDir && entry.path === activeFile) row.classList.add('active');

    const indentEl = document.createElement('div');
    indentEl.className = 'indent';
    for (let i = 0; i < depth; i++) {
      const u = document.createElement('div');
      u.className = 'indent-unit';
      indentEl.appendChild(u);
    }
    row.appendChild(indentEl);

    const chevronEl = document.createElement('div');
    chevronEl.className = 'item-chevron';
    if (entry.isDir) chevronEl.innerHTML = CHEVRON_SVG;
    row.appendChild(chevronEl);

    row.appendChild(entry.isDir ? folderIconEl(expanded.has(entry.path)) : fileIconEl(entry.ext));

    const labelEl = document.createElement('div');
    labelEl.className = 'item-label';
    labelEl.textContent = entry.name;
    row.appendChild(labelEl);

    row.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (entry.isDir) {
        if (expanded.has(entry.path)) { expanded.delete(entry.path); }
        else { await loadChildren(entry.path); expanded.add(entry.path); }
        render();
      } else {
        const content = await window.electronAPI.readFile(entry.path);
        if (content !== null) loadFileIntoEditor(entry.path, content);
      }
    });

    treeRoot.appendChild(row);
    if (entry.isDir && expanded.has(entry.path)) renderDir(entry.path, depth + 1);
  }

  async function handleOpenFolder() {
    const result = await window.electronAPI.openFolderDialog();
    if (result) openFolder(result);
  }

  openFolderBtn.addEventListener('click', handleOpenFolder);
  emptyOpenBtn.addEventListener('click', handleOpenFolder);
  collapseAllBtn.addEventListener('click', collapseAll);

  let _collapsed = false;
  function toggle() {
    _collapsed = !_collapsed;
    pane.classList.toggle('collapsed', _collapsed);
  }

  if (window.electronAPI) {
    window.electronAPI.onFolderOpened((data) => openFolder(data));
  }

  return { setActiveFile, toggle };
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Electron IPC — editor menus
// ═══════════════════════════════════════════════════════════════════════════════

// Shared save helper — saves to `filePath`, updates state, returns true on success
async function saveToPath(filePath) {
  try {
    window.electronAPI.saveFile(filePath, view.state.doc.toString());
    setCurrentFile(filePath);
    setModified(false);
    return true;
  } catch {
    return false;
  }
}

// Prompt for a save path then write.
// `defaultPath` should be the full existing path (so the dialog opens in the
// right directory) or just a bare filename for brand-new documents.
async function saveWithDialog(defaultPath) {
  const filePath = await window.electronAPI.showSaveDialog({
    defaultPath: defaultPath || 'untitled.md',
  });
  if (filePath) await saveToPath(filePath);
}

// Central save dispatcher — called by both the keyboard shortcut and the menu.
function doSave() {
  if (currentFilePath) {
    // File already has a path: overwrite it directly, no dialog needed.
    saveToPath(currentFilePath);
  } else {
    saveWithDialog('untitled.md');
  }
}

function doSaveAs() {
  // Pass the full current path so the dialog opens in the same directory
  // and pre-fills the filename. Falls back to 'untitled.md' for new docs.
  saveWithDialog(currentFilePath || 'untitled.md');
}

if (window.electronAPI) {
  // ── New document ────────────────────────────────────────────────────────────
  window.electronAPI.onMenuNew(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    setCurrentFile(null);
    setModified(false);
    applyLanguage('md');
    updatePreview('');
  });

  // ── Open file (from menu) ───────────────────────────────────────────────────
  window.electronAPI.onFileOpened(({ path, content }) => {
    loadFileIntoEditor(path, content);
  });

  // ── Save / Save As signals from the application menu ───────────────────────
  window.electronAPI.onMenuSave(doSave);
  window.electronAPI.onMenuSaveAs(doSaveAs);
}

// ── New Window button in titlebar ─────────────────────────────────────────────
document.getElementById('new-window-btn').addEventListener('click', () => {
  if (window.electronAPI) window.electronAPI.newWindow();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Keyboard shortcuts (⌘/Ctrl variants handled here so both keys always work)
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (!e.metaKey && !e.ctrlKey) return;

  if (e.key === 'b') {
    e.preventDefault();
    explorer.toggle();
    return;
  }

  // Save shortcuts — handled directly in the renderer so Ctrl+S works on
  // macOS even though the menu accelerator only fires on ⌘S.
  if (e.key === 's' && !e.shiftKey) {
    e.preventDefault();
    doSave();
    return;
  }

  if (e.key === 's' && e.shiftKey) {
    e.preventDefault();
    doSaveAs();
    return;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Resizable dividers
// ═══════════════════════════════════════════════════════════════════════════════
function makeDraggable(handleEl, getTarget, getDimension, applySize, minSize = 160) {
  let dragging = false, startPos = 0, startSize = 0;

  function stopDrag() {
    if (!dragging) return;
    dragging = false;
    handleEl.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  handleEl.addEventListener('mousedown', (e) => {
    dragging  = true;
    startPos  = e.clientX;
    startSize = getDimension(getTarget());
    handleEl.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta   = e.clientX - startPos;
    const appW    = document.getElementById('app').offsetWidth;
    const newSize = Math.max(minSize, Math.min(startSize + delta, appW - minSize * 2));
    applySize(getTarget(), newSize);
  });

  document.addEventListener('mouseup', stopDrag);
  // Reset if the user switches away from the window mid-drag
  window.addEventListener('blur', stopDrag);
}

makeDraggable(
  document.getElementById('explorer-divider'),
  () => document.getElementById('explorer-pane'),
  (el) => el.offsetWidth,
  (el, size) => { el.style.width = `${size}px`; },
  140,
);

makeDraggable(
  document.getElementById('divider'),
  () => document.getElementById('editor-pane'),
  (el) => el.offsetWidth,
  (el, size) => { el.style.flex = 'none'; el.style.width = `${size}px`; },
  180,
);

view.focus();
