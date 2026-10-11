/* Browser-platform glue: fullscreen, the iOS zoom guard, and the service
   worker that makes Hollowdeep installable as an app. Nothing in here knows
   about the game. */
'use strict';

const Platform = {
  /* ---------------- fullscreen ---------------- */

  // iPhone Safari has no element fullscreen at all; most everything else does.
  fullscreenSupported() {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  },

  isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  },

  // Launched from the home screen as an installed app: already full screen.
  isInstalledApp() {
    return matchMedia('(display-mode: fullscreen)').matches
      || matchMedia('(display-mode: standalone)').matches
      || navigator.standalone === true;
  },

  /* Enter fullscreen and, where the browser allows it, lock to landscape.
     Must be called from a tap or key press. Every failure is harmless. */
  enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || this.isFullscreen()) return;
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => this.lockLandscape()).catch(() => {});
    } catch { /* not allowed here */ }
  },

  exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit && this.isFullscreen()) { try { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
  },

  toggleFullscreen() {
    if (this.isFullscreen()) this.exitFullscreen(); else this.enterFullscreen();
  },

  lockLandscape() {
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  },

  // Keep every fullscreen button's icon and visibility in step.
  syncFullscreenButtons() {
    const on = this.isFullscreen();
    const hide = !this.fullscreenSupported() || this.isInstalledApp();
    for (const b of document.querySelectorAll('[data-fullscreen]')) {
      b.classList.toggle('hidden', hide);
      b.classList.toggle('on', on);
      b.title = on ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
      const label = b.querySelector('.fs-label');
      if (label) label.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
    }
    // Where fullscreen cannot be had from a page (iPhone), say how to get it.
    const hint = document.getElementById('installHint');
    if (hint) hint.classList.toggle('hidden', this.fullscreenSupported() || this.isInstalledApp());
  },

  /* ---------------- zoom guard ----------------
     The viewport meta asks for no zoom, but iPhone Safari ignores that, and
     `touch-action: manipulation` alone does not stop every double-tap zoom
     or pinch. These three listeners close the remaining gaps. */
  guardZoom() {
    // Pinch-zoom on iOS Safari.
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(t, e => e.preventDefault(), { passive: false });
    }
    // Double-tap: swallow the second tap's default if it lands within
    // 300ms of the first. Single taps and clicks are untouched.
    let lastTap = 0;
    document.addEventListener('touchend', e => {
      const now = e.timeStamp;
      if (now - lastTap < 300 && e.cancelable) e.preventDefault();
      lastTap = now;
    }, { passive: false });
    // Two-finger pinch on Android when a page somehow allows it.
    document.addEventListener('touchmove', e => {
      if (e.touches.length > 1 && e.cancelable) e.preventDefault();
    }, { passive: false });
    document.addEventListener('dblclick', e => e.preventDefault());
  },

  /* ---------------- installable app ---------------- */

  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Service workers need https (or localhost); a file:// open just skips it.
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline play just won't be available */ });
    });
  },

  init() {
    this.guardZoom();
    this.registerServiceWorker();
    document.addEventListener('fullscreenchange', () => this.syncFullscreenButtons());
    document.addEventListener('webkitfullscreenchange', () => this.syncFullscreenButtons());
    for (const b of document.querySelectorAll('[data-fullscreen]')) {
      b.addEventListener('click', e => { e.preventDefault(); this.toggleFullscreen(); });
    }
    this.syncFullscreenButtons();
  },
};
