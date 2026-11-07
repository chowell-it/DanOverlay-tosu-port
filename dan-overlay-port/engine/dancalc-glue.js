// Loads Mania Tracker's dan-calc + Prism (engine/dancalc.wasm, built from
// native/dan-calc-wasm) and exposes window.__DANCALC.estimate(osuText, rate).
// Returns { key_count, supported, primary, rice, ln, msd, ln_ratio } or null.
// 6K/7K/8K only: its MinaCalc is stubbed, so 4K stays on engine/minacalc.js.
(function () {
  var mod = null, X = null;
  window.__DANCALC = { ready: false, estimate: function () { return null; } };

  function boot() { X = new WebAssembly.Instance(mod, {}).exports; }

  function run(text, rate) {
    var bytes = new TextEncoder().encode(text);
    var p = X.dc_alloc(bytes.length), lenP = X.dc_alloc(4);
    new Uint8Array(X.memory.buffer, p, bytes.length).set(bytes);
    var out = X.dc_estimate(p, bytes.length, rate, lenP);
    // Views go stale when wasm memory grows, so build them after the call.
    var n = new DataView(X.memory.buffer).getUint32(lenP, true);
    var json = new TextDecoder().decode(new Uint8Array(X.memory.buffer, out, n));
    X.dc_free(out, n); X.dc_free(p, bytes.length); X.dc_free(lenP, 4);
    var r = JSON.parse(json);
    if (r.error) throw new Error(r.error);
    return r;
  }

  fetch("engine/dancalc.wasm")
    .then(function (res) { return res.arrayBuffer(); })
    .then(function (buf) { return WebAssembly.compile(buf); })
    .then(function (m) {
      mod = m;
      boot();
      window.__DANCALC = {
        ready: true,
        estimate: function (text, rate) {
          try { return run(text, rate); }
          catch (e) {
            console.error("[dan-overlay] dan-calc failed", e);
            boot(); // a trap can leave the instance unusable
            return null;
          }
        }
      };
    })
    .catch(function (e) { console.error("[dan-overlay] dan-calc init failed", e); });
})();
