# Scranton Branch 0.4.6-fork.19

**fork.19:** **WSL offices, the rest of the way** — memory (mempalace) runs inside the distribution, so the Memory panel no longer reads "Not set up"; workers god hires start in the distribution; md-api, runners, the knowledge graph and Slack replies use the distribution's node; Windows paths reach agents as /mnt paths (attachments too); resume, restore, usage, context gauge and memory condensing read the distribution's transcripts; qwen/crush, Slack replies and services that start late reach agents through the bridge; worktree dependencies, skills and Codex logins live on the Linux side. **Security** — API keys and tokens no longer appear on the wsl.exe command line; an agent can no longer write files outside the hive through a message id, run code through the hive's git hooks, or steer the app window to another page; network paths from agents are refused (no NTLM hash leaks); a port held by another program inside WSL is never handed to agents; the runner "files changed" check can no longer be fooled by shell profiles or hidden git flags; an engine's base URL no longer leaks into every other agent. **fork.18:** WSL problems now say what is wrong: a missing or blocked `wsl.exe` (security software, company policy), a timeout, a missing distribution, virtualization turned off, or node missing inside the distribution — instead of a raw or empty error. The tool check inside WSL tells you when it could not look, rather than listing everything as missing. **fork.17:** **WSL offices** — on Windows, create a floor inside a WSL distribution and the whole office runs in Linux: agents (Claude Code, agy, Codex…), git and tools, with nothing to change in your network settings; the prerequisites check looks inside the distribution and gives Linux install commands, and runners with secrets run there too. **MCP** — see the MCP servers you already set up for Claude Code, Claude Desktop, Cursor, Codex, Gemini CLI or Windsurf, and import them in one click: their keys move to the encrypted store and the server runs inside the app, so agents never see them; or add your own. **fork.16:** Environment — variables for your agents, and secrets they can use but never see: plain values go into their environment; secrets (stored encrypted) and 1Password references (op://…) only into runners, commands you define that the app runs for an agent and whose output comes back masked, asking you first when the agent changed files. **fork.15:** a factory's board — open any task for its details, parts and history; parent tasks fold their parts; five per column with show more; search; how long each task has been where it is; usage bars that separate the factory's own use from the rest of the account and mark its ceiling. Team: join with an invite on the first visit, and text boxes keep working after confirming a delete. **fork.14:** a factory has a third view, the Line (each worker: what they finished, what they are on, what is next); name tags on the map are short enough not to collide; long task titles no longer run out of the desks. **fork.13:** the REST APIs gallery in Connections no longer spills out of its card; Factories pause when a factory says it is busy (429). **fork.12:** a factory floor shows roles: each worker's name tag carries its role, and a legend of roles (with how many are at work) highlights one at a time. **fork.11:** Factories — add a software factory that speaks Factory MCP and watch it work: its workers on a pixel-art floor (or as desks), work handed between them, a board per project, its usage, and a form to send it tasks when it accepts them. **fork.10:** an image you paste or attach in a message shows as a thumbnail; click it to see it large. **fork.9:** quitting lets Claude Code agents close themselves first, so Michael no longer stays listed in the Claude app after the office is closed. **fork.8:** Windows lists the publisher as Scranton Branch.

**New name.** This fork is now **Scranton Branch**: its own app, its own repository, installed separately from upstream's Munder Difflin. The two no longer share a data folder or keychain entry. **Coming from the old name?** Install this one. On first launch it copies your settings, offices and history, and offers to remove the old "Munder Difflin …-fork" app. Upstream's own Munder Difflin is never touched. On macOS and Linux, Connection keys and the Team pairing are locked to the old app name: re-enter the keys and pair Team again.

The sidebar layout is now **Manager**, next to the classic **Floor**.

Scranton Branch is the branch office of [Munder Difflin](https://github.com/HarnessMD/munder-difflin) 0.4.6: everything the open-source app does, plus offices that work together.

**Versioning.** `<upstream version>-fork.<patch>`: upstream 0.4.6 plus patch 17. The in-app updater only follows this repository.

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
| Universal (Apple Silicon + Intel) | [`Scranton-Branch-0.4.6-fork.19-mac-universal.dmg`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.19-mac-universal.dmg) |

### Windows
| | |
|---|---|
| Installer (x64), *recommended* | [`Scranton-Branch-0.4.6-fork.19-win-x64-setup.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.19-win-x64-setup.exe) |
| Portable (x64, no install) | [`Scranton-Branch-0.4.6-fork.19-win-x64-portable.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.19-win-x64-portable.exe) |

### Linux
| | |
|---|---|
| AppImage (x86_64) | [`Scranton-Branch-0.4.6-fork.19-linux-x86_64.AppImage`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.19-linux-x86_64.AppImage) |
| Server, no GUI (x64) | [`scranton-branch-server-0.4.6-fork.19-linux-x64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.19-linux-x64.tar.gz) |
| Server, no GUI (arm64) | [`scranton-branch-server-0.4.6-fork.19-linux-arm64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.19-linux-arm64.tar.gz) |

Server: unpack, then run `sudo ./install.sh`. Setup, Docker and secrets are in [SERVER.md](https://github.com/diegodiaz1256/scranton-branch/blob/main/SERVER.md). A server installed as `munder-difflin-server` (fork.5–6) keeps running. To switch, stop and disable `munder-difflin`, run the new installer, and copy `/var/lib/munder-difflin` and `/etc/munder-difflin` to the `scranton-branch` paths.

Builds are not code-signed yet: macOS asks you to allow the app in System Settings → Privacy & Security, and Windows SmartScreen asks you to confirm ("More info" → "Run anyway").

Source: [`v0.4.6-fork.19`](https://github.com/diegodiaz1256/scranton-branch/archive/refs/tags/v0.4.6-fork.19.tar.gz)
