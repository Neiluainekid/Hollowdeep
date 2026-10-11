/* Bootstrap: pick a save slot (1..3), pick a weapon, run the clock. */
'use strict';

(function () {
  const game = new Game();
  window.game = game;
  Platform.init();

  /* ---- save slot picker ----
     Slots are 1-based end to end: the number shown on screen, the number in
     the storage key, and the number the run is written back to are the same. */
  let selectedSlot = Save.SLOT_FIRST;

  const slotRow = document.getElementById('slotRow');
  const slotHint = document.getElementById('slotHint');

  function renderSlots() {
    const survey = Save.surveySlots();
    slotRow.replaceChildren();

    for (const entry of survey) {
      const btn = document.createElement('button');
      btn.className = `saveslot ${entry.empty ? 'empty' : 'occupied'}`
        + (entry.slot === selectedSlot ? ' selected' : '');
      btn.dataset.slot = String(entry.slot);
      btn.innerHTML =
        `<div class="n">Slot ${entry.slot}</div>` +
        `<div class="body">${entry.label}</div>` +
        `<span class="act">${entry.empty ? 'new run' : 'continue'}</span>`;
      btn.addEventListener('click', () => {
        selectedSlot = entry.slot;
        if (entry.data) {
          // Occupied slot: resume straight into it.
          if (game.touch.active) Platform.enterFullscreen();
          game.resume(Save.readRun(entry.slot), entry.slot);
        } else {
          renderSlots();
          slotHint.textContent = `Slot ${entry.slot} selected — choose a weapon below.`;
        }
      });
      slotRow.appendChild(btn);
    }

    const anyOccupied = survey.some(e => !e.empty);
    if (!Save.available()) {
      slotHint.textContent = 'Storage is unavailable, so this run will not be saved.';
    } else if (!anyOccupied) {
      slotHint.textContent = 'Pick a slot, then choose a weapon.';
    }
  }
  renderSlots();

  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => {
      // Starting fresh in an occupied slot discards whatever was suspended there.
      if (Save.hasRun(selectedSlot)
        && !confirm(`Slot ${selectedSlot} holds a suspended run. Overwrite it?`)) return;
      // On a phone, go fullscreen and landscape while we still hold a tap.
      if (game.touch.active) Platform.enterFullscreen();
      game.start(card.dataset.class, document.getElementById('seedInput').value, selectedSlot);
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
    game.touch.sync();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
