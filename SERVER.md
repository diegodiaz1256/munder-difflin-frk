# Munder Difflin server

An office with no GUI, for an Ubuntu server or a container. It is the same
app: `src/main` runs unchanged on plain Node (Electron's API is replaced by
`src/server/electronShim.ts`) and the floor's orchestration — the
orchestrator's boot, inbox wake-ups, queue delivery, context rules, revive —
is the renderer's own code, run without a DOM (`src/server/engine.tsx`). No
Chromium: the whole thing is a ~3.5 MB script plus two native modules.

You talk to it from your desktop through **Team**: the server's orchestrator is
one of your teammates.

## Ubuntu (systemd)

Needs Node.js 20+ and git.

```sh
tar xzf munder-difflin-server-<version>-linux-x64.tar.gz
cd munder-difflin-server-<version>-linux-x64
sudo ./install.sh
```

Then edit `/etc/munder-difflin/server.env`:

| Variable | |
|---|---|
| `MD_OFFICE` | the office directory (default `/srv/office`) |
| `MD_NAME` | its name on Team |
| `MD_TEAM_JOIN` | an invite from your desktop (Pro → Team → Invite). Used once, then remembered |
| `MD_MAX_WORKERS` | how many workers may run at once |
| `MD_RELAY_TOKEN` | `<relay>=<token>` for a relay that needs one (see below) |
| `ANTHROPIC_API_KEY` | optional: agents use it instead of a login |

and `sudo systemctl restart munder-difflin`. Logs: `journalctl -u munder-difflin -f`.

Agents run as the `agent` user. Log their CLI in once:
`sudo -u agent -H claude` (then `/login`).

Every flag has a variable and the other way round: `--office`, `--name`,
`--team-join`, `--max-workers`.

## Docker

```sh
openssl rand -hex 32 > packaging/server/secret.key && chmod 600 packaging/server/secret.key
docker compose -f packaging/server/docker-compose.yml up -d
docker compose -f packaging/server/docker-compose.yml exec -u agent office claude   # log in once
```

`AGENT_CLIS` (build arg) picks the agent CLIs baked into the image. CPU, memory
and process limits are in the compose file and apply to the whole office.

## Secrets

Connection keys are stored encrypted, as on a desktop. The key that encrypts
them is the server's alone:

- **systemd**: `/etc/munder-difflin/secret.key` (root, 0600), handed to the
  service as a credential.
- **Docker**: a compose secret (`MD_SECRET_KEY_FILE`). Keep the host file 0600;
  the container warns if agents could read it.
- Otherwise `MD_SECRET_KEY` (removed from the environment once read) or a
  generated `<data dir>/secret.key`.

Agents never see it: they run as another user (`MD_AGENT_UID`/`MD_AGENT_GID`),
so neither the key nor the server's environment is readable to them. Back the
key up — stored keys are unreadable without it.

## Limits of the public relay

Team talks through an ntfy relay. The public `https://ntfy.sh` allows an
anonymous publisher **250 messages a day per IP** and keeps undelivered
messages for **12 hours**; a message over ~3.6 KB is split and every part
counts. Listening costs nothing (one streaming connection).

Fine for conversation between offices. For more, run your own relay (one small
container: `docker run -p 80:80 binwiederhier/ntfy serve`) and set it as the
team's relay in Pro → Team. A relay that needs an access token (ntfy with
access control, or a paid ntfy.sh plan) takes it in the team's Edit form on a
desktop, and in `MD_RELAY_TOKEN=https://relay.example.com=tk_…` (comma-separated
for several) on a server. Tokens are kept in the encrypted store, sent only to
their relay, and never reach agents.

## Not on a server

Voice, dictation, the in-app updater (update the package or the image) and
anything that opens a window or a dialog.
