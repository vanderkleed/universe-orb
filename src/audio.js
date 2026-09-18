// Sound is opt-in and remembered. Music and effects share a master gain for smooth toggles.
//   music     — the supplied background track, looped at a quiet level
//   wind      — brown noise whose level and brightness follow the ship's speed
//   warp      — the hyperspace jump, scheduled as one event and kept low and soft: a breath in,
//               a rounded thud at the flash, a slow exhale
//   tick      — a tiny blip when the scanner or a planet is hovered
//   select    — a soft two-note chime when you commit to a dataset or galaxy
//   arrive    — a brief, soft upper-register chime when the autopilot reaches its target
const KEY = "universe-orb:sound";

export function createAudio(opts = {}) {
  let ctx = opts.context || null, master = null, on = false, built = false;
  let wind = null, windFilter = null, musicGain = null, music = null, noise = null;
  let pauseTimer = null, lastTick = 0;
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

    music = document.createElement("audio");
    music.src = "/audio/background.mp3";
    music.loop = true;
    music.preload = "none";
    music.hidden = true;
    music.dataset.backgroundMusic = "";
    document.body.append(music);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.45; musicGain.connect(master);
    ctx.createMediaElementSource(music).connect(musicGain);
    music.addEventListener("error", () => console.warn("Background music could not load; sound effects remain available."));

    // wind: brown noise through a lowpass whose cutoff and level follow speed
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(3, true); src.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = "lowpass"; windFilter.frequency.value = 200; windFilter.Q.value = 0.7;
    wind = ctx.createGain(); wind.gain.value = 0.0;
    src.connect(windFilter); windFilter.connect(wind); wind.connect(master); src.start();
  }
  function setOn(v) {
    on = v; try { localStorage.setItem(KEY, v ? "on" : "off"); } catch {}
    clearTimeout(pauseTimer);
    if (v) {
      build();
      if (ctx.resume) ctx.resume().catch(() => {});
      music.play().catch(error => {
        if (error.name !== "AbortError") console.warn("Background music playback was blocked; toggle Sound to retry.");
      });
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
    } else if (master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      pauseTimer = setTimeout(() => { if (!on) music.pause(); }, 1500);
    }
    listeners.forEach(f => f(on));
  }
  const listeners = [];

  // helpers for one-shots
  function tone(f, { type = "sine", a = 0.005, d = 0.4, g = 0.2, at = 0, slide = null } = {}) {
    if (!on || !ctx) return; const t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.exponentialRampToValueAtTime(0.0005, t + d);
    o.connect(e); e.connect(master);
    o.onended = () => { o.disconnect(); e.disconnect(); };
    o.start(t); o.stop(t + d + 0.05);
  }
  const play = {
    tick() { if (!on || !ctx) return; const now = ctx.currentTime; if (now - lastTick < 0.06) return; lastTick = now; tone(2200 + Math.random() * 400, { d: 0.05, g: 0.035, a: 0.002 }); },
    select() { tone(523.25, { d: 0.5, g: 0.12 }); tone(783.99, { d: 0.7, g: 0.08, at: 0.09 }); },
    arrive() {
      tone(659.25, { a: 0.025, d: 0.45, g: 0.055 });
      tone(987.77, { a: 0.035, d: 0.65, g: 0.035, at: 0.12 });
    },
    contact() {
      tone(340, { a: 0.008, d: 0.38, g: 0.075, slide: 155 });
      tone(690, { a: 0.012, d: 0.28, g: 0.025, slide: 410 });
      tone(1010, { a: 0.004, d: 0.16, g: 0.009, slide: 720 });
    },
    open() { tone(880, { d: 0.25, g: 0.04, slide: 1320 }); },
    close() { tone(880, { d: 0.2, g: 0.03, slide: 660 }); },

    // The jump, kept low and soft so it stays pleasant across many jumps: a deep breath in (a sub
    // tone rising with a warm harmonic above it), a rounded thud at the flash, and a slow low exhale
    // as you drop out the other side. Nothing above ~600 Hz. T is the flight time; the flash is at T/2.
    warp(T = 2.4) {
      if (!on || !ctx) return;
      const t0 = ctx.currentTime, rise = Math.max(0.8, T * 0.5), mid = t0 + rise, end = mid + 1.6;
      const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master);

      // breath in: a sub sine gliding up an octave, with a filtered triangle a fifth above it
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.8; lp.frequency.setValueAtTime(220, t0); lp.frequency.exponentialRampToValueAtTime(520, mid); lp.frequency.exponentialRampToValueAtTime(160, end);
      const ig = ctx.createGain(); ig.gain.setValueAtTime(0.0001, t0); ig.gain.exponentialRampToValueAtTime(0.42, mid); ig.gain.setValueAtTime(0.42, mid + 0.05); ig.gain.exponentialRampToValueAtTime(0.0001, end);
      lp.connect(ig); ig.connect(bus);
      [[1, "sine", 1], [1.5, "triangle", 0.35], [2, "sine", 0.18]].forEach(([k, type, g]) => {
        const o = ctx.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(44 * k, t0); o.frequency.exponentialRampToValueAtTime(88 * k, mid); o.frequency.exponentialRampToValueAtTime(50 * k, end);
        const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(lp); o.start(t0); o.stop(end + 0.1);
      });

      // the thud at the flash: a rounded sine drop and a puff of low air
      const b = ctx.createOscillator(); b.type = "sine"; b.frequency.setValueAtTime(74, mid); b.frequency.exponentialRampToValueAtTime(34, mid + 0.5);
      const bg = ctx.createGain(); bg.gain.setValueAtTime(0.0001, mid - 0.01); bg.gain.linearRampToValueAtTime(0.55, mid + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, mid + 0.8);
      b.connect(bg); bg.connect(bus); b.start(mid - 0.01); b.stop(mid + 0.9);

      // breath out: low-passed noise that opens briefly at the flash and settles
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const nl = ctx.createBiquadFilter(); nl.type = "lowpass"; nl.Q.value = 0.7; nl.frequency.setValueAtTime(140, t0); nl.frequency.exponentialRampToValueAtTime(600, mid + 0.05); nl.frequency.exponentialRampToValueAtTime(120, end);
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t0); ng.gain.exponentialRampToValueAtTime(0.05, mid - 0.02); ng.gain.linearRampToValueAtTime(0.32, mid + 0.06); ng.gain.exponentialRampToValueAtTime(0.0001, end);
      n.connect(nl); nl.connect(ng); ng.connect(bus); n.start(t0); n.stop(end + 0.1);
    },
  };

  // continuous: call every frame with the ship's normalised speed (0..1) and the warp curve (0..1)
  function update(speed, warp) {
    if (!on || !ctx || ctx.state !== "running") return;
    const t = ctx.currentTime, k = 0.08;
    const s = Math.min(1, speed), w = Math.min(1, warp);
    wind.gain.setTargetAtTime(s * 0.12 + w * 0.1, t, k);
    windFilter.frequency.setTargetAtTime(160 + s * 900 + w * 600, t, k);
    musicGain.gain.setTargetAtTime(0.45 * (1 - w * 0.3), t, 0.3);
  }

  // browsers require a gesture before audio can start: if sound was remembered on, arm it on the first one
  if (remembered && !opts.context) { const arm = () => { setOn(true); removeEventListener("pointerdown", arm); removeEventListener("keydown", arm); }; addEventListener("pointerdown", arm); addEventListener("keydown", arm); }

  return { get on() { return on; }, remembered, toggle: () => setOn(!on), set: setOn, play, update, onChange: f => listeners.push(f), get context() { return ctx; } };
}
