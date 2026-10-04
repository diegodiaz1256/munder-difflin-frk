# Scranton Branch 0.4.6-fork.12

**fork.12:** a factory floor shows roles: each worker's name tag carries its role, and a legend of roles (with how many are at work) highlights one at a time. **fork.11:** Factories — add a software factory that speaks Factory MCP and watch it work: its workers on a pixel-art floor (or as desks), work handed between them, a board per project, its usage, and a form to send it tasks when it accepts them. **fork.10:** an image you paste or attach in a message shows as a thumbnail; click it to see it large. **fork.9:** quitting lets Claude Code agents close themselves first, so Michael no longer stays listed in the Claude app after the office is closed. **fork.8:** Windows lists the publisher as Scranton Branch.

**New name.** This fork is now **Scranton Branch**: its own app, its own repository, installed separately from upstream's Munder Difflin. The two no longer share a data folder or keychain entry. **Coming from the old name?** Install this one. On first launch it copies your settings, offices and history, and offers to remove the old "Munder Difflin …-fork" app. Upstream's own Munder Difflin is never touched. On macOS and Linux, Connection keys and the Team pairing are locked to the old app name: re-enter the keys and pair Team again.

The sidebar layout is now **Manager**, next to the classic **Floor**.

Scranton Branch is the branch office of [Munder Difflin](https://github.com/HarnessMD/munder-difflin) 0.4.6: everything the open-source app does, plus offices that work together.

**Versioning.** `<upstream version>-fork.<patch>`: upstream 0.4.6 plus patch 12. The in-app updater only follows this repository.

## What the branch adds

- **Team**: pair offices with a one-time invite. Teams and people get their own permission levels and relay. Messages are sealed end to end and **post-quantum** (X25519 + ML-KEM-768, Ed25519 signatures).
- **Any relay**: public MQTT brokers (the default: sub-second, no daily cap), ntfy servers, or your own. Private relays take an access token.
- **Server edition**: the office headless on Ubuntu (systemd) or Docker, no Chromium. Pair it with your desktop through Team. See SERVER.md.
- **Connections whose keys agents never see**: GitHub, Postgres (read-only), web search, Notion and Sentry, several accounts each. Keyed MCP servers run inside the app, and agents only hold a capability token.
- **Manager layout**: Agents, Tasks, Inbox, Automations, Memory, Capabilities (your own role bundles), Connections, Team and Temps, with built-in guides.
- **MCP servers actually reach agents** (`--mcp-config`). The orchestrator manages Automations. Archived agents can be reopened, and stopping an agent keeps its uncommitted work.
- **Windows**: the installer works on current Windows 11, hooks work from folders with spaces, and the hook socket survives a busy main thread.
- **No product analytics.**

## Downloads

### macOS
| | |
|---|---|
| Universal (Apple Silicon + Intel) | [`Scranton-Branch-0.4.6-fork.12-mac-universal.dmg`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.12-mac-universal.dmg) |

### Windows
| | |
|---|---|
| Installer (x64), *recommended* | [`Scranton-Branch-0.4.6-fork.12-win-x64-setup.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.12-win-x64-setup.exe) |
| Portable (x64, no install) | [`Scranton-Branch-0.4.6-fork.12-win-x64-portable.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.12-win-x64-portable.exe) |

### Linux
| | |
|---|---|
| AppImage (x86_64) | [`Scranton-Branch-0.4.6-fork.12-linux-x86_64.AppImage`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.12-linux-x86_64.AppImage) |
| Server, no GUI (x64) | [`scranton-branch-server-0.4.6-fork.12-linux-x64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.12-linux-x64.tar.gz) |
| Server, no GUI (arm64) | [`scranton-branch-server-0.4.6-fork.12-linux-arm64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.12-linux-arm64.tar.gz) |

Server: unpack, then run `sudo ./install.sh`. Setup, Docker and secrets are in [SERVER.md](https://github.com/diegodiaz1256/scranton-branch/blob/main/SERVER.md). A server installed as `munder-difflin-server` (fork.5–6) keeps running. To switch, stop and disable `munder-difflin`, run the new installer, and copy `/var/lib/munder-difflin` and `/etc/munder-difflin` to the `scranton-branch` paths.

Builds are not code-signed yet: macOS asks you to allow the app in System Settings → Privacy & Security, and Windows SmartScreen asks you to confirm ("More info" → "Run anyway").

Source: [`v0.4.6-fork.12`](https://github.com/diegodiaz1256/scranton-branch/archive/refs/tags/v0.4.6-fork.12.tar.gz)
