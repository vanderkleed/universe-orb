// Procedural textures (kept in the duo-tone palette).
import * as THREE from "three";

function radial(size, stops) {
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); stops.forEach(s => r.addColorStop(s[0], s[1]));
  g.fillStyle = r; g.fillRect(0, 0, size, size); const t = new THREE.CanvasTexture(c); return t;
}
export const HAZE = radial(256, [[0, "rgba(244,242,236,.5)"], [0.3, "rgba(244,242,236,.14)"], [1, "rgba(244,242,236,0)"]]);
export const DOT = radial(32, [[0, "rgba(244,242,236,1)"], [0.35, "rgba(244,242,236,.7)"], [1, "rgba(244,242,236,0)"]]);
export const SHADE = radial(128, [[0, "rgba(18,17,16,0)"], [0.62, "rgba(18,17,16,0)"], [0.86, "rgba(18,17,16,0.38)"], [1, "rgba(18,17,16,0.85)"]]);
export const RING = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  g.strokeStyle = "#F4F2EC"; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 52, 0, 6.283); g.stroke(); g.lineWidth = 2;
  [0, 1, 2, 3].forEach(i => { g.beginPath(); g.moveTo(64 + Math.cos(i * 1.5708) * 44, 64 + Math.sin(i * 1.5708) * 44); g.lineTo(64 + Math.cos(i * 1.5708) * 60, 64 + Math.sin(i * 1.5708) * 60); g.stroke(); });
  return new THREE.CanvasTexture(c);
})();
export function dither(seed) {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.fillStyle = "#1B1A18"; g.fillRect(0, 0, 64, 64); let s = seed * 9301 + 49297; const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { s = (s * 9301 + 49297) % 233280; const v = (s / 233280) * 0.55 + 0.35 * Math.sin((x + seed) * 0.2) * Math.cos((y - seed) * 0.17) + 0.35; if (v * 16 > bayer[(y % 4) * 4 + (x % 4)]) { g.fillStyle = "#F4F2EC"; g.globalAlpha = 0.08 + 0.16 * v; g.fillRect(x, y, 1, 1); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
