# Universe Orb

You are a mirrored orb flying through every public dataset on Roboflow Universe.
Each dataset is a star; keyword-classified datasets form 18 spiral galaxies, the rest
drift as an interstellar field. Datasets with a known cover image render as circular
"planets" as you approach. Click anything to fly there; long trips go through hyperspace.

Design follows the Roboflow web system: EB Garamond (Regular), Space Mono, 52px nav,
duo-tone #121110 / #F4F2EC, near-imperceptible cross-grid.

## Stack

- Vite + Three.js, no framework. `src/` is ~900 lines.
- Static data in `public/data/`, produced by `pipeline/`. No database.
- One Vercel serverless function (`api/dataset/[...slug].js`) proxies the Roboflow
  project endpoint with a server-side key so the drawer shows live classes, splits and
  counts for any dataset.

## Deploy (Vercel)

1. Push this folder to a GitHub repo.
2. Vercel → New Project → import the repo. Framework preset: Vite. Build `npm run build`, output `dist`.
3. Settings → Environment Variables → `ROBOFLOW_API_KEY` (server-side only; it is never sent to the browser).
4. Deploy. The committed `public/data/` snapshot (330,601 datasets, 3,491 with imagery) works immediately.

Optional: enable the nightly GitHub Action (`.github/workflows/index.yml`). It re-crawls the
sitemaps, visits ~15k project pages for cover/sample images, commits `public/data/`, and Vercel redeploys.
About two weeks of nights covers the whole catalog; after that it keeps refreshing the oldest entries.

## Local

```
npm install
npm run dev                   # http://localhost:5173  (drawer detail needs `vercel dev` + the key)
npm run index                 # full rebuild from sitemaps (~2 min)
npm run index:imagery         # BATCH=15000 RATE=4 by default; then `node pipeline/build-index.mjs --from raw`
```

## Data model

```
public/data/manifest.json          totals, shard size, per-galaxy counts + shard list
public/data/names/<galaxy>-<k>.json  [ [slug, "YYYY-MM"], ... ]  (8,000 per shard, sorted by slug)
public/data/imagery/<0..63>.json   { slug: { c: "owner/imageId", s: [sampleKeys...], t: "YYYY-MM" } }
public/data/imagery.json           [ [slug, galaxy, indexInGalaxy, coverKey], ... ]
```

Star positions are not stored. `src/universe.js` derives the position of star *j* in galaxy *G*
from a hash, so any dataset can be located from `(galaxy, index)` and the 330k-point field costs
nothing to load. Name shards load lazily as you approach a galaxy; imagery and detail load per dataset.

Thumbnails and originals are hotlinked from `source.roboflow.com` (`<key>/thumb.jpg`, `<key>/original.jpg`).
WebGL textures need CORS on that host; if planets stay as dither placeholders in production, the CDN is
not sending `Access-Control-Allow-Origin` and the thumbnails should be proxied or the header enabled.

## Controls

click: fly to a planet, star, galaxy, or open space · drag: look · scroll: pull back to the map (M toggles) ·
R: random jump · Esc: release. Deep links: `#workspace/project` or `#galaxy/mobility`.

## Known limits

- Galaxy assignment is keyword-based on the slug (`pipeline/classify.mjs`); `pipeline/curated.json` overrides.
- The sitemaps omit some public projects; the pipeline keeps every slug it has ever seen, and the

Deployed at universe-orb.vercel.app (auto-deploys from main).

  search-harvested extras, so the count only grows.
- Sample images come from the project page gallery (up to 8) and are not yet indexed for most datasets.
- Mobile: touch works (tap to fly, drag to look); the rail collapses to a strip.
