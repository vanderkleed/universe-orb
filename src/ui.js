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
  range(v) { $("rng").textContent = v; }, sector(v) { $("sec").textContent = v; },
};
export const tag = {
  el: $("tag"),
  show(html, x, y) { this.el.innerHTML = html; this.el.style.opacity = 1; this.move(x, y); },
  move(x, y) { this.el.style.left = x + "px"; this.el.style.top = y + "px"; },
  hide() { this.el.style.opacity = 0; },
};

/* ---------- drawer ---------- */
const drawer = $("drawer"), body = $("dr-body"), fig = $("fig");
let current = null;
export function closeDrawer() { current = null; drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); }
export function openDrawer(star) {
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
  drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); body.scrollTop = 0;

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
$("dr-close").addEventListener("click", () => window.dispatchEvent(new CustomEvent("orb:release")));
