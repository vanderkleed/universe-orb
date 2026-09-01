// Sound: a quiet synthesised score, nothing sampled. Off until the visitor turns it on (the choice is
// remembered). Everything runs through one master gain so the toggle fades rather than cuts.
//   ambient   — two detuned low sines + a slow-breathing filtered noise bed
//   wind      — noise whose level and brightness follow the ship's speed
//   warp      — during hyperspace the wind rises to a roar and a pitched sweep climbs with the warp curve
//   tick      — a tiny blip when the scanner or a planet is hovered
//   select    — a soft two-note chime when you commit to a dataset or galaxy
//   arrive    — a low, warm settle when the autopilot reaches its target
const KEY = "universe-orb:sound";

export function createAudio() {
  let ctx = null, master = null, on = false, built = false;
  let wind = null, windFilter = null, sweep = null, sweepGain = null, padGain = null;
  let lastTick = 0;
  const remembered = (() => { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } })();

  function noiseBuffer(seconds = 2) {
    const n = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }   // brownish
    return b;
  }
  function build() {
    if (built) return; built = true;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);

    // ambient pad: two detuned sines an octave apart + a fifth, very quiet, slowly breathing
    padGain = ctx.createGain(); padGain.gain.value = 0.05; padGain.connect(master);
    const padFilter = ctx.createBiquadFilter(); padFilter.type = "lowpass"; padFilter.frequency.value = 320; padFilter.connect(padGain);
    [[55, 0], [110, 4], [164.8, -3], [220, 6]].forEach(([f, det]) => { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f; o.detune.value = det; const g = ctx.createGain(); g.gain.value = f < 100 ? 1 : 0.35; o.connect(g); g.connect(padFilter); o.start(); });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; const lfoG = ctx.createGain(); lfoG.gain.value = 120; lfo.connect(lfoG); lfoG.connect(padFilter.frequency); lfo.start();

    // wind: brown noise through a lowpass whose cutoff and level follow speed / warp
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(3); src.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = "lowpass"; windFilter.frequency.value = 200; windFilter.Q.value = 0.7;
    wind = ctx.createGain(); wind.gain.value = 0.0;
    src.connect(windFilter); windFilter.connect(wind); wind.connect(master); src.start();

    // warp sweep: a sawtooth, heavily filtered, whose pitch climbs with the warp curve
    sweep = ctx.createOscillator(); sweep.type = "sawtooth"; sweep.frequency.value = 40;
    const sf = ctx.createBiquadFilter(); sf.type = "lowpass"; sf.frequency.value = 600; sf.Q.value = 2;
    sweepGain = ctx.createGain(); sweepGain.gain.value = 0; sweep.connect(sf); sf.connect(sweepGain); sweepGain.connect(master); sweep.start();
  }
  function setOn(v) {
    on = v; try { localStorage.setItem(KEY, v ? "on" : "off"); } catch {}
    if (v) { build(); ctx.resume(); master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6); }
    else if (ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.25); }
    listeners.forEach(f => f(on));
  }
  const listeners = [];

  // one-shots
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
    warpStart() { tone(60, { type: "triangle", d: 1.2, g: 0.18, slide: 140 }); },
  };

  // continuous: call every frame with the ship's normalised speed (0..1) and the warp curve (0..1)
  function update(speed, warp) {
    if (!on || !ctx || ctx.state !== "running") return;
    const t = ctx.currentTime, k = 0.08;
    const s = Math.min(1, speed), w = Math.min(1, warp);
    wind.gain.setTargetAtTime(0.02 + s * 0.12 + w * 0.5, t, k);
    windFilter.frequency.setTargetAtTime(160 + s * 900 + w * 2600, t, k);
    sweepGain.gain.setTargetAtTime(w * w * 0.16, t, k);
    sweep.frequency.setTargetAtTime(40 + Math.pow(w, 1.5) * 520, t, k);
    padGain.gain.setTargetAtTime(0.05 * (1 - w * 0.7), t, k);
  }

  // browsers require a gesture before audio can start: if sound was remembered on, arm it on the first one
  if (remembered) { const arm = () => { setOn(true); removeEventListener("pointerdown", arm); removeEventListener("keydown", arm); }; addEventListener("pointerdown", arm); addEventListener("keydown", arm); }

  return { get on() { return on; }, remembered, toggle: () => setOn(!on), set: setOn, play, update, onChange: f => listeners.push(f) };
}
