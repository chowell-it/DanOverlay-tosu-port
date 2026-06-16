# Methodology

## Getting the Source

Dan Overlay ships as an Electron app so the first step was cracking it open. Electron bundles everything into a file called `app.asar` sitting in the `resources/` folder of the install. Ran `npx asar extract app.asar app/` and got the full source tree out. Turned out to be pretty standard Electron stuff, `index.html`, `overlay.js`, a Python bridge process running alongside it, and a `tools/` folder with `msd.exe` inside.

The good news is the UI skins (ui-2 through ui-6) were just HTML and CSS with a shared `overlay.js` doing all the data work. No build step, no webpack nonsense, nothing minified. Basically dropped them straight into the tosu static folder and they worked as visual shells.

## Reverse Engineering the Scoring Logic

The UI was the easy part. The scoring logic was the problem.

The app ships a compiled Python bytecode file, `minacalc_estimator.pyc`. Used `pycdc` to decompile it back to readable Python. The output was messy and some branches came out wrong, but the core functions were recoverable.

The two things I needed most were:

**The role score formula.** The overlay doesn't map MinaCalc skillsets directly to dan tiers. It first blends them into four role dimensions:

```python
jack    = max(msd["jackspeed"], msd["chordjack"])
speed   = max(msd["stream"],    msd["jumpstream"])
tech    = msd["technical"]
stamina = 0.7 * msd["stamina"] + 0.3 * msd["handstream"]
```

This wasn't written down anywhere obvious. Without the decompile, the natural assumption is that jack just equals jackspeed directly. That assumption caused a pretty big accuracy bug later.

**The dan order.** 20 tiers total. Alpha and Beta sit between 10th and Gamma, not at the end. The calibration data in `role_scales.json` makes this clear once you look, but it's easy to miss if you're just skimming the file.

## msd.exe

MinaCalc ships as a compiled C++ CLI. Feed it a JSON array of note rows on stdin, get back a JSON object of skillset scores. Pretty simple interface except for one thing that cost me a couple hours: the output keys are all lowercase.

```json
{"overall": 26.31, "jackspeed": 11.3, "chordjack": 24.9, ...}
```

The original Python code accessed them as `msd["JackSpeed"]`, `msd["Stream"]` etc. because the original app had a normalization step that ran first. Porting the logic over without that step meant every single skillset lookup returned 0. The server was technically running fine, it was just returning 0 for everything, so no estimates ever matched any dan tier.

Figured it out by running `echo '[{"notes":5,"time":0.0}]' | msd.exe` directly and reading what came back.

## Why There's a Companion Server

tosu ships as a pre-built binary. The original Dan Overlay was built to run alongside its own Electron Node.js process and injected API routes directly into the app. That injection point doesn't exist in a compiled binary, so I couldn't do it the same way.

The options were either building tosu from source and integrating a native TypeScript endpoint, which means the user has to maintain their own custom tosu build forever, or running a separate Python server on a different port that the overlay just fetches from. Went with the Python companion server on port 24051. Pointed the overlay's fetch call from `localhost:24050/dan-overlay/api/analyze` to `localhost:24051/analyze` and it worked.

## Getting Beatmap Data from tosu

tosu exposes current beatmap state at `GET localhost:24050/json`. The path reconstruction to find the actual `.osu` file was a little annoying. The `menu.bm.path.folder` field in the response can be a truncated partial path depending on the tosu version, not the full folder name. Had to use `os.path.basename()` to extract just the beatmap folder name before joining it with the songs directory path. Using the raw value caused file-not-found errors on a bunch of maps.

The LN ratio for the badge was simpler, just `holds / (holds + circles)` pulled directly from tosu's JSON stats. No parsing needed.

## Bugs Along the Way

**"Reform lookup returned no result"** was the first wall. Two separate root causes. The dan order array was missing Alpha and Beta (18 tiers instead of 20), so maps in that range found nothing. And the lowercase key issue meant all skillset scores were 0, so nothing matched anything anyway. Both needed fixing at the same time before anything worked.

**Dan estimates way too low.** After fixing the lookup, a known EXTRA-GAMMA marathon was coming back as 6th Dan. The issue was the role score blending. Was mapping jack directly to `msd["jackspeed"]` instead of `max(jackspeed, chordjack)`. That particular marathon is heavy on chordjack and chordjack scored significantly higher than jackspeed. Without the max, the jack dimension was badly underestimated. Found the correct formula in the decompiled bytecode.

**Slow loading when multiple skins are open.** Python's standard `HTTPServer` is single-threaded. `msd.exe` takes a few seconds to run. One in-progress request blocked everything else. Switched to `ThreadingHTTPServer` and it stopped being an issue.

**LN badge appearing in the wrong spot.** Different skins put `scoringModeBadge` in different places. The Classic skin (ui-2) puts it in a visible flex row called `.c2-badges-row` where inserting a sibling before it looks correct. The other skins either stash it in an off-screen div at `-9999px` or mark it `display:none` inside the main panel. Inserting the badge in those cases caused it to either go off-screen or render at the top-left corner of the card floating over everything. Fixed by checking if the parent has `.c2-badges-row` first. If it does, insert inline. If not, attach with `position:absolute; top:6px; right:6px` anchored to `#danPanel` instead.

**Settings ENOENT on every launch.** tosu tries to read a `.values.json` file for each counter on startup to restore the user's saved settings. If that file doesn't exist yet, it errors. The bigger issue was that a schema mistake in `settings.json` (using `id`/`name` instead of `uniqueID`/`title`) made tosu's parser throw before it ever got to creating the file. So it failed on every launch, never recovered. Fixed the schema and added pre-creation of the values files from the `.bat` launcher so tosu always finds them on first read.

## What Couldn't Be Ported

LN Course estimation is not doable. The original app estimates it using a primary SR scale with a range of roughly 3 to 12, matching osu! star rating. MinaCalc's MSD scale starts around 12 and goes up from there. There's no calibration data for the lower range and no way to generate it without the original engine. The LN% badge is the best substitute available.

The accuracy also isn't going to be 1:1 with the original. MinaCalc averages difficulty across the whole file, so marathon dan courses with warmup sections and transitions get dragged below their peak difficulty. The system tends to underestimate marathon maps by somewhere between half a tier and two tiers depending on the map.

And the companion server is permanent as long as you're using the pre-built tosu binary. It's an extra process you have to keep running. If you build tosu from source you can wire a native endpoint in and drop the server entirely, but that's a different project.
