# Scranton Branch 0.4.6-fork.30

Dictation that works offline, agents that stop searching your disk for the office, and Pi and OpenCode as full members of the office.

## What's new

- **Offline dictation (optional).** Settings → Voice → "This computer (offline Whisper)": one download of Whisper small (≈590 MB) and dictation runs on your machine, with no connection and no key. The settings say what it needs (disk, memory, graphics card) before you download anything.
- **Agents know where everything is.** Every agent gets a map of the office with full paths and is told never to search the disk for it. The protocol is now a short index plus one small file per topic, so an agent reads only the part it needs.
- **Permanent hires from the orchestrator.** Michael knows the hire format and proposes a permanent employee for you to confirm, instead of searching for how to do it.
- **Pi and OpenCode, fully counted.** Both now record their session (so they can be resumed) and their cost, at the price the CLI reports (a local model costs 0). OpenCode no longer reports every event twice.
- **Pi on an older Node.** Pi needs Node 22.19 or newer; on an older one the app now says so, installs the current Node in the agent's terminal and starts Pi, instead of a crash.
- **Fixes:** Claude's first-run theme menu no longer comes out garbled after the app installs it; an agent restored after a reload no longer says "reconnecting…" forever; Connections and Capabilities in your language; "Keep this computer awake" instead of "Mac" on Windows and Linux; `md-run` says when there are no runners.

## Earlier releases

| Version | Highlights |
|---|---|
| fork.29 | Pi reaches your own providers with their key; text boxes stay typeable after dialogs on Windows. |
| fork.28 | APIs (Jira) apply to running agents at once, Pi keeps its model after a restart, your own models in New agent. |
| fork.27 | Pi and OpenCode sign-in and models in the app, local models, REST API access per role. |
| fork.26 | Connections with per-role permissions, Deliverables linked to tasks, readable agent steps, MCP managed in the app. |
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
| Universal (Apple Silicon + Intel) | [`Scranton-Branch-0.4.6-fork.30-mac-universal.dmg`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.30-mac-universal.dmg) |

### Windows
| | |
|---|---|
| Installer (x64), *recommended* | [`Scranton-Branch-0.4.6-fork.30-win-x64-setup.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.30-win-x64-setup.exe) |
| Portable (x64, no install) | [`Scranton-Branch-0.4.6-fork.30-win-x64-portable.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.30-win-x64-portable.exe) |

### Linux
| | |
|---|---|
| AppImage (x86_64) | [`Scranton-Branch-0.4.6-fork.30-linux-x86_64.AppImage`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.30-linux-x86_64.AppImage) |
| Server, no GUI (x64) | [`scranton-branch-server-0.4.6-fork.30-linux-x64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.30-linux-x64.tar.gz) |
| Server, no GUI (arm64) | [`scranton-branch-server-0.4.6-fork.30-linux-arm64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.30-linux-arm64.tar.gz) |

Server: unpack, then run `sudo ./install.sh`. Setup, Docker and secrets are in [SERVER.md](https://github.com/diegodiaz1256/scranton-branch/blob/main/SERVER.md).

Builds are not code-signed yet: macOS asks you to allow the app in System Settings → Privacy & Security, and Windows SmartScreen asks you to confirm ("More info" → "Run anyway").

Source: [`v0.4.6-fork.30`](https://github.com/diegodiaz1256/scranton-branch/archive/refs/tags/v0.4.6-fork.30.tar.gz)

## About this fork

Scranton Branch is the branch office of [Munder Difflin](https://github.com/HarnessMD/munder-difflin) 0.4.6: everything the open-source app does, plus offices that work together (Team, post-quantum sealed), a headless server edition, Factories, WSL offices, and secrets agents use but never see. No product analytics. Versions are `<upstream>-fork.<patch>`; the in-app updater follows this repository only.
