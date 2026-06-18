# Dan Overlay — tosu Port

Live osu!mania **dan tier estimation** as a standalone [tosu](https://github.com/tosuapp/tosu) counter. Shows your estimated dan tier in real time as you browse maps in osu! — **4K** (Reform, Celestial, Signicial, Shoegazer, LN Course) and **7K**.

Drag-and-drop. **No companion server, no Python, no edits to `tosu.exe`** — everything runs in the counter (in-browser).

## Disclaimer

Unofficial port of [Dan Overlay](https://github.com/acarranzao1a-png/Dan-Overlay) by **acarranzao1a-png** into the tosu counter format. All original overlay assets, scoring data, UI skins, and calibration files belong to their respective authors and rights holders. The difficulty engine is [Etterna/MinaCalc](https://github.com/etternagame/etterna) (compiled to WebAssembly here). This port only re-implements the analysis pipeline in TypeScript and wires the overlay into tosu — no original content is claimed.

## Install

1. Copy the `dan-overlay-port/` folder into your tosu `static/` directory:
   ```
   dan-overlay-port/  →  <tosu root>/static/dan-overlay-port/
   ```
2. In tosu's counter manager (`http://localhost:24050`) it appears as **"Dan Overlay tosu! Port"** — add it as an in-game overlay, or open `http://localhost:24050/dan-overlay-port/` directly.

That's it. No process to run, no install step.

**Requirements:** tosu v4.x and osu! running with a mania map selected. The counter's browser/webview needs WebAssembly SIMD (tosu's webview and any modern browser qualify).

## How it works

On every map change the counter reads the current beatmap from tosu (`/json` for state, `/files/beatmap/file` for the `.osu`) and runs the full analysis locally:

- A 1:1 TypeScript port of Dan Overlay's **Sunny SR engine**, family classifier, rank engine, and the Celestial / Signicial / Shoegazer / LN Course estimators.
- **MinaCalc MSD** skillsets via WebAssembly (MinaCalc compiled from `minacalc-rs` 0.2.2 — the same calc the original `msd.exe` uses; output is identical).

DT/HT are detected automatically and rate-adjust the rating.

## Modes

| Mode | Notes |
|---|---|
| **Reform** | default 4K dan estimate |
| **Celestial / Signicial / Shoegazer** | alternative 4K dan scales |
| **LN Course** | auto-activates on LN-heavy maps (LN ratio > 45%) |
| **7K** | auto-detected; rated on the 7K Dan scale (0th…10th, Gamma, Azimuth, Zenith, Stellium) |

Switch the 4K scoring mode in the counter's settings dropdown, or with **Ctrl+1–4** (Reform / Celestial / Signicial / Shoegazer) while the counter is focused. The choice persists in `localStorage`.

The MSD panel shows MinaCalc's 7 skillset values (4K only — MinaCalc doesn't support 7K). On the results screen the overlay shows a clear-quality label by accuracy: **Clear!** (≥96%), **Over Clear!** (≥97%), **Hard Clear!** (≥98%), **Perfect!** (100%).

## Accuracy

The dan estimates are **1:1 with the original Dan Overlay engine** — validated against the original on 185 4K maps (including the official Reform dan courses) and 26 7K maps (including the 7K Dan courses).

Note that "matches the original engine" is not the same as "matches the map's titled dan tier." Like the original, the engine averages difficulty across the whole file, so marathon dan-course maps tend to read a little below their titled tier. On the official courses it lands the exact tier ~51% of the time and within one tier ~88%.

## Notes & limitations

- **7K has no MSD panel** — MinaCalc is 4K-only.
- **Pick one UI skin.** tosu lists every subfolder with an `index.html` (ui-2…ui-6) as a separate counter. Running several at once is just redundant; keep the one you want and delete the rest.
- Scoring-mode settings are per-skin (each skin has its own `settings.json`).

## Rebuilding (for contributors)

The shipped `engine/danEngine.js` and `engine/minacalc.js` are built from the TypeScript engine + MinaCalc source:

- Dan engine: `bash port/build-engine.sh` (needs Node + esbuild via npx).
- MinaCalc WASM: `bash port/build-wasm.sh <minacalc-rs-0.2.2 dir>` (needs emscripten — see the script header for fetching the source).

## Credits

- Original Dan Overlay — [acarranzao1a-png](https://github.com/acarranzao1a-png/Dan-Overlay)
- Difficulty engine — [Etterna / MinaCalc](https://github.com/etternagame/etterna)
- SR engine — [Star-Rating-Rebirth (Sunny)](https://github.com/sunnyxxy/Star-Rating-Rebirth)
- tosu — [tosuapp/tosu](https://github.com/tosuapp/tosu)
- tosu port — Ottowa (chowell-it)

Licensed under GPL-3.0 (see `LICENSE`).
