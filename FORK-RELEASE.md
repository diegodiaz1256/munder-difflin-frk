# Munder Difflin 0.4.6-fork.4

**New in fork.4:** several connections of one service (two GitHub accounts, prod and staging databases), each with its own key and agents; step-by-step guides in Connections and Team; a readable Setup panel. **From fork.3:** **Team**: pair your office with teammates' offices (one per team, each team on its own relay), sealed end to end with no server of ours; per-team and per-person levels decide whether their messages reach your orchestrator or wait for you. **Connections keys never reach agents**: keyed MCP servers now run inside the app and agents only get a capability token. Also in fork.2: the Windows installer no longer crashes at launch.

A fork of [Munder Difflin](https://github.com/HarnessMD/munder-difflin) 0.4.6 with the Pro layout rebuilt in the open.

**Versioning.** Fork releases are `<upstream version>-fork.<patch>`: this is upstream 0.4.6 plus fork patch 4. Patches go up as `-fork.2`, `-fork.3`…; after syncing a new upstream release the base moves (e.g. `0.5.5-fork.1`). Fork tags never collide with upstream's, and the in-app updater only offers fork releases.

## What's in it

- **Pro layout**: the office in a sidebar, one screen at a time (Agents, Tasks, Inbox, Automations, Memory, Capabilities, Connections, Temps), switchable with Classic from the title bar.
- **Connections**: GitHub, Database (Postgres, read-only), Web Search, Notion and Sentry, each with an encrypted key, a real Test and per-agent access; REST APIs for every agent through the key broker.
- **MCP servers actually reach agents**: the default bundle and every Capabilities grant now load (`--mcp-config`); before, Claude Code never started them.
- **Your own role bundles** in Capabilities.
- **The orchestrator manages Automations** (create, change, delete scheduled missions).
- **Reopen archived agents**, and stopping an agent no longer deletes uncommitted work in its worktree.
- **Windows**: hooks work from a folder with spaces; the hook socket survives a busy main thread.
- **No product analytics**, no links to upstream's site or community.
- Model catalog with Opus 5.5, Sonnet 5.5, GPT-6 and Gemini 3.8 Flash.

## Downloads

### macOS
| | |
|---|---|
| Universal (Apple Silicon + Intel) | [`Munder-Difflin-0.4.6-fork.4-mac-universal.dmg`](https://github.com/diegodiaz1256/munder-difflin-frk/releases/latest/download/Munder-Difflin-0.4.6-fork.4-mac-universal.dmg) |

### Windows
| | |
|---|---|
| Installer (x64), *recommended* | [`Munder-Difflin-0.4.6-fork.4-win-x64-setup.exe`](https://github.com/diegodiaz1256/munder-difflin-frk/releases/latest/download/Munder-Difflin-0.4.6-fork.4-win-x64-setup.exe) |
| Portable (x64, no install) | [`Munder-Difflin-0.4.6-fork.4-win-x64-portable.exe`](https://github.com/diegodiaz1256/munder-difflin-frk/releases/latest/download/Munder-Difflin-0.4.6-fork.4-win-x64-portable.exe) |

### Linux
| | |
|---|---|
| AppImage (x86_64) | [`Munder-Difflin-0.4.6-fork.4-linux-x86_64.AppImage`](https://github.com/diegodiaz1256/munder-difflin-frk/releases/latest/download/Munder-Difflin-0.4.6-fork.4-linux-x86_64.AppImage) |

Builds are unsigned: macOS asks you to allow the app in System Settings → Privacy & Security, and Windows SmartScreen asks you to confirm ("More info" → "Run anyway").

Source: [`v0.4.6-fork.4`](https://github.com/diegodiaz1256/munder-difflin-frk/archive/refs/tags/v0.4.6-fork.4.tar.gz)
