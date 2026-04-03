# Changelog

## [2.2.0] — 2026-04-03

### Added
- PT/EN language toggle across extension UI, MCP prompt output, and Claude responses
- Language preference persists in `chrome.storage.sync` (syncs across devices)
- MCP server status indicator (green/red dot) in popup
- Pending annotations count badge in popup (populated from `/health` response)
- `skills/annotator.md` — Claude Code skill for explicit `/annotator` queue processing
- `CLAUDE.md` — project instruction for automatic queue check after each Claude response

### Fixed
- Annotator state always showing "Inactive" on restricted tabs (chrome://, about:blank)
- `i18n.js` not injected before `content.js` in dynamic script injection paths (keyboard shortcut + popup toggle)

---

## [2.1.0] — 2026-04-03

### Added
- Multi-server support: popup scans ports 3847–3856, shows live servers by name, persists selection in chrome.storage.session
- ANNOTATOR_NAME env var: identify each Claude session (`PORT=3848 ANNOTATOR_NAME="backend" node mcp/server.js`)
- Session persistence: annotations survive tab refresh and switching within browser session (chrome.storage.session, keyed by URL)
- Annotation edit: click a marker to view comment, edit, or delete via popover
- Marker popover: shows annotation comment with edit/delete buttons on click (uses textContent, XSS-safe)
- "Limpar sessão" toolbar button with 2-click inline confirmation
- extension/config.js: shared constants (ports, secret, timeout)
- mcp/server.test.js: smoke tests for HTTP routes (node:test, no extra dependencies)
- ANNOTATOR_NAME and port exposed in GET /health response

### Changed
- Per-port queue files: ~/.claude/annotator-queue-{PORT}.json (no cross-session contamination)
- Popup send button shows annotation count: Enviar para CLI (3)
- Keyboard shortcut: Cmd+Shift+Y / Ctrl+Shift+Y (Cmd+Shift+A conflicts on macOS)
- Popup no longer auto-closes after send
- captureElementsInRect uses 5-point majority sampling instead of single centre point
- Toolbar status text updates dynamically with annotation count
- sendToCLI accepts dynamic server URL from popup
- Popup error messages use textContent (not innerHTML)

### Fixed
- Double injection: window.__cpaLoaded guard prevents duplicate IIFE state when script injected twice
- deactivate() no longer wipes annotations — only removes UI elements
- Dead #cpa-export-panel CSS removed from content.css
- MCP SDK pinned to exact version 1.29.0

---

## [2.0.0] — 2026-04-03

### Changed
- Export replaced by direct CLI channel via local MCP plugin
  - Annotations POSTed to localhost:{PORT}/annotate, written to ~/.claude/annotator-queue-{PORT}.json
  - MCP tool get_annotations exposed to Claude CLI; user types "ver anotações" to retrieve

### Added
- mcp/server.js — HTTP + MCP bridge (GET /health, POST /annotate, X-Annotator-Secret auth, 1MB limit)
- Health check in popup before sending (timeout 1.5s)
- Inline error message in popup when server is not running
- Visual feedback on toolbar button: pending, success, error states

### Removed
- showExportPanel(), generatePrompt(), generateMarkdown(), clipboard logic

### Fixed
- Popup error on restricted pages (chrome://)
- Content script inject-on-demand in background.js shortcut handler
- CORS headers on all HTTP responses

---

## [1.0.0] — 2026-04-01

### Added
- Area selection by drag
- Annotations with categories: Código, Acessibilidade, Conteúdo
- Visual markers on page
- Clipboard export (formatted prompt + Markdown)
- Shortcut Cmd+Shift+A / Ctrl+Shift+A
