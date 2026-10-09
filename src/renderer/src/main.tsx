import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import brandLogo from '@brand/logo.png?url';
import './design/global.css';
import './i18n';
import { needsRefocus } from '@shared/focusRecovery';
import { useProStore } from './pro/proStore';

// Text boxes that stopped taking input (Windows, after a native dialog): a click
// on one while the page has no focus asks main to focus the page, then the box.
document.addEventListener('mousedown', (e) => {
  const target = e.target as HTMLElement | null;
  if (!needsRefocus(target, document.hasFocus())) return;
  void window.cth?.refocusWindow?.().then(() => setTimeout(() => target?.focus(), 0)).catch(() => undefined);
}, true);

// Freeze log (main/freezeLog.ts): this window's own long tasks, with the screen
// it was on. Chromium only reports tasks over 50 ms; main keeps those >= 200 ms.
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.duration < 200) continue;
      const p = useProStore.getState();
      const screen = p.layout !== 'pro' ? 'classic' : p.view.kind === 'agent' ? 'agent' : p.view.section;
      window.cth?.reportLongTask?.(e.duration, screen);
    }
  }).observe({ type: 'longtask', buffered: false });
} catch { /* no long-task timing here */ }

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/png';
favicon.href = brandLogo;
document.head.appendChild(favicon);

const splashMark = document.querySelector('#cth-splash .mk');
if (splashMark) {
  const img = document.createElement('img');
  img.src = brandLogo;
  img.alt = 'Scranton Branch';
  img.style.cssText = 'height:56px;width:auto;display:block';
  splashMark.replaceWith(img);
}

const root = document.getElementById('root');
if (!root) throw new Error('No root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
