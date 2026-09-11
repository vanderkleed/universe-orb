#!/usr/bin/env node
// Folds harvested imagery shards (from parallel workers) into public/data/imagery/*.json.
// Entries from the harvest win; anything the repo has that the harvest doesn't is kept.
//
//   node pipeline/merge-imagery.mjs <dir-with-N.json-files>

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DEST = path.join(ROOT, "public/data/imagery");
const SRC = process.argv[2];
if (!SRC) { console.error("usage: merge-imagery.mjs <dir>"); process.exit(1); }

async function readJSON(p, dflt) { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return dflt; } }

let files = 0, added = 0, updated = 0;
for (const f of (await fs.readdir(SRC)).filter(n => /^\d+\.json$/.test(n)).sort((a, b) => +a.split(".")[0] - +b.split(".")[0])) {
  const incoming = await readJSON(path.join(SRC, f), {});
  const current = await readJSON(path.join(DEST, f), {});
  for (const [slug, v] of Object.entries(incoming)) { if (current[slug]) updated++; else added++; current[slug] = { ...current[slug], ...v }; }
  await fs.writeFile(path.join(DEST, f), JSON.stringify(current)); files++;
}
console.log(`merged ${files} shards: ${added} new datasets, ${updated} refreshed`);
