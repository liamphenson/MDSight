# MDSight
A lightweight Markdown editor for macOS with **live preview**

## Features
- Real-time Markdown rendering as you type
- VSCode-style syntax highlighting for Markdown and 100+ other languages
- Full GFM (GitHub Flavored Markdown) support with syntax-highlighted fenced code blocks
- File explorer sidebar with real-time filesystem updates
- Multiple independent windows for working on separate projects simultaneously
- Preview panel is Markdown-only — automatically hides for code and config files

## Usage Guide

### Opening files and folders

| Action | How |
|---|---|
| Open a file | **File → Open…** or `⌘O` |
| Open a folder in the explorer | **File → Open Folder…** or `⌘⇧O`, or click the folder icon in the explorer header |
| Open a file from the explorer | Single-click any file in the sidebar |

### Editing

The left pane is a full code editor powered by CodeMirror. It supports:

- Syntax highlighting for Markdown, Python, JavaScript/TypeScript, Rust, Go, C/C++, Java, Shell, YAML, TOML, SQL, and [many more](https://codemirror.net/5/mode/)
- Line numbers, active-line highlight, and word wrap
- Standard text editing shortcuts (`⌘Z` undo, `⌘X`/`⌘C`/`⌘V` cut/copy/paste, `⌘A` select all)
- Tab key inserts indentation

### Live preview

When a Markdown file is open, the right pane renders the output in real time. The preview panel is hidden automatically for non-Markdown files (e.g. Python scripts, Dockerfiles) so the editor uses the full width.

### Saving files

| Action | Shortcut |
|---|---|
| Save (overwrites existing file in place) | `⌘S` or `Ctrl+S` |
| Save As… (choose a new path) | `⌘⇧S` |

New unsaved buffers prompt for a file path on first save.

### File explorer

- **Toggle** the sidebar: `⌘B`
- **Expand/collapse** folders: click the chevron or the folder name
- The explorer **updates in real time** when files or folders are added, renamed, or deleted on disk — no manual refresh needed
- Drag the divider between the explorer and editor to resize either pane

### Multiple windows

Open additional independent MDSight windows to work on separate projects at the same time:

- **File → New Window** or `⌘⇧N`
- Or click the stacked-windows button (⧉) in the top-right corner of the titlebar

Each window has its own editor state, open file, and explorer root — they do not share state.

### Keyboard shortcuts summary

| Shortcut | Action |
|---|---|
| `⌘O` | Open file |
| `⌘⇧O` | Open folder in explorer |
| `⌘S` / `Ctrl+S` | Save |
| `⌘⇧S` | Save As… |
| `⌘N` | New (clear editor) |
| `⌘⇧N` | New Window |
| `⌘B` | Toggle file explorer |
| `⌘Z` / `⌘⇧Z` | Undo / Redo |

## Development

```bash
# Install dependencies
npm install

# Run in development mode (hot-reloads renderer)
npm start

# Build and package as a macOS .app
npm run package
```

The packaged app is written to `release/mac-arm64/MDSight.app`. Copy it to `/Applications` to install.

**Tech stack:** Electron · CodeMirror 6 · Vite · marked · highlight.js · chokidar
