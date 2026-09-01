// Layout of the universe: 18 spiral galaxies plus an interstellar field, one star per public dataset.
// Rest positions are deterministic functions of (galaxy, index) so any dataset can be located without
// generating the whole field in order. Galaxies rotate differentially (inner stars orbit faster than
// outer ones, which is what winds the arms); the interstellar field drifts as a whole. The same orbit
// formula runs in the star shader (330k stars, no CPU cost) and on the CPU for whatever is near you.
import * as THREE from "three";
import { DOT } from "./textures.js";

export const WORLD = 260;
export const FOG = 0.0022;
// rotation: angular speed ω(r) = ROT_W / (r + ROT_R0)  → inner orbit ≈ 20 min, outer ≈ 1.7 h
export const ROT_W = 0.047, ROT_R0 = 6, DRIFT = 0.0004;   // DRIFT: interstellar field, rad/s about world Y
const T0 = 12345;                                          // time offset so nothing starts at angle 0
const t0ms = performance.now();
export const now = () => T0 + (performance.now() - t0ms) / 1000;

function h32(a, b, c) { let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function gauss(a, b, c) { const u = Math.max(1e-6, h32(a, b, c)), v = h32(a, b, c + 7); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); }

export function buildLayout(manifest) {
  const domains = Object.keys(manifest.galaxies).filter(k => k !== "Uncharted");
  const galaxies = {};
  domains.forEach((k, i) => {
    const n = domains.length, y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), phi = i * Math.PI * (3 - Math.sqrt(5));
    const R = WORLD * (0.72 + h32(i, 1, 1) * 0.5);
    const center = new THREE.Vector3(Math.cos(phi) * r, y * 0.42, Math.sin(phi) * r).multiplyScalar(R);
    const N = manifest.galaxies[k].n;
    const radius = 7 * Math.sqrt(N / 1000) + 9;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((h32(i, 2, 1) - 0.5) * 1.1, h32(i, 3, 1) * 6.28, (h32(i, 4, 1) - 0.5) * 1.1));
    galaxies[k] = { id: i + 1, name: k, center, radius, N, q, qInv: q.clone().invert(), arms: 2 + Math.floor(h32(i, 5, 1) * 2), twist: 3.5 + h32(i, 6, 1) * 3, spin: h32(i, 7, 1) < 0.5 ? 1 : -1 };
  });
  galaxies.Uncharted = { id: 0, name: "Uncharted", N: manifest.galaxies.Uncharted?.n || 0, center: new THREE.Vector3(), radius: WORLD * 1.5 };
  return { domains, galaxies };
}

// rest position (galaxy-local, before rotation) of star j in galaxy G; returns size
function localAt(G, j, out) {
  if (G.id === 0) {
    const rr = Math.pow(h32(0, j, 1), 0.55) * WORLD * 1.45 + 20, th = h32(0, j, 2) * 6.283, yy = gauss(0, j, 3) * WORLD * 0.16;
    out.set(Math.cos(th) * rr, yy, Math.sin(th) * rr);
    return 0.55 + h32(0, j, 4) * 0.6;
  }
  const R = G.radius, id = G.id;
  const bulge = h32(id, j, 1) < 0.14;
  let rr, th, yy;
  if (bulge) { rr = Math.abs(gauss(id, j, 2)) * R * 0.18; th = h32(id, j, 3) * 6.283; yy = gauss(id, j, 4) * R * 0.08; }
  else { rr = R * Math.sqrt(0.04 + h32(id, j, 5) * 0.96); const arm = Math.floor(h32(id, j, 6) * G.arms); th = G.twist * rr / R + arm * 6.283 / G.arms + gauss(id, j, 7) * 0.32; yy = gauss(id, j, 8) * R * 0.045 * (1.2 - rr / R); }
  out.set(Math.cos(th) * rr, yy, Math.sin(th) * rr);
  return (bulge ? 1.1 : 0.8) + h32(id, j, 9) * 0.7;
}
// apply the orbit: rotate a galaxy-local point about its axis by θ(r, t), then place in the world
function orbit(G, local, t, out) {
  const r = Math.hypot(local.x, local.z);
  const th = G.id === 0 ? DRIFT * t : G.spin * ROT_W * t / (r + ROT_R0);
  const c = Math.cos(th), s = Math.sin(th);
  out.set(local.x * c - local.z * s, local.y, local.x * s + local.z * c);
  if (G.id !== 0) out.applyQuaternion(G.q).add(G.center);
  return out;
}
const _l = new THREE.Vector3();
// rest world position (t = 0 frame, used for the deterministic layout)
export function starAt(G, j, out) { const sz = localAt(G, j, _l); orbit(G, _l, 0, out); return sz; }
// current world position
export function starNow(G, j, t, out) { const sz = localAt(G, j, _l); orbit(G, _l, t, out); return sz; }

export function buildStars(layout, manifest) {
  const order = [...layout.domains, "Uncharted"];
  const total = order.reduce((a, k) => a + (manifest.galaxies[k]?.n || 0), 0);
  const pos = new Float32Array(total * 3), sz = new Float32Array(total), gal = new Float32Array(total);
  const owner = new Uint8Array(total), local = new Uint32Array(total);
  const start = {}, count = {};
  const v = new THREE.Vector3(); let c = 0;
  for (const k of order) {
    const G = layout.galaxies[k]; const n = manifest.galaxies[k]?.n || 0; start[k] = c; count[k] = n;
    for (let j = 0; j < n; j++, c++) { sz[c] = localAt(G, j, v); pos[c * 3] = v.x; pos[c * 3 + 1] = v.y; pos[c * 3 + 2] = v.z; owner[c] = G.id; local[c] = j; gal[c] = G.id; }
  }
  // per-galaxy uniforms (index = galaxy id; 0 = interstellar)
  const NG = layout.domains.length + 1;
  const uCenter = [], uQuat = [];
  for (let i = 0; i < NG; i++) { uCenter.push(new THREE.Vector3()); uQuat.push(new THREE.Vector4(0, 0, 0, 1)); }
  const uSpin = new Float32Array(NG).fill(1);
  for (const k of layout.domains) { const G = layout.galaxies[k]; uCenter[G.id].copy(G.center); uQuat[G.id].set(G.q.x, G.q.y, G.q.z, G.q.w); uSpin[G.id] = G.spin; }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));   // galaxy-local rest positions
  geo.setAttribute("sz", new THREE.BufferAttribute(sz, 1));
  geo.setAttribute("gal", new THREE.BufferAttribute(gal, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: DOT }, fogD: { value: FOG }, pr: { value: Math.min(devicePixelRatio, 2) }, warpK: { value: 0 }, time: { value: 0 },
      rotW: { value: ROT_W }, rotR0: { value: ROT_R0 }, drift: { value: DRIFT }, gCenter: { value: uCenter }, gQuat: { value: uQuat }, gSpin: { value: uSpin } },
    defines: { NG },
    vertexShader: `attribute float sz; attribute float gal; varying float vA;
      uniform float fogD, pr, warpK, time, rotW, rotR0, drift; uniform vec3 gCenter[NG]; uniform vec4 gQuat[NG]; uniform float gSpin[NG];
      vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }
      void main(){
        int g = int(gal + 0.5); vec3 p = position;
        float r = length(p.xz); vec4 q = gQuat[g];
        float th = (g == 0) ? drift*time : gSpin[g]*rotW*time/(r + rotR0);
        float c = cos(th), s = sin(th);
        vec3 rp = vec3(p.x*c - p.z*s, p.y, p.x*s + p.z*c);
        vec3 wp = (g == 0) ? rp : qrot(q, rp) + gCenter[g];
        vec4 mv = modelViewMatrix * vec4(wp, 1.0); float d = -mv.z; float f = exp(-d*d*fogD*fogD*0.9);
        vA = f*(0.35+0.65*min(1.0, sz-0.5)); float near = smoothstep(0.0, 6.0, d); vA *= 0.25+0.75*near;
        gl_PointSize = clamp(sz*pr*(150.0/max(d,1.0)), 1.0*pr, 4.2*pr)*(1.0-warpK*0.6); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D tex; varying float vA; void main(){ vec4 t=texture2D(tex,gl_PointCoord); gl_FragColor=vec4(0.957,0.949,0.925,t.a*vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false;

  const idToName = {}; for (const k in layout.galaxies) idToName[layout.galaxies[k].id] = k;
  const galaxyOf = i => idToName[owner[i]];
  const positionOf = (i, out, t = now()) => { _l.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); return orbit(layout.galaxies[galaxyOf(i)], _l, t, out); };

  // Proximity query: galaxies are contiguous index ranges, so scan only the galaxies whose sphere
  // meets the query sphere (a few thousand to ~22k stars). The interstellar field is rigid, so its
  // query runs in the rest frame against a grid.
  const CELL = 24; const grid = new Map();
  const key = (x, y, z) => ((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(y / CELL) + 512)) * 1024 + (Math.floor(z / CELL) + 512);
  { const s = start.Uncharted, n = count.Uncharted; for (let i = s; i < s + n; i++) { const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(i); } }
  const q = new THREE.Vector3(), w = new THREE.Vector3();
  function near(p, range, t = now()) {
    const out = [];
    for (const k of layout.domains) {
      const G = layout.galaxies[k]; if (p.distanceTo(G.center) > G.radius * 1.15 + range) continue;
      // height and orbital radius are invariant under the rotation, so they prune cheaply before the orbit math
      q.copy(p).sub(G.center).applyQuaternion(G.qInv); const rp = Math.hypot(q.x, q.z), yp = q.y;
      const s = start[k], n = count[k];
      for (let i = s; i < s + n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        if (Math.abs(y - yp) > range || Math.abs(Math.hypot(x, z) - rp) > range) continue;
        _l.set(x, y, z); orbit(G, _l, t, w); const d = w.distanceTo(p); if (d < range) out.push([i, d]);
      }
    }
    // interstellar: un-drift the query point, look up the grid, positions are then re-drifted by positionOf
    const th = -DRIFT * t, c = Math.cos(th), s = Math.sin(th); q.set(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
    const cc = Math.ceil(range / CELL); const cx = Math.floor(q.x / CELL), cy = Math.floor(q.y / CELL), cz = Math.floor(q.z / CELL);
    for (let x = -cc; x <= cc; x++) for (let y = -cc; y <= cc; y++) for (let z = -cc; z <= cc; z++) {
      const a = grid.get((((cx + x) + 512) * 1024 + ((cy + y) + 512)) * 1024 + ((cz + z) + 512)); if (!a) continue;
      for (const i of a) { const dx = pos[i * 3] - q.x, dy = pos[i * 3 + 1] - q.y, dz = pos[i * 3 + 2] - q.z; const d2 = dx * dx + dy * dy + dz * dz; if (d2 < range * range) out.push([i, Math.sqrt(d2)]); }
    }
    return out;
  }
  return { points, mat, pos, sz, owner, local, start, count, total, near, galaxyOf, positionOf, tick: t => { mat.uniforms.time.value = t; } };
}
