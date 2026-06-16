#!/usr/bin/env python3
"""
Dan Overlay companion server for pre-built tosu installs.
Port 24051. Fetches beatmap from tosu /json, runs msd.exe, returns analysis JSON.
Place this file in your tosu static/dan-overlay/ folder and run it alongside tosu.
"""

import json
import math
import os
import subprocess
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ── Paths (relative to this script's location) ──────────────────────────────
_HERE      = os.path.dirname(os.path.abspath(__file__))
MSD_EXE    = os.path.join(_HERE, "tools", "msd.exe")
CONFIG_DIR = os.path.join(_HERE, "config")

# ── Dan order / labels ───────────────────────────────────────────────────────
DAN_ORDER = [
    "1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th",
    "Alpha","Beta","Gamma","Delta","Epsilon","Zeta","Eta","Theta","Iota","Kappa",
]
DAN_LABELS = {d: (f"{d} Dan" if d[0].isdigit() else d) for d in DAN_ORDER}

CELESTIAL_COURSES = ["Beginner","Intermediate","Expert","Mastery","Ascension","Transcendence","Singularity"]
CELESTIAL_STAGES  = ["I","II","III","IV","V"]
SIGNICIAL_STAGES  = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV",
                     "LastStage","ExtraStageI","ExtraStageII","ExtraStageIII"]
SHOEGAZER_STAGES  = ["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","Luminal","Tachyon"]

# ── Config loader (cached) ────────────────────────────────────────────────────
_cfg = {}
_analysis_cache = {}  # md5 → analysis result

def load_cfg(name):
    if name not in _cfg:
        with open(os.path.join(CONFIG_DIR, name), "r", encoding="utf-8") as f:
            _cfg[name] = json.load(f)
    return _cfg[name]

# ── .osu parser ───────────────────────────────────────────────────────────────
def parse_osu(path, rate=1.0):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    section = ""
    mode = None
    keys = 4
    od = 8.0
    tp_first_bpm = None
    hit_objects = []

    for raw in lines:
        line = raw.strip()
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            continue
        if not line or line.startswith("//"):
            continue

        if section == "General" and line.startswith("Mode:"):
            mode = int(line.split(":")[1].strip())
        elif section == "Difficulty":
            if line.startswith("CircleSize:"):
                keys = int(float(line.split(":")[1].strip()))
            elif line.startswith("OverallDifficulty:"):
                od = float(line.split(":")[1].strip())
        elif section == "TimingPoints" and tp_first_bpm is None:
            parts = line.split(",")
            if len(parts) >= 7:
                beat_len = float(parts[1])
                uninherited = int(parts[6])
                if uninherited == 1 and beat_len > 0:
                    tp_first_bpm = round(60000.0 / beat_len, 2)
        elif section == "HitObjects":
            parts = line.split(",")
            if len(parts) >= 3:
                x = int(parts[0])
                t = float(parts[2])
                hit_objects.append((x, t))

    if mode != 3:
        raise ValueError(f"Not a mania map (mode={mode})")
    if keys != 4:
        raise ValueError(f"Not a 4K map (keys={keys})")
    if not hit_objects:
        raise ValueError("No hit objects")
    if tp_first_bpm is None:
        raise ValueError("No timing points")

    bpm = tp_first_bpm
    rows = []
    for x, t in hit_objects:
        col = min(int(x / (512 / keys)), keys - 1)
        bit = 1 << col
        ts  = round(t / rate / 1000.0, 4)
        if rows and rows[-1]["time"] == ts:
            rows[-1]["notes"] |= bit
        else:
            rows.append({"notes": bit, "time": ts})

    return bpm, od, rows

# ── msd.exe ───────────────────────────────────────────────────────────────────
def run_msd(rows):
    proc = subprocess.run(
        [MSD_EXE],
        input=json.dumps(rows).encode("utf-8"),
        capture_output=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"msd.exe: {proc.stderr.decode(errors='replace')[:200]}")
    return json.loads(proc.stdout)

# ── Reform algorithm ──────────────────────────────────────────────────────────
def _band_pos(v, lo, ctr, hi):
    if v <= ctr:
        return max(0.0, min(1.0, 0.5 * (v - lo) / max(ctr - lo, 0.001)))
    return max(0.0, min(1.0, 0.5 + 0.5 * (v - ctr) / max(hi - ctr, 0.001)))

def _ctr_conf(v, lo, ctr, hi):
    return max(0.0, min(1.0, 1.0 - abs(v - ctr) / max((hi - lo) / 2.0, 0.001)))

def _anchor_q(sc, flag, disp):
    if sc < 2 or flag == "weak":     return 0.65
    if flag == "dispersed" or disp > 3: return 0.80
    return 1.0

def _lookup_role_dan(value, thresholds):
    bands = []
    for i, d in enumerate(DAN_ORDER):
        t = thresholds.get(d)
        if t:
            bands.append({"i": i, "d": d, **t})

    containing = [b for b in bands if b["lower"] <= value <= b["upper"]]

    if len(containing) == 1:
        b = containing[0]
        aq  = _anchor_q(b.get("sample_count",0), b.get("risk_flag",""), b.get("dispersion",0))
        pos = _band_pos(value, b["lower"], b["center"], b["upper"])
        conf= _ctr_conf(value, b["lower"], b["center"], b["upper"]) * aq
        return b["d"], pos, conf

    if len(containing) > 1:
        b   = min(containing, key=lambda x: abs(value - x["center"]))
        aq  = _anchor_q(b.get("sample_count",0), b.get("risk_flag",""), b.get("dispersion",0))
        pos = _band_pos(value, b["lower"], b["center"], b["upper"])
        conf= _ctr_conf(value, b["lower"], b["center"], b["upper"]) * aq * 0.7
        return b["d"], pos, conf

    if not bands:
        return DAN_ORDER[0], 0.0, 0.0

    b   = min(bands, key=lambda x: abs(value - x["center"]))
    aq  = _anchor_q(b.get("sample_count",0), b.get("risk_flag",""), b.get("dispersion",0))
    pos = _band_pos(value, b["lower"], b["center"], b["upper"])
    conf= _ctr_conf(value, b["lower"], b["center"], b["upper"]) * aq * 0.5
    return b["d"], pos, conf

def _composite_dan(estimates):
    """estimates: [(dan, pos, conf, role), ...]"""
    tuples = [(DAN_ORDER.index(d), p, c) for d, p, c, _ in estimates if d in DAN_ORDER]
    if not tuples:
        return None, 0.5, 0.0

    tuples.sort(key=lambda x: x[0])
    top_i  = tuples[-1][0]
    bot_i  = tuples[0][0]
    spread = top_i - bot_i

    if spread <= 2:
        total_c = sum(t[2] for t in tuples) or 1.0
        composite = sum((t[0] + t[1]) * t[2] for t in tuples) / total_c
        ci = round(composite)
    else:
        ci = max(tuples, key=lambda x: x[2])[0]

    if spread >= 5:
        ci -= 1
    ci = max(0, min(len(DAN_ORDER) - 1, ci))

    matching = [t for t in tuples if t[0] == ci]
    if matching:
        tc = sum(t[2] for t in matching) or 1.0
        fp = sum(t[1] * t[2] for t in matching) / tc
    else:
        fp = 0.5

    avg_c = sum(t[2] for t in tuples) / len(tuples)
    return DAN_ORDER[ci], fp, avg_c

def compute_reform(msd, role_scales):
    thresholds = role_scales.get("thresholds", {})
    role_map = {
        "jack":    max(msd.get("jackspeed", 0), msd.get("chordjack", 0)),
        "speed":   max(msd.get("stream", 0),    msd.get("jumpstream", 0)),
        "tech":    msd.get("technical", 0),
        "stamina": 0.7 * msd.get("stamina", 0) + 0.3 * msd.get("handstream", 0),
    }
    estimates = []
    for role, val in role_map.items():
        rt = thresholds.get(role)
        if rt and val > 0:
            d, p, c = _lookup_role_dan(val, rt)
            estimates.append((d, p, c, role))
    if not estimates:
        return None, 0.5, 0.0
    return _composite_dan(estimates)

# ── Pack profile lookups ──────────────────────────────────────────────────────
def _best_tier(msd, tiers, lo_k="lower", hi_k="upper"):
    best_in  = None
    best_out = None
    best_out_d = float("inf")
    for t in tiers:
        lo  = t.get(lo_k, t.get("overall_msd", 0) - 2)
        hi  = t.get(hi_k, t.get("overall_msd", 0) + 2)
        ctr = t.get("overall_msd", (lo + hi) / 2)
        d   = abs(msd - ctr)
        if lo <= msd <= hi:
            if best_in is None or d < abs(msd - best_in.get("overall_msd", ctr)):
                best_in = t
        if d < best_out_d:
            best_out_d = d
            best_out = t
    tier = best_in if best_in else best_out
    in_range = best_in is not None
    return tier, in_range

def compute_celestial(msd, profiles):
    best = None
    best_d = float("inf")
    best_in_range = None

    for course in CELESTIAL_COURSES:
        cp = profiles.get(course, {})
        for stage in CELESTIAL_STAGES:
            t = cp.get(stage)
            if not t:
                continue
            lo  = t.get("lower", t["overall_msd"] - 2)
            hi  = t.get("upper", t["overall_msd"] + 2)
            ctr = t["overall_msd"]
            d   = abs(msd - ctr)
            if lo <= msd <= hi:
                if best_in_range is None or d < abs(msd - best_in_range[0]["overall_msd"]):
                    best_in_range = (t, course, stage)
            if d < best_d:
                best_d = d
                best = (t, course, stage)

    picked, course, stage = best_in_range if best_in_range else (best or (None, None, None))
    if picked is None:
        return None

    hi     = picked.get("upper", picked["overall_msd"] + 2)
    beyond = msd > hi
    si     = CELESTIAL_STAGES.index(stage)
    dp_c   = si + (0.5 if beyond else 0.0)
    conf   = 1.0 if best_in_range else 0.5

    return {
        "tier": stage,
        "label": f"{course} {stage}",
        "short": f"{course[:3]}-{stage}",
        "dp_celestial": dp_c,
        "beyond": beyond,
        "confidence": conf,
    }

def compute_signicial(msd, profiles):
    tiers = [{"_s": s, **profiles[s]} for s in SIGNICIAL_STAGES if s in profiles]
    t, in_range = _best_tier(msd, tiers)
    if t is None:
        return None
    s      = t["_s"]
    hi     = t.get("upper", t["overall_msd"] + 2)
    beyond = msd > hi
    si     = SIGNICIAL_STAGES.index(s)
    return {
        "stage_key": s,
        "label": f"Stage {s}",
        "short": s,
        "dp_signicial": si + (0.5 if beyond else 0.0),
        "beyond": beyond,
    }

def compute_shoegazer(msd, profiles):
    tiers = [{"_s": s, **profiles[s]} for s in SHOEGAZER_STAGES if s in profiles]
    t, in_range = _best_tier(msd, tiers, lo_k="msd_lower", hi_k="msd_upper")
    if t is None:
        return None
    s      = t["_s"]
    hi     = t.get("msd_upper", t.get("overall_msd", 0) + 2)
    beyond = msd > hi
    si     = SHOEGAZER_STAGES.index(s)
    return {
        "stage_key": s,
        "label": f"{s} Dan",
        "short": s,
        "dp_shoegazer": si + (0.5 if beyond else 0.0),
        "beyond": beyond,
    }

# ── Main analysis ─────────────────────────────────────────────────────────────
def analyze():
    with urllib.request.urlopen("http://localhost:24050/json", timeout=5) as r:
        state = json.loads(r.read())

    songs  = state["settings"]["folders"]["songs"]
    bm     = state["menu"]["bm"]
    md5    = bm.get("md5", "")
    folder = os.path.basename(bm["path"]["folder"])
    fname  = bm["path"]["file"]

    if not fname:
        raise ValueError("No beatmap loaded")

    if md5 and md5 in _analysis_cache:
        return _analysis_cache[md5]

    osu = os.path.join(songs, folder, fname)
    if not os.path.isfile(osu):
        raise FileNotFoundError(f"Beatmap not found: {osu}")

    bpm, od, rows = parse_osu(osu)
    msd = run_msd(rows)

    overall_msd = msd.get("overall", 0)
    skillsets = {
        "stream":     msd.get("stream", 0),
        "jumpstream": msd.get("jumpstream", 0),
        "handstream": msd.get("handstream", 0),
        "stamina":    msd.get("stamina", 0),
        "jackspeed":  msd.get("jackspeed", 0),
        "chordjack":  msd.get("chordjack", 0),
        "technical":  msd.get("technical", 0),
    }

    role_scales = load_cfg("role_scales.json")
    dan, pos, conf = compute_reform(msd, role_scales)

    if dan is None:
        raise RuntimeError("Reform lookup returned no result")

    dan_idx  = DAN_ORDER.index(dan)
    dp       = 1.0 + dan_idx + pos
    sublevel = "Low" if pos < 0.333 else ("Mid" if pos < 0.667 else "High")
    beyond   = pos >= 1.0

    duration_s = rows[-1]["time"] - rows[0]["time"] if len(rows) > 1 else 0

    result = {
        "type":        "analysis",
        "dan_label":   DAN_LABELS.get(dan, dan),
        "dan_short":   dan,
        "dp":          dp,
        "sublevel":    sublevel,
        "beyond":      beyond,
        "overall_msd": overall_msd,
        "skillsets":   skillsets,
        "celestial":   compute_celestial(overall_msd,  load_cfg("celestial_profiles.json")),
        "signicial":   compute_signicial(overall_msd,  load_cfg("signicial_profiles.json")),
        "shoegazer":   compute_shoegazer(overall_msd,  load_cfg("shoegazer_profiles.json")),
        "ln_course":   None,
        "ln_route":    None,
        "mod":         0,
        "mod_label":   "NM",
        "bpm":         bpm,
        "od":          od,
        "osu_sr":      bm.get("stats", {}).get("fullSR", 0),
        "duration_s":  duration_s,
    }
    stats    = bm.get("stats", {})
    holds    = stats.get("holds", 0)
    circles  = stats.get("circles", 0)
    ln_ratio = holds / max(circles + holds, 1)
    result["ln_ratio"] = round(ln_ratio, 3)

    if md5:
        _analysis_cache[md5] = result
    return result

# ── HTTP server ───────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass  # suppress access log

    def _send(self, code, body_bytes, ct="application/json"):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(body_bytes)))
        self.end_headers()
        self.wfile.write(body_bytes)

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_GET(self):
        if self.path != "/analyze":
            self._send(404, b'{"error":"not found"}')
            return
        try:
            payload = analyze()
            self._send(200, json.dumps(payload).encode("utf-8"))
        except ValueError as e:
            self._send(400, json.dumps({"error": str(e)}).encode("utf-8"))
        except Exception as e:
            self._send(500, json.dumps({"error": str(e)}).encode("utf-8"))

PORT = 24051

if __name__ == "__main__":
    print(f"Dan Overlay server  →  http://127.0.0.1:{PORT}/analyze")
    print(f"msd.exe : {MSD_EXE}")
    print(f"config  : {CONFIG_DIR}")
    print("Press Ctrl+C to stop.\n")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
