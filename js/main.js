/* Bootstrap: offer to resume, wire the class-select cards, run the clock. */
'use strict';

(function () {
  const game = new Game();
  window.game = game;

  /* ---- resume offer ---- */
  const box = document.getElementById('continueBox');
  const saved = Save.hasRun() ? Save.peek() : null;
  if (saved) {
    const cls = CLASSES[saved.player.classId];
    const when = new Date(saved.savedAt || Date.now());
    const mins = Math.floor((saved.elapsed || 0) / 60);
    const map = MAPS[saved.mapIndex || 0];
    document.getElementById('continueInfo').textContent =
      `${cls ? cls.className : '?'} · level ${saved.player.level} · ${map.name} · ${mins}m played · saved ${when.toLocaleString()}`;
    box.classList.remove('hidden');
    document.getElementById('continueBtn').addEventListener('click', () => game.resume(Save.readRun()));
  }

  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => {
      // Starting fresh discards any suspended run.
      if (saved && !confirm('This abandons your suspended run. Start a new one?')) return;
      game.start(card.dataset.class, document.getElementById('seedInput').value);
    });
  });

  // Best-effort flush. The 5s autosave is what actually protects the run;
  // this only narrows the window when the tab closes cleanly.
  addEventListener('beforeunload', () => { if (game.state === 'playing') game.saveNow(); });
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && game.state === 'playing') game.saveNow();
  });

  let last = performance.now();
  function frame(now) {
    // Clamp dt so an alt-tab pause can't teleport anything through a wall.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    if (game.state !== 'title') game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
