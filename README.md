# Annotator for Claude

**[PT](README.pt.md)** | EN

Chrome extension to annotate areas of web pages and send them directly to Claude CLI via a local MCP channel — no API key required.

```
Chrome Extension  →  POST localhost:{PORT}  →  MCP Server  →  Claude CLI
```

## Features

- Drag to select any area of a page and annotate it
- Categories: Code (HTML/CSS/JS), Accessibility (WCAG), Content/Text
- Annotations persist across page refreshes (chrome.storage.session)
- Multi-server: supports multiple simultaneous Claude CLI sessions on different ports
- PT/EN language toggle — preference syncs across devices
- Automatic processing via CLAUDE.md instruction or `/annotator` skill

## Requirements

- Chrome (or Chromium-based browser)
- [Claude CLI](https://claude.ai/download) with MCP support
- Node.js 18+

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/mjvmsteixeira/claude_page_annotator.git
cd claude_page_annotator
```

### 2. Load the Chrome extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder

### 3. Install the MCP server

```bash
cd mcp && npm install
```

### 4. Register with Claude CLI

```bash
claude mcp add -s user annotator node /path/to/claude_page_annotator/mcp/server.js
```

Verify:
```bash
claude mcp list
# annotator: node .../server.js  Connected
```

## Usage

### Annotating

1. Open Claude CLI: `claude` — the MCP server starts automatically on port 3847
2. Activate the extension with **Cmd+Shift+Y** (Mac) / **Ctrl+Shift+Y** (Windows/Linux), or click the popup → **Activate Annotator**
3. Drag to select a page area
4. In the comment modal, choose categories and describe what Claude should analyse (`Ctrl+Enter` to save)
5. Click a marker to view, edit, or delete an annotation

### Sending annotations to Claude CLI

1. Select the MCP server in the popup
2. Click **Send to CLI (n)**
3. Annotations are automatically processed in Claude CLI (if CLAUDE.md is set up — see below)

### Language toggle (PT/EN)

Click the **PT | EN** button in the popup header. Preference is saved and syncs across devices.

## Claude Code integration

### Automatic processing

Copy `CLAUDE.md` to your project root (or add its contents to your existing `CLAUDE.md`):

```markdown
After each response in this project, silently call the `get_annotations` MCP tool.
- If there are pending annotations: process them immediately inline.
- If the queue is empty: say nothing.
```

Claude will check for annotations after every response — no manual trigger needed.

### `/annotator` skill

For explicit processing at any time, install the skill:

```bash
cp skills/annotator.md ~/.claude/skills/annotator.md
```

Then type `/annotator` in Claude CLI to fetch and process pending annotations.

## Multiple Claude sessions

Each session needs its own server on a different port:

```bash
# Terminal 1 — frontend session
PORT=3847 ANNOTATOR_NAME="frontend" claude

# Terminal 2 — backend session
PORT=3848 ANNOTATOR_NAME="backend" claude
```

The extension popup detects both servers automatically. Select the target before sending.

## Custom secret

To use a custom authentication secret:

```bash
ANNOTATOR_SECRET=my-secret node mcp/server.js
```

Update `DEFAULT_SECRET` in `extension/config.js` to match.

## Tests

```bash
cd mcp && npm test
```

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|---------|
| "No server found" | Server not running | Start `claude` with MCP registered |
| "Server not active" | Server stopped | Restart `claude` |
| Popup shows "Inactive" | Normal initial state | Click Activate Annotator |
| Button greyed out | Restricted page (chrome://) | Navigate to a normal page |
| No response in terminal | MCP not registered | Run `claude mcp list` and verify |
| Annotations gone after send | Expected — cleared after successful send | Normal behaviour |

## License

MIT — see [LICENSE](LICENSE)
