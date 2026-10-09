<div align="center">

<img src="./docs/logo.png" alt="Scranton Branch" width="160">

# Scranton Branch

### The branch office of Munder Difflin: offices that work together

<p>
  <a href="./LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-F4D35E.svg?style=flat-square&labelColor=6E1423"></a>
  <a href="https://github.com/diegodiaz1256/scranton-branch/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/diegodiaz1256/scranton-branch?style=flat-square&label=release&color=F4D35E&labelColor=6E1423"></a>
  <img alt="Platform: macOS | Windows | Linux | Linux server" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20server-F4F1EA.svg?style=flat-square&labelColor=6E1423">
</p>

<img src="./docs/media/floor.png" alt="The office floor: agents at desks working in parallel" width="1100">

</div>

Scranton Branch runs the coding agents you already use (Claude Code, Codex, Gemini CLI,
Grok, Kimi, Qwen, OpenCode, Crush, pi, Copilot, Cursor, or any command) as a real office on
your machine: an orchestrator that hands out the work, agents in their own terminals and
worktrees, a shared hive for messages, tasks and memory.

It started as a fork of [Munder Difflin](https://github.com/HarnessMD/munder-difflin) and
keeps everything the open-source app does. What it adds is about **more than one office**:
branches that talk to each other, offices that run on a server with nobody watching, and
credentials that stay with the office instead of with its agents.

## What the branch adds

**Team: offices that work together.** Pair your office with a colleague's, or with a server
of your own, using a one-time invite. Teams have their own relay and permission levels, and
each person can get different ones: their messages reach your orchestrator directly, or
wait for you. There is no server of ours in between. Messages are **sealed end to end and
post-quantum**: X25519 combined with ML-KEM-768 (FIPS 203), signed with Ed25519. Pairs made
before that upgrade themselves, and a post-quantum pair refuses to fall back to classical.

**Any relay.** A team relay can be a public MQTT broker (the default: about a second to pair,
a fraction of one to deliver, no daily cap), an ntfy server (keeps messages 12 h for someone
offline), or one you run. The relay only ever sees a random mailbox and opaque bytes.

**The office as a server.** `scranton-branch-server` is the same office with no GUI and no
Chromium: a ~3.5 MB Node app for Ubuntu (systemd installer) or Docker, with CPU and memory
limits. Pair it with your desktop through Team and its orchestrator becomes one of your
teammates. See [SERVER.md](./SERVER.md).

**Factories: somewhere to send work.** Point Scranton Branch at a software factory that speaks
[Factory MCP](./FACTORY-MCP.md), an open profile of MCP, and send it whole tasks. You follow
them through its pipeline and answer its questions; the orchestrator can delegate to it too.

**Connections whose keys agents never see.** GitHub, Postgres (read-only), web search, Notion
and Sentry, with as many accounts of each as you need. Keys are encrypted at rest. Keyed MCP
servers run inside the app, so an agent only holds a capability token. The REST APIs go
through a local broker. A server's key is out of its agents' reach by design: they run as
another user.

**The Manager layout.** Alongside the classic Floor, a desk view with one screen at a time:
Agents, Tasks, Inbox, Automations, Memory, Capabilities (with role bundles you define),
Connections, Team, Temps. Built-in guides walk you through Connections and Team.

**No product analytics.** The build carries no analytics key, and nothing phones home. See
[PRIVACY.md](./PRIVACY.md) for every connection the app makes, and
[CODE_SIGNING.md](./CODE_SIGNING.md) for how releases are signed.

## Download

| | |
|---|---|
| Windows (x64) | [installer](https://github.com/diegodiaz1256/scranton-branch/releases/latest) · portable |
| macOS (universal) | [.dmg](https://github.com/diegodiaz1256/scranton-branch/releases/latest) |
| Linux (x86_64) | [AppImage](https://github.com/diegodiaz1256/scranton-branch/releases/latest) |
| Server: Ubuntu / Debian (x64, arm64) | [tarball](https://github.com/diegodiaz1256/scranton-branch/releases/latest) · `sudo ./install.sh` |

Builds are not code-signed yet. macOS asks you to allow the app in System Settings → Privacy &
Security. On Windows, SmartScreen asks you to confirm ("More info" → "Run anyway").

**Coming from "Munder Difflin" (this fork's old name)?** Install Scranton Branch. On first
launch it copies your settings, offices and history, then offers to remove the old app. It
never touches upstream's own Munder Difflin.

## Build from source

Node 20+, git, and a C/C++ toolchain (for node-pty).

```bash
npm install
npm run dev            # live-reloading desktop app
npm run build          # production build into out/
npm run build:server   # the GUI-less server into out/server
npm run typecheck
node --test test/      # the test suite
```

Scranton Branch has its own versions from 1.0.0 (semantic versioning); before that they were
`<upstream version>-fork.<patch>`. The in-app updater only follows this repository. A push to `main` with a
new version in `package.json` builds and publishes the release.

## Architecture in one paragraph

An Electron main process owns everything privileged: PTYs, the hive on disk (only main
commits to it), the hook server, the encrypted secret store, the MCP gateway and key
broker, and the Team node. The renderer is React + Pixi; it reaches main only through
`window.cth` (preload). The floor's orchestration runs in the renderer on a desktop and, with
the same code under a DOM-less React, inside the server (`src/server/`). Details:
[CLAUDE.md](./CLAUDE.md), [HIVE.md](./HIVE.md), [SPEC.md](./SPEC.md).

## License and credits

From 1.0.0 the source code is **Apache-2.0** ([LICENSE](./LICENSE)), © the Scranton Branch
contributors. If you redistribute it, changed or not, keep the [NOTICE](./NOTICE) file with it:
that is the attribution the license asks for. The parts that come from Munder Difflin
(© Chaitanya Giri and the Munder Difflin contributors), and this fork up to 0.4.6-fork.38, stay
under the MIT License ([LICENSES/MIT-munder-difflin.txt](./LICENSES/MIT-munder-difflin.txt)).

The bundled pixel art is **Modern Interiors** by [LimeZu](https://limezu.itch.io/moderninteriors),
under its Complete Version licence, which requires credit to LimeZu. It is licensed separately
from the code ([LICENSE-ASSETS](./LICENSE-ASSETS),
[ATTRIBUTION.md](./src/renderer/src/assets/ATTRIBUTION.md)). The Office cast is drawn
procedurally.

*Munder Difflin* and *Scranton Branch* are an affectionate parody, not affiliated with NBC's
*The Office* or Dunder Mifflin. Scranton Branch is an independent fork, not affiliated with
or endorsed by the Munder Difflin / HarnessMD project.

Built on [Pixi.js](https://pixijs.com/), [xterm.js](https://xtermjs.org/),
[node-pty](https://github.com/microsoft/node-pty), [electron-vite](https://electron-vite.org/),
[@noble/post-quantum](https://github.com/paulmillr/noble-post-quantum) and
[MQTT.js](https://github.com/mqttjs/MQTT.js).
