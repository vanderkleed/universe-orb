#!/usr/bin/env node
// Collects cover + sample image keys for public datasets by reading each Universe project page
// (og:image and the gallery thumbnails). No API key needed. Incremental: keeps what it already has,
// visits BATCH new slugs per run (default 15000), oldest-first, so a nightly job covers the catalog
// in a couple of weeks and then keeps it fresh.
//
//   node pipeline/build-imagery.mjs                 # default batch
//   BATCH=40000 RATE=6 node pipeline/build-imagery.mjs
//
// Output: public/data/imagery/<shard>.json  ->  { "<workspace/project>": { c:"owner/imageId", s:["owner/imageId",...], t:"2026-08", n:imageCount } }
// build-index.mjs then derives public/data/imagery.json (slug, galaxy, index, cover) from these shards.

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = path.join(ROOT, "public/data");
const BATCH = +(process.env.BATCH || 15000);
const RATE = +(process.env.RATE || 4);           // requests per second
const SHARDS = 64;
const UA = process.env.UA || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 universe-orb-indexer";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shardOf = slug => { let h = 0; for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % SHARDS; };

async function readJSON(p, dflt) { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return dflt; } }

async function main() {
  const manifest = await readJSON(path.join(OUT, "manifest.json"));
  if (!manifest) throw new Error("run build-index.mjs first");
  // every slug, from the name shards
  const all = [];
  for (const g of Object.values(manifest.galaxies)) for (const f of g.shards) all.push(...(await readJSON(path.join(OUT, f), [])));
  await fs.mkdir(path.join(OUT, "imagery"), { recursive: true });
  const shards = [];
  for (let i = 0; i < SHARDS; i++) shards.push(await readJSON(path.join(OUT, `imagery/${i}.json`), {}));
  const have = slug => shards[shardOf(slug)][slug];

  // oldest-visited first; never-visited first of all
  const todo = all.filter(([s]) => !have(s)).slice(0, BATCH);
  const stale = all.filter(([s]) => have(s)).sort((a, b) => (have(a[0]).t || "") < (have(b[0]).t || "") ? -1 : 1).slice(0, Math.max(0, BATCH - todo.length));
  const queue = [...todo, ...stale];
  console.log(`visiting ${queue.length} project pages (${todo.length} new) at ${RATE}/s`);

  let done = 0, ok = 0, httpFail = 0, firstFail = null; const stamp = new Date().toISOString().slice(0, 7);
  const workers = Array.from({ length: RATE }, async () => {
    while (queue.length) {
      const [slug] = queue.shift();
      const t0 = Date.now();
      try {
        const r = await fetch(`https://universe.roboflow.com/${slug}`, { headers: { "user-agent": UA, "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" } });
        if (r.status === 429) { await sleep(5000); queue.push([slug]); continue; }
        if (!r.ok) { httpFail++; if (!firstFail) firstFail = r.status + " " + slug; }
        const html = r.ok ? await r.text() : "";
        const cover = html.match(/property="og:image"\s+content="https:\/\/source\.roboflow\.com\/([^/"]+\/[^/"]+)\//)?.[1];
        const samples = [...html.matchAll(/source\.roboflow\.com\/([A-Za-z0-9]+\/[A-Za-z0-9]+)\/thumb\.jpg/g)].map(m => m[1]);
        const uniq = [...new Set(samples)].filter(k => k !== cover).slice(0, 8);
        const n = +((html.match(/for\s+([\d,]+)\s+images/) || [])[1] || "").replace(/,/g, "") || 0;   // "… annotations for 1,120 images"
        shards[shardOf(slug)][slug] = cover ? { c: cover, s: uniq, t: stamp, ...(n ? { n } : {}) } : { t: stamp };
        if (cover) ok++;
      } catch (e) { /* leave for next run */ }
      done++;
      if (done % 500 === 0) console.log(`  ${done}/${queue.length + done}, ${ok} with cover`);
      const wait = 1000 - (Date.now() - t0); if (wait > 0) await sleep(wait);
    }
  });
  await Promise.all(workers);

  let covers = 0;
  for (let i = 0; i < SHARDS; i++) { await fs.writeFile(path.join(OUT, `imagery/${i}.json`), JSON.stringify(shards[i])); for (const v of Object.values(shards[i])) if (v.c) covers++; }
  console.log(`imagery shards written: ${covers} datasets with a cover. Run build-index.mjs --from raw to refresh imagery.json + manifest.`);
  if (httpFail) console.warn(`${httpFail} pages returned HTTP errors (first: ${firstFail})`);
  if (done > 100 && ok === 0 && httpFail > done * 0.9) { console.error("the project-page host appears to be refusing this runner entirely"); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
