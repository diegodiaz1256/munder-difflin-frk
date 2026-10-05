# Scranton Branch 0.4.6-fork.25

Memory by project and personal lists, control over models and tools per agent, and terminals that tell you when an agent is waiting on you.

## What's new

### Memory
- **Memory by project.** Each project gets its own memory with sections that fit what it is (code, data, infrastructure, docs or research), and the Memory screen lets you look at the whole office or one project.
- **Things, with their other names.** Factions, products, people… gathered from notes into an Entities tab, with aliases and spelling slips matched ("deth gaurd" finds Death Guard).
- **Your lists.** Memory → Lists keeps what you own, want or plan (a collection, a wishlist…), one column per state. Tell the orchestrator "I bought Mortarion" and it moves it from *Want* to *Have* (agents use the new `munder-lists` tool).

### Agents
- **Model and effort per role.** Settings → Agents & Models → *Per role*: a model and a thinking effort for the orchestrator, your agents and temps (e.g. temps on Haiku, low effort). Unset, Claude Code uses its own default, which is often *high*.
- **Claude's own tools are capabilities too.** Capabilities → *Who has what* now has **Web**, **Shell** and **Sub-agents** per agent; switched off, the agent cannot use them (an agent without web search no longer searches anyway).
- **"Asks you".** When an agent's CLI shows a menu in its terminal (trust this folder, a model picker, a confirmation), its card says *asks you* with the question, and you get a desktop notification when the app is in the background.

### Español
- **The whole app in Spanish** (Settings → General → Language), including the Manager screens, the office picker and the floor’s bubbles. Those screens are now translatable in every language (English, 简体中文, العربية too).

### Files and the IDE
- **Click a file an agent printed and it opens** in the IDE, on Windows and WSL offices: it opened empty on Windows, needed Ctrl+click, and long paths (wrapped over several lines) were not links at all.

### Capabilities
- **Web off means no web.** Turning off an agent’s Web capability also takes away the Fetch and Web Search servers it was still using to search. With Shell on, commands can still reach the web; turn both off for an agent with no internet.

### Subscription usage
- **Your 5-hour and weekly windows in the title bar** (*5h 64% · week 61%*), amber near the limit and red close to it; hover for when each resets and the per-model weekly caps. On a Claude subscription these, not dollars, are what runs out. Each agent's status line shows the 5-hour window too.

### Terminals
- **The prompt stays at the bottom.** After a menu closed, or coming back from Manager, the terminal could show blank space under Claude's prompt.
- **Open a terminal here** works on Windows (Windows Terminal or cmd) and in WSL offices (inside the distribution); it failed with `spawn open ENOENT`.

### First run on Windows
- **The setup help installs for real.** On a machine without Node, it downloaded Node and then skipped every later step, so Claude was never installed and the orchestrator died with *"the command line is too long"*. Each step now runs in order and stops with a clear message if it fails; a checksum mismatch stops the install.
- The app only relaunches the agent once its CLI is really there, and otherwise says why under the installer output.
- Cursor's Windows installer runs through PowerShell. The first screen says *Welcome to Scranton Branch*.

### WSL offices
- **The orchestrator and a worker starting together both start.** One of them could hang at "WSL bridge" until the 90 s timeout.

## Earlier releases

| Version | Highlights |
|---|---|
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
| Universal (Apple Silicon + Intel) | [`Scranton-Branch-0.4.6-fork.25-mac-universal.dmg`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.25-mac-universal.dmg) |

### Windows
| | |
|---|---|
| Installer (x64), *recommended* | [`Scranton-Branch-0.4.6-fork.25-win-x64-setup.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.25-win-x64-setup.exe) |
| Portable (x64, no install) | [`Scranton-Branch-0.4.6-fork.25-win-x64-portable.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.25-win-x64-portable.exe) |

### Linux
| | |
|---|---|
| AppImage (x86_64) | [`Scranton-Branch-0.4.6-fork.25-linux-x86_64.AppImage`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.25-linux-x86_64.AppImage) |
| Server, no GUI (x64) | [`scranton-branch-server-0.4.6-fork.25-linux-x64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.25-linux-x64.tar.gz) |
| Server, no GUI (arm64) | [`scranton-branch-server-0.4.6-fork.25-linux-arm64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.25-linux-arm64.tar.gz) |

Server: unpack, then run `sudo ./install.sh`. Setup, Docker and secrets are in [SERVER.md](https://github.com/diegodiaz1256/scranton-branch/blob/main/SERVER.md).

Builds are not code-signed yet: macOS asks you to allow the app in System Settings → Privacy & Security, and Windows SmartScreen asks you to confirm ("More info" → "Run anyway").

Source: [`v0.4.6-fork.25`](https://github.com/diegodiaz1256/scranton-branch/archive/refs/tags/v0.4.6-fork.25.tar.gz)

## About this fork

Scranton Branch is the branch office of [Munder Difflin](https://github.com/HarnessMD/munder-difflin) 0.4.6: everything the open-source app does, plus offices that work together (Team, post-quantum sealed), a headless server edition, Factories, WSL offices, and secrets agents use but never see. No product analytics. Versions are `<upstream>-fork.<patch>`; the in-app updater follows this repository only.
