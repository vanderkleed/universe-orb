// "Planets": datasets with a known cover image, drawn as circular textured bodies.
// A pool of meshes is assigned to the nearest imaged datasets; thumbnails are hotlinked from the CDN
// and cached (LRU). Anything beyond range stays a star.
import * as THREE from "three";
import { SHADE, DOT, dither } from "./textures.js";
import { starAt, starNow, now } from "./universe.js";
import { thumbUrl } from "./data.js";

const POOL = 240, RANGE = 150, CACHE_MAX = 900;
const circle = new THREE.CircleGeometry(0.5, 56);
const edge = new THREE.EdgesGeometry(circle);
const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
const cache = new Map();      // url -> texture (insertion order = LRU)
const placeholder = dither(3);
function texture(url, cb) {
  const t = cache.get(url);
  if (t) { cache.delete(url); cache.set(url, t); return cb(t); }
  loader.load(url, tex => { tex.colorSpace = THREE.SRGBColorSpace; cache.set(url, tex); if (cache.size > CACHE_MAX) { const k = cache.keys().next().value; cache.get(k).dispose(); cache.delete(k); } cb(tex); }, undefined, () => cb(null));
}

export function buildPlanets(scene, layout, imagery) {
  // imagery: [ [slug, galaxy, index, coverKey], ... ]
  // Each item's pos is refreshed from the orbit model (galaxies rotate), so positions are never cached for long.
  // size follows the dataset's image count (log scale, ~150 images small, 50k+ images large);
  // datasets whose count is not yet indexed fall back to a hash-derived size
  const sizeOf = (n, sz) => n > 0 ? 0.5 + 1.15 * Math.min(1, Math.max(0, (Math.log10(n) - 1.7) / 2.8)) : 0.55 + sz * 0.45;
  const items = []; const v = new THREE.Vector3();
  for (const [slug, dom, j, cover, n] of imagery) {
    const G = layout.galaxies[dom]; if (!G) continue;
    const sz = starAt(G, j, v);
    items.push({ slug, dom, j, G, cover, n: n || 0, pos: v.clone(), size: sizeOf(n, sz), mesh: null });
  }
  const bySlug = new Map(items.map(it => [it.slug, it]));
  const update = (it, t = now()) => starNow(it.G, it.j, t, it.pos);

  const pool = []; const group = new THREE.Group(); scene.add(group);
  for (let i = 0; i < POOL; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: placeholder, transparent: true, opacity: 0.96, side: THREE.DoubleSide });
    const m = new THREE.Mesh(circle, mat); m.visible = false;
    const e = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: 0xF4F2EC, transparent: true, opacity: 0.2 })); m.add(e);
    const sh = new THREE.Mesh(circle, new THREE.MeshBasicMaterial({ map: SHADE, transparent: true, depthWrite: false })); sh.position.z = 0.002; sh.scale.setScalar(1.004); m.add(sh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(2.1); m.add(glow);
    m.userData = { edge: e, glow, item: null, url: null };
    group.add(m); pool.push(m);
  }

  // a few thousand items: brute force with fresh positions is cheap and always correct
  function near(p, range) {
    const out = []; const t = now();
    for (const it of items) { if (it.G.id !== 0 && p.distanceTo(it.G.center) > it.G.radius * 1.15 + range) continue; update(it, t); const d = it.pos.distanceTo(p); if (d < range) out.push([it, d]); }
    return out;
  }

  // reassign the pool to the nearest imaged datasets (call every few frames)
  function assign(shipPos, pinned) {
    const cand = near(shipPos, RANGE).sort((a, b) => a[1] - b[1]).slice(0, POOL).map(c => c[0]);
    if (pinned && !cand.includes(pinned)) cand[cand.length - 1] = pinned;
    const want = new Set(cand);
    const free = [];
    for (const m of pool) { const it = m.userData.item; if (it && !want.has(it)) { it.mesh = null; m.userData.item = null; m.visible = false; } if (!m.userData.item) free.push(m); }
    for (const it of cand) {
      if (it.mesh) continue; const m = free.pop(); if (!m) break;
      it.mesh = m; m.userData.item = it; m.position.copy(it.pos); m.scale.setScalar(it.size); m.visible = true;
      m.material.map = placeholder; m.material.needsUpdate = true;
      const url = thumbUrl(it.cover); m.userData.url = url;
      texture(url, tex => { if (m.userData.url === url && tex) { m.material.map = tex; m.material.needsUpdate = true; } });
    }
  }

  return { items, bySlug, pool, group, near, assign, update, active: () => pool.filter(m => m.visible) };
}
