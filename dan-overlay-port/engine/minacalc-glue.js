// Loads the MinaCalc WASM module and exposes a synchronous MSD function at
// window.__MINACALC.msd(notesU32, timesF32) -> [overall,stream,...,technical].
// Uses rateIndex 3 (1.0x); rate is pre-applied via row time-scaling (see msdRows).
(function () {
  if (typeof MinaCalcModule !== 'function') {
    console.warn('[dan-overlay] MinaCalcModule not found (engine/minacalc.js missing?) — MSD disabled');
    return;
  }
  window.__MINACALC = { ready: false, msd: function () { return null; } };
  MinaCalcModule().then(function (M) {
    window.__MINACALC = {
      ready: true,
      msd: function (notes, times) {
        var n = notes.length;
        if (!n) return null;
        var nP = M._mc_malloc(n * 4), tP = M._mc_malloc(n * 4), oP = M._mc_malloc(32);
        M.HEAPU32.set(notes, nP >> 2);
        M.HEAPF32.set(times, tP >> 2);
        M._compute_msd(nP, tP, n, 3, oP);
        var out = Array.prototype.slice.call(M.HEAPF32.subarray(oP >> 2, (oP >> 2) + 8));
        M._mc_free(nP); M._mc_free(tP); M._mc_free(oP);
        return out;
      }
    };
    console.log('[dan-overlay] MinaCalc WASM ready');
  }).catch(function (e) { console.error('[dan-overlay] MinaCalc init failed', e); });
})();
