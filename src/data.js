// Data access: manifest, lazily loaded name shards, imagery index, live detail via the API proxy.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const CDN = "/img/";   // same-origin proxy (vercel.json rewrite) so thumbnails work as WebGL textures
export const thumbUrl = key => `${CDN}${key}/thumb.jpg`;      // 200px wide
export const originalUrl = key => `${CDN}${key}/original.jpg`;

export async function loadManifest() {
  const r = await fetch(`${BASE}/data/manifest.json`);
  if (!r.ok) throw new Error("manifest missing: run `npm run index`");
  return r.json();
}

// imagery.json: [ [slug, galaxy, indexInGalaxy, coverKey], ... ]
export async function loadImagery() {
  const r = await fetch(`${BASE}/data/imagery.json`);
  return r.ok ? r.json() : [];
}

// Name shards: each galaxy's datasets in stable order; shard k covers indices [k*size, (k+1)*size).
const shards = new Map();      // file -> Promise<Array<[slug,lastmod]>>
export function shardFor(manifest, galaxy, index) {
  const g = manifest.galaxies[galaxy]; if (!g) return null;
  const size = manifest.shardSize || 8000;
  return { file: g.shards[Math.floor(index / size)], offset: index - Math.floor(index / size) * size };
}
export function nameOf(manifest, galaxy, index) {
  const s = shardFor(manifest, galaxy, index); if (!s || !s.file) return null;
  const p = shards.get(s.file);
  if (!p) { loadShard(s.file); return null; }
  return p.value ? p.value[s.offset] : null;
}
export function loadShard(file) {
  if (shards.has(file)) return shards.get(file);
  const p = fetch(`${BASE}/data/${file}`).then(r => r.json()).then(v => { p.value = v; return v; });
  shards.set(file, p);
  return p;
}
export function galaxyShards(manifest, galaxy) {
  return Promise.all((manifest.galaxies[galaxy]?.shards || []).map(loadShard));
}

// Imagery detail (cover + samples) per slug, sharded by hash.
const imageryShards = new Map();
const SHARDS = 64;
const shardOf = slug => { let h = 0; for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % SHARDS; };
export async function imageryFor(slug) {
  const i = shardOf(slug);
  if (!imageryShards.has(i)) imageryShards.set(i, fetch(`${BASE}/data/imagery/${i}.json`).then(r => r.ok ? r.json() : {}).catch(() => ({})));
  return (await imageryShards.get(i))[slug] || null;
}

// Live detail through the serverless proxy (needs ROBOFLOW_API_KEY on the server).
const detailCache = new Map();
export async function detailFor(slug) {
  if (detailCache.has(slug)) return detailCache.get(slug);
  const p = fetch(`/api/dataset/${slug}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  detailCache.set(slug, p);
  return p;
}

export const prettyName = slug => { let p = slug.split("/")[1] || slug; p = p.replace(/-[a-z0-9]{5}$/, ""); return p.replace(/[-_]+/g, " ").trim() || slug; };
export const prettyWs = slug => (slug.split("/")[0] || "").replace(/-[a-z0-9]{5}$/, "").replace(/[-_]+/g, " ");
export const fmt = n => (n == null ? "—" : Number(n).toLocaleString("en-US"));
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const monthName = lm => { if (!lm) return "—"; const [y, m] = lm.split("-"); return new Date(+y, (+m || 1) - 1, 1).toLocaleDateString("en-US", { year: "numeric", month: "short" }); };
export const TYPE = { "object-detection": "Object detection", "instance-segmentation": "Instance segmentation", "semantic-segmentation": "Semantic segmentation", "classification": "Classification", "single-label-classification": "Classification", "multi-label-classification": "Classification", "keypoint-detection": "Keypoints" };
