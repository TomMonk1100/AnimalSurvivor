/**
 * LEAD-OWNED entry point. Boots the app once the DOM is ready and exposes the
 * handle on `window.__webToy` for the browser acceptance harness / console.
 */
import { startApp, type AppHandle } from './app';

declare global {
  interface Window {
    __webToy?: AppHandle;
  }
}

function boot(): void {
  window.__webToy = startApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
