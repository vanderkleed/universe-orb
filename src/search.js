// Search across every dataset name. The name shards load once, in the background, on first use;
// matching runs in a Web Worker so typing never stutters. Results carry (galaxy, index) so the
// scene can locate the star directly.
import { galaxyShards } from "./data.js";

const workerSrc = `
let rows = [];   // [galaxy, indexInGalaxy, slug, prettyLower, workspaceLower]
let imaged = new Set();   // slugs with a cover image: they rank first among equals
const pretty = s => { let p = s.split("/")[1] || s; p = p.replace(/-[a-z0-9]{5}$/, ""); return p.replace(/[-_]+/g, " ").trim(); };
onmessage = e => {
  const m = e.data;
  if (m.type === "load") { m.list.forEach((slug, j) => rows.push([m.g, m.offset + j, slug, pretty(slug).toLowerCase(), (slug.split("/")[0] || "").toLowerCase()])); return; }
  if (m.type === "imaged") { imaged = new Set(m.list); return; }
  if (m.type === "done") { postMessage({ type: "ready", n: rows.length }); return; }
  if (m.type === "query") {
    const q = m.q.trim().toLowerCase(); if (!q) { postMessage({ type: "results", q: m.q, hits: [], total: 0 }); return; }
    const terms = q.split(/\\s+/); const hits = [];
    for (const r of rows) {
      const name = r[3], ws = r[4]; let score = 0;
      for (const t of terms) {
        const i = name.indexOf(t);
        if (i === 0) score += 3; else if (i > 0 && name[i - 1] === " ") score += 2; else if (i > 0) score += 1; else if (ws.includes(t)) score += 0.5; else { score = -1; break; }
      }
      if (score > 0) hits.push([score + (imaged.has(r[2]) ? 1.5 : 0) - name.length * 0.002, r]);
    }
    hits.sort((a, b) => b[0] - a[0]);
    postMessage({ type: "results", q: m.q, hits: hits.slice(0, 12).map(h => ({ galaxy: h[1][0], index: h[1][1], slug: h[1][2] })), total: hits.length });
  }
};`;

export function createSearch(manifest, layout, imagedSlugs, onReady) {
  const worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" })));
  worker.postMessage({ type: "imaged", list: [...imagedSlugs] });
  let loading = null, ready = false, pending = null, cb = null;
  worker.onmessage = e => {
    if (e.data.type === "ready") { ready = true; onReady && onReady(e.data.n); if (pending != null) { worker.postMessage({ type: "query", q: pending }); pending = null; } }
    if (e.data.type === "results" && cb) cb(e.data);
  };
  function load() {
    if (loading) return loading;
    loading = (async () => {
      for (const g of [...layout.domains, "Uncharted"]) {
        const lists = await galaxyShards(manifest, g); let j = 0;
        for (const list of lists) { worker.postMessage({ type: "load", g, offset: j, list: list.map(e => e[0]) }); j += list.length; }
      }
      worker.postMessage({ type: "done" });
    })();
    return loading;
  }
  return {
    load,
    query(q, onResults) { cb = onResults; load(); if (!ready) { pending = q; return; } worker.postMessage({ type: "query", q }); },
    get ready() { return ready; },
  };
}
