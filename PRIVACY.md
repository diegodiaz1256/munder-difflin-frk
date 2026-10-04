# Privacy

Scranton Branch collects **no analytics, telemetry or usage data**. There is no account and no
server run by this project. The build carries no analytics key, so the analytics code
inherited from upstream never starts.

## What connects to the network, and why

**On its own, with no personal data sent:**

- **Update check**: reads this repository's latest release on GitHub
  (`api.github.com`, `github.com`) and downloads an update when there is one.
- **Two small data files** from this repository on GitHub (`raw.githubusercontent.com`):
  the model catalog and the Settings card text.

These are plain HTTPS requests to GitHub. GitHub sees your IP address, as it does for any
download (see [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)).

**Only when you use the feature:**

- **Your coding agents** (Claude Code, Codex, Gemini CLI and the others) talk to their own
  providers under your own accounts and keys, exactly as when you run them yourself. If an
  agent's tool is missing when you start it, the app downloads it from its official source
  (the npm registry, nodejs.org or astral.sh).
- **Team** sends messages to the relay you choose: a public MQTT broker, an ntfy server, or
  your own. They are encrypted end to end, so the relay sees only a random mailbox name and
  unreadable bytes.
- **Connections** (GitHub, databases, search, Notion, Sentry) send requests to the services
  you connect, with the keys you enter.
- **Voice and dictation**, **Slack** and **webhooks** send data to the services they name
  (OpenAI, Groq, Slack, a tunnel service), only while you have them on.

## On your machine

Settings, offices, history and memory stay in your user data folder and in the project
folders you choose. Keys and passwords are encrypted with your operating system's secure
storage, and the agents never receive them.
