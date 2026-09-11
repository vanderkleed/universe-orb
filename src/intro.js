// Universe title sequence — self-contained, no dependencies.
//
//   import { playIntro } from "./intro.js";
//   playIntro({ total: 330601, galaxies: 18, onDone: () => startArrivalFlight() });
//
// Mounts a full-screen overlay above whatever is underneath, holds the title, then dissolves.
// onDone fires as the dissolve starts (~6.2s) so the arrival flight can begin underneath it.
// Click or any key skips. prefers-reduced-motion gets a quiet title fade. Plays the full sequence on
// a visitor's first visit and a short title-only version afterwards (localStorage) — pass
// { force: true } to always play it in full.
//
// React:  useEffect(() => { playIntro({ total, galaxies, onDone }); }, []);

const CSS = `
.uo-intro{position:fixed;inset:0;z-index:1000;background:#000000;overflow:hidden;cursor:default;transition:opacity 1.1s ease}
.uo-intro.out{opacity:0;pointer-events:none}
.uo-intro canvas{position:absolute;inset:0;width:100%;height:100%}
.uo-intro .t{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none;color:#F4F2EC}
.uo-intro .n{font-family:"Geist Mono",ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;font-weight:500;font-size:clamp(34px,6vw,76px);letter-spacing:-0.01em;line-height:1;opacity:0}
.uo-intro .l{font-family:"Geist Mono",ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(244,242,236,.5);margin-top:16px;opacity:0}
.uo-intro .w{position:absolute;font-family:"Suisse Intl",Inter,-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;font-weight:300;text-transform:uppercase;font-size:clamp(34px,5.6vw,78px);line-height:1;letter-spacing:.6em;opacity:0;transform:translateY(6px);margin-left:.6em}
.uo-intro .s{position:absolute;margin-top:clamp(62px,9vw,120px);font-family:"Geist Mono",ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(244,242,236,.55);opacity:0}
.uo-intro .skip{position:absolute;right:22px;bottom:18px;font-family:"Geist Mono",ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:rgba(244,242,236,.28);opacity:0;transition:opacity .8s}
`;

const ease = { outExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)), inOutCubic: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2), outCubic: x => 1 - Math.pow(1 - x, 3), inCubic: x => x * x * x };
const fmt = n => Math.round(n).toLocaleString("en-US");
const clamp01 = x => Math.max(0, Math.min(1, x));

export function playIntro({ total = 330601, galaxies = 18, onDone = () => {}, mount = document.body, force = false, storageKey = "universe-orb:intro" } = {}) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let seen = false; try { seen = !!localStorage.getItem(storageKey); } catch {}
  const short = reduce || (seen && !force);
  try { localStorage.setItem(storageKey, "1"); } catch {}

  if (!document.getElementById("uo-intro-css")) { const st = document.createElement("style"); st.id = "uo-intro-css"; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement("div"); root.className = "uo-intro"; root.setAttribute("aria-label", "Universe");
  root.innerHTML = `<canvas></canvas><div class="t"><div class="n" aria-hidden="true">1</div><div class="l">datasets</div><div class="w">Universe</div><div class="s">Roboflow &nbsp;·&nbsp; ${fmt(total)} datasets &nbsp;·&nbsp; ${galaxies} galaxies</div></div><div class="skip">click to skip</div>`;
  mount.appendChild(root);
  const cv = root.querySelector("canvas"), ctx = cv.getContext("2d");
  const nEl = root.querySelector(".n"), lEl = root.querySelector(".l"), wEl = root.querySelector(".w"), sEl = root.querySelector(".s"), skipEl = root.querySelector(".skip");

  // timeline (seconds)
  const T = short
    ? { dot: 0, countStart: 0, countEnd: 0, title: 0.1, titleIn: 0.9, warp: 2.6, done: 2.6, end: 3.7 }
    : { dot: 0.2, countStart: 0.9, countEnd: 3.3, title: 3.45, titleIn: 1.0, warp: 6.05, done: 6.2, end: 7.45 };

  let W = 0, H = 0, dpr = 1;
  function size() { dpr = Math.min(devicePixelRatio || 1, 2); W = root.clientWidth; H = root.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  size(); addEventListener("resize", size);

  // the field: specks accumulate as the count climbs, scattered in a soft gaussian around centre
  const MAXDOTS = 2400; const dots = [];
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };
  // each speck is polar (angle, radius as a fraction of the short side); resolved per frame so resize and warp are free
  function spawn(t) { dots.push({ a: Math.random() * 6.2831853, g: Math.abs(gauss()) * 0.34 + 0.02, born: t, s: 0.6 + Math.random() * 1.1, tw: Math.random() * 6.28 }); }
  function place(d, warpK) { const r = Math.min(W, H) * (d.g + warpK * (0.9 + d.g * 3)); return [W / 2 + Math.cos(d.a) * r, H / 2 + Math.sin(d.a) * r]; }

  let start = null, skipped = false, finished = false, doneFired = false, raf = 0;
  const skip = () => { if (skipped || finished) return; skipped = true; };
  root.addEventListener("pointerdown", skip); const onKey = () => skip(); addEventListener("keydown", onKey);
  setTimeout(() => { skipEl.style.opacity = 1; }, 1400);

  function frame(now) {
    clearTimeout(fallback); cancelAnimationFrame(raf);
    if (start === null) start = now;
    let t = (now - start) / 1000;
    if (skipped && t < T.warp) { start = now - T.warp * 1000; t = T.warp; skipped = false; }
    // The short intro skips counting, so its zero-length count phase is already complete.
    const countK = short ? 1 : clamp01((t - T.countStart) / (T.countEnd - T.countStart));
    // counts like something counting: single digits at first, then a surge, then a firm landing on the total
    const ck = countK < 0.5 ? 8 * Math.pow(countK, 4) : 1 - Math.pow(-2 * countK + 2, 4) / 2;
    const count = short ? total : 1 + (total - 1) * ck;
    const warpK = t < T.warp ? 0 : ease.inCubic(clamp01((t - T.warp) / (T.end - T.warp)));

    // spawn specks in step with the count (capped; the count keeps climbing past the cap)
    if (!short) { const want = Math.min(MAXDOTS, Math.floor(Math.pow(count / total, 0.8) * MAXDOTS)); while (dots.length < want) spawn(t); }
    else if (!dots.length) { for (let i = 0; i < 900; i++) spawn(-2); }

    ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, H);
    // vignette-ish glow at centre while the field forms
    const glow = (1 - warpK) * (0.05 + 0.08 * countK);
    const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.42);
    rg.addColorStop(0, `rgba(244,242,236,${glow.toFixed(3)})`); rg.addColorStop(1, "rgba(244,242,236,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    // the first light
    if (t >= T.dot) { const k = ease.outCubic(clamp01((t - T.dot) / 0.7)); const pulse = 0.85 + 0.15 * Math.sin(t * 3); ctx.beginPath(); ctx.arc(W / 2, H / 2, (1.6 + 1.2 * k) * pulse, 0, 6.2832); ctx.fillStyle = `rgba(244,242,236,${(0.95 * k * (1 - warpK)).toFixed(3)})`; ctx.fill(); }

    // specks: brief flare at birth, then a quiet twinkle; during the warp they streak outward
    ctx.lineCap = "round";
    for (const d of dots) {
      const age = t - d.born; const flare = Math.exp(-age * 3.5);
      const tw = 0.55 + 0.45 * Math.sin(t * 1.3 + d.tw);
      const alpha = (0.28 + 0.5 * flare) * tw * (1 - warpK * 0.35);
      const [x, y] = place(d, warpK);
      if (warpK > 0.01) {
        const [px, py] = place(d, Math.max(0, warpK - 0.07 - warpK * 0.35));
        ctx.strokeStyle = `rgba(244,242,236,${(alpha * 0.9).toFixed(3)})`; ctx.lineWidth = d.s * (0.9 + warpK); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(x, y, d.s * (0.55 + 0.9 * flare), 0, 6.2832); ctx.fillStyle = `rgba(244,242,236,${alpha.toFixed(3)})`; ctx.fill();
      }
    }

    // type
    if (!short) {
      const nIn = ease.outCubic(clamp01((t - T.countStart + 0.15) / 0.6)), nOut = ease.inOutCubic(clamp01((t - T.title + 0.05) / 0.55));
      nEl.textContent = fmt(count); nEl.style.opacity = (nIn * (1 - nOut)).toFixed(3); nEl.style.transform = `translateY(${(-8 * nOut).toFixed(1)}px)`;
      lEl.style.opacity = (ease.outCubic(clamp01((t - T.countStart - 0.4) / 0.8)) * (1 - nOut)).toFixed(3);
    }
    const wk = ease.outCubic(clamp01((t - T.title) / T.titleIn));
    const fade = 1 - ease.inCubic(clamp01((t - T.warp - 0.35) / (T.end - T.warp - 0.35)));
    wEl.style.opacity = (wk * fade).toFixed(3); wEl.style.letterSpacing = (0.6 - 0.24 * wk).toFixed(3) + "em"; wEl.style.marginLeft = (0.6 - 0.24 * wk).toFixed(3) + "em"; wEl.style.transform = `translateY(${(6 - 6 * wk).toFixed(2)}px)`;
    sEl.style.opacity = (ease.outCubic(clamp01((t - T.title - 0.45) / 0.8)) * fade).toFixed(3);

    if (t >= T.done && !doneFired) { doneFired = true; root.classList.add("out"); try { onDone(); } catch {} }
    if (t >= T.end + 0.2) { finished = true; cleanup(); return; }
    schedule();
  }
  // frames drive the sequence; a timer fallback keeps the clock moving in throttled or hidden tabs so
  // nobody is ever parked on the overlay
  let fallback = 0;
  function schedule() { raf = requestAnimationFrame(frame); fallback = setTimeout(() => { cancelAnimationFrame(raf); frame(performance.now()); }, 120); }
  function cleanup() { cancelAnimationFrame(raf); clearTimeout(fallback); removeEventListener("keydown", onKey); removeEventListener("resize", size); root.remove(); }
  schedule();
  return { skip, destroy: () => { finished = true; cleanup(); if (!doneFired) { doneFired = true; onDone(); } } };
}
