/**
 * Headless mode: the whole app, with no window shown — for a server (Ubuntu
 * under systemd, say) or a machine that just hosts an office.
 *
 *   munder-difflin --headless --office /srv/office [--name "Build server"]
 *                  [--team-join <invite code>]
 *
 * The renderer still runs, in a window that is never shown, so every bit of
 * orchestration (the orchestrator's boot, team restore, inbox wake-ups, queue
 * delivery, context rules) behaves exactly as on a desktop. On Linux with no
 * display server, Chromium's headless Ozone backend is selected so nothing needs
 * X or Wayland (xvfb-run is the fallback if a distro's build objects).
 *
 * Must be imported right after demo.ts in index.ts: the Chromium switches have
 * to be set before the app is ready.
 *
 * Talk to a headless office from your desktop through Team: create an invite in
 * Pro → Team and pass it as --team-join; the server's orchestrator is then one of
 * your teammates.
 */
import { app } from 'electron';
import { resolve } from 'node:path';

function argValue(name: string): string | undefined {
  const argv = process.argv;
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
}

export const HEADLESS = process.argv.includes('--headless') || process.env.MD_HEADLESS === '1';

/** First-run setup from the command line (headless only). */
export const HEADLESS_SETUP = HEADLESS
  ? {
      office: argValue('office') ? resolve(argValue('office')!) : undefined,
      name: argValue('name'),
      teamJoin: argValue('team-join')
    }
  : null;

if (HEADLESS) {
  // No display server (a typical server): Chromium's headless Ozone platform.
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    app.commandLine.appendSwitch('ozone-platform', 'headless');
  }
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  // Nothing to show in a dock or taskbar.
  if (process.platform === 'darwin') app.dock?.hide();
}
