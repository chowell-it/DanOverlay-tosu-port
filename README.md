# Dan Overlay — tosu Port

## Disclaimer

This is an unofficial port of [Dan Overlay](https://github.com/acarranzao1a-png/Dan-Overlay) by **acarranzao1a-png** into the [tosu](https://github.com/tosuapp/tosu) counter format. All original overlay assets, scoring data, UI skins, and algorithm data files belong to their respective authors and rights holders. The difficulty rating engine (`tools/msd.exe`) is part of [Etterna/MinaCalc](https://github.com/etternagame/etterna). This port adds only a companion server and targeted edits to wire the overlay into tosu — no original content was created or claimed.

---

## Purpose

Runs the Dan Overlay dan tier estimator as a native tosu counter. Displays your estimated Reform / Celestial / Signicial / Shoegazer dan tier in real time as you browse maps in osu!. Reads the currently selected beatmap through tosu's `/json` API, calculates MinaCalc MSD skillset scores via a local companion server, and feeds the result into the original overlay UI.

**What this port adds:**
- `dan-overlay-server.py` — Python companion server (port 24051) that handles all analysis
- `start-dan-overlay-server.bat` — launcher for the companion server
- Targeted edits to `overlay.js` to fetch from the companion server instead of the original Python bridge
- `settings.json` in each UI skin folder for scoringMode selection in tosu
- LN% badge that appears inline with the scoring mode badge when a map has ≥ 30% hold notes

---

## Requirements

- [tosu](https://github.com/tosuapp/tosu) v4.x (pre-built binary install)
- Python 3.10+ installed and on your PATH (the same Python used by the original Dan Overlay works)
- osu! running with a 4K mania beatmap selected

---

## Install

1. Copy the entire `static/dan-overlay/` folder into your tosu `static/` directory:
   ```
   static/dan-overlay/  →  <tosu root>/static/dan-overlay/
   ```

2. Copy `start-dan-overlay-server.bat` into your tosu root directory:
   ```
   start-dan-overlay-server.bat  →  <tosu root>/start-dan-overlay-server.bat
   ```

Your tosu folder should look like:
```
tosu-windows-v4.x.x/
├── tosu.exe
├── start-dan-overlay-server.bat      ← new
└── static/
    └── dan-overlay/                  ← new
        ├── overlay.js
        ├── dan-overlay-server.py
        ├── config/
        ├── tools/
        │   └── msd.exe
        ├── ui-2/
        ├── ui-3/
        ├── ui-4/
        ├── ui-5/
        └── ui-6/
```

---

## Running

1. Start tosu normally.
2. Double-click `start-dan-overlay-server.bat` in your tosu root. Keep that console window open — closing it stops analysis.
3. In the tosu counter manager (`http://localhost:24050`), open one of the **ui-2** through **ui-6** counters and add it to your OBS/stream scene.
4. Select a 4K mania map in osu!. The overlay will show **COMPUTING** briefly then display the estimated dan tier.

The companion server caches results per beatmap MD5 — revisiting a map is instant.

---

## Changing Scoring Mode

**Option A — tosu counter manager settings panel:**
In the tosu UI, select your active skin counter and change the *Scoring mode* dropdown. The counter reloads with the new mode.

**Option B — keyboard shortcut (while the counter is focused in a browser):**
| Shortcut | Mode |
|---|---|
| Ctrl+1 | Reform |
| Ctrl+2 | Celestial |
| Ctrl+3 | Signicial |
| Ctrl+4 | Shoegazer |

The selected mode persists in `localStorage` across page loads.

---

## Known Issues and Limitations

### No LN Course dan estimation
The LN Course scoring mode from the original app requires a proprietary primary SR engine that is not available outside the original Dan Overlay binary. LN Course cannot be estimated. As a partial substitute, a small **LN %** badge appears inline with the scoring mode label when the current map has ≥ 30% hold notes, giving you a rough indicator of LN content.

### Algorithms are not 1:1 accurate
The Reform estimation uses MinaCalc MSD skillset scores looked up against calibration thresholds. It is a statistical estimate, not a pass/fail determination. Accuracy varies by map type — marathon dan course maps in particular tend to estimate lower than their titled tier because MinaCalc averages difficulty across the entire file including transitions and easier sections.

### Pick one UI skin — hide the others
tosu detects every subfolder with an `index.html` as a separate counter. All five skins (ui-2 through ui-6) will appear in the counter list. Running multiple skins simultaneously multiplies analysis requests. **Pick one skin and delete or rename the folders for the others** to avoid clutter and redundant load:
```
# Example: keeping only ui-2, removing the rest
delete: static/dan-overlay/ui-3/
delete: static/dan-overlay/ui-4/
delete: static/dan-overlay/ui-5/
delete: static/dan-overlay/ui-6/
```

### Settings are per-skin and have no quick config panel
Each UI skin has its own `settings.json`. Settings changed in the tosu counter manager apply only to that skin's counter URL. There is no unified config panel across skins. The scoring mode defaults to Reform — changing it requires either using the tosu settings dropdown for each skin individually or using the in-overlay keyboard shortcut.

### Switching between scoring modes (Celestial / Signicial / Shoegazer / Reform) requires a settings edit or shortcut
There is no in-overlay UI button to switch modes. Use the tosu counter manager settings dropdown (reloads the counter with the new mode in the URL) or use keyboard shortcuts Ctrl+1–4 while the counter is open in a browser tab. The selected mode is saved to `localStorage` and restored on next load.

### Cannot be integrated into tosu's compiled binary
This port runs as a separate companion server process rather than being compiled into tosu. The companion server must be running alongside tosu — it cannot be embedded into the pre-built `tosu.exe`. If you build tosu from source, the TypeScript endpoint (`danOverlay.ts`) can be integrated natively and the companion server is not needed.
