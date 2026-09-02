#!/usr/bin/env node
// Collects cover image keys + image counts through the Roboflow API (key-authenticated, so it works
// from cloud runners that universe.roboflow.com's bot protection refuses). Same incremental model as
// build-imagery.mjs: visits BATCH unseen-or-stale slugs per run, merges into the imagery shards.
//
//   ROBOFLOW_API_KEY=... BATCH=15000 RATE=4 node pipeline/build-imagery-api.mjs
//
// The API returns the project icon (cover) and image count, but not the sample gallery; existing
// sample lists from the page scraper are kept untouched.

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = path.join(ROOT, "public/data");
const KEY = process.env.ROBOFLOW_API_KEY;
const BATCH = +(process.env.BATCH || 15000);
const RATE = +(process.env.RATE || 4);
const SHARDS = 64;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shardOf = slug => { let h = 0; for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % SHARDS; };

async function readJSON(p, dflt) { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return dflt; } }

// the icon arrives as an object of URLs ({original, thumb, annotation}), a full source.roboflow.com
// URL, or a bare "owner/imageId" key — extract the owner/imageId pair from whichever shape shows up
function coverKey(icon) {
  const strs = typeof icon === "string" ? [icon] : (icon && typeof icon === "object" ? Object.values(icon).filter(v => typeof v === "string") : []);
  for (const s of strs) {
    const m = s.match(/source\.roboflow\.com\/([^/]+\/[^/.?]+)/); if (m) return m[1];
    if (/^[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(s)) return s;
  }
  return null;
}

async function main() {
  if (!KEY) { console.error("ROBOFLOW_API_KEY is not set"); process.exit(1); }
  const manifest = await readJSON(path.join(OUT, "manifest.json"));
  if (!manifest) throw new Error("run build-index.mjs first");
  const all = [];
  for (const g of Object.values(manifest.galaxies)) for (const f of g.shards) all.push(...(await readJSON(path.join(OUT, f), [])));
  await fs.mkdir(path.join(OUT, "imagery"), { recursive: true });
  const shards = [];
  for (let i = 0; i < SHARDS; i++) shards.push(await readJSON(path.join(OUT, `imagery/${i}.json`), {}));
  const have = slug => shards[shardOf(slug)][slug];

  const todo = all.filter(([s]) => !have(s)).slice(0, BATCH);
  const stale = all.filter(([s]) => have(s)).sort((a, b) => ((have(a[0]).t || "") < (have(b[0]).t || "") ? -1 : 1)).slice(0, Math.max(0, BATCH - todo.length));
  const queue = [...todo, ...stale];
  console.log(`fetching ${queue.length} projects through the API (${todo.length} new) at ${RATE}/s`);

  let done = 0, ok = 0, miss = 0, err = 0, firstErr = null, shownShape = false;
  const stamp = new Date().toISOString().slice(0, 7);
  const workers = Array.from({ length: RATE }, async () => {
    while (queue.length) {
      const [slug] = queue.shift();
      const t0 = Date.now();
      try {
        const r = await fetch(`https://api.roboflow.com/${slug}?api_key=${KEY}`);
        if (r.status === 429) { await sleep(5000); queue.push([slug]); continue; }
        if (!r.ok) { err++; if (!firstErr) firstErr = r.status + " " + slug; }
        else {
          const j = await r.json(); const p = j.project || j;
          const c = coverKey(p.icon || p.image || p.cover);
          const n = +p.images || 0;
          const prev = have(slug) || {};
          if (c) { shards[shardOf(slug)][slug] = { ...prev, c, t: stamp, ...(n ? { n } : {}) }; ok++; }
          else {
            miss++;
            shards[shardOf(slug)][slug] = { ...prev, t: stamp, ...(n ? { n } : {}) };
            if (!shownShape) { shownShape = true; console.log("  no cover; icon value was:", JSON.stringify(p.icon || null).slice(0, 140)); }
          }
        }
      } catch (e) { /* leave for next run */ }
      done++;
      if (done % 500 === 0) console.log(`  ${done}/${queue.length + done}, ${ok} covers, ${miss} without, ${err} errors`);
      const wait = 1000 - (Date.now() - t0); if (wait > 0) await sleep(wait);
    }
  });
  await Promise.all(workers);

  let covers = 0;
  for (let i = 0; i < SHARDS; i++) { await fs.writeFile(path.join(OUT, `imagery/${i}.json`), JSON.stringify(shards[i])); for (const v of Object.values(shards[i])) if (v.c) covers++; }
  console.log(`imagery shards written: ${covers} datasets with a cover (${ok} updated, ${miss} without icons, ${err} HTTP errors${firstErr ? ", first: " + firstErr : ""}).`);
  if (done > 100 && ok === 0 && err > done * 0.9) { console.error("the API refused nearly every request — check the key"); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
