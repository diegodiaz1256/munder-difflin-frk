# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## What is signed

Only binaries built from this repository's source by its public GitHub Actions workflow
([`.github/workflows/release.yml`](./.github/workflows/release.yml)):

- `Scranton-Branch-<version>-win-x64-setup.exe` (Windows installer)
- `Scranton-Branch-<version>-win-x64-portable.exe` (Windows portable build)

Each release is built from a tagged commit on `main`. Nothing built on a personal machine is
signed, and no third-party binaries are signed with this certificate. The upstream project's
binaries are not re-signed: Scranton Branch builds its own from source.

## Team and roles

| Role | Members |
|---|---|
| Authors (may change the source without review) | [@diegodiaz1256](https://github.com/diegodiaz1256) |
| Reviewers (review every change from people outside the team) | [@diegodiaz1256](https://github.com/diegodiaz1256) |
| Approvers (approve each signing request) | [@diegodiaz1256](https://github.com/diegodiaz1256) |

Every team member uses multi-factor authentication on GitHub and on SignPath. Changes from
contributors outside the team arrive as pull requests and are merged only after review.

## Privacy

See [PRIVACY.md](./PRIVACY.md). In short: no analytics or telemetry. The app connects to the
network only to check this repository for updates and fetch two small data files from it, and
for features you turn on yourself.
