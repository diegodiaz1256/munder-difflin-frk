# Scranton Branch 0.4.6-fork.36

Several offices at once, a lighter and faster app, an orchestrator that knows the app, and your own skill marketplaces.

## What's new

- **Several offices at once.** File → New Floor (or the office name in the sidebar) opens another office in its own window, with its own orchestrator and agents. Reopen floors from the same menu; each window's title names its office. One office runs on one floor at a time.
- **Half the size, faster to start.** The installed app drops from about 600 MB to about 310 MB, the window is ready in roughly half the time, and starting a whole team no longer freezes the app.
- **The app writes down its own freezes.** Any stall over 200 ms is logged with what caused it (Settings → General → Freezes), so a slow moment comes with data.
- **The orchestrator knows the app.** Ask it how to do something in Scranton Branch and it tells you where to click. It goes by its real name everywhere and is marked ★ Orchestrator.
- **Your own skill marketplaces.** Add GitHub repositories of skills in Capabilities → Skills; their skills join the catalog, and the orchestrator can use them if you allow it.
- **Tighter folder and git guard.** One-liners in python, node and other languages, and commands inside bash -c, cmd /c, PowerShell or wsl, are checked too. Capabilities says what the guard cannot see.
- **Deliverables and tasks.** PDFs preview inside the app, only the document scrolls, and task details show the ticket (DUN-12).
- **Clearer.** The Now view reads who, what and when at a glance; the menu follows your language.
- **Fixes.** A message without a time no longer blanks the Manager view; downloads and the office browser can no longer hang.

## Earlier releases

| Version | Highlights |
|---|---|
| fork.35 | No freezes on a busy floor, lighter agents, git and folder guard, office skills, Backlog, deliverable diffs. |
| fork.34 | Inbox as a chat per agent, task history, deliverables with authors, agents keep their conversation. |
| fork.33 | Now view, a tidier sidebar, fewer tokens spent, safer engine installs. |
| fork.32 | The office browser comes up when a page fails, and uses less memory. |
| fork.31 | Office browser for pages a plain fetch cannot read, a lighter Floor view, Manager shows the office starting. |
| fork.30 | Offline dictation, agents stop searching your disk, Pi and OpenCode record session and cost. |
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
| Universal (Apple Silicon + Intel) | [`Scranton-Branch-0.4.6-fork.36-mac-universal.dmg`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.36-mac-universal.dmg) |

### Windows
| | |
|---|---|
| Installer (x64), *recommended* | [`Scranton-Branch-0.4.6-fork.36-win-x64-setup.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.36-win-x64-setup.exe) |
| Portable (x64, no install) | [`Scranton-Branch-0.4.6-fork.36-win-x64-portable.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.36-win-x64-portable.exe) |

### Linux
| | |
|---|---|
| AppImage (x86_64) | [`Scranton-Branch-0.4.6-fork.36-linux-x86_64.AppImage`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.36-linux-x86_64.AppImage) |
| Server, no GUI (x64) | [`scranton-branch-server-0.4.6-fork.36-linux-x64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.36-linux-x64.tar.gz) |
| Server, no GUI (arm64) | [`scranton-branch-server-0.4.6-fork.36-linux-arm64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.36-linux-arm64.tar.gz) |

Server: unpack, then run `sudo ./install.sh`. Setup, Docker and secrets are in [SERVER.md](https://github.com/diegodiaz1256/scranton-branch/blob/main/SERVER.md).

Builds are not code-signed yet: macOS asks you to allow the app in System Settings → Privacy & Security, and Windows SmartScreen asks you to confirm ("More info" → "Run anyway").

Source: [`v0.4.6-fork.36`](https://github.com/diegodiaz1256/scranton-branch/archive/refs/tags/v0.4.6-fork.36.tar.gz)

## About this fork

Scranton Branch is the branch office of [Munder Difflin](https://github.com/HarnessMD/munder-difflin) 0.4.6: everything the open-source app does, plus offices that work together (Team, post-quantum sealed), a headless server edition, Factories, WSL offices, and secrets agents use but never see. No product analytics. Versions are `<upstream>-fork.<patch>`; the in-app updater follows this repository only.
