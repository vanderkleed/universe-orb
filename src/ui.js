// HUD, rail, labels, scanner labels and the dataset drawer.
import { fmt, esc, prettyName, prettyWs, monthName, TYPE, thumbUrl, originalUrl, imageryFor, detailFor } from "./data.js";

const $ = id => document.getElementById(id);

export function buildRail(manifest, layout, onGalaxy) {
  const rail = $("rail"), strip = $("strip");
  rail.innerHTML = `<div class="h">Galaxies</div>` + layout.domains.map(k => `<button data-d="${k}"><i>${fmt(manifest.galaxies[k].n)}</i>${k}</button>`).join("")
    + `<div class="h" style="margin-top:12px">Interstellar</div><div style="color:var(--dim);display:flex;gap:10px"><i style="font-style:normal;min-width:6ch;text-align:right">${fmt(manifest.galaxies.Uncharted?.n || 0)}</i>uncharted</div>`;
  strip.innerHTML = layout.domains.map(k => `<button data-d="${k}">${k}</button>`).join("");
  document.querySelectorAll("[data-d]").forEach(b => b.addEventListener("click", () => onGalaxy(b.dataset.d)));
  $("stats").innerHTML = `<span><b>${fmt(manifest.total)}</b> datasets</span><span><b>${layout.domains.length}</b> galaxies</span><span><b>${fmt(manifest.imaged)}</b> with imagery</span>`;
}
export function markDom(k) { document.querySelectorAll("[data-d]").forEach(b => b.classList.toggle("on", b.dataset.d === k)); }

export function makeLabels(layout, manifest) {
  const els = {};
  layout.domains.forEach(k => { const el = document.createElement("div"); el.className = "dlabel"; el.innerHTML = `${k}<small>${fmt(manifest.galaxies[k].n)}</small>`; document.body.appendChild(el); els[k] = el; });
  return els;
}
export function makeScanPool(n) {
  const pool = []; for (let i = 0; i < n; i++) { const el = document.createElement("div"); el.className = "slabel"; document.body.appendChild(el); pool.push(el); } return pool;
}

export const readout = {
  last: null,
  set(key, name, meta) { const k = key + name + meta; if (k === this.last) return; this.last = k; $("ro-k").textContent = key; $("ro-name").textContent = name; $("ro-meta").innerHTML = meta; },
  range(v) { $("rng").textContent = v; },
  sector(v) {
    $("sec").textContent = v;
    const location = selected ? (selected.galaxy === "Uncharted" ? "Interstellar" : selected.galaxy) : v;
    if ($("location-name").textContent !== location) $("location-name").textContent = location;
  },
};
export const tag = {
  el: $("tag"),
  show(html, x, y) { this.el.innerHTML = html; this.el.style.opacity = 1; this.move(x, y); },
  move(x, y) { this.el.style.left = x + "px"; this.el.style.top = y + "px"; },
  hide() { this.el.style.opacity = 0; },
};

export function setExploration(open) {
  document.body.classList.toggle("exploration-open", open);
  $("explore-toggle").setAttribute("aria-expanded", String(open));
  $("explore-toggle").textContent = open ? "Hide controls" : "Explore";
}
$("explore-toggle").addEventListener("click", () => setExploration(!document.body.classList.contains("exploration-open")));

let selected = null, orbitRadius = null;
export function showSelection(star) {
  selected = star;
  orbitRadius = null;
  const name = prettyName(star.slug);
  $("selection-title").textContent = name + " · by " + prettyWs(star.slug);
  $("selection-details").setAttribute("aria-label", "Details for " + name);
  $("selection-open").href = "https://universe.roboflow.com/" + star.slug;
  $("selection").hidden = false;
  document.body.classList.add("has-selection");
}
function fitOrbitText(text, length, font, tracking) {
  const context = orbitMeasure.getContext("2d");
  context.font = font;
  const width = value => context.measureText(value).width + Array.from(value).length * tracking;
  if (width(text) <= length) return text;
  const characters = Array.from(text);
  while (characters.length && width(characters.join("") + "…") > length) characters.pop();
  return characters.join("") + "…";
}
const orbitMeasure = document.createElement("canvas");
export function clearSelection() {
  const hadFocus = $("selection").contains(document.activeElement);
  selected = null;
  $("selection").hidden = true;
  document.body.classList.remove("has-selection");
  closeDrawer();
  if (hadFocus) $("gl").focus({ preventScroll: true });
}
export function placeSelection(x, y, radius, visible) {
  if (!selected) return;
  const el = $("selection");
  el.classList.toggle("offscreen", !visible);
  el.style.setProperty("--orb-x", `${x}px`);
  el.style.setProperty("--orb-y", `${y}px`);
  // Never clamp a ring inward to fit the viewport: the orb surface stays clear at every zoom.
  const r = Math.ceil(Math.max(86, radius + 36));
  if (orbitRadius !== r) {
    orbitRadius = r;
    const menuRadius = r + 52, extent = menuRadius + 28;
    el.style.setProperty("--orbit-size", `${extent * 2}px`);
    el.querySelectorAll("svg").forEach(svg => svg.setAttribute("viewBox", `${-extent} ${-extent} ${extent * 2} ${extent * 2}`));
    $("selection-name-path").setAttribute("d", `M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`);
    $("selection-by-path").setAttribute("d", `M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0`);
    const font = getComputedStyle(el).fontFamily;
    $("selection-name").textContent = fitOrbitText(prettyName(selected.slug).toUpperCase(), Math.PI * r * .9, `16px ${font}`, 2.8);
    $("selection-by").textContent = fitOrbitText(("by " + prettyWs(selected.slug)).toUpperCase(), Math.PI * r * .8, `14px ${font}`, 2);
    ["details", "open", "leave"].forEach((action, index) => {
      const angle = 144 - index * 54, half = 23;
      const point = degrees => `${menuRadius * Math.cos(degrees * Math.PI / 180)} ${menuRadius * Math.sin(degrees * Math.PI / 180)}`;
      $("orbit-" + action + "-path").setAttribute("d", `M ${point(angle + half)} A ${menuRadius} ${menuRadius} 0 0 0 ${point(angle - half)}`);
    });
  }
}
$("selection-details").addEventListener("click", () => { if (selected) openDrawer(selected); });
$("selection-leave").addEventListener("click", () => window.dispatchEvent(new CustomEvent("orb:release")));

/* ---------- drawer ---------- */
const drawer = $("drawer"), body = $("dr-body"), fig = $("fig");
let current = null;
drawer.inert = true;
$("gl").tabIndex = -1;
export function closeDrawer() {
  const hadFocus = drawer.contains(document.activeElement);
  current = null; drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); drawer.inert = true;
  document.body.classList.remove("details-open");
  $("selection-details").setAttribute("aria-expanded", "false");
  if (hadFocus) (selected ? $("selection-details") : $("gl")).focus({ preventScroll: true });
}
export function openDrawer(star) {
  setExploration(false);
  // star: { slug, galaxy, lastmod, cover }
  current = star; const { slug } = star;
  $("dr-dom").textContent = (star.galaxy === "Uncharted" ? "Interstellar" : star.galaxy) + " · public dataset";
  $("dr-name").textContent = prettyName(slug); $("dr-by").textContent = "by " + prettyWs(slug);
  $("dr-link").href = "https://universe.roboflow.com/" + slug; $("dr-all").href = "https://universe.roboflow.com/" + slug + "/browse";
  setFigure(star.cover ? originalUrl(star.cover) : "", ""); fig.classList.toggle("busy", !star.cover);
  $("samples").innerHTML = ""; $("bars").innerHTML = ""; $("dr-anncount").textContent = "";
  ["dr-images", "dr-classes", "dr-models"].forEach(id => $(id).textContent = "—");
  $("split").innerHTML = ""; $("splitl").innerHTML = "";
  $("facts").innerHTML = [["Galaxy", star.galaxy === "Uncharted" ? "Interstellar (unclassified)" : star.galaxy], ["Updated", monthName(star.lastmod)], ["Workspace", slug.split("/")[0]], ["Project", slug.split("/")[1]]].map(([k, v]) => `<b>${k}</b><span>${esc(v)}</span>`).join("");
  $("dr-note").textContent = "";
  drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); drawer.inert = false; body.scrollTop = 0;
  document.body.classList.add("details-open");
  $("selection-details").setAttribute("aria-expanded", "true");
  $("dr-close").focus();

  imageryFor(slug).then(im => {
    if (current !== star) return;
    if (im?.c && !star.cover) { star.cover = im.c; setFigure(originalUrl(im.c), ""); fig.classList.remove("busy"); }
    const s = im?.s || [];
    $("samples").innerHTML = s.length ? s.map((k, i) => `<button data-k="${k}" title="Sample ${i + 1}"><img src="${thumbUrl(k)}" alt="" loading="lazy"></button>`).join("") : `<div class="facts"><span style="color:var(--mute)">Samples not indexed yet</span></div>`;
    $("samples").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      const on = b.classList.contains("on"); $("samples").querySelectorAll("button").forEach(x => x.classList.remove("on"));
      if (on) { setFigure(star.cover ? originalUrl(star.cover) : "", ""); return; } b.classList.add("on"); setFigure(originalUrl(b.dataset.k), "sample");
    }));
  });
  detailFor(slug).then(d => {
    if (current !== star) return;
    if (!d) { $("dr-note").textContent = "Live detail needs the API proxy (set ROBOFLOW_API_KEY on the server)."; return; }
    const classes = Object.entries(d.classes || {}).sort((a, b) => b[1] - a[1]); const total = classes.reduce((a, c) => a + c[1], 0); const max = classes.length ? classes[0][1] : 1;
    $("dr-images").textContent = fmt(d.images); $("dr-classes").textContent = fmt(classes.length); $("dr-models").textContent = fmt(d.models);
    $("dr-anncount").textContent = total ? fmt(total) + " annotations" : "";
    $("bars").innerHTML = classes.length ? classes.slice(0, 8).map(([k, v]) => `<div class="bar"><span class="n" title="${esc(k)}">${esc(k)}</span><span class="t"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span><span>${fmt(v)}</span></div>`).join("") + (classes.length > 8 ? `<div class="bar"><span class="n" style="color:var(--mute)">+${classes.length - 8} more</span><span></span><span></span></div>` : "") : `<div class="bar"><span class="n" style="color:var(--mute)">No class counts</span><span></span><span></span></div>`;
    const sp = d.splits || {}; const tr = sp.train || 0, va = sp.valid || 0, te = sp.test || 0, st = tr + va + te || 1;
    $("split").innerHTML = `<i style="width:${tr / st * 100}%"></i><i style="width:${va / st * 100}%"></i><i style="width:${te / st * 100}%"></i>`;
    $("splitl").innerHTML = `<span>train ${fmt(tr)}</span><span>valid ${fmt(va)}</span><span>test ${fmt(te)}</span>`;
    const dt = s => s ? new Date(parseFloat(s) * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short" }) : "—";
    $("dr-dom").textContent = (star.galaxy === "Uncharted" ? "Interstellar" : star.galaxy) + " · " + (TYPE[d.type] || d.type || "dataset");
    if (d.name) $("dr-name").textContent = d.name;
    $("facts").innerHTML = [["Type", TYPE[d.type] || d.type || "—"], ["License", d.license || "—"], ["Versions", fmt(d.versions?.length)], ["Unannotated", fmt(Math.max(0, d.unannotated || 0))], ["Created", dt(d.created)], ["Updated", dt(d.updated)], ["Galaxy", star.galaxy === "Uncharted" ? "Interstellar (unclassified)" : star.galaxy], ["Workspace", slug.split("/")[0]]].map(([k, v]) => `<b>${k}</b><span>${esc(v)}</span>`).join("");
  });
}
function setFigure(src, cap) { const img = $("dr-img"); img.style.opacity = src ? 1 : 0; img.src = src; $("cap").textContent = cap || ""; $("cap").style.display = cap ? "" : "none"; }
$("dr-close").addEventListener("click", closeDrawer);
