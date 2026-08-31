#!/usr/bin/env node
// Builds the static index the site loads at runtime.
//
//   node pipeline/build-index.mjs            # full rebuild from Universe sitemaps
//   node pipeline/build-index.mjs --from raw # reuse pipeline/cache/slugs.json
//
// Output (public/data):
//   manifest.json            galaxies with counts, layout seeds, totals, build date
//   names/<galaxy>-<n>.json  shards of [slug, lastmod] for every public dataset
//   imagery.json             [slug, galaxy, index, coverKey] derived from imagery/*.json (build-imagery.mjs)
//
// Runs with no API key. The sitemaps list most but not all public projects, so slugs already known
// from previous runs, the curated list, and the imagery shards are kept.

import fs from "node:fs/promises";
import path from "node:path";
import { classify, DOMAIN_NAMES } from "./classify.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = path.join(ROOT, "public/data");
const CACHE = path.join(ROOT, "pipeline/cache");
const SHARD = 8000;
const UA = "universe-orb-indexer (+https://github.com/roboflow)";

async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA } });
      if (r.ok) return await r.text();
      if (r.status === 429) await sleep(2000 * (i + 1));
    } catch (e) { await sleep(800 * (i + 1)); }
  }
  throw new Error("failed " + url);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function crawlSitemaps() {
  const idx = await fetchText("https://universe.roboflow.com/sitemap.xml");
  const files = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => u.includes("sitemap-projects"));
  console.log(`sitemap index: ${files.length} project sitemaps`);
  const roots = new Map();
  let done = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (files.length) {
      const u = files.shift();
      const t = await fetchText(u);
      const re = /<url>\s*<loc>https:\/\/universe\.roboflow\.com\/([^<]+)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?/g;
      let m;
      while ((m = re.exec(t))) {
        const slug = m[1];
        if (slug.split("/").length !== 2) continue;            // skip /model/N etc.
        if (!roots.has(slug)) roots.set(slug, (m[2] || "").slice(0, 7));
      }
      if (++done % 200 === 0) console.log(`  ${done} sitemaps, ${roots.size} datasets`);
    }
  });
  await Promise.all(workers);
  return roots;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(CACHE, { recursive: true });
  let roots;
  if (process.argv.includes("--from")) {
    roots = new Map(Object.entries(JSON.parse(await fs.readFile(path.join(CACHE, "slugs.json"), "utf8"))));
  } else {
    roots = await crawlSitemaps();
    await fs.writeFile(path.join(CACHE, "slugs.json"), JSON.stringify(Object.fromEntries(roots)));
  }
  // keep datasets we know about that the sitemaps omit
  const prior = JSON.parse(await fs.readFile(path.join(CACHE, "slugs.json"), "utf8").catch(() => "{}"));
  for (const [slug, lm] of Object.entries(prior)) if (!roots.has(slug)) roots.set(slug, lm);
  for (let i = 0; i < 64; i++) { try { for (const slug of Object.keys(JSON.parse(await fs.readFile(path.join(OUT, `imagery/${i}.json`), "utf8")))) if (!roots.has(slug)) roots.set(slug, ""); } catch {} }
  await fs.writeFile(path.join(CACHE, "slugs.json"), JSON.stringify(Object.fromEntries(roots)));
  console.log(`${roots.size} public datasets`);

  const overrides = JSON.parse(await fs.readFile(path.join(ROOT, "pipeline/curated.json"), "utf8").catch(() => "{}"));
  const byDom = {};
  for (const [slug, lm] of roots) (byDom[classify(slug, overrides)] ||= []).push([slug, lm]);

  // stable ordering so star indices are reproducible between builds
  for (const k in byDom) byDom[k].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  await fs.rm(path.join(OUT, "names"), { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, "names"), { recursive: true });
  const galaxies = {};
  for (const dom of [...DOMAIN_NAMES, "Uncharted"]) {
    const list = byDom[dom] || [];
    const shards = [];
    for (let i = 0; i < list.length; i += SHARD) {
      const file = `names/${dom.toLowerCase()}-${shards.length}.json`;
      await fs.writeFile(path.join(OUT, file), JSON.stringify(list.slice(i, i + SHARD)));
      shards.push(file);
    }
    galaxies[dom] = { n: list.length, shards };
  }
  // imagery.json: [slug, galaxy, indexInGalaxy, coverKey] for every dataset with a known cover,
  // rebuilt from the imagery shards so indices always match this build's ordering.
  const where = new Map();
  for (const dom in byDom) byDom[dom].forEach(([slug], j) => where.set(slug, [dom, j]));
  const imagery = [];
  for (let i = 0; i < 64; i++) {
    let sh = {}; try { sh = JSON.parse(await fs.readFile(path.join(OUT, `imagery/${i}.json`), "utf8")); } catch { continue; }
    for (const [slug, v] of Object.entries(sh)) { const w = where.get(slug); if (v.c && w) imagery.push([slug, w[0], w[1], v.c]); }
  }
  await fs.writeFile(path.join(OUT, "imagery.json"), JSON.stringify(imagery));
  const manifest = {
    built: new Date().toISOString(),
    total: roots.size,
    imaged: imagery.length,
    shardSize: SHARD,
    galaxies,
  };
  await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log("wrote manifest:", Object.entries(galaxies).map(([k, v]) => `${k} ${v.n}`).join(", "));
}
main().catch(e => { console.error(e); process.exit(1); });
