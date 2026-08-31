// Layout of the universe: 18 spiral galaxies plus an interstellar field, one star per public dataset.
// Positions are deterministic functions of (galaxy, index) so any dataset can be located without
// generating the whole field in order.
import * as THREE from "three";
import { DOT } from "./textures.js";

export const WORLD = 260;
export const FOG = 0.0022;

// hash-based rng: stable across builds and machines
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
    galaxies[k] = { id: i + 1, name: k, center, radius, N, q, arms: 2 + Math.floor(h32(i, 5, 1) * 2), twist: 3.5 + h32(i, 6, 1) * 3 };
  });
  galaxies.Uncharted = { id: 0, name: "Uncharted", N: manifest.galaxies.Uncharted?.n || 0 };
  return { domains, galaxies };
}

// world position + size of star j in galaxy G
export function starAt(G, j, out) {
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
  out.set(Math.cos(th) * rr, yy, Math.sin(th) * rr).applyQuaternion(G.q).add(G.center);
  return (bulge ? 1.1 : 0.8) + h32(id, j, 9) * 0.7;
}

export function buildStars(layout, manifest) {
  const order = [...layout.domains, "Uncharted"];
  const total = order.reduce((a, k) => a + (manifest.galaxies[k]?.n || 0), 0);
  const pos = new Float32Array(total * 3), sz = new Float32Array(total);
  const owner = new Uint8Array(total);         // galaxy id per star
  const local = new Uint32Array(total);        // index within galaxy
  const start = {};
  const v = new THREE.Vector3(); let c = 0;
  for (const k of order) {
    const G = layout.galaxies[k]; const n = manifest.galaxies[k]?.n || 0; start[k] = c;
    for (let j = 0; j < n; j++, c++) { sz[c] = starAt(G, j, v); pos[c * 3] = v.x; pos[c * 3 + 1] = v.y; pos[c * 3 + 2] = v.z; owner[c] = G.id; local[c] = j; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("sz", new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: DOT }, fogD: { value: FOG }, pr: { value: Math.min(devicePixelRatio, 2) }, warpK: { value: 0 } },
    vertexShader: `attribute float sz; varying float vA; uniform float fogD; uniform float pr; uniform float warpK;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); float d=-mv.z; float f=exp(-d*d*fogD*fogD*0.9);
        vA=f*(0.35+0.65*min(1.0,sz-0.5)); float near=smoothstep(0.0,6.0,d); vA*=0.25+0.75*near;
        gl_PointSize=clamp(sz*pr*(150.0/max(d,1.0)),1.0*pr,4.2*pr)*(1.0-warpK*0.6); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D tex; varying float vA; void main(){ vec4 t=texture2D(tex,gl_PointCoord); gl_FragColor=vec4(0.957,0.949,0.925,t.a*vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false;

  // uniform grid for proximity queries
  const CELL = 24; const grid = new Map();
  const key = (x, y, z) => ((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(y / CELL) + 512)) * 1024 + (Math.floor(z / CELL) + 512);
  for (let i = 0; i < total; i++) { const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(i); }
  function near(p, range) {
    const out = []; const c = Math.ceil(range / CELL); const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL), cz = Math.floor(p.z / CELL);
    for (let x = -c; x <= c; x++) for (let y = -c; y <= c; y++) for (let z = -c; z <= c; z++) {
      const a = grid.get((((cx + x) + 512) * 1024 + ((cy + y) + 512)) * 1024 + ((cz + z) + 512)); if (!a) continue;
      for (const i of a) { const dx = pos[i * 3] - p.x, dy = pos[i * 3 + 1] - p.y, dz = pos[i * 3 + 2] - p.z; const d2 = dx * dx + dy * dy + dz * dz; if (d2 < range * range) out.push([i, Math.sqrt(d2)]); }
    }
    return out;
  }
  const idToName = {}; for (const k in layout.galaxies) idToName[layout.galaxies[k].id] = k;
  return { points, mat, pos, sz, owner, local, start, total, near, galaxyOf: i => idToName[owner[i]], positionOf: (i, out) => out.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) };
}
