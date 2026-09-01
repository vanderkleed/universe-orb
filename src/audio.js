// Sound: a quiet synthesised score, nothing sampled. Off until the visitor turns it on (the choice is
// remembered). Everything runs through one master gain so the toggle fades rather than cuts.
//   ambient   — detuned low sines through a slow-breathing lowpass
//   wind      — brown noise whose level and brightness follow the ship's speed
//   warp      — the hyperspace jump, scheduled as one event: a rising charge, a boom at the flash,
//               a bright whoosh that falls away as you come out the other side
//   tick      — a tiny blip when the scanner or a planet is hovered
//   select    — a soft two-note chime when you commit to a dataset or galaxy
//   arrive    — a low, warm settle when the autopilot reaches its target
const KEY = "universe-orb:sound";

export function createAudio(opts = {}) {
  let ctx = opts.context || null, master = null, on = false, built = false;
  let wind = null, windFilter = null, padGain = null, noise = null;
  let lastTick = 0;
  const remembered = (() => { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } })();

  function noiseBuffer(seconds, brown) {
    const n = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  function build() {
    if (built) return; built = true;
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    noise = noiseBuffer(3, false);

    // ambient pad: low sines, an octave, a fifth and a detuned copy, very quiet, slowly breathing
    padGain = ctx.createGain(); padGain.gain.value = 0.05; padGain.connect(master);
    const padFilter = ctx.createBiquadFilter(); padFilter.type = "lowpass"; padFilter.frequency.value = 320; padFilter.connect(padGain);
    [[55, 0], [110, 4], [164.8, -3], [220, 6]].forEach(([f, det]) => { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f; o.detune.value = det; const g = ctx.createGain(); g.gain.value = f < 100 ? 1 : 0.35; o.connect(g); g.connect(padFilter); o.start(); });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; const lfoG = ctx.createGain(); lfoG.gain.value = 120; lfo.connect(lfoG); lfoG.connect(padFilter.frequency); lfo.start();

    // wind: brown noise through a lowpass whose cutoff and level follow speed
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(3, true); src.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = "lowpass"; windFilter.frequency.value = 200; windFilter.Q.value = 0.7;
    wind = ctx.createGain(); wind.gain.value = 0.0;
    src.connect(windFilter); windFilter.connect(wind); wind.connect(master); src.start();
  }
  function setOn(v) {
    on = v; try { localStorage.setItem(KEY, v ? "on" : "off"); } catch {}
    if (v) { build(); if (ctx.resume) ctx.resume().catch(() => {}); master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6); }
    else if (ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.25); }
    listeners.forEach(f => f(on));
  }
  const listeners = [];

  // helpers for one-shots
  function tone(f, { type = "sine", a = 0.005, d = 0.4, g = 0.2, at = 0, slide = null } = {}) {
    if (!on || !ctx) return; const t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.exponentialRampToValueAtTime(0.0005, t + d);
    o.connect(e); e.connect(master); o.start(t); o.stop(t + d + 0.05);
  }
  const play = {
    tick() { if (!on || !ctx) return; const now = ctx.currentTime; if (now - lastTick < 0.06) return; lastTick = now; tone(2200 + Math.random() * 400, { d: 0.05, g: 0.035, a: 0.002 }); },
    select() { tone(523.25, { d: 0.5, g: 0.12 }); tone(783.99, { d: 0.7, g: 0.08, at: 0.09 }); },
    arrive() { tone(130.81, { type: "triangle", d: 1.6, g: 0.14 }); tone(196, { d: 1.2, g: 0.05, at: 0.05 }); },
    open() { tone(880, { d: 0.25, g: 0.04, slide: 1320 }); },
    close() { tone(880, { d: 0.2, g: 0.03, slide: 660 }); },

    // The jump. T is the flight time; the visual flash peaks at T/2, so the boom lands there.
    warp(T = 2.4) {
      if (!on || !ctx) return;
      const t0 = ctx.currentTime, mid = t0 + T * 0.5, end = t0 + T + 1.2;
      const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master);

      // 1. charge: a pair of detuned saws whose pitch and bandpass climb together, level swelling
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 3.5;
      bp.frequency.setValueAtTime(140, t0); bp.frequency.exponentialRampToValueAtTime(3600, mid); bp.frequency.exponentialRampToValueAtTime(220, mid + 0.7);
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0.0001, t0); cg.gain.exponentialRampToValueAtTime(0.22, mid - 0.05); cg.gain.setValueAtTime(0.22, mid); cg.gain.exponentialRampToValueAtTime(0.0001, mid + 0.6);
      bp.connect(cg); cg.connect(bus);
      [0, 7, -5].forEach(det => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.detune.value = det; o.frequency.setValueAtTime(60, t0); o.frequency.exponentialRampToValueAtTime(520, mid); o.frequency.exponentialRampToValueAtTime(90, mid + 0.7); o.connect(bp); o.start(t0); o.stop(mid + 0.8); });
      // a rumble that builds under the charge
      const r = ctx.createOscillator(); r.type = "sine"; r.frequency.setValueAtTime(38, t0); r.frequency.linearRampToValueAtTime(48, mid);
      const rg = ctx.createGain(); rg.gain.setValueAtTime(0.0001, t0); rg.gain.exponentialRampToValueAtTime(0.3, mid); rg.gain.exponentialRampToValueAtTime(0.0001, mid + 1.2);
      r.connect(rg); rg.connect(bus); r.start(t0); r.stop(mid + 1.3);

      // 2. the boom at the flash: a sine that drops from 90 to 28 Hz with a fast decay, plus a click
      const b = ctx.createOscillator(); b.type = "sine"; b.frequency.setValueAtTime(90, mid); b.frequency.exponentialRampToValueAtTime(28, mid + 0.9);
      const bg = ctx.createGain(); bg.gain.setValueAtTime(0.0001, mid - 0.01); bg.gain.linearRampToValueAtTime(0.9, mid + 0.012); bg.gain.exponentialRampToValueAtTime(0.0001, mid + 1.4);
      b.connect(bg); bg.connect(bus); b.start(mid - 0.01); b.stop(mid + 1.5);
      const clk = ctx.createBufferSource(); clk.buffer = noise; const ck = ctx.createGain(); ck.gain.setValueAtTime(0.35, mid); ck.gain.exponentialRampToValueAtTime(0.0001, mid + 0.06); clk.connect(ck); ck.connect(bus); clk.start(mid); clk.stop(mid + 0.08);

      // 3. the whoosh: white noise through a highpass that starts bright and falls away as you decelerate
      const w = ctx.createBufferSource(); w.buffer = noise; w.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.Q.value = 0.9; hp.frequency.setValueAtTime(5000, mid); hp.frequency.exponentialRampToValueAtTime(140, end);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(12000, mid); lp.frequency.exponentialRampToValueAtTime(900, end);
      const wg = ctx.createGain(); wg.gain.setValueAtTime(0.0001, t0); wg.gain.exponentialRampToValueAtTime(0.06, mid - 0.02); wg.gain.linearRampToValueAtTime(0.55, mid + 0.05); wg.gain.exponentialRampToValueAtTime(0.0001, end);
      w.connect(hp); hp.connect(lp); lp.connect(wg); wg.connect(bus); w.start(t0); w.stop(end + 0.1);
      // a thin pitched tail that falls like a doppler shift
      const d = ctx.createOscillator(); d.type = "triangle"; d.frequency.setValueAtTime(1400, mid); d.frequency.exponentialRampToValueAtTime(180, end);
      const dg = ctx.createGain(); dg.gain.setValueAtTime(0.0001, mid); dg.gain.linearRampToValueAtTime(0.07, mid + 0.05); dg.gain.exponentialRampToValueAtTime(0.0001, end - 0.2);
      d.connect(dg); dg.connect(bus); d.start(mid); d.stop(end);
    },
  };

  // continuous: call every frame with the ship's normalised speed (0..1) and the warp curve (0..1)
  function update(speed, warp) {
    if (!on || !ctx || ctx.state !== "running") return;
    const t = ctx.currentTime, k = 0.08;
    const s = Math.min(1, speed), w = Math.min(1, warp);
    wind.gain.setTargetAtTime(0.02 + s * 0.12 + w * 0.1, t, k);
    windFilter.frequency.setTargetAtTime(160 + s * 900 + w * 600, t, k);
    padGain.gain.setTargetAtTime(0.05 * (1 - w * 0.7), t, k);
  }

  // browsers require a gesture before audio can start: if sound was remembered on, arm it on the first one
  if (remembered && !opts.context) { const arm = () => { setOn(true); removeEventListener("pointerdown", arm); removeEventListener("keydown", arm); }; addEventListener("pointerdown", arm); addEventListener("keydown", arm); }

  return { get on() { return on; }, remembered, toggle: () => setOn(!on), set: setOn, play, update, onChange: f => listeners.push(f), get context() { return ctx; } };
}
