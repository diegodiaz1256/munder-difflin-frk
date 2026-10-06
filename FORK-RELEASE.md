# Scranton Branch 0.4.6-fork.26

Connections your agents actually use, with permissions per role; one place to read what agents made; and their steps, readable instead of scrolling past in a terminal.

## What's new

### Connections and permissions
- **Agents know their connections and use them by default.** Each agent's prompt lists the connections it can call (GitHub, Database, Notion, Sentry, Web Search…) and says when one is read-only for it. OpenCode agents get them too, not only Claude Code.
- **Roles decide what an agent may do.** Capabilities → a role gives each connection *Read only* or *Read & write*; Connections sets the most any agent can do (*Nothing / Read only / Read & write*). The lower of the two wins, and the app's gateway enforces it on every call, whatever the agent's CLI. New and existing connections start read-only.
- **Who has it, and why not.** Every connection shows each agent's access, the reason when it has none (switched off, key missing, not chosen, its role does not include it…), and the latest calls agents made with it, refused ones included.
- Choosing agents for a connection that is off turns it on; Claude Code no longer asks for permission on every call to a connection you already allowed.

### MCP
- **Agents use only the servers managed here.** Claude Code agents no longer load servers from your own settings, a project's `.mcp.json` or ones an agent adds for itself (switch in Manager → MCP).
- **What each agent gets**, listed per agent. Servers found on the machine or added by an agent (also in a WSL distribution's home) say whether agents can reach them, and a GitHub, Postgres, Brave, Notion or Sentry server recommends setting it up as a Connection instead.

### Deliverables
- **Manager → Deliverables**: what agents made for you, grouped by task — files linked from the task card, the office's `research/` folder, and what each agent wrote this session. Markdown rendered (or as source), CSV as a table, JSON formatted, images shown.
- **Linked to the task automatically.** A file an agent writes in `research/` while it works a task is linked to that task, for Claude Code, Codex, Antigravity, OpenCode and Pi. A task's detail opens its deliverables.
- **Open in its app** (documents, PDFs, images, Office files without macros) or show it in its folder. Executables and scripts are only ever shown in their folder.

### Agents' steps
- **Terminal / Steps / Both** in an agent's room: a readable timeline of what it ran, read, edited, searched and called, with the file or command each time, durations and failures, filters, and credentials hidden. Works for every CLI that reports tool use.

### Environment and AI providers
- Plain variables are hidden until you press *Show*; each kind says how agents use it, and agents are told which variables they have.
- **Manager → AI providers**: model keys, endpoints and default models for OpenCode, Pi, Crush and Qwen in one place. New keys: Mistral, DeepSeek, xAI, Together AI.

### Integrations
- **Jira's Test connection works.** It called the bare `/rest/api/3` (a 404); each service is now tested with a real read (Jira `/myself`, Confluence, GitHub, Notion, Stripe, Sentry, Linear), and an untouched `your-domain` is pointed out.

## Earlier releases

| Version | Highlights |
|---|---|
| fork.25 | Memory by project and lists, model and effort per role, Spanish everywhere, 5h/weekly usage in the title bar. |
| fork.24 | Memory offline with a concept graph, hires as a CV, Remote Control button, WSL orchestrator always starts. |
| fork.23 | Upgrades install over the previous version instead of running its uninstaller. |
| fork.22 | Offices in deeply nested folders keep their agents' hooks. |
| fork.21 | The fallback uninstaller no longer stops on "in use"; the WSL folder picker opens in Linux. |
| fork.20 | "Uninstall without uninstaller" entry; trust company or local certificates. |
| fork.19 | WSL offices: memory, workers, runners and Slack replies inside the distribution. |
| fork.18 | Clear WSL errors (blocked wsl.exe, timeouts, missing distribution or node). |
| fork.17 | **WSL offices** and **MCP import** from your other tools. |
| fork.16 | **Environment**: variables for agents, and secrets they use but never see. |
| fork.11–15 | **Factories**: send work to a software factory and watch it work. |
| fork.8–10 | Publisher name, agents close cleanly on quit, image previews. |

## Downloads

### macOS
| | |
|---|---|
| Universal (Apple Silicon + Intel) | [`Scranton-Branch-0.4.6-fork.26-mac-universal.dmg`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.26-mac-universal.dmg) |

### Windows
| | |
|---|---|
| Installer (x64), *recommended* | [`Scranton-Branch-0.4.6-fork.26-win-x64-setup.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.26-win-x64-setup.exe) |
| Portable (x64, no install) | [`Scranton-Branch-0.4.6-fork.26-win-x64-portable.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.26-win-x64-portable.exe) |

### Linux
| | |
|---|---|
| AppImage (x86_64) | [`Scranton-Branch-0.4.6-fork.26-linux-x86_64.AppImage`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.26-linux-x86_64.AppImage) |
| Server, no GUI (x64) | [`scranton-branch-server-0.4.6-fork.26-linux-x64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.26-linux-x64.tar.gz) |
| Server, no GUI (arm64) | [`scranton-branch-server-0.4.6-fork.26-linux-arm64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.26-linux-arm64.tar.gz) |

Server: unpack, then run `sudo ./install.sh`. Setup, Docker and secrets are in [SERVER.md](https://github.com/diegodiaz1256/scranton-branch/blob/main/SERVER.md).

Builds are not code-signed yet: macOS asks you to allow the app in System Settings → Privacy & Security, and Windows SmartScreen asks you to confirm ("More info" → "Run anyway").

Source: [`v0.4.6-fork.26`](https://github.com/diegodiaz1256/scranton-branch/archive/refs/tags/v0.4.6-fork.26.tar.gz)

## About this fork

Scranton Branch is the branch office of [Munder Difflin](https://github.com/HarnessMD/munder-difflin) 0.4.6: everything the open-source app does, plus offices that work together (Team, post-quantum sealed), a headless server edition, Factories, WSL offices, and secrets agents use but never see. No product analytics. Versions are `<upstream>-fork.<patch>`; the in-app updater follows this repository only.
