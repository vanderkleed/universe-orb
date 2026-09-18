import { createIntroBadge } from "./intro-badge.js";

// Universe title sequence — self-contained.
// Mounts above the scene; the visitor starts the arrival flight with Explore.
const CSS = `
.uo-intro{position:fixed;inset:0;z-index:1000;background:var(--ground);color:var(--ink);overflow:auto;transition:opacity .65s ease;isolation:isolate}
.uo-intro.out{opacity:0;pointer-events:none}
.uo-intro canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1}
.uo-intro .entry-layout{box-sizing:border-box;min-height:100%;min-height:100svh;display:flex;flex-direction:column;justify-content:space-between;padding:max(28px,env(safe-area-inset-top)) max(28px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(28px,env(safe-area-inset-left))}
.uo-intro .entry-header,.uo-intro .entry-footer{display:flex;align-items:center;justify-content:space-between;gap:24px;font:14px/1.5 var(--sans);color:var(--mute)}
.uo-intro .entry-brand{display:block;width:104px;height:auto;filter:invert(1)}
.uo-intro .entry-center{display:flex;flex-direction:column;align-items:center;gap:28px;text-align:center;padding:64px 0}
.uo-intro .entry-lockup{display:flex;align-items:baseline;gap:12px;color:var(--ink);font:500 22px/1 var(--sans)}
/* Match the wordmark's 240-unit x-height and 8-unit baseline inset at 104px wide. */
.uo-intro .entry-lockup span{font-size-adjust:.5174;letter-spacing:.01em;transform:translateY(-.38px)}
.uo-intro h1{font:300 clamp(32px,5.4vw,60px)/1.15 var(--sans);text-transform:uppercase;letter-spacing:.14em;text-indent:.14em;margin:0;text-wrap:balance}
.uo-intro .entry-description.entry-description-desktop{width:var(--entry-copy-width,640px);max-width:100%}
.uo-intro:not(.intro-revealed) .entry-header,.uo-intro:not(.intro-revealed) .entry-footer,.uo-intro:not(.intro-revealed) .entry-center>:not(.entry-badge){visibility:hidden;opacity:0}
.uo-intro.intro-revealed .entry-header,.uo-intro.intro-revealed .entry-footer,.uo-intro.intro-revealed .entry-center>:not(.entry-badge){animation:entry-reveal 1.5s cubic-bezier(.25,.1,.25,1) both}
.uo-intro.intro-revealed .entry-description{animation-delay:.2s}
.uo-intro.intro-revealed .entry-facts{animation-delay:.4s}
.uo-intro.intro-revealed .entry-button{animation-delay:.6s}
.uo-intro.intro-revealed .entry-footer{animation-delay:.8s}
@keyframes entry-reveal{from{clip-path:inset(100% -4px 0);transform:translateY(20px)}to{clip-path:inset(-4px -4px -4px);transform:translateY(0)}}
.uo-intro .entry-badge{position:relative;width:min(560px,100%);height:clamp(150px,24vh,270px);flex-shrink:0}
.uo-intro .entry-badge img{width:100%;height:100%;object-fit:contain;filter:grayscale(1);transition:opacity .2s}
.uo-intro .entry-badge canvas{z-index:0;top:-50%;height:200%}
.uo-intro .entry-badge.badge-ready img{opacity:0}
.uo-intro .entry-description{font:400 14px/1.6 var(--mono);color:var(--mute);width:100%;max-width:76ch;margin:0;text-align:left;text-wrap:pretty}
.uo-intro .entry-button{position:relative;font:500 16px/1.5 var(--sans);background:transparent;color:var(--ink);border:0;border-radius:0;min-height:52px;min-width:200px;padding:0 24px;cursor:pointer}
.uo-intro .entry-button-frame{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;fill:transparent;stroke:currentColor;stroke-width:.75;transition:fill .2s}
.uo-intro .entry-button:hover .entry-button-frame{fill:var(--hair)}
.uo-intro .entry-button:focus-visible{outline:none}
.uo-intro .entry-button:focus-visible .entry-button-frame{stroke-width:1;fill:var(--hair)}
.uo-intro .entry-facts{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 20px;font:14px/1.5 var(--mono);color:var(--mute)}
.uo-intro .entry-facts strong{font-weight:400;color:var(--ink);font-variant-numeric:tabular-nums}
.uo-intro .entry-count{display:inline-block;min-width:7ch;text-align:right}
.uo-intro .entry-mobile-hint,.uo-intro .entry-description-mobile{display:none}
.uo-intro .entry-description-mobile p{margin:0}
.uo-intro .entry-description-mobile summary{color:var(--ink);cursor:pointer;min-height:44px;display:flex;align-items:center;justify-content:center;list-style:none;text-decoration:underline;text-underline-offset:4px}
.uo-intro .entry-description-mobile summary::-webkit-details-marker{display:none}
.uo-intro .entry-description-mobile summary:focus-visible{outline:1px solid var(--ink);outline-offset:2px}
.uo-intro .entry-read-less,.uo-intro details[open] .entry-read-more{display:none}
.uo-intro details[open] .entry-read-less{display:inline}
@media(max-width:720px){
 .uo-intro .entry-layout{padding:max(20px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))}
 .uo-intro .entry-header{gap:12px}
 .uo-intro .entry-center{gap:24px;padding:28px 0}
 .uo-intro .entry-badge{height:clamp(140px,23svh,210px)}
 .uo-intro h1{font-size:clamp(28px,7vw,44px);max-width:16ch;letter-spacing:.12em;text-indent:.12em}
 .uo-intro .entry-description{max-width:38ch;text-align:center;text-wrap:pretty}.uo-intro .entry-description-desktop{display:none}.uo-intro .entry-description-mobile{display:block}.uo-intro .entry-button{min-width:220px}
 .uo-intro .entry-footer{flex-direction:column;gap:8px;justify-content:center;text-align:center}.uo-intro .entry-desktop-hint{display:none}.uo-intro .entry-mobile-hint{display:inline}
}
@media(prefers-reduced-motion:reduce){.uo-intro,.uo-intro .entry-button{transition:none}.uo-intro.intro-revealed .entry-header,.uo-intro.intro-revealed .entry-footer,.uo-intro.intro-revealed .entry-center>:not(.entry-badge){animation:none}}
`;
const description = "Every point of light is a dataset. Per Data Ad Astra is a flyable map of Roboflow Universe: 330,000 public datasets rendered as stars, gathered into 18 galaxies by subject, from medical imaging to agriculture to sports. Fly toward anything and the nearest datasets resolve into image orbs you can open, with sample images, class breakdowns and a link straight to the dataset. The catalog rebuilds nightly from Universe itself, so it is never a snapshot; it is the live shape of what the computer vision community has built, one contribution at a time.";
const fmt = n => Math.round(n).toLocaleString("en-US");

export function playIntro({ total = 330601, galaxies = 18, onDone = () => {}, mount = document.body } = {}) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.getElementById("uo-intro-css")) {
    const style = document.createElement("style"); style.id = "uo-intro-css"; style.textContent = CSS; document.head.appendChild(style);
  }
  const root = document.createElement("section");
  root.className = "uo-intro";
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-labelledby", "entry-title");
  root.innerHTML = `<canvas aria-hidden="true"></canvas><div class="entry-layout">
    <header class="entry-header"><div class="entry-lockup"><img class="entry-brand" src="/images/roboflow-wordmark-black.svg" alt="Roboflow" width="132" height="24"><span>universe</span></div></header>
    <div class="entry-center"><div class="entry-badge" role="img" aria-label="Metallic Roboflow Universe badge"><img src="/images/roboflow-logomark.svg" alt="" width="2501" height="2500"></div><h1 id="entry-title">per data ad astra</h1>
      <p class="entry-description entry-description-desktop">${description}</p>
      <div class="entry-description entry-description-mobile">
        <p>Every point of light is a dataset. Fly through 330,000 public datasets across 18 galaxies. Discover images, explore classes, and open any dataset. Rebuilt nightly from Roboflow Universe.</p>
        <details><summary><span class="entry-read-more">Read more</span><span class="entry-read-less">Read less</span></summary><p>${description}</p></details>
      </div>
      <div class="entry-facts"><span role="img" aria-label="${fmt(total)} public datasets"><strong class="entry-count" aria-hidden="true">${fmt(total)}</strong> <span aria-hidden="true">datasets</span></span><span><strong>${fmt(galaxies)}</strong> galaxies</span></div>
      <button type="button" class="entry-button"><svg class="entry-button-frame" viewBox="0 0 200 52" preserveAspectRatio="none" aria-hidden="true" focusable="false"><polygon points="9,1 191,1 199,9 199,43 191,51 9,51 1,43 1,9" vector-effect="non-scaling-stroke" /></svg>Explore <span aria-hidden="true">↗</span></button>
    </div>
    <footer class="entry-footer"><span>Real datasets. Endless discovery.</span><span class="entry-desktop-hint">Drag to look · Click to travel</span><span class="entry-mobile-hint">Drag to look · Tap to travel</span></footer>
  </div>`;
  const siblings = [...mount.children].filter(el => el instanceof HTMLElement && !["SCRIPT", "STYLE"].includes(el.tagName));
  const inertState = siblings.map(el => el.inert);
  siblings.forEach(el => { el.inert = true; });
  document.body.classList.add("title-open");
  mount.appendChild(root);
  const button = root.querySelector("button"), counter = root.querySelector(".entry-count");
  const canvas = root.querySelector("canvas"), context = canvas.getContext("2d");
  const badgeHost = root.querySelector(".entry-badge");
  const badge = createIntroBadge(badgeHost, reduce);
  root.tabIndex = -1;
  let width = 0, height = 0, raf = 0, started = null, finished = false, timer = 0;
  let centerOffset = 0, currentShift = 0, revealed = false;
  function reveal() {
    if (revealed || finished) return;
    revealed = true;
    root.classList.add("intro-revealed");
    button.focus({ preventScroll: true });
  }
  // Polar positions survive a viewport rotation without respawning the field.
  const stars = Array.from({ length: matchMedia("(max-width:720px)").matches ? 420 : 900 }, () => ({
    a: Math.random() * Math.PI * 2, r: Math.pow(Math.random(), .65) * .95,
    size: .4 + Math.random() * 1.1, phase: Math.random() * Math.PI * 2,
  }));
  function draw(time = 0) {
    if (!context) return;
    if (started === null) started = time;
    const seconds = reduce ? 10 : (time - started) / 1000;
    const slide = Math.max(0, Math.min(1, (seconds - 3.5) / 2));
    const easedSlide = slide * slide * slide * (slide * (slide * 6 - 15) + 10);
    currentShift = centerOffset * (1 - easedSlide);
    badgeHost.style.transform = `translateY(${currentShift}px)`;
    if (seconds >= 5.05) reveal();
    badge.update(seconds);
    context.clearRect(0, 0, width, height);
    const color = getComputedStyle(root).color;
    context.fillStyle = color;
    for (const star of stars) {
      const radius = Math.max(width, height) * star.r;
      context.globalAlpha = .12 + .35 * (reduce ? .5 : .5 + .5 * Math.sin(seconds * .35 + star.phase));
      context.beginPath(); context.arc(width / 2 + Math.cos(star.a) * radius, height / 2 + Math.sin(star.a) * radius * .7, star.size, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    const progress = Math.max(0, Math.min(1, (seconds - 5.45) / 2));
    counter.textContent = fmt(total * (1 - Math.pow(1 - progress, 3)));
    if (!reduce && !finished) raf = requestAnimationFrame(draw);
  }
  function size() {
    width = root.clientWidth; height = root.clientHeight;
    root.style.setProperty("--entry-copy-width", `${root.querySelector("h1").offsetWidth}px`);
    const bounds = badgeHost.getBoundingClientRect();
    centerOffset = height / 2 - (bounds.top - currentShift + bounds.height / 2);
    if (started === null && !reduce) {
      currentShift = centerOffset;
      badgeHost.style.transform = `translateY(${currentShift}px)`;
    }
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = width * dpr; canvas.height = height * dpr;
    context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduce) draw();
  }
  function restore() {
    siblings.forEach((el, i) => { el.inert = inertState[i]; });
    document.body.classList.remove("title-open");
  }
  function cleanup() {
    cancelAnimationFrame(raf); clearTimeout(timer); removeEventListener("resize", size);
    badge.dispose(); root.remove(); restore();
    document.getElementById("gl")?.focus({ preventScroll: true });
  }
  function enter() {
    if (finished) return;
    finished = true; button.disabled = true; root.classList.add("out");
    cancelAnimationFrame(raf);
    onDone();
    timer = setTimeout(cleanup, reduce ? 0 : 650);
  }
  button.addEventListener("click", enter);
  root.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Tab") {
      const focusable = [...root.querySelectorAll("summary, button:not(:disabled)")].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
      const index = focusable.indexOf(document.activeElement);
      e.preventDefault();
      focusable[(index + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
    }
    if (e.key === "Escape") enter();
  });
  size(); addEventListener("resize", size);
  document.fonts.ready.then(() => { if (!finished) size(); });
  if (!reduce) raf = requestAnimationFrame(draw);
  if (!reduce) root.focus({ preventScroll: true });
  return { skip: enter, destroy: () => { const notify = !finished; finished = true; cleanup(); if (notify) onDone(); } };
}
