# Scranton Branch 0.4.6-fork.24

Fixes and features from a customer test on a WSL office, checked with real agents on WSL and on Windows.

## What's new

### Memory
- **Works offline.** Memory never goes to the internet by itself. The model downloads (or updates) only from **Settings → Memory & Knowledge**, which shows whether it is on disk. Without it, search tells you so instead of showing Hugging Face errors.
- **A graph of what the office knows.** The Memory screen now draws the concepts in your agents' notes and in their deliverables (factions, products, files, people…), linked when they appear together. Click one to read the notes behind it.
- **Readable search.** Results by meaning show the note, who wrote it and how well it matches, instead of raw command output. A memory opens in place, with *Ask the orchestrator about this*, *Open agent* and *Copy*.
- **Deliverables are remembered.** Documents agents write in `research/` are indexed, not only their memory notes.
- **Agents use it as a tool.** Every agent gets the office memory as an MCP tool (`munder-memory`), so they look things up instead of re-reading files.
- An older mempalace that cannot use the chosen model now says so, and how to fix it.

### Orchestrator and hiring
- **Delegating means an agent on the floor.** The orchestrator no longer starts hidden helpers inside its own session; when you have not let it hire, it asks you (*Start it / Always allow / Decline*) instead of waiting unseen.
- **Permanent hires reach you.** When the orchestrator proposes a hire, it opens for review **as a CV** (role, mission, skills, engine, budget), with *Hire* and *Edit details*. The folder defaults to the office.
- **See the hand-offs.** In Manager → the orchestrator's page, an envelope goes out when he delegates, the line runs while the agent works, he shows who he is waiting on, and the envelope comes back with the answer.
- New offices start the orchestrator on **Opus 5.5** and workers on **Sonnet 5.5**.

### Remote Control
- No longer sent at every start (Claude asks to confirm it, which held up the first prompt). A **cloud button** turns it on and shows its state: *connecting…*, *remote on ●* (click to open the session) or why it failed. Claude's own Remote Control menu is answered for you when the button asked.

### Terminals and the floor
- **Smoother terminals.** Output is sent once per frame, scrollback is lighter, and the side panel opens wide enough for about 80 columns.
- **Text that is typed is sent.** Long prompts and slash commands wait long enough before Enter (on Windows the first prompt sometimes needed Enter by hand).
- **Readable bubbles and name tags** on a small floor, not only full screen.
- Agent cards switch on press (a click that moved a little did nothing). The wall clock asks before closing the app.
- The startup screen says Scranton Branch.

### WSL offices
- **The orchestrator always starts.** Reopening a WSL office could leave it out ("port … is already in use inside WSL") while workers carried on alone; the WSL bridge now reuses its own ports, recovers from a restart, and a failed start is shown with *Retry*.
- `munder-git` is only given to agents inside a git repository (it failed at every start in an office that is not one).

### Under the hood
- A closed console (the terminal that launched the app went away) no longer makes the app spin at full CPU.

## Earlier releases

| Version | Highlights |
|---|---|
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
| Universal (Apple Silicon + Intel) | [`Scranton-Branch-0.4.6-fork.24-mac-universal.dmg`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.24-mac-universal.dmg) |

### Windows
| | |
|---|---|
| Installer (x64), *recommended* | [`Scranton-Branch-0.4.6-fork.24-win-x64-setup.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.24-win-x64-setup.exe) |
| Portable (x64, no install) | [`Scranton-Branch-0.4.6-fork.24-win-x64-portable.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.24-win-x64-portable.exe) |

### Linux
| | |
|---|---|
| AppImage (x86_64) | [`Scranton-Branch-0.4.6-fork.24-linux-x86_64.AppImage`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.24-linux-x86_64.AppImage) |
| Server, no GUI (x64) | [`scranton-branch-server-0.4.6-fork.24-linux-x64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.24-linux-x64.tar.gz) |
| Server, no GUI (arm64) | [`scranton-branch-server-0.4.6-fork.24-linux-arm64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.24-linux-arm64.tar.gz) |

Server: unpack, then run `sudo ./install.sh`. Setup, Docker and secrets are in [SERVER.md](https://github.com/diegodiaz1256/scranton-branch/blob/main/SERVER.md).

Builds are not code-signed yet: macOS asks you to allow the app in System Settings → Privacy & Security, and Windows SmartScreen asks you to confirm ("More info" → "Run anyway").

Source: [`v0.4.6-fork.24`](https://github.com/diegodiaz1256/scranton-branch/archive/refs/tags/v0.4.6-fork.24.tar.gz)

## About this fork

Scranton Branch is the branch office of [Munder Difflin](https://github.com/HarnessMD/munder-difflin) 0.4.6: everything the open-source app does, plus offices that work together (Team, post-quantum sealed), a headless server edition, Factories, WSL offices, and secrets agents use but never see. No product analytics. Versions are `<upstream>-fork.<patch>`; the in-app updater follows this repository only.
