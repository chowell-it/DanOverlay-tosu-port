# Dan Overlay (tosu port)

Live osu!mania **4K Dan tier estimation** as a standalone tosu counter — a 1:1
port of Dan Overlay's engine (Reform, Celestial, Signicial, Shoegazer, LN Course).

## Install (drag-and-drop)

1. Copy this folder into your tosu `static/` directory (e.g.
   `tosu/static/dan-overlay-port/`).
2. In tosu's dashboard it appears as **"Dan Overlay tosu! Port"** — add it as an
   in-game overlay, or open `http://localhost:24050/dan-overlay-port/`.

That's it. **No separate process, no tosu modification, no setup.** Everything
runs in-browser: the counter fetches the current `.osu` from tosu
(`/files/beatmap/file`) and computes all tiers locally.

## Modes

Switch in the counter settings: Reform · Celestial · Signicial · Shoegazer.
LN Course auto-activates on LN-heavy maps (LN ratio > 0.45). DT/HT are detected
automatically and rate-adjust the rating.

## Notes

- All five dan tiers are 1:1 with the original Dan Overlay engine (validated on
  185 maps incl. the official Reform dan courses).
- The **MinaCalc MSD** panel runs in-browser via WebAssembly (MinaCalc compiled
  from minacalc-rs 0.2.2 — the same calc msd.exe uses; output is identical).
  Needs a browser with WASM SIMD (tosu's webview / any modern browser).

## Engine files (in `engine/`)

- `danEngine.js` — the dan analysis (parser, SR engine, classifier, rank, estimators).
- `minacalc.js` — MinaCalc compiled to WASM (single-file) for MSD.
- `minacalc-glue.js` — loads the WASM, exposes `window.__MINACALC.msd`.

## Rebuilding

- Dan engine: `bash port/build-engine.sh` (needs Node + npx/esbuild).
- MinaCalc WASM: `bash port/build-wasm.sh <minacalc-rs-0.2.2 dir>` (needs emscripten;
  see that script's header for fetching the source).
