import { createIntroBadge } from "./intro-badge.js";

// Opening: the metallic Universe badge spins into place over a quiet field of stars,
// then the screen fades straight into the flight once the scene is ready. Any click or key skips ahead.
const CSS = `
.uo-intro{position:fixed;inset:0;z-index:1000;background:var(--ground);color:var(--ink);transition:opacity .9s cubic-bezier(.4,0,.2,1);isolation:isolate;display:flex;align-items:center;justify-content:center;cursor:pointer}
.uo-intro.out{opacity:0;pointer-events:none}
.uo-intro>canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1}
.uo-intro .entry-badge{position:relative;width:min(560px,calc(100vw - 40px));height:clamp(150px,24vh,270px);flex-shrink:0}
.uo-intro .entry-badge img{width:100%;height:100%;object-fit:contain;filter:grayscale(1);transition:opacity .2s}
.uo-intro .entry-badge canvas{position:absolute;left:0;width:100%;z-index:0;top:-50%;height:200%}
.uo-intro .entry-badge.badge-ready img{opacity:0}
.uo-intro .entry-wait{position:absolute;left:0;right:0;bottom:max(40px,env(safe-area-inset-bottom));text-align:center;font:11px/1.5 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mute);opacity:0;transition:opacity .8s}
.uo-intro .entry-wait.show{opacity:1}
@media(prefers-reduced-motion:reduce){.uo-intro{transition:opacity .3s}}
`;
// seconds: the badge's spin settles at ~3.45s; hold a beat, then hand off
const HOLD = 4.1, REDUCED_HOLD = 1.2;

export function playIntro({ onDone = () => {}, ready = Promise.resolve(), mount = document.body } = {}) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.getElementById("uo-intro-css")) {
    const style = document.createElement("style"); style.id = "uo-intro-css"; style.textContent = CSS; document.head.appendChild(style);
  }
  const root = document.createElement("section");
  root.className = "uo-intro";
  root.setAttribute("aria-label", "Roboflow Universe");
  root.innerHTML = `<canvas aria-hidden="true"></canvas><div class="entry-badge" role="img" aria-label="Roboflow Universe"><img src="/images/roboflow-logomark.svg" alt="" width="2501" height="2500"></div><p class="entry-wait" aria-live="polite">Loading datasets</p>`;
  document.body.classList.add("title-open");
  mount.appendChild(root);
  const canvas = root.querySelector("canvas"), context = canvas.getContext("2d");
  const badge = createIntroBadge(root.querySelector(".entry-badge"), reduce);
  let width = 0, height = 0, raf = 0, started = null, finished = false, timer = 0, fallback = 0;
  // Leave only when the hold is over (or the visitor skips) AND the universe behind is built.
  let isReady = false, wantExit = false;
  const hold = (reduce ? REDUCED_HOLD : HOLD) * 1000, t0 = performance.now();
  const wait = root.querySelector(".entry-wait");
  function request() { wantExit = true; if (isReady) enter(); }
  ready.then(() => {
    isReady = true;
    if (wantExit) enter();
    // rAF can be paused in background tabs; never leave a visitor stuck on the badge
    else fallback = setTimeout(enter, Math.max(0, hold - (performance.now() - t0)) + 2500);
  });

  const stars = Array.from({ length: matchMedia("(max-width:720px)").matches ? 420 : 900 }, () => ({
    a: Math.random() * Math.PI * 2, r: Math.pow(Math.random(), .65) * .95,
    size: .4 + Math.random() * 1.1, phase: Math.random() * Math.PI * 2,
  }));
  function draw(time = performance.now()) {
    if (finished) return;
    if (started === null) started = time;
    const seconds = (time - started) / 1000;
    badge.update(reduce ? 10 : seconds);
    if (context) {
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(root).color;
      for (const star of stars) {
        const radius = Math.max(width, height) * star.r;
        context.globalAlpha = .12 + .35 * (reduce ? .5 : .5 + .5 * Math.sin(seconds * .35 + star.phase));
        context.beginPath(); context.arc(width / 2 + Math.cos(star.a) * radius, height / 2 + Math.sin(star.a) * radius * .7, star.size, 0, Math.PI * 2); context.fill();
      }
      context.globalAlpha = 1;
    }
    if (seconds >= (reduce ? REDUCED_HOLD : HOLD)) { request(); if (finished) return; }
    if (!isReady && seconds >= HOLD + 1.5) wait.classList.add("show");
    raf = requestAnimationFrame(draw);
  }
  function size() {
    width = root.clientWidth; height = root.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = width * dpr; canvas.height = height * dpr;
    context?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function cleanup() {
    cancelAnimationFrame(raf); clearTimeout(timer); clearTimeout(fallback); removeEventListener("resize", size); removeEventListener("keydown", onKey, true);
    badge.dispose(); root.remove();
    document.body.classList.remove("title-open");
    document.getElementById("gl")?.focus({ preventScroll: true });
  }
  function enter() {
    if (finished) return;
    finished = true; root.classList.add("out");
    cancelAnimationFrame(raf); removeEventListener("keydown", onKey, true);
    document.body.classList.remove("title-open");
    onDone();
    timer = setTimeout(cleanup, reduce ? 300 : 900);
  }
  function onKey(e) { e.stopPropagation(); if (!e.metaKey && !e.ctrlKey) request(); }
  root.addEventListener("pointerdown", request);
  addEventListener("keydown", onKey, true);
  size(); addEventListener("resize", size);
  raf = requestAnimationFrame(draw);
  return { skip: enter, destroy: () => { const notify = !finished; finished = true; cleanup(); if (notify) onDone(); } };
}
