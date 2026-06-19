var DanEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // port/browser/danEngine.ts
  var danEngine_exports = {};
  __export(danEngine_exports, {
    analyze: () => analyze
  });

  // port/src/osuParserMain.ts
  var safeInt = (v, d = null) => {
    const n = parseFloat(String(v).trim());
    return Number.isNaN(n) ? d : Math.trunc(n);
  };
  var safeFloat = (v, d = null) => {
    const n = parseFloat(String(v).trim());
    return Number.isNaN(n) ? d : n;
  };
  function mapXToCol(x, keycount) {
    if (keycount <= 0) return 0;
    let xc = x;
    if (x < 0) xc = 0;
    else if (x >= 512) xc = 511;
    const col = Math.trunc(xc * keycount / 512);
    return Math.min(col, keycount - 1);
  }
  function remapCol(colIn, kcIn, kcOut) {
    if (kcIn <= 0 || kcOut <= 0) return 0;
    return Math.trunc(colIn * kcOut / kcIn);
  }
  function buildRows(notes, tol) {
    if (!notes.length) return [];
    const ordered = [...notes].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const rows = [];
    let t0 = Math.trunc(ordered[0][0]);
    let cols = /* @__PURE__ */ new Set([Math.trunc(ordered[0][1])]);
    for (let i = 1; i < ordered.length; i++) {
      const t = Math.trunc(ordered[i][0]);
      const c = Math.trunc(ordered[i][1]);
      if (Math.abs(t - t0) <= tol) {
        cols.add(c);
      } else {
        rows.push({ t: t0, cols: [...cols].sort((a, b) => a - b) });
        t0 = t;
        cols = /* @__PURE__ */ new Set([c]);
      }
    }
    rows.push({ t: t0, cols: [...cols].sort((a, b) => a - b) });
    return rows;
  }
  function parsearOsuV2Text(raw, enforceModeMania = true) {
    const lines = raw.split(/\r\n|\r|\n/);
    let bpm = 120;
    const allBpms = [];
    let mode = 3, keycountNative = 4, od = 8, hp = 8;
    let section = "";
    const notes = [];
    const noteEvents = [];
    let objectCount = 0, lnCount = 0;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("[") && line.endsWith("]")) {
        section = line;
        continue;
      }
      if (line.startsWith("//")) continue;
      if (section === "[General]") {
        if (line.startsWith("Mode:")) {
          const v = safeInt(line.split(/:(.*)/s)[1], mode);
          mode = v == null ? mode : v;
        }
      } else if (section === "[Difficulty]") {
        if (line.startsWith("CircleSize:")) {
          const cs = safeFloat(line.split(/:(.*)/s)[1], keycountNative);
          if (cs != null) keycountNative = Math.max(1, Math.round(cs));
        } else if (line.startsWith("OverallDifficulty:")) {
          const v = safeFloat(line.split(/:(.*)/s)[1]);
          if (v != null) od = v;
        } else if (line.startsWith("HPDrainRate:")) {
          const v = safeFloat(line.split(/:(.*)/s)[1]);
          if (v != null) hp = v;
        }
      } else if (section === "[TimingPoints]") {
        const parts = line.split(",");
        if (parts.length >= 7) {
          const uninherited = safeInt(parts[6], 0);
          const beatLength = safeFloat(parts[1]);
          if (uninherited === 1 && beatLength != null && beatLength > 0) {
            const tpBpm = 6e4 / beatLength;
            if (allBpms.length === 0) bpm = tpBpm;
            allBpms.push(tpBpm);
          }
        }
      } else if (section === "[HitObjects]") {
        const parts = line.split(",");
        if (parts.length < 5) continue;
        const x = safeInt(parts[0]);
        const t = safeInt(parts[2]);
        const objType = safeInt(parts[3], 0);
        if (x == null || t == null) continue;
        const colNative = mapXToCol(x, keycountNative);
        const col = remapCol(colNative, keycountNative, keycountNative);
        const isLn = !!(objType & 128);
        const isTap = !!(objType & 1);
        objectCount += 1;
        if (isLn) {
          lnCount += 1;
          let tEnd = null;
          if (parts.length >= 6) tEnd = safeInt(parts[5].split(":")[0]);
          if (tEnd == null || tEnd <= t) {
            notes.push([t, col]);
            noteEvents.push({ time_ms: t, col, event_type: "tap", is_ln: false });
          } else {
            notes.push([t, col]);
            noteEvents.push({ time_ms: t, col, event_type: "ln_start", is_ln: true, ln_start_ms: t, ln_end_ms: tEnd, duration_ms: tEnd - t });
            notes.push([tEnd, col]);
            noteEvents.push({ time_ms: tEnd, col, event_type: "ln_end", is_ln: true, ln_start_ms: t, ln_end_ms: tEnd, duration_ms: tEnd - t });
          }
        } else if (isTap) {
          notes.push([t, col]);
          noteEvents.push({ time_ms: t, col, event_type: "tap", is_ln: false });
        }
      }
    }
    const sorted = [...notes].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const deduped = [];
    let prev = null;
    for (const n of sorted) {
      if (prev && prev[0] === n[0] && prev[1] === n[1]) continue;
      deduped.push(n);
      prev = n;
    }
    let rejected = false;
    if (enforceModeMania && mode !== 3) rejected = true;
    let finalNotes = deduped, finalEvents = noteEvents;
    if (rejected) {
      finalNotes = [];
      finalEvents = [];
    }
    const rows = buildRows(finalNotes, 0);
    const noteCount = finalNotes.length;
    const firstMs = finalNotes.length ? finalNotes[0][0] : 0;
    const lastMs = finalNotes.length ? finalNotes[finalNotes.length - 1][0] : 0;
    const drainTimeS = Math.max(0, (lastMs - firstMs) / 1e3);
    const lnRatio = lnCount / Math.max(objectCount, 1);
    const bpmsRounded = allBpms.length ? allBpms.map((b) => Math.round(b)) : [Math.round(bpm)];
    const bpmMin = Math.min(...bpmsRounded);
    const bpmMax = Math.max(...bpmsRounded);
    const counts = /* @__PURE__ */ new Map();
    for (const b of bpmsRounded) counts.set(b, (counts.get(b) ?? 0) + 1);
    let bpmCommon = bpmsRounded[0], best = -1;
    for (const [b, c] of counts) if (c > best) {
      best = c;
      bpmCommon = b;
    }
    return {
      notes: finalNotes,
      note_events: finalEvents.sort((a, b) => a.time_ms - b.time_ms || a.col - b.col),
      rows,
      bpm,
      bpm_min: bpmMin,
      bpm_max: bpmMax,
      bpm_common: bpmCommon,
      od,
      hp,
      keycount_native: keycountNative,
      note_count: noteCount,
      ln_count: lnCount,
      object_count: objectCount,
      ln_ratio: lnRatio,
      drain_time_s: drainTimeS,
      mode,
      rejected
    };
  }

  // port/src/validator.ts
  var LN_ROUTE_HYBRID_FLOOR = 0.3;
  var LN_ROUTE_LN_FLOOR = 0.45;
  function lnConfidenceBand(lnRatio) {
    if (lnRatio <= 0.1) return "high";
    if (lnRatio <= 0.3) return "degraded";
    if (lnRatio <= 0.45) return "gray";
    return "out_of_domain";
  }
  function lnRoute(lnRatio) {
    if (lnRatio <= LN_ROUTE_HYBRID_FLOOR) return "rice";
    if (lnRatio <= LN_ROUTE_LN_FLOOR) return "hybrid";
    return "ln";
  }
  function validateDomain(p) {
    const warnings = [];
    const keycount = p.keycount_native, mode = p.mode;
    const noteCount = p.note_count, drainTimeS = p.drain_time_s, bpm = p.bpm, od = p.od, hp = p.hp, lnRatio = p.ln_ratio;
    const is4k = keycount === 4, is7k = keycount === 7;
    let rejectionReason = null;
    if (p.rejected) rejectionReason = `parser rejected: mode=${mode}, keycount=${keycount}`;
    if (mode !== 3) rejectionReason = rejectionReason ?? `not mania mode (mode=${mode})`;
    if (!is4k && !is7k) rejectionReason = rejectionReason ?? `not 4K or 7K (keycount=${keycount})`;
    if (noteCount < 20) rejectionReason = rejectionReason ?? `too few notes (${noteCount})`;
    if (drainTimeS < 5) rejectionReason = rejectionReason ?? `drain too short (${drainTimeS.toFixed(1)}s)`;
    const lnConfidence = lnConfidenceBand(lnRatio);
    if (lnConfidence === "out_of_domain") warnings.push(`LN ratio ${(lnRatio * 100).toFixed(1)}% \u2014 out of rice domain`);
    const route = lnRoute(lnRatio);
    return {
      valid: rejectionReason === null,
      is_4k: is4k,
      is_7k: is7k,
      ln_ratio: lnRatio,
      ln_confidence: lnConfidence,
      ln_route: route,
      note_count: noteCount,
      drain_time_s: drainTimeS,
      bpm,
      od,
      hp,
      warnings,
      rejection_reason: rejectionReason
    };
  }

  // port/src/featureExtractor.ts
  var round = (v, d) => isFinite(v) ? Number(v.toFixed(d)) : v;
  function bisectLeft(a, v) {
    let lo = 0, hi = a.length;
    while (lo < hi) {
      const m = lo + hi >>> 1;
      if (a[m] < v) lo = m + 1;
      else hi = m;
    }
    return lo;
  }
  function bisectRight(a, v) {
    let lo = 0, hi = a.length;
    while (lo < hi) {
      const m = lo + hi >>> 1;
      if (a[m] <= v) lo = m + 1;
      else hi = m;
    }
    return lo;
  }
  function npsWindows(notes, windowMs = 500, strideMs = 250) {
    if (!notes.length) return [];
    const times = notes.map((n) => n[0]);
    const tMin = times[0], tMax = times[times.length - 1];
    const half = Math.trunc(windowMs / 2);
    const durationS = windowMs / 1e3;
    const results = [];
    let t = tMin;
    while (t <= tMax) {
      const lo = t - half, hi = t + half;
      const count = bisectRight(times, hi) - bisectLeft(times, lo);
      const nps = durationS > 0 ? count / durationS : 0;
      results.push([t, nps]);
      t += strideMs;
    }
    return results;
  }
  function cv(values) {
    if (values.length < 2) return 0;
    const mu = values.reduce((a, b) => a + b, 0) / values.length;
    if (mu < 1e-6) return 0;
    const varr = values.reduce((a, v) => a + (v - mu) ** 2, 0) / values.length;
    return Math.sqrt(varr) / mu;
  }
  function extractLnFeatures(parsed) {
    const ev = parsed.note_events;
    const lnRatio = parsed.ln_ratio || 0;
    const drainS = parsed.drain_time_s || 0;
    const lnStarts = ev.filter((e) => e.event_type === "ln_start");
    const zero = { ln_ratio: round(lnRatio, 4), hold_occupancy: 0, ln_duration_mean_ms: 0, ln_duration_cv: 0, simultaneous_hold: 0, release_density: 0, hold_chord_ratio: 0 };
    if (!lnStarts.length || drainS < 1) return zero;
    const durations = lnStarts.filter((e) => (e.duration_ms ?? 0) > 0).map((e) => e.duration_ms);
    const lnDurMean = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const lnDurCv = durations.length >= 2 ? cv(durations) : 0;
    const firstMs = parsed.notes.length ? parsed.notes[0][0] : 0;
    const lastMs = parsed.notes.length ? parsed.notes[parsed.notes.length - 1][0] : 0;
    const chartSpan = Math.max(lastMs - firstMs, 1);
    let occupied = 0;
    const evts = [];
    for (const e of lnStarts) {
      const s = e.ln_start_ms ?? 0, end = e.ln_end_ms ?? 0;
      if (end > s) {
        evts.push([s, 1]);
        evts.push([end, -1]);
      }
    }
    evts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let active = 0, segStart = 0;
    for (const [t, delta] of evts) {
      if (active > 0 && t > segStart) occupied += t - segStart;
      active += delta;
      segStart = t;
    }
    const holdOcc = Math.min(1, occupied / chartSpan);
    const startsByTime = [...lnStarts].sort((a, b) => (a.ln_start_ms ?? 0) - (b.ln_start_ms ?? 0));
    let simCount = 0;
    let activeEnds = [];
    for (const e of startsByTime) {
      const s = e.ln_start_ms ?? 0;
      activeEnds = activeEnds.filter((end) => end > s);
      if (activeEnds.length) simCount++;
      activeEnds.push(e.ln_end_ms ?? 0);
      activeEnds.sort((a, b) => a - b);
    }
    const simultaneous = simCount / startsByTime.length;
    const lnEnds = ev.filter((e) => e.event_type === "ln_end");
    const releaseDensity = drainS > 0 ? lnEnds.length / drainS : 0;
    const startTimes = lnStarts.map((e) => e.ln_start_ms ?? 0);
    const counts = /* @__PURE__ */ new Map();
    for (const t of startTimes) counts.set(t, (counts.get(t) ?? 0) + 1);
    let chorded = 0;
    for (const c of counts.values()) if (c >= 2) chorded += c;
    const holdChord = startTimes.length ? chorded / startTimes.length : 0;
    return {
      ln_ratio: round(lnRatio, 4),
      hold_occupancy: round(holdOcc, 4),
      ln_duration_mean_ms: round(lnDurMean, 1),
      ln_duration_cv: round(lnDurCv, 4),
      simultaneous_hold: round(simultaneous, 4),
      release_density: round(releaseDensity, 3),
      hold_chord_ratio: round(holdChord, 4)
    };
  }
  function extractFeatures(parsed) {
    const notes = parsed.notes;
    const rows = parsed.rows;
    const bpm = parsed.bpm || 120;
    const drainS = parsed.drain_time_s || 0;
    const noteCount = notes.length;
    const rowCount = rows.length;
    const notesSorted = [...notes].sort((a, b) => a[0] - b[0]);
    let stream_purity = 0, jump_ratio = 0, hand_ratio = 0, quad_ratio = 0;
    if (rowCount > 0) {
      const sizes = rows.map((r) => r.cols.length);
      stream_purity = sizes.filter((s) => s === 1).length / rowCount;
      jump_ratio = sizes.filter((s) => s === 2).length / rowCount;
      hand_ratio = sizes.filter((s) => s === 3).length / rowCount;
      quad_ratio = sizes.filter((s) => s >= 4).length / rowCount;
    }
    const byCol = /* @__PURE__ */ new Map();
    for (const [t, c] of notesSorted) {
      let a = byCol.get(c);
      if (!a) {
        a = [];
        byCol.set(c, a);
      }
      a.push(t);
    }
    const JACK = 180, STRICT = 120, VIBRO = 80;
    let jackHits = 0, jackStrict = 0, vibroHits = 0, minijack = 0, totalPairs = 0;
    for (const times of byCol.values()) {
      const s = [...times].sort((a, b) => a - b);
      for (let i = 1; i < s.length; i++) {
        const gap = s[i] - s[i - 1];
        totalPairs += 1;
        if (gap <= VIBRO) {
          vibroHits++;
          jackStrict++;
          jackHits++;
        } else if (gap <= STRICT) {
          jackStrict++;
          jackHits++;
        } else if (gap <= JACK) {
          jackHits++;
        }
        if (gap >= 100 && gap <= 200) minijack++;
      }
    }
    let jack_ratio = 0, jack_density = 0, vibro_density = 0;
    if (noteCount > 0 && totalPairs > 0) {
      jack_ratio = jackHits / totalPairs;
      jack_density = jackStrict / totalPairs;
      vibro_density = vibroHits / totalPairs;
    }
    const minijack_ratio = minijack / Math.max(totalPairs, 1);
    let anchor_ratio = 0;
    if (noteCount > 0) {
      const colCounts = [...byCol.values()].map((a) => a.length);
      const maxColCount = colCounts.length ? Math.max(...colCounts) : 0;
      const numCols = colCounts.length || 4;
      const expectedPerCol = noteCount / numCols;
      anchor_ratio = Math.max(0, (maxColCount - expectedPerCol) / Math.max(noteCount, 1));
    }
    let transition_var = 0;
    if (rows.length >= 2) {
      const diffs = [];
      for (let i = 1; i < rows.length; i++) {
        const prev = new Set(rows[i - 1].cols), curr = new Set(rows[i].cols);
        const union = (/* @__PURE__ */ new Set([...prev, ...curr])).size;
        let inter = 0;
        for (const c of curr) if (prev.has(c)) inter++;
        if (union > 0) diffs.push(1 - inter / union);
      }
      transition_var = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    }
    const npsData = npsWindows(notesSorted, 500, 250);
    const npsValues = npsData.length ? npsData.map((d) => d[1]) : [0];
    const density_cv = cv(npsValues);
    const npsSorted = [...npsValues].sort((a, b) => a - b);
    let nps_p90 = 0, nps_p50 = 0, nps_p95 = 0;
    if (npsSorted.length) {
      nps_p90 = npsSorted[Math.min(Math.trunc(0.9 * npsSorted.length), npsSorted.length - 1)];
      nps_p50 = npsSorted[Math.min(Math.trunc(0.5 * npsSorted.length), npsSorted.length - 1)];
      nps_p95 = npsSorted[Math.min(Math.trunc(0.95 * npsSorted.length), npsSorted.length - 1)];
    }
    const top30Cutoff = Math.trunc(0.7 * npsSorted.length);
    const top30Vals = npsSorted.length ? npsSorted.slice(top30Cutoff) : [];
    const nps_sustained_top30 = top30Vals.length ? top30Vals.reduce((a, b) => a + b, 0) / top30Vals.length : 0;
    const activeVals = npsValues.filter((v) => v > 2);
    const nps_active_ratio = activeVals.length / Math.max(npsValues.length, 1);
    const nps_active_cv = activeVals.length >= 2 ? cv(activeVals) : 0;
    const stamina_index = drainS > 0 && nps_p90 > 0 ? nps_sustained_top30 / nps_p90 * Math.log(1 + drainS / 90) : 0;
    const burst_ratio = nps_p95 / Math.max(nps_p50, 0.01);
    let pattern_irregularity = 0;
    if (notesSorted.length && drainS > 0) {
      const tMin = notesSorted[0][0], tMax = notesSorted[notesSorted.length - 1][0];
      const entropies = [];
      let t = tMin, ni = 0;
      while (t <= tMax) {
        const lo = t, hi = t + 2e3;
        const colCountsW = /* @__PURE__ */ new Map();
        let totalW = 0;
        for (let j = ni; j < notesSorted.length; j++) {
          const nt = notesSorted[j][0], nc = notesSorted[j][1];
          if (nt < lo) continue;
          if (nt > hi) break;
          colCountsW.set(nc, (colCountsW.get(nc) ?? 0) + 1);
          totalW++;
        }
        if (totalW >= 4) {
          let h = 0;
          for (const cnt of colCountsW.values()) if (cnt > 0) {
            const p = cnt / totalW;
            h -= p * Math.log2(p);
          }
          entropies.push(h);
        }
        t += 1e3;
        while (ni < notesSorted.length && notesSorted[ni][0] < lo) ni++;
      }
      pattern_irregularity = entropies.length >= 2 ? cv(entropies) : 0;
    }
    let timing_irregularity = 0;
    if (rowCount >= 3) {
      const rowTimes = rows.map((r) => r.t);
      const gaps = [];
      for (let i = 1; i < rowTimes.length; i++) gaps.push(rowTimes[i] - rowTimes[i - 1]);
      timing_irregularity = gaps.length ? cv(gaps) : 0;
    }
    let chord_complexity = 0;
    const fracChords = hand_ratio + quad_ratio;
    if (fracChords > 0 && rowCount > 0 && npsValues.length) {
      const chordTimes = /* @__PURE__ */ new Set();
      for (const r of rows) if (r.cols.length >= 3) chordTimes.add(r.t);
      if (chordTimes.size) {
        const npsDuringChords = [];
        const overallMean = npsValues.reduce((a, b) => a + b, 0) / npsValues.length;
        for (const [centerT, npsVal] of npsData) {
          const lo = centerT - 250, hi = centerT + 250;
          let any = false;
          for (const ct of chordTimes) if (lo <= ct && ct <= hi) {
            any = true;
            break;
          }
          if (any) npsDuringChords.push(npsVal);
        }
        if (npsDuringChords.length && overallMean > 0) {
          const densityAmp = npsDuringChords.reduce((a, b) => a + b, 0) / npsDuringChords.length / overallMean;
          chord_complexity = fracChords * (1 + densityAmp);
        } else {
          chord_complexity = fracChords;
        }
      } else {
        chord_complexity = 0;
      }
    }
    return {
      stream_purity: round(stream_purity, 4),
      jump_ratio: round(jump_ratio, 4),
      hand_ratio: round(hand_ratio, 4),
      quad_ratio: round(quad_ratio, 4),
      jack_ratio: round(jack_ratio, 4),
      jack_density: round(jack_density, 4),
      vibro_density: round(vibro_density, 4),
      anchor_ratio: round(anchor_ratio, 4),
      minijack_ratio: round(minijack_ratio, 4),
      density_cv: round(density_cv, 4),
      transition_var: round(transition_var, 4),
      nps_p50: round(nps_p50, 3),
      nps_p90: round(nps_p90, 3),
      nps_p95: round(nps_p95, 3),
      nps_sustained_top30: round(nps_sustained_top30, 3),
      nps_active_ratio: round(nps_active_ratio, 4),
      nps_active_cv: round(nps_active_cv, 4),
      bpm: round(bpm, 2),
      duration_s: round(drainS, 2),
      stamina_index: round(stamina_index, 4),
      burst_ratio: round(burst_ratio, 4),
      pattern_irregularity: round(pattern_irregularity, 4),
      timing_irregularity: round(timing_irregularity, 4),
      chord_complexity: round(chord_complexity, 4)
    };
  }

  // port/src/osuParser.ts
  function intFloat(s) {
    return Math.trunc(parseFloat(s));
  }
  function parseOsuText(raw) {
    const lines = raw.split(/\r\n|\r|\n/);
    let i = 0;
    const next = () => {
      if (i >= lines.length) throw new StopIteration();
      return lines[i++];
    };
    let od = -1;
    let columnCount = -1;
    const columns = [];
    const noteStarts = [];
    const noteEnds = [];
    const noteTypes = [];
    const readColumnCount = (line) => {
      if (!line.includes("CircleSize:")) return -1;
      let val = line.trim().slice(-1);
      if (val === "0") val = "10";
      return Math.trunc(parseFloat(val));
    };
    const parseHitObject = (line, K) => {
      const params = line.split(",");
      const columnWidth = Math.trunc(512 / K);
      columns.push(Math.trunc(intFloat(params[0]) / columnWidth));
      noteStarts.push(Math.trunc(parseInt(params[2], 10)));
      noteTypes.push(Math.trunc(parseInt(params[3], 10)));
      noteEnds.push(Math.trunc(parseInt(params[5].split(":")[0], 10)));
    };
    try {
      while (true) {
        let line;
        try {
          line = next();
        } catch (e) {
          if (e instanceof StopIteration) break;
          throw e;
        }
        if (line.includes("[Metadata]") && !line.includes("Source:")) {
          let m = next();
          while (!m.includes("Source:")) m = next();
        }
        const cc = readColumnCount(line);
        if (cc !== -1) columnCount = cc;
        od = 9;
        if (columnCount !== -1) {
          if (line.includes("[HitObjects]")) {
            let nl = next();
            while (true) {
              if (nl.trim() !== "") parseHitObject(nl, columnCount);
              nl = next();
            }
          }
        }
      }
    } catch (e) {
      if (!(e instanceof StopIteration)) throw e;
    }
    return { K: columnCount, columns, noteStarts, noteEnds, noteTypes, od };
  }
  var StopIteration = class extends Error {
  };

  // port/src/algorithm.ts
  var zeros = (n) => new Float64Array(n);
  var full = (n, v) => {
    const a = new Float64Array(n);
    a.fill(v);
    return a;
  };
  function searchsorted(a, v, side = "left") {
    let lo = 0, hi = a.length;
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      const go = side === "left" ? a[mid] < v : a[mid] <= v;
      if (go) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  function interp(x, xp, fp) {
    const out = new Float64Array(x.length);
    const n = xp.length;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      if (xi <= xp[0]) {
        out[i] = fp[0];
        continue;
      }
      if (xi >= xp[n - 1]) {
        out[i] = fp[n - 1];
        continue;
      }
      let j = searchsorted(xp, xi, "right") - 1;
      if (j < 0) j = 0;
      if (j >= n - 1) j = n - 2;
      const t = (xi - xp[j]) / (xp[j + 1] - xp[j]);
      out[i] = fp[j] + t * (fp[j + 1] - fp[j]);
    }
    return out;
  }
  function stepInterp(newX, oldX, oldVals) {
    const out = new Float64Array(newX.length);
    for (let i = 0; i < newX.length; i++) {
      let idx = searchsorted(oldX, newX[i], "right") - 1;
      if (idx < 0) idx = 0;
      out[i] = oldVals[idx];
    }
    return out;
  }
  function cumulativeSum(x, f) {
    const n = x.length;
    const F = new Float64Array(n);
    let acc = 0;
    for (let i = 1; i < n; i++) {
      acc += f[i - 1] * (x[i] - x[i - 1]);
      F[i] = acc;
    }
    return F;
  }
  function smoothOnCorners(x, f, window, scale, mode) {
    const F = cumulativeSum(x, f);
    const n = x.length;
    const x0 = x[0], xl = x[n - 1];
    const clip = (v) => v < x0 ? x0 : v > xl ? xl : v;
    const query = (q) => {
      let idx = searchsorted(x, q, "left") - 1;
      if (idx < 0) idx = 0;
      else if (idx > n - 2) idx = n - 2;
      return F[idx] + f[idx] * (q - x[idx]);
    };
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = clip(x[i] - window);
      const b = clip(x[i] + window);
      const val = query(b) - query(a);
      if (mode === "avg") {
        const span = b - a;
        out[i] = span > 0 ? val / span : 0;
      } else {
        out[i] = scale * val;
      }
    }
    return out;
  }
  function rescaleHigh(sr) {
    return sr <= 9 ? sr : 9 + (sr - 9) / 1.2;
  }
  function preprocess(p, mod) {
    const K = p.K;
    const noteSeq = [];
    for (let i = 0; i < p.columns.length; i++) {
      const k = p.columns[i];
      let h = p.noteStarts[i];
      if (mod === "DT") h = Math.floor(h * 2 / 3);
      else if (mod === "HT") h = Math.floor(h * 4 / 3);
      noteSeq.push([k, h]);
    }
    let x = 0.3 * Math.pow((64.5 - Math.ceil(p.od * 3)) / 500, 0.5);
    x = Math.min(x, 0.6 * (x - 0.09) + 0.09);
    noteSeq.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const noteSeqByColumn = Array.from({ length: K }, () => []);
    for (const tup of noteSeq) noteSeqByColumn[tup[0]].push(tup);
    let T = 0;
    for (const n of noteSeq) if (n[1] > T) T = n[1];
    T += 1;
    return { x, K, T, noteSeq, noteSeqByColumn };
  }
  function getCorners(T, noteSeq) {
    const baseSet = /* @__PURE__ */ new Set();
    for (const [, h] of noteSeq) {
      baseSet.add(h);
      baseSet.add(h + 501);
      baseSet.add(h - 499);
      baseSet.add(h + 1);
    }
    baseSet.add(0);
    baseSet.add(T);
    const base = Float64Array.from([...baseSet].filter((s) => s >= 0 && s <= T).sort((a, b) => a - b));
    const aSet = /* @__PURE__ */ new Set();
    for (const [, h] of noteSeq) {
      aSet.add(h);
      aSet.add(h + 1e3);
      aSet.add(h - 1e3);
    }
    aSet.add(0);
    aSet.add(T);
    const A = Float64Array.from([...aSet].filter((s) => s >= 0 && s <= T).sort((a, b) => a - b));
    const allSet = /* @__PURE__ */ new Set([...base, ...A]);
    const all = Float64Array.from([...allSet].sort((a, b) => a - b));
    return { all, base, A };
  }
  function getKeyUsage(K, T, noteSeq, baseCorners) {
    const usage = Array.from({ length: K }, () => new Uint8Array(baseCorners.length));
    for (const [k, h] of noteSeq) {
      const start = Math.max(h - 150, 0);
      const end = Math.min(h + 150, T - 1);
      const li = searchsorted(baseCorners, start, "left");
      const ri = searchsorted(baseCorners, end, "left");
      for (let i = li; i < ri; i++) usage[k][i] = 1;
    }
    return usage;
  }
  function getKeyUsage400(K, T, noteSeq, baseCorners) {
    const usage = Array.from({ length: K }, () => zeros(baseCorners.length));
    for (const [k, h] of noteSeq) {
      const start = Math.max(h, 0);
      const li = searchsorted(baseCorners, start - 400, "left");
      const ri = searchsorted(baseCorners, start + 400, "left");
      const mid = searchsorted(baseCorners, start, "left");
      usage[k][mid] += 3.75;
      for (let i = li; i < mid; i++) usage[k][i] += 3.75 - 234375e-10 * (baseCorners[i] - start) ** 2;
      for (let i = mid + 1; i < ri; i++) usage[k][i] += 3.75 - 234375e-10 * (baseCorners[i] - start) ** 2;
    }
    return usage;
  }
  function computeAnchor(K, keyUsage400, baseCorners) {
    const N = baseCorners.length;
    const out = zeros(N);
    const row = new Float64Array(K);
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < K; k++) row[k] = keyUsage400[k][i];
      const counts = Array.from(row).sort((a, b) => b - a);
      let nNz = 0;
      for (const c of counts) if (c > 0) nNz++;
      let walk = 0, maxWalk = 0;
      for (let j = 0; j < K - 1; j++) {
        const c0 = counts[j], c1 = counts[j + 1];
        const pairValid = c0 > 0 && c1 > 0;
        if (!pairValid) continue;
        const safeC0 = c0 > 0 ? c0 : 1;
        const ratio = c0 > 0 ? c1 / safeC0 : 0;
        const weight = 1 - 4 * (0.5 - ratio) ** 2;
        walk += c0 * weight;
        maxWalk += c0;
      }
      const rawAnchor = nNz > 1 ? walk / Math.max(maxWalk, 1e-9) : 0;
      out[i] = 1 + Math.min(rawAnchor - 0.18, 5 * (rawAnchor - 0.22) ** 3);
    }
    return out;
  }
  function computeJbar(K, T, x, noteSeqByColumn, baseCorners) {
    const N = baseCorners.length;
    const jackNerfer = (delta) => 1 - 7e-5 * (0.15 + Math.abs(delta - 0.08)) ** -4;
    const deltaKs = Array.from({ length: K }, () => full(N, 1e9));
    const Jks = Array.from({ length: K }, () => zeros(N));
    for (let k = 0; k < K; k++) {
      const notes = noteSeqByColumn[k];
      if (notes.length < 2) continue;
      for (let n = 0; n < notes.length - 1; n++) {
        const start = notes[n][1];
        const end = notes[n + 1][1];
        const delta = 1e-3 * (end - start);
        const val = delta ** -1 * (delta + 0.11 * x ** 0.25) ** -1 * jackNerfer(delta);
        const li = searchsorted(baseCorners, start, "left");
        const ri = searchsorted(baseCorners, end, "left");
        if (ri > li) {
          for (let i = li; i < ri; i++) {
            Jks[k][i] = val;
            deltaKs[k][i] = delta;
          }
        }
      }
    }
    const JbarKs = Jks.map((jk) => smoothOnCorners(baseCorners, jk, 500, 1e-3, "sum"));
    const Jbar = zeros(N);
    for (let i = 0; i < N; i++) {
      let num = 0, den = 0;
      for (let k = 0; k < K; k++) {
        const w = 1 / deltaKs[k][i];
        const jv = JbarKs[k][i];
        num += Math.max(jv, 0) ** 5 * w;
        den += w;
      }
      Jbar[i] = (num / Math.max(den, 1e-9)) ** 0.2;
    }
    return { deltaKs, Jbar };
  }
  var CROSS_MATRIX = [
    [-1],
    [0.075, 0.075],
    [0.125, 0.05, 0.125],
    [0.125, 0.125, 0.125, 0.125],
    [0.175, 0.25, 0.05, 0.25, 0.175],
    [0.175, 0.25, 0.175, 0.175, 0.25, 0.175],
    [0.225, 0.35, 0.25, 0.05, 0.25, 0.35, 0.225],
    [0.225, 0.35, 0.25, 0.225, 0.225, 0.25, 0.35, 0.225],
    [0.275, 0.45, 0.35, 0.25, 0.05, 0.25, 0.35, 0.45, 0.275],
    [0.275, 0.45, 0.35, 0.25, 0.275, 0.275, 0.25, 0.35, 0.45, 0.275],
    [0.325, 0.55, 0.45, 0.35, 0.25, 0.05, 0.25, 0.35, 0.45, 0.55, 0.325]
  ];
  function computeXbar(K, T, x, noteSeqByColumn, activeColumns, baseCorners) {
    const N = baseCorners.length;
    const crossCoeff = CROSS_MATRIX[K];
    const Xks = Array.from({ length: K + 1 }, () => zeros(N));
    const fastCross = Array.from({ length: K + 1 }, () => zeros(N));
    for (let k = 0; k <= K; k++) {
      let notesInPair;
      if (k === 0) notesInPair = noteSeqByColumn[0];
      else if (k === K) notesInPair = noteSeqByColumn[K - 1];
      else notesInPair = [...noteSeqByColumn[k - 1], ...noteSeqByColumn[k]].sort((a, b) => a[1] - b[1]);
      for (let i = 1; i < notesInPair.length; i++) {
        const start = notesInPair[i - 1][1];
        const end = notesInPair[i][1];
        const li = searchsorted(baseCorners, start, "left");
        const ri = searchsorted(baseCorners, end, "left");
        if (ri <= li) continue;
        const delta = 1e-3 * (notesInPair[i][1] - notesInPair[i - 1][1]);
        let val = 0.16 * Math.max(x, delta) ** -2;
        const leftInactive = !activeColumns[li].includes(k - 1) && !activeColumns[ri].includes(k - 1);
        const rightInactive = !activeColumns[li].includes(k) && !activeColumns[ri].includes(k);
        if (leftInactive || rightInactive) val *= 1 - crossCoeff[k];
        const fc = Math.max(0, 0.4 * Math.max(delta, 0.06, 0.75 * x) ** -2 - 80);
        for (let j = li; j < ri; j++) {
          Xks[k][j] = val;
          fastCross[k][j] = fc;
        }
      }
    }
    const Xbase = zeros(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = 0; k <= K; k++) s += Xks[k][i] * crossCoeff[k];
      Xbase[i] = s;
    }
    for (let k = 0; k < K; k++) {
      for (let i = 0; i < N; i++) {
        Xbase[i] += Math.sqrt(fastCross[k][i] * crossCoeff[k] * fastCross[k + 1][i] * crossCoeff[k + 1]);
      }
    }
    return smoothOnCorners(baseCorners, Xbase, 500, 1e-3, "sum");
  }
  function computePbar(K, T, x, noteSeq, anchor, baseCorners) {
    const N = baseCorners.length;
    const streamBooster = (delta) => {
      const bpm = Math.min(Math.max(7.5 / delta, 0), 420);
      const primary = 0.1 / (1 + Math.exp(-0.06 * (bpm - 175)));
      const secondary = bpm >= 200 && bpm <= 350 ? 0.3 * (1 - Math.exp(-0.02 * (bpm - 200))) : 0;
      return 1 + primary + secondary;
    };
    const Pstep = zeros(N);
    for (let i = 0; i < noteSeq.length - 1; i++) {
      const hL = noteSeq[i][1];
      const hR = noteSeq[i + 1][1];
      const deltaTime = hR - hL;
      if (deltaTime < 1e-9) {
        const spike = 1e3 * (0.02 * (4 / x - 24)) ** 0.25;
        const li2 = searchsorted(baseCorners, hL, "left");
        const ri2 = searchsorted(baseCorners, hL, "right");
        if (ri2 > li2) for (let j = li2; j < ri2; j++) Pstep[j] += spike;
        continue;
      }
      const li = searchsorted(baseCorners, hL, "left");
      const ri = searchsorted(baseCorners, hR, "left");
      if (ri <= li) continue;
      const delta = 1e-3 * deltaTime;
      const bVal = streamBooster(delta);
      const baseInc = (0.08 * x ** -1 * (1 - 24 * x ** -1 * (x / 6) ** 2)) ** 0.25;
      let inc;
      if (delta < 2 * x / 3) {
        inc = delta ** -1 * (0.08 * x ** -1 * (1 - 24 * x ** -1 * (delta - x / 2) ** 2)) ** 0.25 * Math.max(bVal, 1);
      } else {
        inc = delta ** -1 * baseInc * Math.max(bVal, 1);
      }
      for (let j = li; j < ri; j++) {
        Pstep[j] += Math.min(inc * anchor[j], Math.max(inc, inc * 2 - 10));
      }
    }
    return smoothOnCorners(baseCorners, Pstep, 500, 1e-3, "sum");
  }
  function computeAbar(K, T, x, noteSeqByColumn, activeColumns, deltaKs, aCorners, baseCorners) {
    const Nb = baseCorners.length;
    const dks = Array.from({ length: Math.max(K - 1, 0) }, () => zeros(Nb));
    for (let i = 0; i < Nb; i++) {
      const cols = activeColumns[i];
      for (let j = 0; j < cols.length - 1; j++) {
        const k0 = cols[j], k1 = cols[j + 1];
        dks[k0][i] = Math.abs(deltaKs[k0][i] - deltaKs[k1][i]) + 0.4 * Math.max(0, Math.max(deltaKs[k0][i], deltaKs[k1][i]) - 0.11);
      }
    }
    const Na = aCorners.length;
    const Astep = full(Na, 1);
    for (let i = 0; i < Na; i++) {
      let idx = searchsorted(baseCorners, aCorners[i], "left");
      if (idx < 0) idx = 0;
      else if (idx > Nb - 1) idx = Nb - 1;
      const cols = activeColumns[idx];
      for (let j = 0; j < cols.length - 1; j++) {
        const k0 = cols[j], k1 = cols[j + 1];
        const dVal = dks[k0][idx];
        const dk0 = deltaKs[k0][idx], dk1 = deltaKs[k1][idx];
        if (dVal < 0.02) Astep[i] *= Math.min(0.75 + 0.5 * Math.max(dk0, dk1), 1);
        else if (dVal < 0.07) Astep[i] *= Math.min(0.65 + 5 * dVal + 0.5 * Math.max(dk0, dk1), 1);
      }
    }
    return smoothOnCorners(aCorners, Astep, 250, 1, "avg");
  }
  function computeCandKs(K, T, noteSeq, keyUsage, baseCorners) {
    const N = baseCorners.length;
    const noteHitTimes = Float64Array.from(noteSeq.map((n) => n[1]).sort((a, b) => a - b));
    const C2 = zeros(N);
    for (let i = 0; i < N; i++) {
      const lo = searchsorted(noteHitTimes, baseCorners[i] - 500, "left");
      const hi = searchsorted(noteHitTimes, baseCorners[i] + 500, "left");
      C2[i] = hi - lo;
    }
    const Ks = zeros(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = 0; k < K; k++) s += keyUsage[k][i];
      Ks[i] = Math.max(s, 1);
    }
    return { C: C2, Ks };
  }
  function calculateText(raw, mod) {
    return calculateFromParsed(parseOsuText(raw), mod);
  }
  function calculateFromParsed(parsed, mod) {
    const { x, K, T, noteSeq, noteSeqByColumn } = preprocess(parsed, mod);
    const { all: allCorners, base: baseCorners, A: aCorners } = getCorners(T, noteSeq);
    const keyUsage = getKeyUsage(K, T, noteSeq, baseCorners);
    const activeColumns = new Array(baseCorners.length);
    for (let i = 0; i < baseCorners.length; i++) {
      const cols = [];
      for (let k = 0; k < K; k++) if (keyUsage[k][i]) cols.push(k);
      activeColumns[i] = cols;
    }
    const keyUsage400 = getKeyUsage400(K, T, noteSeq, baseCorners);
    const anchor = computeAnchor(K, keyUsage400, baseCorners);
    const { deltaKs, Jbar: JbarBase } = computeJbar(K, T, x, noteSeqByColumn, baseCorners);
    const Jbar = interp(allCorners, baseCorners, JbarBase);
    const XbarBase = computeXbar(K, T, x, noteSeqByColumn, activeColumns, baseCorners);
    const Xbar = interp(allCorners, baseCorners, XbarBase);
    const PbarBase = computePbar(K, T, x, noteSeq, anchor, baseCorners);
    const Pbar = interp(allCorners, baseCorners, PbarBase);
    const AbarBase = computeAbar(K, T, x, noteSeqByColumn, activeColumns, deltaKs, aCorners, baseCorners);
    const Abar = interp(allCorners, aCorners, AbarBase);
    const { C: C2, Ks } = computeCandKs(K, T, noteSeq, keyUsage, baseCorners);
    const Carr = stepInterp(allCorners, baseCorners, C2);
    const Ksarr = stepInterp(allCorners, baseCorners, Ks);
    const N = allCorners.length;
    const Sall = zeros(N), Tall = zeros(N), Dall = zeros(N);
    for (let i = 0; i < N; i++) {
      const abarP = Abar[i] ** (3 / Ksarr[i]);
      const jMin = Math.min(Jbar[i], 8 + 0.85 * Jbar[i]);
      const s = (0.4 * (abarP * jMin) ** 1.5 + 0.6 * (Abar[i] ** (2 / 3) * (0.8 * Pbar[i])) ** 1.5) ** (2 / 3);
      Sall[i] = s;
      const t = abarP * Xbar[i] / (Xbar[i] + s + 1);
      Tall[i] = t;
      Dall[i] = 2.7 * s ** 0.5 * t ** 1.5 + s * 0.27;
    }
    const gaps = zeros(N);
    gaps[0] = (allCorners[1] - allCorners[0]) / 2;
    gaps[N - 1] = (allCorners[N - 1] - allCorners[N - 2]) / 2;
    for (let i = 1; i < N - 1; i++) gaps[i] = (allCorners[i + 1] - allCorners[i - 1]) / 2;
    const effW = zeros(N);
    for (let i = 0; i < N; i++) effW[i] = Carr[i] * gaps[i];
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => Dall[a] - Dall[b] || a - b);
    const Dsorted = new Float64Array(N), wSorted = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      Dsorted[i] = Dall[order[i]];
      wSorted[i] = effW[order[i]];
    }
    const cum = new Float64Array(N);
    let acc = 0;
    for (let i = 0; i < N; i++) {
      acc += wSorted[i];
      cum[i] = acc;
    }
    const total = cum[N - 1];
    const norm = new Float64Array(N);
    for (let i = 0; i < N; i++) norm[i] = cum[i] / total;
    const targets = [0.945, 0.935, 0.925, 0.915, 0.845, 0.835, 0.825, 0.815];
    const idx = targets.map((t) => searchsorted(norm, t, "left"));
    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const p93 = mean(idx.slice(0, 4).map((i) => Dsorted[i]));
    const p83 = mean(idx.slice(4, 8).map((i) => Dsorted[i]));
    let sumD5w = 0, sumW = 0;
    for (let i = 0; i < N; i++) {
      sumD5w += Dsorted[i] ** 5 * wSorted[i];
      sumW += wSorted[i];
    }
    const weightedMean = (sumD5w / sumW) ** 0.2;
    let SR = 0.88 * p93 * 0.25 + 0.94 * p83 * 0.2 + weightedMean * 0.55;
    const totalNotes = noteSeq.length;
    SR *= totalNotes / (totalNotes + 60);
    SR = rescaleHigh(SR) * 0.975;
    const vmin = (a) => {
      let m = Infinity;
      for (const v of a) if (v < m) m = v;
      return m;
    };
    const vsum = (a) => {
      let s = 0;
      for (const v of a) s += v;
      return s;
    };
    const srPre = 0.88 * p93 * 0.25 + 0.94 * p83 * 0.2 + weightedMean * 0.55;
    const dbg = {
      ksMin: vmin(Ksarr),
      ksMax: arrMax(Ksarr),
      ksMean: vmean(Ksarr),
      cSum: vsum(Carr),
      cMean: vmean(Carr),
      sMax: arrMax(Sall),
      sMean: vmean(Sall),
      dMax: arrMax(Dall),
      dMean: vmean(Dall),
      idx,
      p93,
      p83,
      wmean: weightedMean,
      effWSum: vsum(effW),
      srPre
    };
    return { sr: SR, components: { Pbar, Abar, Jbar, Xbar }, allCorners, noteCount: totalNotes, dbg };
  }
  function vmean(a) {
    if (!a.length) return 0;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }
  function analyzePrimarySrText(raw, mod = "NM") {
    return analyzePrimarySrFromParsed(parseOsuText(raw), mod);
  }
  function analyzePrimarySrFromParsed(parsed, mod = "NM") {
    const coreMod = mod === "NC" ? "DT" : mod;
    try {
      const r = calculateFromParsed(parsed, coreMod);
      const Jbar = r.components.Jbar, Pbar = r.components.Pbar, Xbar = r.components.Xbar, Abar = r.components.Abar;
      const jbarMax = arrMax(Jbar), pbarMax = arrMax(Pbar), xbarMax = arrMax(Xbar), abarMean = vmean(Abar);
      const compTotal = jbarMax + pbarMax + xbarMax + 1;
      const jMean = jbarMax, njMean = pbarMax + xbarMax;
      return {
        sr: round2(r.sr, 4),
        jbar_max: round2(jbarMax, 4),
        pbar_max: round2(pbarMax, 4),
        xbar_max: round2(xbarMax, 4),
        abar_mean: round2(abarMean, 4),
        jack_ratio: round2(jMean / Math.max(jMean + njMean, 1e-9), 4),
        jbar_share: round2(jbarMax / compTotal, 4),
        pbar_share: round2(pbarMax / compTotal, 4),
        xbar_share: round2(xbarMax / compTotal, 4),
        total_notes_eff: r.allCorners.length,
        success: true,
        error: null
      };
    } catch (e) {
      return { sr: 0, jbar_max: 0, pbar_max: 0, xbar_max: 0, abar_mean: 0, jack_ratio: 0, jbar_share: 0, pbar_share: 0, xbar_share: 0, total_notes_eff: 0, success: false, error: String(e) };
    }
  }
  function arrMax(a) {
    let m = 0;
    for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
    return m;
  }
  function round2(v, d) {
    const f = 10 ** d;
    return Math.round(v * f) / f;
  }

  // port/src/classifier.ts
  var round3 = (v, d) => isFinite(v) ? Number(v.toFixed(d)) : v;
  function classifyFamily(sunny, features, domain) {
    const gs = (k, d = 0) => {
      let v = sunny[k];
      if (v === void 0 || v === null) v = d;
      if (!v) v = d;
      return Number(v);
    };
    const gf = (k, d = 0) => {
      let v = features[k];
      if (v === void 0 || v === null) v = d;
      if (!v) v = d;
      return Number(v);
    };
    const gd = (k, d = 0) => {
      let v = domain[k];
      if (v === void 0 || v === null) v = d;
      if (!v) v = d;
      return Number(v);
    };
    const bpm = gd("bpm", gf("bpm", 0));
    const drain_s = gd("drain_time_s", gf("duration_s", 0));
    const jbar_max = gs("jbar_max"), pbar_max = gs("pbar_max"), xbar_max = gs("xbar_max");
    const d93 = gs("d93"), d83 = gs("d83");
    const bar_total = jbar_max + pbar_max + 1;
    const jack_dom = jbar_max / bar_total;
    const stream_dom = pbar_max / bar_total;
    const tech_dom = xbar_max + bar_total > 0 ? xbar_max / (xbar_max + bar_total) : 0;
    const peak_ratio = d83 > 0.1 ? d93 / Math.max(d83, 0.01) : 1;
    const stream_purity = gf("stream_purity");
    const jack_ratio_broad = gf("jack_ratio", 0);
    const jack_density = gf("jack_density", jack_ratio_broad);
    const vibro_density = gf("vibro_density", gf("vibro_ratio", 0));
    const density_cv = Math.min(2, gf("density_cv"));
    const transition_var = gf("transition_var");
    const jump_ratio = gf("jump_ratio"), hand_ratio = gf("hand_ratio"), quad_ratio = gf("quad_ratio");
    const nps_p90 = gf("nps_p90"), nps_sustained = gf("nps_sustained_top30");
    const nps_active_ratio = gf("nps_active_ratio"), nps_active_cv = gf("nps_active_cv");
    const chord_fraction = jump_ratio + hand_ratio + quad_ratio;
    const anchor_ratio = gf("anchor_ratio", 0);
    const pattern_irregularity = gf("pattern_irregularity", 0);
    const timing_irregularity = gf("timing_irregularity", 0);
    const rep_margin = Math.max(0, 0.83 - transition_var);
    const is_repetitive = Math.min(1, rep_margin * 12);
    let jack_baseline;
    if (bpm > 0) {
      const quarter_ms = 6e4 / bpm;
      jack_baseline = Math.min(0.9, Math.max(0, 1 - quarter_ms / 250));
    } else jack_baseline = 0.3;
    const jack_excess = Math.max(0, jack_ratio_broad - jack_baseline);
    const bpm_signal = Math.min(1.5, Math.max(0, bpm - 140) / 80);
    const jack_score = is_repetitive * 50 + jack_density * 45 + chord_fraction * 20 + jack_excess * 15 + vibro_density * 20 + anchor_ratio * 15 + jack_dom * 10;
    const stream_score = stream_purity * 45 + Math.max(0, 1 - chord_fraction * 3) * 15 - chord_fraction * 12 + stream_dom * 20 + Math.max(0, 1 - density_cv) * 15 + Math.max(0, 0.5 - jack_density) * 10;
    const tech_score = density_cv * 55 + pattern_irregularity * 25 + nps_active_cv * 20 + tech_dom * 20 + transition_var * 12 + chord_fraction * 8;
    const speed_raw = bpm_signal * 42 + stream_purity * 22 + Math.max(0, 1 - density_cv) * 10 + Math.max(0, peak_ratio - 1.02) * 12;
    const speed_chord_gate = Math.max(0.25, 1 - chord_fraction * 1.8);
    const speed_regularity = Math.max(0.5, 1 - Math.max(0, density_cv - 0.3) * 2.5);
    const speed_score = speed_raw * speed_chord_gate * speed_regularity;
    const drain_gate = Math.max(0, drain_s - 60) / 120;
    const short_penalty = Math.max(0, 1 - drain_s / 90);
    const chord_req = Math.min(1, Math.max(0, chord_fraction - 0.15) / 0.2);
    const stamina_raw = drain_gate * 28 + chord_fraction * 25 - stream_purity * 20 + nps_active_ratio * 12 + Math.max(0, 1 - density_cv) * 8 + nps_sustained * 0.3 + Math.min(1, drain_s / 150) * 12;
    let stamina_score = stamina_raw * chord_req * Math.max(0.4, 1 - short_penalty * 0.5);
    if (is_repetitive > 0.15) stamina_score *= Math.max(0.3, 1 - is_repetitive * 0.7);
    const scores = { stream: stream_score, jack: jack_score, tech: tech_score, speed: speed_score, stamina: stamina_score };
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top_family = ranked[0][0], top_score = ranked[0][1];
    const second_score = ranked.length > 1 ? ranked[1][1] : 0;
    const gap = top_score - second_score;
    const total = ranked.reduce((a, kv) => a + kv[1], 0);
    let confidence = Math.min(1, gap / Math.max(total * 0.1, 1));
    let family;
    if (confidence < 0.15) {
      family = "hybrid";
      confidence = Math.max(0.1, confidence);
    } else family = top_family;
    const sc = (k) => scores[k] ?? 0;
    if ((family === "hybrid" || family === "stream") && density_cv > 0.35) {
      const tech_s = sc("tech"), stream_s = sc("stream");
      if (tech_s > 0 && stream_s > 0 && tech_s / stream_s > 0.75) {
        family = "tech";
        confidence = Math.max(confidence, 0.3);
      }
    }
    if (family === "stream" && bpm >= 155 && stream_purity > 0.7 && chord_fraction < 0.3) {
      const speed_s = sc("speed"), stream_s = sc("stream");
      if (speed_s > 0 && stream_s > 0 && speed_s / stream_s > 0.35) {
        family = "speed";
        confidence = Math.max(confidence, 0.25);
      }
    }
    const total_notes_eff = (() => {
      let v = sunny.total_notes_eff;
      if (!v) v = 0;
      return Number(v);
    })();
    if (family === "jack" && total_notes_eff > 15e3) {
      family = sc("stamina") > sc("tech") ? "stamina" : "hybrid";
      confidence = Math.min(confidence, 0.5);
    }
    if ((family === "stream" || family === "tech") && drain_s > 120 && chord_fraction > 0.25) {
      const stamina_s = sc("stamina"), stream_s = sc("stream"), tech_s = sc("tech");
      if (stamina_s > 0 && stamina_s > Math.max(stream_s, tech_s) * 0.85) {
        family = "stamina";
        confidence = Math.max(confidence, 0.35);
      }
    }
    if (!(family === "tech" || family === "jack") && timing_irregularity > 0.4 && jack_density > 0.08 && (0.15 < chord_fraction && chord_fraction < 0.55) && (0.4 < stream_purity && stream_purity < 0.85)) {
      const tech_s = sc("tech"), winner_s = sc(family);
      if (tech_s > 0 && winner_s > 0 && tech_s > winner_s * 0.75) {
        family = "tech";
        confidence = Math.max(confidence, 0.35);
      }
    }
    const roundedScores = {};
    for (const [k, v] of Object.entries(scores)) roundedScores[k] = round3(v, 2);
    return { family, confidence: round3(confidence, 3), scores: roundedScores, subtype: "generic", subtype_confidence: 0, subtype_scores: {} };
  }

  // port/config/sr_means.json
  var sr_means_default = {
    _metadata: {
      description: "SR means per Dan tier for SR \u2192 DP interpolation. These are the calibrated median SR values from 1500+ maps (official DDMythical + practice packs).",
      calibrated: "2026-05",
      method: "per-dan median SR across all sources",
      n_maps_total: 1534,
      n_official: 130,
      n_practice: 1404,
      monotonic: true
    },
    general: {
      _comment: "Primary ruler: average across all skillsets. Used when no family is identified or confidence is below 0.50.",
      "1st": 3.27,
      "2nd": 3.61,
      "3rd": 3.92,
      "4th": 4.43,
      "5th": 4.95,
      "6th": 5.34,
      "7th": 5.67,
      "8th": 5.97,
      "9th": 6.25,
      "10th": 6.32,
      Alpha: 6.65,
      Beta: 6.97,
      Gamma: 7.28,
      Delta: 7.96,
      Epsilon: 9.24,
      Zeta: 9.52,
      Eta: 10.15,
      Theta: 10.74,
      Iota: 11.68,
      Kappa: 12.25
    },
    skillsets: {
      jack: {
        _comment: "Same-column pressure dominant. 1st-Epsilon from 1534 maps, Zeta-Kappa from 25 pure NM maps.",
        "1st": 2.34,
        "2nd": 2.35,
        "3rd": 3.17,
        "4th": 3.48,
        "5th": 3.98,
        "6th": 4.75,
        "7th": 4.97,
        "8th": 5.84,
        "9th": 5.85,
        "10th": 6.5,
        Alpha: 6.66,
        Beta: 6.9,
        Gamma: 7.28,
        Delta: 7.91,
        Epsilon: 9.13,
        Zeta: 9.35,
        Eta: 10.38,
        Theta: 11.03,
        Iota: 12.47,
        Kappa: 13.42
      },
      speed: {
        _comment: "Stream/jumpstream dominant. Skillset projection from 1534 maps (1st-Epsilon), 25 NM maps (Zeta-Kappa).",
        "1st": 2.94,
        "2nd": 3.5,
        "3rd": 3.78,
        "4th": 4.16,
        "5th": 4.86,
        "6th": 5.29,
        "7th": 5.36,
        "8th": 5.71,
        "9th": 5.98,
        "10th": 6.22,
        Alpha: 6.58,
        Beta: 6.92,
        Gamma: 7.23,
        Delta: 7.91,
        Epsilon: 9.25,
        Zeta: 9.55,
        Eta: 10.05,
        Theta: 10.65,
        Iota: 10.99,
        Kappa: 11.98
      },
      stamina: {
        _comment: "Sustained long-duration dominant. 0.7*stamina + 0.3*handstream ratio.",
        "1st": 3.38,
        "2nd": 3.48,
        "3rd": 3.79,
        "4th": 4.69,
        "5th": 5.23,
        "6th": 5.65,
        "7th": 5.75,
        "8th": 6.15,
        "9th": 6.26,
        "10th": 6.41,
        Alpha: 6.7,
        Beta: 7.04,
        Gamma: 7.37,
        Delta: 8.04,
        Epsilon: 9.32,
        Zeta: 9.6,
        Eta: 9.96,
        Theta: 10.84,
        Iota: 11.66,
        Kappa: 12.46
      },
      tech: {
        _comment: "High pattern variety, density variation, transition complexity.",
        "1st": 2.84,
        "2nd": 3.08,
        "3rd": 3.09,
        "4th": 3.9,
        "5th": 4.18,
        "6th": 4.5,
        "7th": 5.43,
        "8th": 5.69,
        "9th": 6.31,
        "10th": 6.46,
        Alpha: 6.63,
        Beta: 7,
        Gamma: 7.31,
        Delta: 7.99,
        Epsilon: 9.22,
        Zeta: 9.6,
        Eta: 10.25,
        Theta: 10.61,
        Iota: 11.69,
        Kappa: 12.05
      }
    }
  };

  // port/src/rankEngine.ts
  var GENERAL = sr_means_default.general;
  var SKILLSETS = sr_means_default.skillsets;
  var DAN_ORDER = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"];
  var DAN_DISPLAY = { "1st": "1st Dan", "2nd": "2nd Dan", "3rd": "3rd Dan", "4th": "4th Dan", "5th": "5th Dan", "6th": "6th Dan", "7th": "7th Dan", "8th": "8th Dan", "9th": "9th Dan", "10th": "10th Dan", Alpha: "Alpha", Beta: "Beta", Gamma: "Gamma", Delta: "Delta", Epsilon: "Epsilon", Zeta: "Zeta", Eta: "Eta", Theta: "Theta", Iota: "Iota", Kappa: "Kappa" };
  var SUBLEVEL_LABELS = [[0, 0.2, "Low"], [0.2, 0.4, "Mid-Low"], [0.4, 0.6, "Mid"], [0.6, 0.8, "Mid-High"], [0.8, 1, "High"]];
  var LN_CONFIDENCE_MULT = { high: 1, degraded: 0.75, gray: 0.45, out_of_domain: 0.15 };
  var round4 = (v, d) => isFinite(v) ? Number(v.toFixed(d)) : v;
  var rulerCache = /* @__PURE__ */ new Map();
  function getRuler(skillset) {
    const key = skillset ?? "__general__";
    const cached = rulerCache.get(key);
    if (cached) return cached;
    const overrides = skillset ? SKILLSETS[skillset] ?? {} : {};
    const table = [];
    for (let i = 0; i < DAN_ORDER.length; i++) {
      const dan = DAN_ORDER[i];
      const sr = overrides[dan] ?? GENERAL[dan];
      table.push([sr, i + 1]);
    }
    for (let i = 1; i < table.length; i++) {
      if (table[i][0] <= table[i - 1][0]) table[i] = [table[i - 1][0] + 0.01, table[i][1]];
    }
    rulerCache.set(key, table);
    return table;
  }
  function precomputeBoundaries(ruler) {
    const means = ruler.map((r) => r[0]);
    const n = means.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      let lower, upper;
      if (i > 0) lower = (means[i - 1] + means[i]) / 2;
      else {
        const gap = n > 1 ? means[1] - means[0] : 1;
        lower = means[0] - gap / 2;
      }
      if (i < n - 1) upper = (means[i] + means[i + 1]) / 2;
      else {
        const gap = n > 1 ? means[n - 1] - means[n - 2] : 1;
        upper = means[n - 1] + gap / 2;
      }
      out.push([lower, upper, ruler[i][1]]);
    }
    return out;
  }
  function srToDp(sr, skillset = null) {
    const ruler = getRuler(skillset);
    const b = precomputeBoundaries(ruler);
    if (sr < b[0][0]) return Math.max(0.5, b[0][2]);
    if (sr >= b[b.length - 1][1]) return Math.min(20.99, b[b.length - 1][2] + 0.99);
    for (const [lower, upper, dpInt] of b) {
      if (lower <= sr && sr < upper) {
        const t = (sr - lower) / Math.max(upper - lower, 1e-6);
        return dpInt + t;
      }
    }
    return b[b.length - 1][2];
  }
  function dpToLabel(dp) {
    const idx = Math.max(0, Math.min(DAN_ORDER.length - 1, Math.trunc(dp) - 1));
    const short = DAN_ORDER[idx];
    return [DAN_DISPLAY[short] ?? short, short];
  }
  function dpToSublevel(dp) {
    const frac = dp >= 1 ? dp - Math.floor(dp) : 0;
    for (const [lo, hi, label] of SUBLEVEL_LABELS) if (lo <= frac && frac < hi) return label;
    return "High";
  }
  function gnum(o, k, d = 0) {
    let v = o ? o[k] : void 0;
    if (v === void 0 || v === null) v = d;
    if (!v) v = d;
    return Number(v);
  }
  function jackPeakBonus(sr_result, family) {
    if (family !== "jack") return 0;
    const totalNotes = gnum(sr_result, "total_notes_eff");
    if (totalNotes > 15e3) return 0;
    const jbarMax = gnum(sr_result, "jbar_max");
    const srVal = gnum(sr_result, "sr");
    let peakStart, peakScale, peakCap;
    if (srVal >= 11) {
      peakStart = 64.5;
      peakScale = 0.031;
      peakCap = srVal < 12 ? 0.35 : 0.2;
    } else if (srVal >= 9) {
      peakStart = 58;
      peakScale = 0.02;
      peakCap = 0.25;
    } else if (srVal >= 7) {
      peakStart = 50;
      peakScale = 0.02;
      peakCap = 0.3;
    } else {
      peakStart = 48;
      peakScale = 0.015;
      peakCap = 0.2;
    }
    return Math.min(peakCap, Math.max(0, jbarMax - peakStart) * peakScale);
  }
  var FAMILY_TO_SKILLSET = { jack: "jack", speed: "speed", stamina: "stamina", tech: "tech", stream: "speed", hybrid: null };
  function computeRank(sr_result, features, classification, domain) {
    const sr = gnum(sr_result, "sr");
    const family = classification.family ?? "hybrid";
    const familyConfidence = Number(classification.confidence ?? 0);
    let skillset = familyConfidence >= 0.5 ? FAMILY_TO_SKILLSET[family] ?? null : null;
    const sjJbar = gnum(sr_result, "jbar_max");
    const sjShare = gnum(sr_result, "jbar_share");
    const sjPbar = gnum(sr_result, "pbar_max");
    const isSpeedjack = sjJbar >= 70 && sjShare >= 0.55 && sjPbar < 55 && sr < 10.5;
    const corrections = [];
    let jackBonus = 0, staminaBonus = 0, rankingSr, dp;
    if (isSpeedjack) {
      jackBonus = jackPeakBonus(sr_result, "jack");
      const sjExtra = Math.min(0.65, Math.max(0, sjJbar - 72) * 0.06);
      const sjTotal = jackBonus + sjExtra;
      rankingSr = sr + sjTotal;
      dp = srToDp(rankingSr, "jack");
      skillset = "jack";
      corrections.push(`speedjack_rescue:+${round4(sjTotal, 3)}`);
    } else {
      jackBonus = jackPeakBonus(sr_result, family);
      const bpm = gnum(domain, "bpm", gnum(features, "bpm", 0));
      const drainS = gnum(domain, "drain_time_s", 0);
      if (family === "stamina" && bpm >= 240 && drainS >= 120) staminaBonus = Math.min(0.2, (bpm - 240) * 8e-3);
      rankingSr = sr + jackBonus + staminaBonus;
      if (jackBonus > 0) corrections.push(`jack_peak_bonus:+${jackBonus.toFixed(3)}`);
      if (staminaBonus > 0) corrections.push(`stamina_rescue:+${staminaBonus.toFixed(3)}`);
      dp = srToDp(rankingSr, skillset);
    }
    const noteCount = Math.trunc(gnum(domain, "note_count", 0));
    const noteConfidence = Math.min(1, noteCount / 200);
    const lnConfidence = domain.ln_confidence ?? "high";
    const lnMult = LN_CONFIDENCE_MULT[lnConfidence] ?? 1;
    const overallConfidence = round4(Math.min(1, familyConfidence * lnMult * noteConfidence), 3);
    dp = round4(dp, 2);
    const [danLabel, danShort] = dpToLabel(dp);
    const sublevel = dpToSublevel(dp);
    return {
      dp,
      dan_label: danLabel,
      dan_short: danShort,
      sublevel,
      beyond: dp > 20.5,
      confidence: overallConfidence,
      sr: round4(sr, 4),
      family,
      corrections
    };
  }

  // port/src/reform.ts
  function analyzeReformText(raw, mod = "NM") {
    const parsed = parsearOsuV2Text(raw, true);
    return analyzeReformCore(parsed, analyzePrimarySrText(raw, mod));
  }
  function analyzeReformCore(parsed, sr) {
    const domain = validateDomain(parsed);
    if (!domain.valid) return { error: domain.rejection_reason ?? "domain_rejected" };
    const features = extractFeatures(parsed);
    const classification = classifyFamily(sr, features, domain);
    const rank = computeRank(sr, features, classification, domain);
    return {
      ...rank,
      engine: "sr_ruler_v3",
      bpm: domain.bpm,
      od: domain.od,
      drain_time_s: domain.drain_time_s,
      ln_route: domain.ln_route,
      ln_confidence: domain.ln_confidence,
      note_count: domain.note_count
    };
  }

  // port/config/celestial_profiles.json
  var celestial_profiles_default = {
    Beginner: {
      I: {
        skillsets: {
          stream: 3.4405,
          jumpstream: 3.135,
          handstream: 2.18,
          stamina: 2.7078,
          jackspeed: 0.74,
          chordjack: 2.66,
          technical: 3.06
        },
        overall_msd: 3.4405,
        lower: 3.4405,
        upper: 3.4405,
        map_count: 1,
        sr_mean: 0.3521,
        sr_lower: 0.3521,
        sr_upper: 0.3521,
        sr_count: 1,
        sr_by_type: {
          jack: null,
          speed: null,
          stamina: null,
          tech: 0.3521
        }
      },
      II: {
        skillsets: {
          stream: 4.3865,
          jumpstream: 4.3595,
          handstream: 2.9,
          stamina: 3.3689,
          jackspeed: 0.9,
          chordjack: 3.38,
          technical: 3.86
        },
        overall_msd: 4.3865,
        lower: 4.3865,
        upper: 4.3865,
        map_count: 1,
        sr_mean: 0.4778,
        sr_lower: 0.4778,
        sr_upper: 0.4778,
        sr_count: 1,
        sr_by_type: {
          jack: null,
          speed: null,
          stamina: null,
          tech: 0.4778
        }
      },
      III: {
        skillsets: {
          stream: 6.34,
          jumpstream: 6.42,
          handstream: 4.34,
          stamina: 7.5219,
          jackspeed: 4.74,
          chordjack: 4.66,
          technical: 8.1255
        },
        overall_msd: 8.1255,
        lower: 8.1255,
        upper: 8.1255,
        map_count: 1,
        sr_mean: 1.1373,
        sr_lower: 1.1373,
        sr_upper: 1.1373,
        sr_count: 1,
        sr_by_type: {
          jack: null,
          speed: null,
          stamina: null,
          tech: 1.1373
        }
      },
      IV: {
        skillsets: {
          stream: 9.06,
          jumpstream: 10.3595,
          handstream: 4.9,
          stamina: 9.6979,
          jackspeed: 5.46,
          chordjack: 7.14,
          technical: 9.694
        },
        overall_msd: 10.3595,
        lower: 10.3595,
        upper: 10.3595,
        map_count: 1,
        sr_mean: 1.864,
        sr_lower: 1.864,
        sr_upper: 1.864,
        sr_count: 1,
        sr_by_type: {
          jack: null,
          speed: null,
          stamina: null,
          tech: 1.864
        }
      },
      V: {
        skillsets: {
          stream: 10.1,
          jumpstream: 10.18,
          handstream: 5.7,
          stamina: 11.2078,
          jackspeed: 5.62,
          chordjack: 7.3,
          technical: 11.749
        },
        overall_msd: 11.749,
        lower: 11.749,
        upper: 11.749,
        map_count: 1,
        sr_mean: 2.1939,
        sr_lower: 2.1939,
        sr_upper: 2.1939,
        sr_count: 1,
        sr_by_type: {
          jack: null,
          speed: null,
          stamina: null,
          tech: 2.1939
        }
      }
    },
    Intermediate: {
      I: {
        skillsets: {
          stream: 10.98,
          jumpstream: 11.491,
          handstream: 9.06,
          stamina: 12.0957,
          jackspeed: 6.9,
          chordjack: 7.7,
          technical: 12.2445
        },
        overall_msd: 12.2445,
        lower: 12.0645,
        upper: 13.76,
        map_count: 3,
        sr_mean: 2.3688,
        sr_lower: 2.3367,
        sr_upper: 2.3816,
        sr_count: 3,
        sr_by_type: {
          jack: null,
          speed: null,
          stamina: null,
          tech: 2.3688
        }
      },
      II: {
        skillsets: {
          stream: 11.407,
          jumpstream: 10.74,
          handstream: 8.1,
          stamina: 11.9896,
          jackspeed: 6.18,
          chordjack: 7.94,
          technical: 12.745
        },
        overall_msd: 12.745,
        lower: 12.576,
        upper: 13.7865,
        map_count: 3,
        sr_mean: 2.7081,
        sr_lower: 2.1528,
        sr_upper: 2.7967,
        sr_count: 3,
        sr_by_type: {
          jack: 2.7967,
          speed: null,
          stamina: null,
          tech: 2.1528
        }
      },
      III: {
        skillsets: {
          stream: 13.06,
          jumpstream: 13.611,
          handstream: 12.26,
          stamina: 14.7535,
          jackspeed: 7.86,
          chordjack: 9.06,
          technical: 14.9
        },
        overall_msd: 15.211,
        lower: 14.337,
        upper: 17.485,
        map_count: 3,
        sr_mean: 2.9057,
        sr_lower: 2.8724,
        sr_upper: 3.631,
        sr_count: 3,
        sr_by_type: {
          jack: null,
          speed: 2.9057,
          stamina: 2.8724,
          tech: 3.631
        }
      },
      IV: {
        skillsets: {
          stream: 13.46,
          jumpstream: 14.6455,
          handstream: 9.14,
          stamina: 15.0134,
          jackspeed: 9.62,
          chordjack: 11.7,
          technical: 15.5035
        },
        overall_msd: 15.5035,
        lower: 15.409,
        upper: 15.9355,
        map_count: 3,
        sr_mean: 3.2388,
        sr_lower: 2.8585,
        sr_upper: 3.7676,
        sr_count: 3,
        sr_by_type: {
          jack: 3.0486,
          speed: null,
          stamina: null,
          tech: 3.7676
        }
      },
      V: {
        skillsets: {
          stream: 15.989,
          jumpstream: 16.3395,
          handstream: 12.66,
          stamina: 17.6513,
          jackspeed: 10.74,
          chordjack: 12.58,
          technical: 17.574
        },
        overall_msd: 17.6513,
        lower: 15.561,
        upper: 18.7685,
        map_count: 3,
        sr_mean: 3.6187,
        sr_lower: 3.469,
        sr_upper: 4.2963,
        sr_count: 3,
        sr_by_type: {
          jack: 3.469,
          speed: null,
          stamina: 3.6187,
          tech: 4.2963
        }
      }
    },
    Expert: {
      I: {
        skillsets: {
          stream: 16.06,
          jumpstream: 15.18,
          handstream: 10.58,
          stamina: 18.005,
          jackspeed: 9.1,
          chordjack: 11.98,
          technical: 18.0325
        },
        overall_msd: 18.3035,
        lower: 17.8675,
        upper: 19.4645,
        map_count: 4,
        sr_mean: 3.768,
        sr_lower: 3.445,
        sr_upper: 4.4733,
        sr_count: 4,
        sr_by_type: {
          jack: null,
          speed: 3.8478,
          stamina: 3.6882,
          tech: null
        }
      },
      II: {
        skillsets: {
          stream: 15.82,
          jumpstream: 17.593,
          handstream: 12.74,
          stamina: 18.7455,
          jackspeed: 10.74,
          chordjack: 13.34,
          technical: 17.8518
        },
        overall_msd: 19.27,
        lower: 17.8417,
        upper: 20.733,
        map_count: 4,
        sr_mean: 4.3309,
        sr_lower: 3.6289,
        sr_upper: 4.7814,
        sr_count: 4,
        sr_by_type: {
          jack: 4.1304,
          speed: null,
          stamina: 3.6289,
          tech: null
        }
      },
      III: {
        skillsets: {
          stream: 18.8735,
          jumpstream: 17.5803,
          handstream: 10.14,
          stamina: 19.7154,
          jackspeed: 10.66,
          chordjack: 13.14,
          technical: 19.9377
        },
        overall_msd: 20.4762,
        lower: 17.1275,
        upper: 21.091,
        map_count: 4,
        sr_mean: 4.5624,
        sr_lower: 3.0951,
        sr_upper: 5.0076,
        sr_count: 4,
        sr_by_type: {
          jack: 3.0951,
          speed: 4.6468,
          stamina: null,
          tech: null
        }
      },
      IV: {
        skillsets: {
          stream: 17.86,
          jumpstream: 17.846,
          handstream: 12.94,
          stamina: 19.2399,
          jackspeed: 12.3,
          chordjack: 13.38,
          technical: 20.6867
        },
        overall_msd: 20.8022,
        lower: 18.0515,
        upper: 22.135,
        map_count: 4,
        sr_mean: 4.5416,
        sr_lower: 3.8645,
        sr_upper: 4.835,
        sr_count: 4,
        sr_by_type: {
          jack: 3.8645,
          speed: 4.7518,
          stamina: null,
          tech: 4.3314
        }
      },
      V: {
        skillsets: {
          stream: 18.6532,
          jumpstream: 18.4582,
          handstream: 15.74,
          stamina: 20.2791,
          jackspeed: 12.3,
          chordjack: 14.7,
          technical: 20.3842
        },
        overall_msd: 21.0552,
        lower: 18.621,
        upper: 23.124,
        map_count: 4,
        sr_mean: 4.6808,
        sr_lower: 4.6503,
        sr_upper: 5.3457,
        sr_count: 4,
        sr_by_type: {
          jack: 4.6597,
          speed: 4.702,
          stamina: 5.4944,
          tech: null
        }
      }
    },
    Mastery: {
      I: {
        skillsets: {
          stream: 16.42,
          jumpstream: 20.1595,
          handstream: 17.06,
          stamina: 20.6922,
          jackspeed: 12.82,
          chordjack: 15.06,
          technical: 21.642
        },
        overall_msd: 21.8545,
        lower: 19.39,
        upper: 22.944,
        map_count: 5,
        sr_mean: 5.1045,
        sr_lower: 4.7911,
        sr_upper: 5.5663,
        sr_count: 5,
        sr_by_type: {
          jack: 4.9478,
          speed: 5.2316,
          stamina: 5.5663,
          tech: null
        }
      },
      II: {
        skillsets: {
          stream: 20.02,
          jumpstream: 18.58,
          handstream: 16.5,
          stamina: 21.2451,
          jackspeed: 13.06,
          chordjack: 15.14,
          technical: 21.4965
        },
        overall_msd: 22.3715,
        lower: 18.961,
        upper: 23.7972,
        map_count: 5,
        sr_mean: 5.3629,
        sr_lower: 4.9421,
        sr_upper: 5.4402,
        sr_count: 5,
        sr_by_type: {
          jack: 5.3149,
          speed: 5.3629,
          stamina: 5.4269,
          tech: 4.9421
        }
      },
      III: {
        skillsets: {
          stream: 21.204,
          jumpstream: 19.14,
          handstream: 17.54,
          stamina: 22.7702,
          jackspeed: 14.02,
          chordjack: 17.14,
          technical: 22.8445
        },
        overall_msd: 23.0254,
        lower: 21.545,
        upper: 24.855,
        map_count: 5,
        sr_mean: 5.7535,
        sr_lower: 5.1821,
        sr_upper: 5.7947,
        sr_count: 5,
        sr_by_type: {
          jack: 5.7741,
          speed: 5.6907,
          stamina: 5.1821,
          tech: null
        }
      },
      IV: {
        skillsets: {
          stream: 19.22,
          jumpstream: 19.46,
          handstream: 16.18,
          stamina: 22.8155,
          jackspeed: 14.82,
          chordjack: 18.18,
          technical: 23.021
        },
        overall_msd: 23.6391,
        lower: 23.039,
        upper: 25.2805,
        map_count: 5,
        sr_mean: 5.7191,
        sr_lower: 5.3931,
        sr_upper: 6.1456,
        sr_count: 5,
        sr_by_type: {
          jack: 5.6524,
          speed: 5.7724,
          stamina: 5.3931,
          tech: 6.1456
        }
      },
      V: {
        skillsets: {
          stream: 20.58,
          jumpstream: 22.7885,
          handstream: 16.42,
          stamina: 24.5069,
          jackspeed: 13.94,
          chordjack: 17.46,
          technical: 22.9765
        },
        overall_msd: 24.9385,
        lower: 23.4685,
        upper: 26.0435,
        map_count: 5,
        sr_mean: 5.9995,
        sr_lower: 5.7659,
        sr_upper: 6.282,
        sr_count: 5,
        sr_by_type: {
          jack: 5.9995,
          speed: 6.1113,
          stamina: 6.024,
          tech: 5.8842
        }
      }
    },
    Ascension: {
      I: {
        skillsets: {
          stream: 22.7045,
          jumpstream: 22.5265,
          handstream: 14.66,
          stamina: 24.2502,
          jackspeed: 14.5,
          chordjack: 18.5,
          technical: 25.0965
        },
        overall_msd: 25.0965,
        lower: 22.96,
        upper: 26.469,
        map_count: 5,
        sr_mean: 6.0801,
        sr_lower: 5.7598,
        sr_upper: 6.4068,
        sr_count: 5,
        sr_by_type: {
          jack: 5.9512,
          speed: 5.9928,
          stamina: null,
          tech: 6.2434
        }
      },
      II: {
        skillsets: {
          stream: 21.3,
          jumpstream: 22.34,
          handstream: 22.34,
          stamina: 26.0938,
          jackspeed: 14.5,
          chordjack: 19.22,
          technical: 24.747
        },
        overall_msd: 27.2795,
        lower: 24.747,
        upper: 28.3105,
        map_count: 5,
        sr_mean: 6.5801,
        sr_lower: 6.3602,
        sr_upper: 6.7468,
        sr_count: 5,
        sr_by_type: {
          jack: 6.5801,
          speed: 6.4538,
          stamina: 6.669,
          tech: null
        }
      },
      III: {
        skillsets: {
          stream: 26.421,
          jumpstream: 24.132,
          handstream: 15.7,
          stamina: 25.9973,
          jackspeed: 18.1,
          chordjack: 20.1,
          technical: 26.8065
        },
        overall_msd: 27.3685,
        lower: 24.4393,
        upper: 28.992,
        map_count: 5,
        sr_mean: 6.8393,
        sr_lower: 6.1248,
        sr_upper: 7.0912,
        sr_count: 5,
        sr_by_type: {
          jack: 6.331,
          speed: 7.0912,
          stamina: null,
          tech: 6.8812
        }
      },
      IV: {
        skillsets: {
          stream: 25.3,
          jumpstream: 22.18,
          handstream: 18.5,
          stamina: 26.6076,
          jackspeed: 16.26,
          chordjack: 20.82,
          technical: 24.74
        },
        overall_msd: 28.8375,
        lower: 26.7325,
        upper: 30.075,
        map_count: 5,
        sr_mean: 6.9687,
        sr_lower: 6.9031,
        sr_upper: 7.2065,
        sr_count: 5,
        sr_by_type: {
          jack: 6.9359,
          speed: 7.1789,
          stamina: 6.9562,
          tech: null
        }
      },
      V: {
        skillsets: {
          stream: 21.94,
          jumpstream: 25.7,
          handstream: 21.54,
          stamina: 30.2998,
          jackspeed: 17.06,
          chordjack: 20.82,
          technical: 25.22
        },
        overall_msd: 30.9154,
        lower: 29.235,
        upper: 31.467,
        map_count: 5,
        sr_mean: 7.3377,
        sr_lower: 7.1728,
        sr_upper: 7.5575,
        sr_count: 5,
        sr_by_type: {
          jack: 7.2674,
          speed: 7.1728,
          stamina: 7.3377,
          tech: 7.5575
        }
      }
    },
    Transcendence: {
      I: {
        skillsets: {
          stream: 28.6247,
          jumpstream: 25.7497,
          handstream: 20.54,
          stamina: 28.9645,
          jackspeed: 16.98,
          chordjack: 22.22,
          technical: 29.3235
        },
        overall_msd: 30.27,
        lower: 27.531,
        upper: 32.225,
        map_count: 6,
        sr_mean: 7.4964,
        sr_lower: 7.2348,
        sr_upper: 7.7097,
        sr_count: 6,
        sr_by_type: {
          jack: 7.4623,
          speed: 7.2348,
          stamina: 7.4442,
          tech: 7.5486
        }
      },
      II: {
        skillsets: {
          stream: 26.38,
          jumpstream: 24.78,
          handstream: 24.34,
          stamina: 28.2964,
          jackspeed: 18.26,
          chordjack: 24.82,
          technical: 28.5297
        },
        overall_msd: 30.4465,
        lower: 29.2605,
        upper: 32.7285,
        map_count: 6,
        sr_mean: 7.8092,
        sr_lower: 7.71,
        sr_upper: 8.1732,
        sr_count: 6,
        sr_by_type: {
          jack: 7.7266,
          speed: null,
          stamina: 8.1408,
          tech: 7.8092
        }
      },
      III: {
        skillsets: {
          stream: 26.7822,
          jumpstream: 27.06,
          handstream: 23.46,
          stamina: 30.9564,
          jackspeed: 19.42,
          chordjack: 23.42,
          technical: 28.2407
        },
        overall_msd: 31.5228,
        lower: 30.6735,
        upper: 33.5399,
        map_count: 6,
        sr_mean: 8.03,
        sr_lower: 7.829,
        sr_upper: 8.2089,
        sr_count: 6,
        sr_by_type: {
          jack: 8.1206,
          speed: 7.829,
          stamina: 8.0896,
          tech: 8.0278
        }
      },
      IV: {
        skillsets: {
          stream: 30.7497,
          jumpstream: 27.9537,
          handstream: 24.26,
          stamina: 31.1445,
          jackspeed: 19.7,
          chordjack: 25.78,
          technical: 31.3647
        },
        overall_msd: 32.5467,
        lower: 31.558,
        upper: 33.4259,
        map_count: 6,
        sr_mean: 8.3215,
        sr_lower: 8.0956,
        sr_upper: 8.6222,
        sr_count: 6,
        sr_by_type: {
          jack: 8.223,
          speed: null,
          stamina: 8.2926,
          tech: 8.3929
        }
      },
      V: {
        skillsets: {
          stream: 26.78,
          jumpstream: 26.98,
          handstream: 26.3,
          stamina: 32.2791,
          jackspeed: 19.74,
          chordjack: 26.3,
          technical: 30.3772
        },
        overall_msd: 33.4631,
        lower: 32.2545,
        upper: 35.191,
        map_count: 6,
        sr_mean: 8.5645,
        sr_lower: 8.1859,
        sr_upper: 8.8701,
        sr_count: 6,
        sr_by_type: {
          jack: 8.3699,
          speed: null,
          stamina: 8.7317,
          tech: 8.4411
        }
      }
    },
    Singularity: {
      I: {
        skillsets: {
          stream: 29.059,
          jumpstream: 26.62,
          handstream: 27.42,
          stamina: 32.6612,
          jackspeed: 21.62,
          chordjack: 28.8005,
          technical: 30.8832
        },
        overall_msd: 33.7437,
        lower: 32.5975,
        upper: 36.117,
        map_count: 8,
        sr_mean: 8.8056,
        sr_lower: 8.5823,
        sr_upper: 9.0313,
        sr_count: 8,
        sr_by_type: {
          jack: 8.8264,
          speed: 8.9994,
          stamina: 8.9081,
          tech: 8.6619
        }
      },
      II: {
        skillsets: {
          stream: 26.38,
          jumpstream: 30.62,
          handstream: 30.3,
          stamina: 35.0795,
          jackspeed: 21.26,
          chordjack: 28.34,
          technical: 30.8455
        },
        overall_msd: 35.5902,
        lower: 32.3945,
        upper: 37.243,
        map_count: 8,
        sr_mean: 8.9126,
        sr_lower: 8.5214,
        sr_upper: 9.1579,
        sr_count: 8,
        sr_by_type: {
          jack: 8.9126,
          speed: 9.1579,
          stamina: 8.8426,
          tech: 8.6205
        }
      },
      III: {
        skillsets: {
          stream: 26.06,
          jumpstream: 29.5,
          handstream: 28.9,
          stamina: 35.5136,
          jackspeed: 23.42,
          chordjack: 32.8407,
          technical: 30.3
        },
        overall_msd: 36.9727,
        lower: 35.1095,
        upper: 39.1145,
        map_count: 8,
        sr_mean: 9.4519,
        sr_lower: 9.0913,
        sr_upper: 9.644,
        sr_count: 8,
        sr_by_type: {
          jack: 9.466,
          speed: null,
          stamina: 9.5368,
          tech: 9.3209
        }
      },
      IV: {
        skillsets: {
          stream: 31.7115,
          jumpstream: 28.86,
          handstream: 27.14,
          stamina: 37.0069,
          jackspeed: 24.1,
          chordjack: 30.42,
          technical: 34.865
        },
        overall_msd: 39.0045,
        lower: 35.5855,
        upper: 40.7555,
        map_count: 8,
        sr_mean: 9.8404,
        sr_lower: 9.5755,
        sr_upper: 10.1052,
        sr_count: 8,
        sr_by_type: {
          jack: 9.8187,
          speed: null,
          stamina: 9.8355,
          tech: 9.8412
        }
      },
      V: {
        skillsets: {
          stream: 29.06,
          jumpstream: 29.86,
          handstream: 31.62,
          stamina: 39.4488,
          jackspeed: 26.74,
          chordjack: 36.628,
          technical: 31.46
        },
        overall_msd: 39.5663,
        lower: 38.634,
        upper: 43.397,
        map_count: 7,
        sr_mean: 10.0878,
        sr_lower: 9.9654,
        sr_upper: 10.3,
        sr_count: 7,
        sr_by_type: {
          jack: 10.2698,
          speed: null,
          stamina: 10.1021,
          tech: 10.0276
        }
      }
    }
  };

  // port/src/celestial.ts
  var TIERS = ["Beginner", "Intermediate", "Expert", "Mastery", "Ascension", "Transcendence", "Singularity"];
  var CATEGORIES = ["I", "II", "III", "IV", "V"];
  var TIER_SHORT = { Beginner: "B", Intermediate: "Int", Expert: "E", Mastery: "M", Ascension: "A", Transcendence: "T", Singularity: "S" };
  var FAMILY_TO_TYPE = { jack: "jack", speed: "speed", stamina: "stamina", tech: "tech", stream: null, hybrid: null };
  var SHRINKAGE = 1;
  var SLOTS = [];
  for (const t of TIERS) for (const c of CATEGORIES) SLOTS.push([t, c]);
  var SLOT_INDEX = /* @__PURE__ */ new Map();
  SLOTS.forEach(([t, c], i) => SLOT_INDEX.set(`${t}|${c}`, i + 1));
  var round5 = (v, d) => isFinite(v) ? Number(v.toFixed(d)) : v;
  var rulerCache2 = /* @__PURE__ */ new Map();
  var boundsCache = /* @__PURE__ */ new Map();
  var keyOf = (ct) => ct ?? "__general__";
  function buildRuler(chartType) {
    const ck = keyOf(chartType);
    if (rulerCache2.has(ck)) return rulerCache2.get(ck);
    const general = chartType !== null ? buildRuler(null) : null;
    const generalMap = /* @__PURE__ */ new Map();
    if (general) for (const [sr, dp] of general) generalMap.set(dp, sr);
    const table = [];
    for (const [tier, cat] of SLOTS) {
      const slot = celestial_profiles_default[tier]?.[cat];
      const dpInt = SLOT_INDEX.get(`${tier}|${cat}`);
      let sr;
      if (chartType === null) {
        if (!slot || !slot.sr_mean) {
          rulerCache2.set(ck, null);
          boundsCache.set(ck, null);
          return null;
        }
        sr = Number(slot.sr_mean);
      } else {
        const typeSr = slot?.sr_by_type?.[chartType] ?? null;
        const genSr = generalMap.get(dpInt);
        if (typeSr != null && genSr != null) sr = SHRINKAGE * Number(typeSr) + (1 - SHRINKAGE) * genSr;
        else if (typeSr != null) sr = Number(typeSr);
        else if (genSr != null) sr = genSr;
        else {
          rulerCache2.set(ck, null);
          boundsCache.set(ck, null);
          return null;
        }
      }
      table.push([sr, dpInt]);
    }
    for (let i = 1; i < table.length; i++) if (table[i][0] <= table[i - 1][0]) table[i] = [table[i - 1][0] + 1e-3, table[i][1]];
    const means = table.map((t) => t[0]);
    const n = means.length;
    const boundaries = [];
    for (let i = 0; i < n; i++) {
      const lower = i > 0 ? (means[i - 1] + means[i]) / 2 : means[0] - (n > 1 ? (means[1] - means[0]) / 2 : 1);
      const upper = i < n - 1 ? (means[i] + means[i + 1]) / 2 : means[n - 1] + (n > 1 ? (means[n - 1] - means[n - 2]) / 2 : 1);
      boundaries.push([lower, upper, table[i][1]]);
    }
    rulerCache2.set(ck, table);
    boundsCache.set(ck, boundaries);
    return table;
  }
  function srToDp2(sr, chartType) {
    let resolved = chartType;
    let ruler = buildRuler(resolved);
    if (ruler === null && resolved !== null) {
      resolved = null;
      ruler = buildRuler(null);
    }
    if (ruler === null) return null;
    const b = boundsCache.get(keyOf(resolved));
    if (!b) return null;
    if (sr < b[0][0]) return Math.max(0.5, b[0][2]);
    if (sr >= b[b.length - 1][1]) return Math.min(35.99, b[b.length - 1][2] + 0.99);
    for (const [low, high, dpInt] of b) {
      if (low <= sr && sr < high) {
        const width = Math.max(high - low, 1e-6);
        return dpInt + (sr - low) / width;
      }
    }
    return b[b.length - 1][2];
  }
  function dpToSlot(dp) {
    const idx = Math.max(0, Math.min(34, Math.trunc(dp) - 1));
    return SLOTS[idx];
  }
  function confidenceFromFrac(frac) {
    const conf = 0.5 * (1 + Math.cos(Math.PI * (frac - 0.5) * 2));
    return round5(Math.max(0.1, Math.min(1, conf)), 3);
  }
  function estimateCelestial(skillsets, sr, familyHint) {
    let chartType = familyHint ? FAMILY_TO_TYPE[familyHint] ?? null : null;
    if (sr != null && sr > 0) {
      let ruler = buildRuler(chartType);
      if (ruler === null && chartType !== null) {
        chartType = null;
        ruler = buildRuler(null);
      }
      if (ruler !== null) {
        const dpRaw = srToDp2(sr, chartType);
        if (dpRaw != null) {
          const beyond = dpRaw > 35.99;
          const dpClamped = Math.max(0.5, Math.min(35.5, dpRaw));
          const [tier, cat] = dpToSlot(dpClamped);
          const resolvedType = rulerCache2.get(keyOf(chartType)) != null ? chartType : null;
          const boundaries = boundsCache.get(keyOf(resolvedType)) ?? [];
          const slotDp = SLOT_INDEX.get(`${tier}|${cat}`);
          let conf = 0.5;
          if (slotDp - 1 < boundaries.length) {
            const [low, high] = boundaries[slotDp - 1];
            const width = Math.max(high - low, 1e-6);
            const frac = (sr - low) / width;
            conf = confidenceFromFrac(Math.max(0, Math.min(1, frac)));
          }
          return {
            tier,
            category: cat,
            short: `${TIER_SHORT[tier]}-${cat}`,
            label: `${tier} ${cat}`,
            confidence: round5(conf, 3),
            dp_celestial: round5(dpClamped, 3),
            beyond
          };
        }
      }
    }
    return null;
  }

  // port/config/signicial_profiles.json
  var signicial_profiles_default = {
    I: {
      sr_mean: 2.684,
      sr_lower: 1.922,
      sr_upper: 3.091,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 14.404,
      lower: 13.731,
      upper: 14.535,
      map_count: 4
    },
    II: {
      sr_mean: 2.917,
      sr_lower: 2.44,
      sr_upper: 3.253,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 14.634,
      lower: 13.678,
      upper: 15.45,
      map_count: 4
    },
    III: {
      sr_mean: 3.374,
      sr_lower: 2.74,
      sr_upper: 3.768,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 16.159,
      lower: 15.027,
      upper: 17.477,
      map_count: 4
    },
    IV: {
      sr_mean: 3.975,
      sr_lower: 3.618,
      sr_upper: 4.356,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 18.523,
      lower: 17.477,
      upper: 19.353,
      map_count: 4
    },
    V: {
      sr_mean: 4.341,
      sr_lower: 3.923,
      sr_upper: 4.747,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 19.55,
      lower: 18.871,
      upper: 20.695,
      map_count: 4
    },
    VI: {
      sr_mean: 4.661,
      sr_lower: 4.442,
      sr_upper: 5.065,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 20.236,
      lower: 19.953,
      upper: 21.669,
      map_count: 4
    },
    VII: {
      sr_mean: 5.006,
      sr_lower: 4.806,
      sr_upper: 5.296,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 21.598,
      lower: 20.973,
      upper: 21.885,
      map_count: 4
    },
    VIII: {
      sr_mean: 5.302,
      sr_lower: 5.072,
      sr_upper: 5.683,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 22.884,
      lower: 21.648,
      upper: 24.218,
      map_count: 4
    },
    IX: {
      sr_mean: 5.605,
      sr_lower: 5.33,
      sr_upper: 5.844,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 23.868,
      lower: 22.838,
      upper: 25.081,
      map_count: 4
    },
    X: {
      sr_mean: 5.978,
      sr_lower: 5.735,
      sr_upper: 6.222,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 24.588,
      lower: 22.626,
      upper: 25.75,
      map_count: 4
    },
    XI: {
      sr_mean: 6.302,
      sr_lower: 6.23,
      sr_upper: 6.442,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 26.333,
      lower: 23.804,
      upper: 28.134,
      map_count: 4
    },
    XII: {
      sr_mean: 6.644,
      sr_lower: 6.464,
      sr_upper: 6.957,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 26.764,
      lower: 26.137,
      upper: 30.27,
      map_count: 4
    },
    XIII: {
      sr_mean: 7.242,
      sr_lower: 6.719,
      sr_upper: 7.637,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 29.674,
      lower: 26.17,
      upper: 30.88,
      map_count: 4
    },
    XIV: {
      sr_mean: 7.965,
      sr_lower: 7.901,
      sr_upper: 8.048,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 31.628,
      lower: 29.772,
      upper: 32.236,
      map_count: 4
    },
    LastStage: {
      sr_mean: 8.928,
      sr_lower: 8.734,
      sr_upper: 9.251,
      sr_count: 4,
      sr_by_type: {
        jack: null,
        tech: null,
        speed: null,
        stamina: null
      },
      overall_msd: 32.716,
      lower: 32.095,
      upper: 34.938,
      map_count: 4
    },
    ExtraStageI: {
      sr_mean: 9.5163,
      sr_lower: 8.9814,
      sr_upper: 9.7821,
      sr_count: 4,
      sr_by_type: {
        jack: 9.5938,
        tech: 9.7821,
        speed: 9.4388,
        stamina: 8.9814
      },
      overall_msd: 37.58,
      lower: 35.642,
      upper: 39.575,
      map_count: 4
    },
    ExtraStageII: {
      sr_mean: 9.9816,
      sr_lower: 9.3905,
      sr_upper: 10.3899,
      sr_count: 4,
      sr_by_type: {
        jack: 10.3899,
        tech: 9.8224,
        speed: 10.3236,
        stamina: 9.3905
      },
      overall_msd: 41,
      lower: 38.5,
      upper: 43.5,
      map_count: 4
    },
    ExtraStageIII: {
      sr_mean: 10.8,
      sr_lower: 10.47,
      sr_upper: 11.13,
      sr_count: 4,
      sr_by_type: {
        jack: 10.85,
        tech: 10.95,
        speed: 11,
        stamina: 10.8
      },
      overall_msd: 45,
      lower: 43,
      upper: 47,
      map_count: 4
    }
  };

  // port/src/signicial.ts
  var STAGE_KEYS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "LastStage", "ExtraStageI", "ExtraStageII", "ExtraStageIII"];
  var STAGE_DISPLAY = { I: "Stage I", II: "Stage II", III: "Stage III", IV: "Stage IV", V: "Stage V", VI: "Stage VI", VII: "Stage VII", VIII: "Stage VIII", IX: "Stage IX", X: "Stage X", XI: "Alpha", XII: "Beta", XIII: "Gamma", XIV: "Delta", LastStage: "Epsilon", ExtraStageI: "Zeta", ExtraStageII: "Eta", ExtraStageIII: "Theta" };
  var STAGE_SHORT = { I: "I", II: "II", III: "III", IV: "IV", V: "V", VI: "VI", VII: "VII", VIII: "VIII", IX: "IX", X: "X", XI: "\u03B1", XII: "\u03B2", XIII: "\u03B3", XIV: "\u03B4", LastStage: "\u03B5", ExtraStageI: "\u03B6", ExtraStageII: "\u03B7", ExtraStageIII: "\u03B8" };
  var STAGE_SUBTITLE = { I: "Prelude", II: "Abnormality", III: "Termination", IV: "Resuscitation", V: "Disturbance", VI: "Revitalization", VII: "Motivation", VIII: "Misfortune", IX: "Catastrophe", X: "Finale" };
  var FAMILY_TO_TYPE2 = { jack: "jack", speed: "speed", stamina: "stamina", tech: "tech", stream: null, hybrid: null };
  var SHRINKAGE2 = 0.6;
  var STAGE_DP = /* @__PURE__ */ new Map();
  STAGE_KEYS.forEach((k, i) => STAGE_DP.set(k, i + 1));
  var round6 = (v, d) => isFinite(v) ? Number(v.toFixed(d)) : v;
  var rulerCache3 = /* @__PURE__ */ new Map();
  var boundsCache2 = /* @__PURE__ */ new Map();
  var keyOf2 = (ct) => ct ?? "__general__";
  function buildRuler2(chartType) {
    const ck = keyOf2(chartType);
    if (rulerCache3.has(ck)) return rulerCache3.get(ck);
    const general = chartType !== null ? buildRuler2(null) : null;
    const generalMap = /* @__PURE__ */ new Map();
    if (general) for (const [sr, dp] of general) generalMap.set(dp, sr);
    const ruler = [];
    for (const key of STAGE_KEYS) {
      const slot = signicial_profiles_default[key];
      if (!slot) continue;
      const dpInt = STAGE_DP.get(key);
      let sr;
      if (chartType === null) sr = slot.sr_mean ?? null;
      else {
        const typeSr = slot.sr_by_type?.[chartType] ?? null;
        const genSr = generalMap.get(dpInt);
        if (typeSr != null && genSr != null) sr = SHRINKAGE2 * Number(typeSr) + (1 - SHRINKAGE2) * genSr;
        else if (typeSr != null) sr = Number(typeSr);
        else sr = genSr ?? null;
      }
      if (sr == null || Number(sr) <= 0) continue;
      ruler.push([Number(sr), dpInt]);
    }
    if (ruler.length < 2) {
      rulerCache3.set(ck, null);
      boundsCache2.set(ck, null);
      return null;
    }
    ruler.sort((a, b2) => a[1] - b2[1]);
    for (let i = 1; i < ruler.length; i++) if (ruler[i][0] <= ruler[i - 1][0]) ruler[i] = [ruler[i - 1][0] + 1e-3, ruler[i][1]];
    const means = ruler.map((r) => r[0]);
    const n = means.length;
    const b = [];
    for (let i = 0; i < n; i++) {
      const lower = i > 0 ? (means[i - 1] + means[i]) / 2 : means[0] - (n > 1 ? (means[1] - means[0]) / 2 : 1);
      const upper = i < n - 1 ? (means[i] + means[i + 1]) / 2 : means[n - 1] + (n > 1 ? (means[n - 1] - means[n - 2]) / 2 : 1);
      b.push([lower, upper, ruler[i][1]]);
    }
    rulerCache3.set(ck, ruler);
    boundsCache2.set(ck, b);
    return ruler;
  }
  function srToDp3(sr, chartType) {
    let resolved = chartType;
    let ruler = buildRuler2(resolved);
    if (ruler === null && resolved !== null) {
      resolved = null;
      ruler = buildRuler2(null);
    }
    if (ruler === null) return null;
    const b = boundsCache2.get(keyOf2(resolved));
    if (!b) return null;
    if (sr < b[0][0]) return Math.max(0.5, b[0][2]);
    if (sr >= b[b.length - 1][1]) return Math.min(18.99, b[b.length - 1][2] + 0.99);
    for (const [low, high, dpInt] of b) if (low <= sr && sr < high) return dpInt + (sr - low) / Math.max(high - low, 1e-6);
    return b[b.length - 1][2];
  }
  function dpToStageKey(dp) {
    const idx = Math.max(0, Math.min(Math.floor(dp) - 1, STAGE_KEYS.length - 1));
    return STAGE_KEYS[idx];
  }
  function confFromDpFrac(dp) {
    const frac = dp - Math.floor(dp);
    const dist = Math.abs(frac - 0.5);
    const conf = 0.5 * (1 + Math.cos(Math.PI * dist / 0.5));
    return Math.max(0, Math.min(1, conf));
  }
  function estimateSignicial(skillsets, sr, familyHint) {
    const chartType = familyHint ? FAMILY_TO_TYPE2[familyHint] ?? null : null;
    let dp = null;
    if (sr != null && sr > 0) dp = srToDp3(sr, chartType);
    if (dp == null) return null;
    const beyond = dp > 18.99;
    dp = Math.max(1, dp);
    const stageKey = dpToStageKey(dp);
    return {
      stage_key: stageKey,
      label: STAGE_DISPLAY[stageKey],
      short: STAGE_SHORT[stageKey],
      subtitle: STAGE_SUBTITLE[stageKey] ?? "",
      confidence: round6(confFromDpFrac(dp), 4),
      dp_signicial: round6(dp, 3),
      beyond
    };
  }

  // port/config/shoegazer_profiles.json
  var shoegazer_profiles_default = {
    "1st": {
      sr_mean: 3.1267,
      sr_lower: 3.1267,
      sr_upper: 3.1267,
      sr_count: 1,
      overall_msd: 14.874,
      msd_lower: 14.874,
      msd_upper: 14.874,
      msd_count: 1
    },
    "2nd": {
      sr_mean: 3.507,
      sr_lower: 3.507,
      sr_upper: 3.507,
      sr_count: 1,
      overall_msd: 17.1051,
      msd_lower: 17.1051,
      msd_upper: 17.1051,
      msd_count: 1
    },
    "3rd": {
      sr_mean: 3.9562,
      sr_lower: 3.9562,
      sr_upper: 3.9562,
      sr_count: 1,
      overall_msd: 18.1818,
      msd_lower: 18.1818,
      msd_upper: 18.1818,
      msd_count: 1
    },
    "4th": {
      sr_mean: 4.6767,
      sr_lower: 4.6767,
      sr_upper: 4.6767,
      sr_count: 1,
      overall_msd: 20.7681,
      msd_lower: 20.7681,
      msd_upper: 20.7681,
      msd_count: 1
    },
    "5th": {
      sr_mean: 4.9451,
      sr_lower: 4.9451,
      sr_upper: 4.9451,
      sr_count: 1,
      overall_msd: 21.5229,
      msd_lower: 21.5229,
      msd_upper: 21.5229,
      msd_count: 1
    },
    "6th": {
      sr_mean: 5.5769,
      sr_lower: 5.5769,
      sr_upper: 5.5769,
      sr_count: 1,
      overall_msd: 23.7762,
      msd_lower: 23.7762,
      msd_upper: 23.7762,
      msd_count: 1
    },
    "7th": {
      sr_mean: 5.6621,
      sr_lower: 5.5689,
      sr_upper: 5.7553,
      sr_count: 2,
      overall_msd: 24.2646,
      msd_lower: 24.0537,
      msd_upper: 24.4755,
      msd_count: 2
    },
    "8th": {
      sr_mean: 6.0305,
      sr_lower: 6.0012,
      sr_upper: 6.0597,
      sr_count: 2,
      overall_msd: 24.9806,
      msd_lower: 24.9306,
      msd_upper: 25.0305,
      msd_count: 2
    },
    "9th": {
      sr_mean: 5.9935,
      sr_lower: 5.982,
      sr_upper: 6.005,
      sr_count: 2,
      overall_msd: 25.6022,
      msd_lower: 25.5078,
      msd_upper: 25.6965,
      msd_count: 2
    },
    "10th": {
      sr_mean: 6.619,
      sr_lower: 6.5946,
      sr_upper: 6.6434,
      sr_count: 2,
      overall_msd: 26.5345,
      msd_lower: 26.4291,
      msd_upper: 26.64,
      msd_count: 2
    },
    Luminal: {
      sr_mean: 7.0461,
      sr_lower: 7.0321,
      sr_upper: 7.0602,
      sr_count: 2,
      overall_msd: 28.1662,
      msd_lower: 27.5946,
      msd_upper: 28.7379,
      msd_count: 2
    },
    Tachyon: {
      sr_mean: 7.5711,
      sr_lower: 7.4949,
      sr_upper: 7.7039,
      sr_count: 3,
      overall_msd: 29.7369,
      msd_lower: 28.7712,
      msd_upper: 30.6693,
      msd_count: 3
    }
  };

  // port/src/shoegazer.ts
  var STAGE_KEYS2 = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "Luminal", "Tachyon"];
  var STAGE_DISPLAY2 = { "1st": "1st Dan", "2nd": "2nd Dan", "3rd": "3rd Dan", "4th": "4th Dan", "5th": "5th Dan", "6th": "6th Dan", "7th": "7th Dan", "8th": "8th Dan", "9th": "9th Dan", "10th": "10th Dan", Luminal: "Luminal", Tachyon: "Tachyon" };
  var STAGE_SHORT2 = { "1st": "1", "2nd": "2", "3rd": "3", "4th": "4", "5th": "5", "6th": "6", "7th": "7", "8th": "8", "9th": "9", "10th": "10", Luminal: "\u2606", Tachyon: "\u03B5" };
  var STAGE_DP2 = /* @__PURE__ */ new Map();
  STAGE_KEYS2.forEach((k, i) => STAGE_DP2.set(k, i + 1));
  var round7 = (v, d) => isFinite(v) ? Number(v.toFixed(d)) : v;
  var rulerCache4;
  var boundsCache3;
  function buildRuler3() {
    if (rulerCache4 !== void 0) return rulerCache4;
    const ruler = [];
    for (const key of STAGE_KEYS2) {
      const slot = shoegazer_profiles_default[key];
      if (!slot) continue;
      const sr = slot.sr_mean;
      if (sr == null || sr <= 0) continue;
      ruler.push([Number(sr), STAGE_DP2.get(key)]);
    }
    if (ruler.length < 2) {
      rulerCache4 = null;
      boundsCache3 = null;
      return null;
    }
    ruler.sort((a, b2) => a[1] - b2[1]);
    for (let i = 1; i < ruler.length; i++) if (ruler[i][0] <= ruler[i - 1][0]) ruler[i] = [ruler[i - 1][0] + 1e-3, ruler[i][1]];
    const means = ruler.map((r) => r[0]);
    const n = means.length;
    const b = [];
    for (let i = 0; i < n; i++) {
      const lower = i > 0 ? (means[i - 1] + means[i]) / 2 : means[0] - (n > 1 ? (means[1] - means[0]) / 2 : 1);
      const upper = i < n - 1 ? (means[i] + means[i + 1]) / 2 : means[n - 1] + (n > 1 ? (means[n - 1] - means[n - 2]) / 2 : 1);
      b.push([lower, upper, ruler[i][1]]);
    }
    rulerCache4 = ruler;
    boundsCache3 = b;
    return ruler;
  }
  function srToDp4(sr) {
    const ruler = buildRuler3();
    if (!ruler) return null;
    const b = boundsCache3;
    if (sr < b[0][0]) return Math.max(0.5, b[0][2]);
    if (sr >= b[b.length - 1][1]) return Math.min(12.99, b[b.length - 1][2] + 0.99);
    for (const [low, high, dpInt] of b) if (low <= sr && sr < high) return dpInt + (sr - low) / Math.max(high - low, 1e-6);
    return b[b.length - 1][2];
  }
  function dpToStageKey2(dp) {
    const idx = Math.max(0, Math.min(Math.trunc(dp) - 1, STAGE_KEYS2.length - 1));
    return STAGE_KEYS2[idx];
  }
  function confFromDpFrac2(dp) {
    const frac = dp - Math.floor(dp);
    const dist = Math.abs(frac - 0.5);
    const conf = 0.5 * (1 + Math.cos(Math.PI * dist / 0.5));
    return Math.max(0, Math.min(1, conf));
  }
  function estimateShoegazer(skillsets, sr) {
    let dp = null;
    if (sr != null && sr > 0) dp = srToDp4(sr);
    if (dp == null) return null;
    const beyond = dp > 12.99;
    dp = Math.max(1, dp);
    const stageKey = dpToStageKey2(dp);
    return {
      stage_key: stageKey,
      label: STAGE_DISPLAY2[stageKey],
      short: STAGE_SHORT2[stageKey],
      confidence: round7(confFromDpFrac2(dp), 4),
      dp_shoegazer: round7(dp, 3),
      beyond
    };
  }

  // port/config/ln_course_profiles.json
  var ln_course_profiles_default = {
    allround: {
      "1st": {
        sr_mean: 2.3246,
        sr_count: 1
      },
      "2nd": {
        sr_mean: 1.7897,
        sr_count: 1
      },
      "3rd": {
        sr_mean: 2.7561,
        sr_count: 1
      },
      "4th": {
        sr_mean: 2.6084,
        sr_count: 1
      },
      "5th": {
        sr_mean: 3.477,
        sr_count: 1
      },
      "6th": {
        sr_mean: 3.1132,
        sr_count: 1
      },
      "7th": {
        sr_mean: 4.195,
        sr_count: 1
      },
      "8th": {
        sr_mean: 4.4407,
        sr_count: 1
      },
      "9th": {
        sr_mean: 4.9033,
        sr_count: 1
      },
      "10th": {
        sr_mean: 5.5391,
        sr_count: 1
      },
      Yoake: {
        sr_mean: 5.7238,
        sr_count: 1
      },
      Yuugure: {
        sr_mean: 6.0091,
        sr_count: 1
      },
      Yoru: {
        sr_mean: 6.393,
        sr_count: 1
      },
      Yami: {
        sr_mean: 6.891,
        sr_count: 1
      },
      Yume: {
        sr_mean: 7.4672,
        sr_count: 1
      },
      Yokaze: {
        sr_mean: 6.9452,
        sr_count: 1
      }
    },
    jack_technical: {
      "1st": {
        sr_mean: 0.917,
        sr_count: 1
      },
      "2nd": {
        sr_mean: 2.1146,
        sr_count: 1
      },
      "3rd": {
        sr_mean: 3.5099,
        sr_count: 1
      },
      "4th": {
        sr_mean: 2.9725,
        sr_count: 1
      },
      "5th": {
        sr_mean: 3.0857,
        sr_count: 1
      },
      "6th": {
        sr_mean: 1.9911,
        sr_count: 1
      },
      "7th": {
        sr_mean: 3.681,
        sr_count: 1
      },
      "8th": {
        sr_mean: 2.8157,
        sr_count: 1
      },
      "9th": {
        sr_mean: 3.9959,
        sr_count: 1
      },
      "10th": {
        sr_mean: 4.7784,
        sr_count: 1
      },
      Yoake: {
        sr_mean: 4.0904,
        sr_count: 1
      },
      Yuugure: {
        sr_mean: 5.0529,
        sr_count: 1
      },
      Yoru: {
        sr_mean: 6.0788,
        sr_count: 1
      },
      Yami: {
        sr_mean: 7.0452,
        sr_count: 1
      },
      Yume: {
        sr_mean: 6.9865,
        sr_count: 1
      },
      Yokaze: {
        sr_mean: 7.5334,
        sr_count: 1
      }
    },
    inverse: {
      "1st": {
        sr_mean: 0.373,
        sr_count: 1
      },
      "2nd": {
        sr_mean: 1.6848,
        sr_count: 1
      },
      "3rd": {
        sr_mean: 2.3061,
        sr_count: 1
      },
      "4th": {
        sr_mean: 1.6863,
        sr_count: 1
      },
      "5th": {
        sr_mean: 3.4617,
        sr_count: 1
      },
      "6th": {
        sr_mean: 3.1251,
        sr_count: 1
      },
      "7th": {
        sr_mean: 2.2816,
        sr_count: 1
      },
      "8th": {
        sr_mean: 3.485,
        sr_count: 1
      },
      "9th": {
        sr_mean: 4.3624,
        sr_count: 1
      },
      "10th": {
        sr_mean: 4.4354,
        sr_count: 1
      },
      Yoake: {
        sr_mean: 5.9052,
        sr_count: 1
      },
      Yuugure: {
        sr_mean: 5.9866,
        sr_count: 1
      },
      Yoru: {
        sr_mean: 6.8257,
        sr_count: 1
      },
      Yami: {
        sr_mean: 6.4333,
        sr_count: 1
      },
      Yume: {
        sr_mean: 7.1386,
        sr_count: 1
      },
      Yokaze: {
        sr_mean: 7.3977,
        sr_count: 1
      }
    },
    speed_density: {
      "1st": {
        sr_mean: 1.6052,
        sr_count: 1
      },
      "2nd": {
        sr_mean: 3.0169,
        sr_count: 1
      },
      "3rd": {
        sr_mean: 3.4553,
        sr_count: 1
      },
      "4th": {
        sr_mean: 3.5086,
        sr_count: 1
      },
      "5th": {
        sr_mean: 3.5691,
        sr_count: 1
      },
      "6th": {
        sr_mean: 4.5535,
        sr_count: 1
      },
      "7th": {
        sr_mean: 5.0759,
        sr_count: 1
      },
      "8th": {
        sr_mean: 5.0227,
        sr_count: 1
      },
      "9th": {
        sr_mean: 5.0577,
        sr_count: 1
      },
      "10th": {
        sr_mean: 5.5354,
        sr_count: 1
      },
      Yoake: {
        sr_mean: 5.7086,
        sr_count: 1
      },
      Yuugure: {
        sr_mean: 5.9762,
        sr_count: 1
      },
      Yoru: {
        sr_mean: 6.6037,
        sr_count: 1
      },
      Yami: {
        sr_mean: 6.9833,
        sr_count: 1
      },
      Yume: {
        sr_mean: 7.1522,
        sr_count: 1
      },
      Yokaze: {
        sr_mean: 8.3187,
        sr_count: 1
      }
    },
    global: {
      "1st": {
        sr_mean: 1.305,
        sr_count: 4,
        sr_std: 0.8463
      },
      "2nd": {
        sr_mean: 2.1515,
        sr_count: 4,
        sr_std: 0.6053
      },
      "3rd": {
        sr_mean: 2.8504,
        sr_count: 4,
        sr_std: 0.5797
      },
      "4th": {
        sr_mean: 2.8504,
        sr_count: 4,
        sr_std: 0.7668
      },
      "5th": {
        sr_mean: 3.2971,
        sr_count: 4,
        sr_std: 0.2138
      },
      "6th": {
        sr_mean: 3.2971,
        sr_count: 4,
        sr_std: 1.0498
      },
      "7th": {
        sr_mean: 3.8084,
        sr_count: 4,
        sr_std: 1.1695
      },
      "8th": {
        sr_mean: 3.941,
        sr_count: 4,
        sr_std: 0.9822
      },
      "9th": {
        sr_mean: 4.5798,
        sr_count: 4,
        sr_std: 0.4903
      },
      "10th": {
        sr_mean: 5.0721,
        sr_count: 4,
        sr_std: 0.5551
      },
      Yoake: {
        sr_mean: 5.357,
        sr_count: 4,
        sr_std: 0.8491
      },
      Yuugure: {
        sr_mean: 5.7562,
        sr_count: 4,
        sr_std: 0.4691
      },
      Yoru: {
        sr_mean: 6.4753,
        sr_count: 4,
        sr_std: 0.3179
      },
      Yami: {
        sr_mean: 6.8382,
        sr_count: 4,
        sr_std: 0.2773
      },
      Yume: {
        sr_mean: 7.1861,
        sr_count: 4,
        sr_std: 0.2019
      },
      Yokaze: {
        sr_mean: 7.5488,
        sr_count: 4,
        sr_std: 0.5716
      }
    },
    regression: {
      feature_order: [
        "dp_sr",
        "hold_occupancy",
        "simultaneous_hold",
        "release_density",
        "ln_duration_cv",
        "dp_sr_x_hold_occ",
        "bias"
      ],
      coefs: [
        0.768445,
        0.579175,
        5.109795,
        0.324758,
        0.224097,
        -0.265177,
        -3.189884
      ],
      training_n: 64,
      r2: 0.9482,
      mae: 0.8163
    },
    family_feature_means: {
      allround: {
        hold_occupancy: 0.8273,
        simultaneous_hold: 0.6055,
        release_density: 9.7958,
        ln_duration_cv: 0.9124,
        ln_ratio: 0.6777
      },
      jack_technical: {
        hold_occupancy: 0.8771,
        simultaneous_hold: 0.6875,
        release_density: 8.7761,
        ln_duration_cv: 0.9628,
        ln_ratio: 0.727
      },
      inverse: {
        hold_occupancy: 0.8615,
        simultaneous_hold: 0.7736,
        release_density: 9.0285,
        ln_duration_cv: 0.8849,
        ln_ratio: 0.7729
      },
      speed_density: {
        hold_occupancy: 0.7983,
        simultaneous_hold: 0.5693,
        release_density: 9.1562,
        ln_duration_cv: 1.2038,
        ln_ratio: 0.6877
      }
    }
  };

  // port/src/lnCourse.ts
  var STAGE_KEYS3 = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "Yoake", "Yuugure", "Yoru", "Yami", "Yume", "Yokaze"];
  var STAGE_DISPLAY3 = { "1st": "1st Dan", "2nd": "2nd Dan", "3rd": "3rd Dan", "4th": "4th Dan", "5th": "5th Dan", "6th": "6th Dan", "7th": "7th Dan", "8th": "8th Dan", "9th": "9th Dan", "10th": "10th Dan", Yoake: "\u591C\u660E\u3051 Yoake", Yuugure: "\u5915\u66AE\u308C Yuugure", Yoru: "\u591C Yoru", Yami: "\u95C7 Yami", Yume: "\u5922 Yume", Yokaze: "\u591C\u98A8 Yokaze" };
  var STAGE_SHORT3 = { "1st": "1", "2nd": "2", "3rd": "3", "4th": "4", "5th": "5", "6th": "6", "7th": "7", "8th": "8", "9th": "9", "10th": "10", Yoake: "\u591C\u660E", Yuugure: "\u5915\u66AE", Yoru: "\u591C", Yami: "\u95C7", Yume: "\u5922", Yokaze: "\u98A8" };
  var LN_FAMILIES = ["allround", "jack_technical", "inverse", "speed_density"];
  var LN_FAMILY_DISPLAY = { allround: "All-round LN", jack_technical: "Jack/Technical LN", inverse: "Inverse/Wall LN", speed_density: "Speed/Density LN" };
  var STAGE_DP3 = /* @__PURE__ */ new Map();
  STAGE_KEYS3.forEach((k, i) => STAGE_DP3.set(k, i + 1));
  var round8 = (v, d) => isFinite(v) ? Number(v.toFixed(d)) : v;
  var rulerCache5;
  var boundsCache4;
  function buildRuler4() {
    if (rulerCache5 !== void 0) return rulerCache5;
    const fam = ln_course_profiles_default["global"];
    if (!fam) {
      rulerCache5 = null;
      boundsCache4 = null;
      return null;
    }
    const ruler = [];
    for (const key of STAGE_KEYS3) {
      const slot = fam[key];
      if (!slot) continue;
      const sr = slot.sr_mean;
      if (sr == null || sr <= 0) continue;
      ruler.push([Number(sr), STAGE_DP3.get(key)]);
    }
    if (ruler.length < 2) {
      rulerCache5 = null;
      boundsCache4 = null;
      return null;
    }
    ruler.sort((a, b2) => a[1] - b2[1]);
    for (let i = 1; i < ruler.length; i++) if (ruler[i][0] <= ruler[i - 1][0]) ruler[i] = [ruler[i - 1][0] + 1e-3, ruler[i][1]];
    const means = ruler.map((r) => r[0]);
    const n = means.length;
    const b = [];
    for (let i = 0; i < n; i++) {
      const lower = i > 0 ? (means[i - 1] + means[i]) / 2 : means[0] - (n > 1 ? (means[1] - means[0]) / 2 : 1);
      const upper = i < n - 1 ? (means[i] + means[i + 1]) / 2 : means[n - 1] + (n > 1 ? (means[n - 1] - means[n - 2]) / 2 : 1);
      b.push([lower, upper, ruler[i][1]]);
    }
    rulerCache5 = ruler;
    boundsCache4 = b;
    return ruler;
  }
  function srToDp5(sr) {
    const ruler = buildRuler4();
    if (!ruler) return null;
    const b = boundsCache4;
    if (sr < b[0][0]) return Math.max(0.5, b[0][2]);
    if (sr >= b[b.length - 1][1]) return Math.min(16.99, b[b.length - 1][2] + 0.99);
    for (const [low, high, dpInt] of b) if (low <= sr && sr < high) return dpInt + (sr - low) / Math.max(high - low, 1e-6);
    return b[b.length - 1][2];
  }
  function dpFromRegression(dpSr, f) {
    const reg = ln_course_profiles_default["regression"];
    if (!reg) return null;
    const coefs = reg.coefs ?? [];
    const forder = reg.feature_order ?? [];
    if (!coefs.length || !forder.length || coefs.length !== forder.length) return null;
    const holdOcc = f.hold_occupancy;
    const featVals = {
      dp_sr: dpSr,
      hold_occupancy: holdOcc,
      simultaneous_hold: f.simultaneous_hold,
      release_density: f.release_density,
      ln_duration_cv: f.ln_duration_cv,
      dp_sr_x_hold_occ: dpSr * holdOcc,
      bias: 1
    };
    let result = 0;
    for (let i = 0; i < coefs.length; i++) result += coefs[i] * (featVals[forder[i]] ?? 0);
    return result;
  }
  function dpToStageKey3(dp) {
    const idx = Math.max(0, Math.min(Math.trunc(dp) - 1, STAGE_KEYS3.length - 1));
    return STAGE_KEYS3[idx];
  }
  function confFromDpFrac3(dp) {
    const frac = dp - Math.floor(dp);
    const dist = Math.abs(frac - 0.5);
    const conf = 0.5 * (1 + Math.cos(Math.PI * dist / 0.5));
    return Math.max(0, Math.min(1, conf));
  }
  function classifyLnFamily(f) {
    const releaseDens = f.release_density, lnRatio = f.ln_ratio, simHold = f.simultaneous_hold, lnCv = f.ln_duration_cv;
    if (releaseDens > 3.5 && lnRatio > 0.5) return "speed_density";
    if (lnRatio > 0.85 && simHold > 0.3) return "inverse";
    if (lnRatio < 0.55 && lnCv > 0.5) return "jack_technical";
    return "allround";
  }
  function estimateLnCourse(skillsets, sr, lnFamily, features) {
    const familyKey = LN_FAMILIES.includes(lnFamily) ? lnFamily : "allround";
    let dp = null;
    if (sr != null && sr > 0) {
      const dpSrRaw = srToDp5(sr);
      if (dpSrRaw != null && features != null) {
        dp = dpFromRegression(dpSrRaw, features);
        if (dp != null) dp = Math.max(1, Math.min(16.5, dp));
      }
      if (dp == null) dp = dpSrRaw;
    }
    if (dp == null) return null;
    const beyond = dp > 16.99;
    dp = Math.max(1, dp);
    const stageKey = dpToStageKey3(dp);
    return {
      stage_key: stageKey,
      label: STAGE_DISPLAY3[stageKey],
      short: STAGE_SHORT3[stageKey],
      confidence: round8(confFromDpFrac3(dp), 4),
      dp_ln: round8(dp, 3),
      ln_family: familyKey,
      ln_family_label: LN_FAMILY_DISPLAY[familyKey] ?? "LN",
      beyond
    };
  }

  // port/src/msdRows.ts
  var MSD_MOD_RATE = { HT: 0.75, DT: 1.5, NC: 1.5, NM: 1 };
  function buildMsdRows(osuText, rate) {
    let keycount = 0;
    let inDiff = false, inHit = false;
    const raw = [];
    for (const lineRaw of osuText.split(/\r\n|\r|\n/)) {
      const line = lineRaw.trim();
      if (!line) continue;
      if (line.startsWith("[") && line.endsWith("]")) {
        inDiff = line === "[Difficulty]";
        inHit = line === "[HitObjects]";
        continue;
      }
      if (inDiff && line.startsWith("CircleSize:")) {
        const v = parseFloat(line.split(":")[1]);
        if (!Number.isNaN(v)) keycount = Math.trunc(v);
      } else if (inHit) {
        const p = line.split(",");
        if (p.length < 4) continue;
        const x = parseInt(p[0], 10), t = parseInt(p[2], 10);
        if (!Number.isNaN(x) && !Number.isNaN(t)) raw.push([x, t]);
      }
    }
    if (keycount !== 4 && keycount !== 7 || !raw.length) return null;
    const colW = 512 / keycount;
    const rows = /* @__PURE__ */ new Map();
    for (const [x, ms] of raw) {
      const col = Math.min(Math.trunc(x / colW), keycount - 1);
      const timeS = Math.round(ms / rate / 1e3 * 1e4) / 1e4;
      rows.set(timeS, (rows.get(timeS) ?? 0) | 1 << col);
    }
    const keys = [...rows.keys()].sort((a, b) => a - b);
    const notes = new Uint32Array(keys.length);
    const times = new Float32Array(keys.length);
    keys.forEach((t, i) => {
      notes[i] = rows.get(t);
      times[i] = t;
    });
    return { notes, times, n: keys.length };
  }

  // port/config/sr_means_7k.json
  var sr_means_7k_default = {
    _metadata: {
      description: "7K DDMythical original Dan course SR means (practice packs)",
      keys: 7,
      tiers: [
        "0th",
        "1st",
        "2nd",
        "3rd",
        "4th",
        "5th",
        "6th",
        "7th",
        "8th",
        "9th",
        "10th",
        "Gamma",
        "Azimuth",
        "Zenith",
        "Stellium"
      ],
      n_maps_total: 45,
      calibrated: "2026-06",
      source: "data/original 7K/ - DDMythical 7K regular dan packs"
    },
    general: {
      "0th": {
        n: 3,
        median: 3.7392,
        mean: 3.7037,
        min: 3.3056,
        max: 4.0664
      },
      "1st": {
        n: 3,
        median: 4.7131,
        mean: 4.6596,
        min: 4.2308,
        max: 5.0348
      },
      "2nd": {
        n: 3,
        median: 4.9136,
        mean: 5.1143,
        min: 4.7514,
        max: 5.678
      },
      "3rd": {
        n: 3,
        median: 5.4499,
        mean: 5.4877,
        min: 5.1288,
        max: 5.8844
      },
      "4th": {
        n: 3,
        median: 5.8615,
        mean: 5.8614,
        min: 5.5744,
        max: 6.1483
      },
      "5th": {
        n: 3,
        median: 6.0782,
        mean: 6.1033,
        min: 5.973,
        max: 6.2587
      },
      "6th": {
        n: 3,
        median: 6.4382,
        mean: 6.5724,
        min: 6.216,
        max: 7.0631
      },
      "7th": {
        n: 3,
        median: 6.9917,
        mean: 6.9788,
        min: 6.7263,
        max: 7.2184
      },
      "8th": {
        n: 3,
        median: 7.6337,
        mean: 7.522,
        min: 7.1528,
        max: 7.7794
      },
      "9th": {
        n: 3,
        median: 7.6437,
        mean: 7.7837,
        min: 7.4582,
        max: 8.092
      },
      "10th": {
        n: 3,
        median: 8.2582,
        mean: 8.2658,
        min: 7.9061,
        max: 8.633
      },
      Gamma: {
        n: 3,
        median: 8.7916,
        mean: 8.6916,
        min: 8.3442,
        max: 8.9389
      },
      Azimuth: {
        n: 3,
        median: 9.2473,
        mean: 9.2493,
        min: 9.1104,
        max: 9.3902
      },
      Zenith: {
        n: 3,
        median: 9.9851,
        mean: 9.9485,
        min: 9.8685,
        max: 9.9918
      },
      Stellium: {
        n: 3,
        median: 10.568,
        mean: 10.4853,
        min: 10.2731,
        max: 10.6147
      }
    },
    by_skillset: {
      jack: {},
      tech: {
        "0th": {
          n: 1,
          median: 3.3056,
          mean: 3.3056,
          min: 3.3056,
          max: 3.3056
        },
        "1st": {
          n: 1,
          median: 4.2308,
          mean: 4.2308,
          min: 4.2308,
          max: 4.2308
        },
        "2nd": {
          n: 1,
          median: 4.7514,
          mean: 4.7514,
          min: 4.7514,
          max: 4.7514
        },
        "3rd": {
          n: 1,
          median: 5.4499,
          mean: 5.4499,
          min: 5.4499,
          max: 5.4499
        },
        "4th": {
          n: 1,
          median: 6.1483,
          mean: 6.1483,
          min: 6.1483,
          max: 6.1483
        },
        "5th": {
          n: 1,
          median: 6.0782,
          mean: 6.0782,
          min: 6.0782,
          max: 6.0782
        },
        "6th": {
          n: 1,
          median: 6.4382,
          mean: 6.4382,
          min: 6.4382,
          max: 6.4382
        },
        "7th": {
          n: 1,
          median: 6.7263,
          mean: 6.7263,
          min: 6.7263,
          max: 6.7263
        },
        "8th": {
          n: 1,
          median: 7.1528,
          mean: 7.1528,
          min: 7.1528,
          max: 7.1528
        },
        "9th": {
          n: 1,
          median: 7.4582,
          mean: 7.4582,
          min: 7.4582,
          max: 7.4582
        },
        "10th": {
          n: 1,
          median: 7.9061,
          mean: 7.9061,
          min: 7.9061,
          max: 7.9061
        },
        Gamma: {
          n: 1,
          median: 8.7916,
          mean: 8.7916,
          min: 8.7916,
          max: 8.7916
        },
        Azimuth: {
          n: 1,
          median: 9.3902,
          mean: 9.3902,
          min: 9.3902,
          max: 9.3902
        },
        Zenith: {
          n: 1,
          median: 9.8685,
          mean: 9.8685,
          min: 9.8685,
          max: 9.8685
        },
        Stellium: {
          n: 1,
          median: 10.2731,
          mean: 10.2731,
          min: 10.2731,
          max: 10.2731
        }
      },
      speed: {
        "0th": {
          n: 1,
          median: 4.0664,
          mean: 4.0664,
          min: 4.0664,
          max: 4.0664
        },
        "1st": {
          n: 1,
          median: 5.0348,
          mean: 5.0348,
          min: 5.0348,
          max: 5.0348
        },
        "2nd": {
          n: 1,
          median: 5.678,
          mean: 5.678,
          min: 5.678,
          max: 5.678
        },
        "3rd": {
          n: 1,
          median: 5.8844,
          mean: 5.8844,
          min: 5.8844,
          max: 5.8844
        },
        "4th": {
          n: 1,
          median: 5.5744,
          mean: 5.5744,
          min: 5.5744,
          max: 5.5744
        },
        "5th": {
          n: 1,
          median: 5.973,
          mean: 5.973,
          min: 5.973,
          max: 5.973
        },
        "6th": {
          n: 1,
          median: 6.216,
          mean: 6.216,
          min: 6.216,
          max: 6.216
        },
        "7th": {
          n: 1,
          median: 6.9917,
          mean: 6.9917,
          min: 6.9917,
          max: 6.9917
        },
        "8th": {
          n: 1,
          median: 7.7794,
          mean: 7.7794,
          min: 7.7794,
          max: 7.7794
        },
        "9th": {
          n: 1,
          median: 7.5651,
          mean: 7.5651,
          min: 7.5651,
          max: 7.5651
        },
        "10th": {
          n: 1,
          median: 8.2582,
          mean: 8.2582,
          min: 8.2582,
          max: 8.2582
        },
        Gamma: {
          n: 1,
          median: 8.3442,
          mean: 8.3442,
          min: 8.3442,
          max: 8.3442
        },
        Azimuth: {
          n: 1,
          median: 9.1104,
          mean: 9.1104,
          min: 9.1104,
          max: 9.1104
        },
        Zenith: {
          n: 1,
          median: 9.9918,
          mean: 9.9918,
          min: 9.9918,
          max: 9.9918
        },
        Stellium: {
          n: 1,
          median: 10.568,
          mean: 10.568,
          min: 10.568,
          max: 10.568
        }
      },
      stream: {
        "0th": {
          n: 1,
          median: 3.7392,
          mean: 3.7392,
          min: 3.7392,
          max: 3.7392
        },
        "1st": {
          n: 1,
          median: 4.7131,
          mean: 4.7131,
          min: 4.7131,
          max: 4.7131
        },
        "2nd": {
          n: 1,
          median: 4.9136,
          mean: 4.9136,
          min: 4.9136,
          max: 4.9136
        },
        "3rd": {
          n: 1,
          median: 5.1288,
          mean: 5.1288,
          min: 5.1288,
          max: 5.1288
        },
        "4th": {
          n: 1,
          median: 5.8615,
          mean: 5.8615,
          min: 5.8615,
          max: 5.8615
        },
        "5th": {
          n: 1,
          median: 6.2587,
          mean: 6.2587,
          min: 6.2587,
          max: 6.2587
        },
        "6th": {
          n: 1,
          median: 7.0631,
          mean: 7.0631,
          min: 7.0631,
          max: 7.0631
        },
        "7th": {
          n: 1,
          median: 7.2184,
          mean: 7.2184,
          min: 7.2184,
          max: 7.2184
        },
        "8th": {
          n: 1,
          median: 7.6337,
          mean: 7.6337,
          min: 7.6337,
          max: 7.6337
        },
        "9th": {
          n: 1,
          median: 8.092,
          mean: 8.092,
          min: 8.092,
          max: 8.092
        },
        "10th": {
          n: 1,
          median: 8.633,
          mean: 8.633,
          min: 8.633,
          max: 8.633
        },
        Gamma: {
          n: 1,
          median: 8.9389,
          mean: 8.9389,
          min: 8.9389,
          max: 8.9389
        },
        Azimuth: {
          n: 1,
          median: 9.2473,
          mean: 9.2473,
          min: 9.2473,
          max: 9.2473
        },
        Zenith: {
          n: 1,
          median: 9.9851,
          mean: 9.9851,
          min: 9.9851,
          max: 9.9851
        },
        Stellium: {
          n: 1,
          median: 10.6147,
          mean: 10.6147,
          min: 10.6147,
          max: 10.6147
        }
      },
      stamina: {}
    }
  };

  // port/src/sevenK.ts
  var GENERAL2 = sr_means_7k_default.general;
  var BASE_DP = {
    "0th": 0,
    "1st": 1,
    "2nd": 2,
    "3rd": 3,
    "4th": 4,
    "5th": 5,
    "6th": 6,
    "7th": 7,
    "8th": 8,
    "9th": 9,
    "10th": 10,
    Gamma: 11,
    Azimuth: 12,
    Zenith: 13,
    Stellium: 14
  };
  var DAN_TIERS = ["0th", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
  var round9 = (v, d) => isFinite(v) ? Number(v.toFixed(d)) : v;
  function sevenK(sr) {
    let bestTier = null;
    let minDist = Infinity;
    for (const [tier, data] of Object.entries(GENERAL2)) {
      if (!data || typeof data !== "object" || data.median == null) continue;
      const dist = Math.abs(sr - Number(data.median));
      if (dist < minDist) {
        minDist = dist;
        bestTier = tier;
      }
    }
    if (bestTier === null) bestTier = "Gamma";
    const td = GENERAL2[bestTier];
    const tMin = Number(td.min), tMax = Number(td.max);
    const pos = tMax > tMin ? (sr - tMin) / (tMax - tMin) : 0.5;
    let sub = pos < 0.2 ? "Low" : pos < 0.4 ? "Mid-Low" : pos < 0.6 ? "Mid" : pos < 0.8 ? "Mid-High" : "High";
    const baseDp = BASE_DP[bestTier] ?? 0;
    const dp7k = round9(baseDp + pos * 0.99, 2);
    let tier7k = bestTier;
    if (DAN_TIERS.includes(bestTier)) tier7k = bestTier + " Dan";
    if (bestTier === "Stellium" && pos > 1) {
      tier7k = "Beyond Stellium";
      sub = "Beyond";
    }
    return { mode: "7k", tier_7k: tier7k, sublevel_7k: sub, dp_7k: dp7k, sr: round9(sr, 2) };
  }

  // port/src/quaver.ts
  var C = {
    LnEndThresholdMs: 42,
    ChordClumpToleranceMs: 8,
    SJackLowerBoundaryMs: 40,
    SJackUpperBoundaryMs: 320,
    SJackMaxStrainValue: 68,
    SJackCurveExponential: 1.17,
    TJackLowerBoundaryMs: 40,
    TJackUpperBoundaryMs: 330,
    TJackMaxStrainValue: 70,
    TJackCurveExponential: 1.14,
    RollLowerBoundaryMs: 30,
    RollUpperBoundaryMs: 230,
    RollMaxStrainValue: 55,
    RollCurveExponential: 1.13,
    BracketLowerBoundaryMs: 30,
    BracketUpperBoundaryMs: 230,
    BracketMaxStrainValue: 56,
    BracketCurveExponential: 1.13,
    LnBaseMultiplier: 0.6,
    LnLayerToleranceMs: 60,
    LnLayerThresholdMs: 93.7,
    LnReleaseAfterMultiplier: 1,
    LnReleaseBeforeMultiplier: 1.3,
    LnTapMultiplier: 1.05,
    VibroActionDurationMs: 88.2,
    VibroActionToleranceMs: 88.2,
    VibroMultiplier: 0.75,
    VibroLengthMultiplier: 0.3,
    VibroMaxLength: 6,
    RollRatioToleranceMs: 2,
    RollRatioMultiplier: 0.25,
    RollLengthMultiplier: 0.6,
    RollMaxLength: 14
  };
  var SECONDS_TO_MS = 1e3;
  function laneToHand(lane, keyCount) {
    const half = Math.trunc(keyCount / 2);
    if (keyCount % 2 === 0) return lane <= half ? 0 : 1;
    if (lane <= half) return 0;
    if (lane === half + 1) return 2;
    return 1;
  }
  function laneToFinger(lane, keyCount) {
    const half = Math.trunc(keyCount / 2);
    if (keyCount <= 9) {
      if (keyCount % 2 === 0) return lane <= half ? 1 << half - lane : 1 << lane - (half + 1);
      if (lane <= half) return 1 << half - lane;
      if (lane === half + 1) return 16;
      return 1 << lane - (half + 2);
    }
    if (keyCount === 10) {
      if (lane <= half - 1) return 1 << half - 1 - lane;
      if (lane === half || lane === half + 1) return 16;
      return 1 << lane - (half + 2);
    }
    return 0;
  }
  function newSData(h, rate) {
    return {
      hitObjects: [h],
      next: null,
      startTime: h.start / rate,
      endTime: h.end / rate,
      actionCoeff: 1,
      patternMult: 1,
      rollManipMult: 1,
      jackManipMult: 1,
      totalStrain: 0,
      hand: 0,
      fingerAction: 0,
      fingerActionDurMs: 0,
      fingerState: 0
    };
  }
  var handChord = (d) => d.hitObjects.length > 1;
  function getCoefficient(duration, xMin, xMax, strainMax, exp, avgDensity) {
    const lowestDifficulty = 1, densityMultiplier = 0.266, densityDifficultyMin = 0.4;
    const ratio = Math.max(0, 1 - (duration - xMin) / (xMax - xMin));
    if (ratio === 0 && avgDensity < 4) {
      if (avgDensity < 1) return densityDifficultyMin;
      return avgDensity * densityMultiplier + 0.134;
    }
    return lowestDifficulty + (strainMax - lowestDifficulty) * Math.pow(ratio, exp);
  }
  function mapXToCol2(x, K) {
    let xc = x;
    if (x < 0) xc = 0;
    else if (x >= 512) xc = 511;
    return Math.min(Math.trunc(xc * K / 512), K - 1);
  }
  function buildInputFromText(raw) {
    const lines = raw.split(/\r\n|\r|\n/);
    let K = 4, section = "";
    const hits = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line[0] === "[" && line.endsWith("]")) {
        section = line;
        continue;
      }
      if (section === "[Difficulty]") {
        if (line.startsWith("CircleSize:")) {
          const v = parseFloat(line.split(/:(.*)/s)[1]);
          if (!Number.isNaN(v)) K = Math.max(1, Math.round(v));
        }
      } else if (section === "[HitObjects]") {
        const p = line.split(",");
        if (p.length < 4) continue;
        const x = Math.trunc(parseFloat(p[0])), t = Math.trunc(parseFloat(p[2])), type = Math.trunc(parseFloat(p[3]));
        if (Number.isNaN(x) || Number.isNaN(t)) continue;
        const lane = mapXToCol2(x, K) + 1;
        let end = 0;
        if (type & 128 && p.length >= 6) {
          const e = Math.trunc(parseFloat(p[5].split(":")[0]));
          if (!Number.isNaN(e) && e > t) end = e;
        }
        hits.push({ lane, start: t, end });
      }
    }
    hits.sort((a, b) => a.start - b.start);
    let length = 0;
    for (const h of hits) length = Math.max(length, h.start, h.end);
    return { hits, keyCount: K, length, count: hits.length };
  }
  function computeForHand(inp, rate, assumeHand, sd) {
    const avgDensity = SECONDS_TO_MS * inp.count / (inp.length * (-0.5 * rate + 1.5));
    for (const h of inp.hits) {
      const hb = { lane: h.lane, start: h.start, end: h.end, fingerState: laneToFinger(h.lane, inp.keyCount), lnLayerType: 0, lnStrainMult: 1, strainValue: 0 };
      const d = newSData(hb, rate);
      const hand = laneToHand(h.lane, inp.keyCount);
      d.hand = hand === 2 ? assumeHand : hand;
      sd.push(d);
    }
    for (let i = 0; i < sd.length - 1; i++) {
      for (let j = i + 1; j < sd.length; j++) {
        const msDiff = sd[j].startTime - sd[i].startTime;
        if (msDiff > C.ChordClumpToleranceMs) break;
        if (Math.abs(msDiff) <= C.ChordClumpToleranceMs) {
          if (sd[i].hand === sd[j].hand) {
            for (const k of sd[j].hitObjects) {
              let same = false;
              for (const l of sd[i].hitObjects) if (l.fingerState === k.fingerState) same = true;
              if (!same) sd[i].hitObjects.push(k);
            }
            sd.splice(j, 1);
          }
        }
      }
    }
    for (const d of sd) for (const h of d.hitObjects) d.fingerState |= h.fingerState;
    for (let i = 0; i < sd.length - 1; i++) {
      const cur = sd[i];
      for (let j = i + 1; j < sd.length; j++) {
        const nxt = sd[j];
        if (cur.hand === nxt.hand && nxt.startTime > cur.startTime) {
          const jackFound = (cur.fingerState & nxt.fingerState) !== 0;
          const chordFound = handChord(cur) || handChord(nxt);
          const sameState = cur.fingerState === nxt.fingerState;
          const dur = nxt.startTime - cur.startTime;
          cur.next = nxt;
          cur.fingerActionDurMs = dur;
          if (!chordFound && !sameState) {
            cur.fingerAction = 3;
            cur.actionCoeff = getCoefficient(dur, C.RollLowerBoundaryMs, C.RollUpperBoundaryMs, C.RollMaxStrainValue, C.RollCurveExponential, avgDensity);
          } else if (sameState) {
            cur.fingerAction = 1;
            cur.actionCoeff = getCoefficient(dur, C.SJackLowerBoundaryMs, C.SJackUpperBoundaryMs, C.SJackMaxStrainValue, C.SJackCurveExponential, avgDensity);
          } else if (jackFound) {
            cur.fingerAction = 2;
            cur.actionCoeff = getCoefficient(dur, C.TJackLowerBoundaryMs, C.TJackUpperBoundaryMs, C.TJackMaxStrainValue, C.TJackCurveExponential, avgDensity);
          } else {
            cur.fingerAction = 4;
            cur.actionCoeff = getCoefficient(dur, C.BracketLowerBoundaryMs, C.BracketUpperBoundaryMs, C.BracketMaxStrainValue, C.BracketCurveExponential, avgDensity);
          }
          break;
        }
      }
    }
    let manipIndex = 0;
    for (const data of sd) {
      let found = false;
      if (data.next && data.next.next) {
        const middle = data.next, last = data.next.next;
        if (data.fingerAction === 3 && middle.fingerAction === 3 && data.fingerState === last.fingerState) {
          const durationRatio = Math.max(data.fingerActionDurMs / middle.fingerActionDurMs, middle.fingerActionDurMs / data.fingerActionDurMs);
          if (durationRatio >= C.RollRatioToleranceMs) {
            const durMult = 1 / (1 + (durationRatio - 1) * C.RollRatioMultiplier);
            const ratio = 1 - manipIndex / C.RollMaxLength * (1 - C.RollLengthMultiplier);
            data.rollManipMult = durMult * ratio;
            found = true;
            if (manipIndex < C.RollMaxLength) manipIndex++;
          }
        }
      }
      if (!found && manipIndex > 0) manipIndex--;
    }
    let longJack = 0;
    for (const data of sd) {
      let found = false;
      if (data.next) {
        const next = data.next;
        if (data.fingerAction === 1 && next.fingerAction === 1) {
          const durVal = Math.min(1, Math.max(0, (C.VibroActionDurationMs + C.VibroActionToleranceMs - data.fingerActionDurMs) / C.VibroActionToleranceMs));
          const durMult = 1 - durVal * (1 - C.VibroMultiplier);
          const ratio = 1 - longJack / C.VibroMaxLength * (1 - C.VibroLengthMultiplier);
          data.rollManipMult = durMult * ratio;
          found = true;
          if (longJack < C.VibroMaxLength) longJack++;
        }
      }
      if (!found) longJack = 0;
    }
    for (const data of sd) {
      if (data.endTime > data.startTime) {
        const durVal = 1 - Math.min(1, Math.max(0, (C.LnLayerThresholdMs + C.LnLayerToleranceMs - (data.endTime - data.startTime)) / C.LnLayerToleranceMs));
        const baseMult = 1 + durVal * C.LnBaseMultiplier;
        for (const k of data.hitObjects) k.lnStrainMult = baseMult;
        const next = data.next;
        if (next) {
          if (next.startTime < data.endTime - C.LnEndThresholdMs && next.startTime >= data.startTime + C.LnEndThresholdMs) {
            if (next.endTime > data.endTime + C.LnEndThresholdMs) for (const k of data.hitObjects) {
              k.lnLayerType = 2;
              k.lnStrainMult *= C.LnReleaseAfterMultiplier;
            }
            else if (next.endTime > 0) for (const k of data.hitObjects) {
              k.lnLayerType = 1;
              k.lnStrainMult *= C.LnReleaseBeforeMultiplier;
            }
            else for (const k of data.hitObjects) {
              k.lnLayerType = 3;
              k.lnStrainMult *= C.LnTapMultiplier;
            }
          }
        }
      }
    }
    if (sd.length === 0) return 0;
    for (const data of sd) {
      for (const h of data.hitObjects) {
        h.strainValue = data.actionCoeff * data.patternMult * data.rollManipMult * data.jackManipMult * h.lnStrainMult;
        data.totalStrain += h.strainValue;
      }
      data.totalStrain /= data.hitObjects.length;
    }
    let calculatedDiff = sd.reduce((a, s) => a + s.totalStrain, 0) / sd.length;
    const binSize = 1e3;
    const mapStart = Math.min(...sd.map((s) => s.startTime));
    const mapEnd = Math.max(...sd.map((s) => Math.max(s.startTime, s.endTime)));
    const bins = [];
    const useFallback = inp.keyCount % 2 === 1;
    let leftIndex = 0, rightIndex = 0;
    while (leftIndex < sd.length && sd[leftIndex].startTime < mapStart) leftIndex++;
    for (let i = mapStart; i < mapEnd; i += binSize) {
      let valuesInBin;
      if (useFallback) {
        valuesInBin = sd.filter((s) => s.startTime >= i && s.startTime < i + binSize);
      } else {
        while (rightIndex < sd.length - 1 && sd[rightIndex + 1].startTime < i + binSize) rightIndex++;
        if (leftIndex >= sd.length) {
          bins.push(0);
          continue;
        }
        valuesInBin = sd.slice(leftIndex, rightIndex + 1);
      }
      const avg = valuesInBin.length > 0 ? valuesInBin.reduce((a, s) => a + s.totalStrain, 0) / valuesInBin.length : 0;
      bins.push(avg);
      leftIndex = rightIndex + 1;
    }
    if (!bins.some((s) => s > 0)) return 0;
    const cutoffPos = Math.floor(bins.length * 0.4);
    const top40 = [...bins].sort((a, b) => b - a).slice(0, cutoffPos);
    const easyCutoff = top40.length ? top40.reduce((a, b) => a + b, 0) / top40.length : 0;
    const nzBins = bins.filter((s) => s > 0);
    const continuity = nzBins.reduce((a, s) => a + Math.sqrt(s / easyCutoff), 0) / nzBins.length;
    const maxContinuity = 1, avgContinuity = 0.85, minContinuity = 0.6;
    const maxAdj = 1.05, avgAdj = 1, minAdj = 0.9;
    let contAdj;
    if (continuity > avgContinuity) {
      const f = 1 - (continuity - avgContinuity) / (maxContinuity - avgContinuity);
      contAdj = Math.min(avgAdj, Math.max(minAdj, f * (avgAdj - minAdj) + minAdj));
    } else {
      const f = 1 - (continuity - minContinuity) / (avgContinuity - minContinuity);
      contAdj = Math.min(maxAdj, Math.max(avgAdj, f * (maxAdj - avgAdj) + avgAdj));
    }
    calculatedDiff *= contAdj;
    const maxShortAdj = 0.75, shortThreshold = 60 * SECONDS_TO_MS;
    const trueDrain = bins.length * continuity * binSize;
    const shortAdj = Math.min(1, Math.max(maxShortAdj, 0.25 * Math.sqrt(trueDrain / shortThreshold) + 0.75));
    calculatedDiff *= shortAdj;
    return calculatedDiff;
  }
  var MOD_RATE = { NM: 1, DT: 1.5, NC: 1.5, HT: 0.75 };
  function estimateQuaver(osuText, mod = "NM") {
    const rate = MOD_RATE[mod] ?? 1;
    const inp = buildInputFromText(osuText);
    if (inp.count < 2 || inp.length <= 0) return 0;
    const sd = [];
    let diff;
    if (inp.keyCount % 2 === 0) diff = computeForHand(inp, rate, 1, sd);
    else diff = (computeForHand(inp, rate, 0, sd) + computeForHand(inp, rate, 1, sd)) / 2;
    return Math.round(diff * 100) / 100;
  }

  // port/browser/danEngine.ts
  function computeMsd(osuText, mod) {
    const mc = globalThis.__MINACALC;
    if (!mc || !mc.ready || typeof mc.msd !== "function") return null;
    const rows = buildMsdRows(osuText, MSD_MOD_RATE[mod] ?? 1);
    if (!rows) return null;
    const o = mc.msd(rows.notes, rows.times);
    if (!o) return null;
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      overall: r2(o[0]),
      skillsets: { stream: r2(o[1]), jumpstream: r2(o[2]), handstream: r2(o[3]), stamina: r2(o[4]), jackspeed: r2(o[5]), chordjack: r2(o[6]), technical: r2(o[7]) }
    };
  }
  function buildNpsData(parsed) {
    const times = (parsed.note_events || []).filter((e) => e.event_type !== "ln_end").map((e) => e.time_ms).sort((a, b) => a - b);
    const empty = { nps_data: [], dominant_nps: 0, density_meta: { hop_ms: 250, segment_ms: 500 } };
    if (!times.length) return empty;
    const half = 250, durS = 0.5;
    const bl = (v) => {
      let lo = 0, hi = times.length;
      while (lo < hi) {
        const m = lo + hi >>> 1;
        if (times[m] < v) lo = m + 1;
        else hi = m;
      }
      return lo;
    };
    const br = (v) => {
      let lo = 0, hi = times.length;
      while (lo < hi) {
        const m = lo + hi >>> 1;
        if (times[m] <= v) lo = m + 1;
        else hi = m;
      }
      return lo;
    };
    const out = [];
    let sw = 0, sw2 = 0;
    for (let t = times[0]; t <= times[times.length - 1]; t += 250) {
      const nps = (br(t + half) - bl(t - half)) / durS;
      out.push([t, nps]);
      sw += nps;
      sw2 += nps * nps;
    }
    return { nps_data: out, dominant_nps: sw > 0 ? sw2 / sw : 0, density_meta: { hop_ms: 250, segment_ms: 500 } };
  }
  function analyze(osuText, mod = "NM", osuSr = 0) {
    const parsed = parsearOsuV2Text(osuText, true);
    const domain = validateDomain(parsed);
    if (!domain.valid) return { type: "analysis", error: domain.rejection_reason ?? "domain_rejected" };
    const quaver_rating = estimateQuaver(osuText, mod);
    const nps = buildNpsData(parsed);
    if (domain.is_7k) {
      const sr = calculateText(osuText, mod === "NC" ? "DT" : mod).sr;
      const k = sevenK(sr);
      return {
        type: "analysis",
        ...k,
        bpm: domain.bpm,
        od: domain.od,
        duration_s: domain.drain_time_s,
        note_count: domain.note_count,
        mod: mod === "NM" ? "" : mod,
        mod_label: mod,
        overall_msd: 0,
        skillsets: null,
        quaver_rating,
        celestial: null,
        signicial: null,
        shoegazer: null,
        ln_course: null,
        osu_sr: osuSr || 0,
        ...nps
      };
    }
    const r = analyzeReformText(osuText, mod);
    if (r.error) return { type: "analysis", error: r.error };
    const msd = computeMsd(osuText, mod);
    const ss = msd ? { ...msd.skillsets, overall: msd.overall } : {};
    let lnCourse = null;
    if (r.ln_route === "ln") {
      try {
        const lnf = extractLnFeatures(parsearOsuV2Text(osuText, true));
        lnCourse = estimateLnCourse(ss, r.sr, classifyLnFamily(lnf), lnf);
      } catch {
        lnCourse = null;
      }
    }
    return {
      type: "analysis",
      dan_label: r.dan_label,
      dan_short: r.dan_short,
      dp: r.dp,
      sublevel: r.sublevel,
      beyond: r.beyond,
      confidence: r.confidence,
      family: r.family,
      sr: r.sr,
      corrections: r.corrections,
      engine: r.engine,
      bpm: r.bpm,
      od: r.od,
      duration_s: r.drain_time_s,
      ln_route: r.ln_route,
      ln_confidence: r.ln_confidence,
      note_count: r.note_count,
      mod: mod === "NM" ? "" : mod,
      mod_label: mod,
      overall_msd: msd ? msd.overall : 0,
      skillsets: msd ? msd.skillsets : null,
      quaver_rating,
      celestial: estimateCelestial(ss, r.sr, r.family),
      signicial: estimateSignicial(ss, r.sr, r.family),
      shoegazer: estimateShoegazer(ss, r.sr),
      ln_course: lnCourse,
      osu_sr: osuSr || 0,
      ...nps
    };
  }
  return __toCommonJS(danEngine_exports);
})();
