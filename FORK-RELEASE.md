# Scranton Branch 0.4.6-fork.27

Pi and OpenCode managed from the app — sign-in, models and your local models — and who may use each REST API, per role.

## What's new

### Pi and OpenCode
- **Sign in from the app.** AI providers → Engines shows who Pi and OpenCode are signed in to and opens their own sign-in (Pi `/login`, `opencode auth login`) in a terminal inside the app — your Claude, ChatGPT, Copilot or Gemini subscription, or an API key.
- **Pi agents sign in as you.** They now use your Pi login (`~/.pi/agent/auth.json`, linked so a refreshed token stays fresh) and your Pi settings; before, a Pi agent started by the app was never signed in.
- **Pick the default model from a list.** *Load models* asks the engine itself which models it has.
- **Local and OpenAI-compatible providers.** Add Ollama, LM Studio, vLLM, llama.cpp or any OpenAI-compatible server once (models fetched from the server, optional key stored encrypted); every OpenCode and Pi agent gets them, as `provider/model`.

### REST APIs (Jira, Linear, Notion…)
- **Who may use each API, and how.** Connections → *Who may use each REST API*: a limit per API (*Nothing / Read only / Read & write*, read only by default), every agent or chosen ones, and a level per role in Capabilities. The key broker enforces it on every request: read only lets GET and searches through (Jira JQL, Notion queries, GraphQL queries) and refuses anything that would change data.
- Ephemeral workers no longer get every API: they follow the same rule.

## Earlier releases

| Version | Highlights |
|---|---|
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
| Universal (Apple Silicon + Intel) | [`Scranton-Branch-0.4.6-fork.27-mac-universal.dmg`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.27-mac-universal.dmg) |

### Windows
| | |
|---|---|
| Installer (x64), *recommended* | [`Scranton-Branch-0.4.6-fork.27-win-x64-setup.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.27-win-x64-setup.exe) |
| Portable (x64, no install) | [`Scranton-Branch-0.4.6-fork.27-win-x64-portable.exe`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.27-win-x64-portable.exe) |

### Linux
| | |
|---|---|
| AppImage (x86_64) | [`Scranton-Branch-0.4.6-fork.27-linux-x86_64.AppImage`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/Scranton-Branch-0.4.6-fork.27-linux-x86_64.AppImage) |
| Server, no GUI (x64) | [`scranton-branch-server-0.4.6-fork.27-linux-x64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.27-linux-x64.tar.gz) |
| Server, no GUI (arm64) | [`scranton-branch-server-0.4.6-fork.27-linux-arm64.tar.gz`](https://github.com/diegodiaz1256/scranton-branch/releases/latest/download/scranton-branch-server-0.4.6-fork.27-linux-arm64.tar.gz) |

Server: unpack, then run `sudo ./install.sh`. Setup, Docker and secrets are in [SERVER.md](https://github.com/diegodiaz1256/scranton-branch/blob/main/SERVER.md).

Builds are not code-signed yet: macOS asks you to allow the app in System Settings → Privacy & Security, and Windows SmartScreen asks you to confirm ("More info" → "Run anyway").

Source: [`v0.4.6-fork.27`](https://github.com/diegodiaz1256/scranton-branch/archive/refs/tags/v0.4.6-fork.27.tar.gz)

## About this fork

Scranton Branch is the branch office of [Munder Difflin](https://github.com/HarnessMD/munder-difflin) 0.4.6: everything the open-source app does, plus offices that work together (Team, post-quantum sealed), a headless server edition, Factories, WSL offices, and secrets agents use but never see. No product analytics. Versions are `<upstream>-fork.<patch>`; the in-app updater follows this repository only.
