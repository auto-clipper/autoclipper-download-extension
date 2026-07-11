import type { AuthUser } from '@/shared/types';

/**
 * Runs only on app.autoclipper.live. Mirrors the app's login state into the
 * extension so the popup can show "signed in as X" / a login button. The app
 * keeps the Strapi user JSON in localStorage under 'user' (JWT under
 * 'token'); we only read the display fields and never touch the token.
 */

let lastReported = '';

function readUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw || !localStorage.getItem('token')) return null;
    const parsed = JSON.parse(raw);
    return { username: parsed?.username ?? null, email: parsed?.email ?? null };
  } catch {
    return null;
  }
}

function report(): void {
  const user = readUser();
  const serialized = JSON.stringify(user);
  if (serialized === lastReported) return;
  lastReported = serialized;
  try {
    chrome.runtime.sendMessage({ type: 'auth-state', user })?.catch?.(() => {});
  } catch {
    // Orphaned after an extension reload — nothing to report to.
  }
}

report();
// 'storage' only fires for changes made by OTHER tabs; polling catches
// same-tab login/logout.
window.addEventListener('storage', report);
setInterval(report, 3000);
