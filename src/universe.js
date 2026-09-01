// Layout of the universe: 18 galaxies (spirals, barred spirals, ellipticals, rings, flocculent disks) plus an interstellar field, one star per public dataset.
// Rest positions are deterministic functions of (galaxy, index) so any dataset can be located without
// generating the whole field in order. Galaxies rotate differentially (inner stars orbit faster than
// outer ones, which is what winds the arms); the interstellar field drifts as a whole. The same orbit
// formula runs in the star shader (330k stars, no CPU cost) and on the CPU for whatever is near you.
import * as THREE from "three";
import { DOT } from "./textures.js";

export const WORLD = 260;
export const FOG = 0.0022;
// rotation: angular speed ω(r) = W / (r + R0), per galaxy (W, R0 vary; ellipticals barely turn).
// Inside rSolid the disk turns as a solid body (bars keep their shape). Arms always trail the spin.
// Kept slight: about a radian per 10–40 minutes. DRIFT: interstellar field, rad/s about world Y.
export const ROT_W = 0.024, ROT_R0 = 12, DRIFT = 0.0004;
const T0 = 300;                                            // small offset so nothing starts exactly at rest
const t0ms = performance.now();
export const now = () => T0 + (performance.now() - t0ms) / 1000;

function h32(a, b, c) { let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function gauss(a, b, c) { const u = Math.max(1e-6, h32(a, b, c)), v = h32(a, b, c + 7); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); }

// a fixed mix so the 18 galaxies spread across types: 8 spirals, 3 barred, 3 ellipticals, 2 rings, 2 flocculent
const TYPES = ["spiral", "barred", "elliptical", "spiral", "ring", "flocculent", "spiral", "barred", "spiral", "elliptical", "spiral", "ring", "barred", "spiral", "flocculent", "spiral", "elliptical", "spiral"];
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
    // morphology: each galaxy gets its own type and shape parameters so no two look alike
    const type = TYPES[i % TYPES.length];
    const chir = h32(i, 7, 1) < 0.5 ? 1 : -1;   // handedness of the arms; the spin is set so they trail
    const G = { id: i + 1, name: k, type, center, radius, N, q, qInv: q.clone().invert(), chir, spin: -chir,
      arms: type === "flocculent" ? 4 + Math.floor(h32(i, 5, 1) * 3) : type === "barred" ? 2 : 2 + Math.floor(h32(i, 5, 1) * 3),   // 2–4
      twist: type === "flocculent" ? 1.5 + h32(i, 6, 1) * 1.5 : 2.4 + h32(i, 6, 1) * 4.2,                                        // arm pitch
      armW: type === "flocculent" ? 0.3 : 0.1 + h32(i, 9, 1) * 0.2,                                                              // arm scatter (rad)
      bulge: 0.07 + h32(i, 10, 1) * 0.2, thick: 0.03 + h32(i, 11, 1) * 0.05,
      bar: 0.3 + h32(i, 12, 1) * 0.22, ringR: 0.58 + h32(i, 13, 1) * 0.2, ringW: 0.02 + h32(i, 14, 1) * 0.025,
      e1: 0.55 + h32(i, 15, 1) * 0.4, e2: 0.35 + h32(i, 16, 1) * 0.45,                                                          // elliptical axis ratios
      rotW: ROT_W * (type === "elliptical" ? 0.25 : 0.7 + h32(i, 17, 1) * 0.6), rotR0: type === "elliptical" ? 24 : ROT_R0 * (0.7 + h32(i, 18, 1) * 0.8) };
    G.rSolid = type === "barred" ? G.bar * radius : radius * 0.15;
    galaxies[k] = G;
  });
  galaxies.Uncharted = { id: 0, name: "Uncharted", type: "field", N: manifest.galaxies.Uncharted?.n || 0, center: new THREE.Vector3(), radius: WORLD * 1.5, rotW: 0, rotR0: 1, rSolid: 0 };
  return { domains, galaxies };
}

// rest position (galaxy-local, before rotation) of star j in galaxy G; returns size
function localAt(G, j, out) {
  if (G.id === 0) {
    const rr = Math.pow(h32(0, j, 1), 0.55) * WORLD * 1.45 + 20, th = h32(0, j, 2) * 6.283, yy = gauss(0, j, 3) * WORLD * 0.16;
    out.set(Math.cos(th) * rr, yy, Math.sin(th) * rr);
    return 0.55 + h32(0, j, 4) * 0.6;
  }
  const R = G.radius, id = G.id, t = G.type;
  const u = h32(id, j, 1);
  let rr, th, yy, big = false;
  if (t === "elliptical") {
    // a 3-axis gaussian blob, denser at the core, no arms
    const k = R * 0.36 * Math.pow(h32(id, j, 10), 0.4);   // concentrated core, soft edge
    const x = gauss(id, j, 2) * k, z = gauss(id, j, 3) * k * G.e1; yy = gauss(id, j, 4) * k * G.e2;
    out.set(x, yy, z); big = Math.hypot(x, yy, z) < R * 0.1;
    return (big ? 1.1 : 0.8) + h32(id, j, 9) * 0.7;
  }
  if (u < G.bulge) { rr = Math.abs(gauss(id, j, 2)) * R * 0.16; th = h32(id, j, 3) * 6.283; yy = gauss(id, j, 4) * R * 0.07; big = true; }
  else if (t === "ring") {
    if (u < G.bulge + 0.1) { rr = R * Math.sqrt(h32(id, j, 5)) * G.ringR * 0.92; th = h32(id, j, 3) * 6.283; }                     // sparse interior
    else if (u < G.bulge + 0.16) { rr = R * (G.ringR + 0.08 + h32(id, j, 5) * 0.3); th = h32(id, j, 3) * 6.283; }                    // faint outskirts
    else { rr = R * (G.ringR + gauss(id, j, 5) * G.ringW); th = h32(id, j, 3) * 6.283; }                                             // the ring
    yy = gauss(id, j, 8) * R * G.thick;
  }
  else if (t === "barred" && u < G.bulge + 0.16) {
    // the bar: a thick line through the core along local x
    const a = (h32(id, j, 5) - 0.5) * 2 * G.bar * R; const w = gauss(id, j, 6) * R * 0.035 * (1 - Math.abs(a) / (G.bar * R) * 0.5);
    out.set(a, gauss(id, j, 8) * R * G.thick * 0.8, w); return 0.95 + h32(id, j, 9) * 0.6;
  }
  else if (t === "flocculent" && h32(id, j, 13) < 0.5) {
    // patchy star-forming clumps scattered over the disk
    const c = Math.floor(h32(id, j, 14) * 40); const rc = R * Math.sqrt(0.08 + h32(id, c + 1000, 20) * 0.85), tc = h32(id, c + 1000, 21) * 6.283;
    out.set(Math.cos(tc) * rc + gauss(id, j, 2) * R * 0.04, gauss(id, j, 8) * R * G.thick * 0.8, Math.sin(tc) * rc + gauss(id, j, 3) * R * 0.04);
    return 0.85 + h32(id, j, 9) * 0.7;
  }
  else {
    // spiral arms (barred: arms start at the bar ends; flocculent: many short loose arms + scatter)
    const inner = t === "barred" ? G.bar : 0.04;
    rr = R * Math.sqrt(inner * inner + h32(id, j, 5) * (1 - inner * inner));
    const arm = Math.floor(h32(id, j, 6) * G.arms);
    const scatter = t === "flocculent" && h32(id, j, 12) < 0.35;
    th = G.chir * G.twist * (rr - inner * R) / R + arm * 6.283 / G.arms + gauss(id, j, 7) * (scatter ? 3 : G.armW);
    yy = gauss(id, j, 8) * R * G.thick * (1.2 - rr / R);
  }
  out.set(Math.cos(th) * rr, yy, Math.sin(th) * rr);
  return (big ? 1.1 : 0.8) + h32(id, j, 9) * 0.7;
}
// apply the orbit: rotate a galaxy-local point about its axis by θ(r, t), then place in the world
function orbit(G, local, t, out) {
  const r = Math.hypot(local.x, local.z);
  const th = G.id === 0 ? DRIFT * t : G.spin * G.rotW * t / (Math.max(r, G.rSolid) + G.rotR0);
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
  const uRot = []; for (let i = 0; i < NG; i++) uRot.push(new THREE.Vector3(0, 1, 0));   // (spin·W, R0, rSolid) per galaxy
  for (const k of layout.domains) { const G = layout.galaxies[k]; uCenter[G.id].copy(G.center); uQuat[G.id].set(G.q.x, G.q.y, G.q.z, G.q.w); uRot[G.id].set(G.spin * G.rotW, G.rotR0, G.rSolid); }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));   // galaxy-local rest positions
  geo.setAttribute("sz", new THREE.BufferAttribute(sz, 1));
  geo.setAttribute("gal", new THREE.BufferAttribute(gal, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: DOT }, fogD: { value: FOG }, pr: { value: Math.min(devicePixelRatio, 2) }, warpK: { value: 0 }, time: { value: 0 },
      drift: { value: DRIFT }, gCenter: { value: uCenter }, gQuat: { value: uQuat }, gRot: { value: uRot } },
    defines: { NG },
    vertexShader: `attribute float sz; attribute float gal; varying float vA;
      uniform float fogD, pr, warpK, time, drift; uniform vec3 gCenter[NG]; uniform vec4 gQuat[NG]; uniform vec3 gRot[NG];
      vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }
      void main(){
        int g = int(gal + 0.5); vec3 p = position;
        float r = length(p.xz); vec4 q = gQuat[g];
        vec3 rot = gRot[g]; float th = (g == 0) ? drift*time : rot.x*time/(max(r, rot.z) + rot.y);
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
