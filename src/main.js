// Universe Orb: you are a mirrored orb flying through every public dataset on Roboflow Universe.
import * as THREE from "three";
import { loadManifest, loadImagery, nameOf, galaxyShards, prettyName, monthName, fmt, esc } from "./data.js";
import { buildLayout, buildStars, starAt, WORLD, FOG } from "./universe.js";
import { buildPlanets } from "./planets.js";
import { HAZE, DOT, RING, SHADE, dither } from "./textures.js";
import { buildRail, markDom, makeLabels, makeScanPool, readout, tag, openDrawer, closeDrawer } from "./ui.js";
import { thumbUrl, imageryFor } from "./data.js";

const $ = id => document.getElementById(id);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

async function boot() {
  const manifest = await loadManifest();
  $("intro-p").textContent = `Charting ${fmt(manifest.total)} datasets`;
  const imagery = await loadImagery();
  const layout = buildLayout(manifest);
  const { domains, galaxies } = layout;

  /* ---------- renderer ---------- */
  const canvas = $("gl");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0x121110, 1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x121110, FOG);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 2000);
  const ship = new THREE.Object3D(); scene.add(ship);
  const camRig = new THREE.Object3D(); ship.add(camRig); camRig.add(camera);
  let camDist = 6.5, tCamDist = 6.5;

  /* ---------- universe ---------- */
  const stars = buildStars(layout, manifest); scene.add(stars.points);
  domains.forEach(k => { const G = galaxies[k]; const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: HAZE, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending })); haze.position.copy(G.center); haze.scale.setScalar(G.radius * 3); scene.add(haze); G.haze = haze; });
  const planets = buildPlanets(scene, layout, imagery);

  /* ---------- the orb ---------- */
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(0.3, 900, cubeRT); scene.add(cubeCam);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.72, 96, 96), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05, envMap: cubeRT.texture, envMapIntensity: 1.25 }));
  ship.add(orb);
  orb.add(new THREE.Mesh(new THREE.SphereGeometry(0.74, 64, 64), new THREE.MeshBasicMaterial({ color: 0xF4F2EC, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false })));
  const orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })); orbGlow.scale.setScalar(4.2); orb.add(orbGlow);
  scene.add(new THREE.AmbientLight(0xF4F2EC, 0.22)); const key = new THREE.DirectionalLight(0xF4F2EC, 0.45); key.position.set(3, 5, 4); scene.add(key);
  const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: RING, transparent: true, opacity: 0, depthWrite: false, depthTest: false })); reticle.scale.setScalar(1.6); scene.add(reticle);

  /* ---------- hyperspace streaks ---------- */
  const STREAKS = 900, sBase = new Float32Array(STREAKS * 3), sPos = new Float32Array(STREAKS * 6);
  for (let i = 0; i < STREAKS; i++) { const a = Math.random() * 6.283, r = 1.2 + Math.pow(Math.random(), 0.7) * 10; sBase[i * 3] = Math.cos(a) * r; sBase[i * 3 + 1] = Math.sin(a) * r; sBase[i * 3 + 2] = -Math.random() * 60; }
  const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  const streaks = new THREE.LineSegments(sGeo, new THREE.LineBasicMaterial({ color: 0xF4F2EC, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); streaks.frustumCulled = false; camRig.add(streaks);
  let warp = 0, warpPhase = null, warpT = 0, warpZ = 0, warpRun = null, pendingWarp = null;
  function updateStreaks(dt) {
    if (warp <= 0.001) { streaks.visible = false; return; } streaks.visible = true; warpZ += dt * (20 + warp * 140); const L = 0.3 + warp * warp * 16;
    for (let i = 0; i < STREAKS; i++) { let z = (sBase[i * 3 + 2] + warpZ) % 60; z = z - 56; const x = sBase[i * 3], y = sBase[i * 3 + 1]; sPos[i * 6] = x; sPos[i * 6 + 1] = y; sPos[i * 6 + 2] = z; sPos[i * 6 + 3] = x; sPos[i * 6 + 4] = y; sPos[i * 6 + 5] = z + L; }
    sGeo.attributes.position.needsUpdate = true; streaks.material.opacity = Math.min(1, warp * 1.4) * 0.75;
  }

  /* ---------- flight ---------- */
  let yaw = 0.4, pitch = 0, tYaw = 0.4, tPitch = 0, yawVel = 0, speed = 0, thrust = 0;
  const CRUISE = reduce ? 0 : 0.5, JUMP = 110;
  let auto = null;
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const headingTo = vv => { const len = vv.length() || 1; return { yaw: Math.atan2(-vv.x, -vv.z), pitch: Math.asin(Math.max(-1, Math.min(1, vv.y / len))) }; };
  const wrap = a => { while (a > Math.PI) a -= 6.283185; while (a < -Math.PI) a += 6.283185; return a; };
  function flyTo(P, standoff) {
    auto = { target: P.clone(), standoff }; tCamDist = 6.5;
    const dist = P.distanceTo(ship.position);
    if (dist > JUMP && reduce) jumpNear(P, standoff);
    else if (dist > JUMP) { if (!warpPhase) hyperspace(P, standoff); else pendingWarp = { P: P.clone(), standoff }; }
  }
  function jumpNear(P, standoff) { tmp.copy(P).sub(ship.position).normalize(); ship.position.copy(P).sub(tmp.multiplyScalar(standoff + 14)); const h = headingTo(tmp2.copy(P).sub(ship.position)); yaw = tYaw = h.yaw; pitch = tPitch = h.pitch; }
  function hyperspace(P, standoff) { const start = ship.position.clone(); const dir = P.clone().sub(start); const dist = dir.length(); dir.normalize(); const D = Math.max(0, dist - (standoff + 12)); warpRun = { start, dir, D, T: Math.min(3.6, 1.4 + D / 380), P: P.clone() }; warpPhase = "fly"; warpT = 0; }
  function updateWarp(dt) {
    if (!warpPhase) { warp += (0 - warp) * Math.min(1, dt * 6); }
    else {
      warpT += dt; const R = warpRun; const p = Math.min(1, warpT / R.T); const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      ship.position.copy(R.start).addScaledVector(R.dir, R.D * e);
      const h = headingTo(tmp.copy(R.P).sub(ship.position)); tYaw = yaw + wrap(h.yaw - yaw); tPitch = h.pitch;
      warp = Math.pow(Math.sin(p * Math.PI), 0.55);
      if (p >= 1) { warpPhase = null; warp = 0; if (pendingWarp) { const q = pendingWarp; pendingWarp = null; if (auto) hyperspace(q.P, q.standoff); } }
    }
    $("flash").style.opacity = Math.pow(warp, 4) * 0.5; camera.fov = 52 + warp * 40; camera.updateProjectionMatrix(); stars.mat.uniforms.warpK.value = warp;
  }

  /* ---------- focus ---------- */
  // A "star" record: { index (global star index), slug, galaxy, j, lastmod, cover, item (planet item or null) }
  let focus = null, activeDom = null;
  const constel = new THREE.Group(); scene.add(constel); let constelT = 0;
  const circleGeo = new THREE.CircleGeometry(0.5, 56), edgeGeo = new THREE.EdgesGeometry(circleGeo);
  function clearConstellation() { while (constel.children.length) { const c = constel.children.pop(); c.material.dispose(); } }
  async function showConstellation(star) {
    clearConstellation(); const im = await imageryFor(star.slug); if (!im || focus !== star || !im.s?.length) return;
    constel.position.copy(star.pos); const base = star.item ? star.item.size : 1.4; const n = im.s.length, ring = base * 2.0;
    im.s.forEach((k, i) => {
      const a = i / n * 6.283 - 1.2, r = ring * (1 + 0.12 * Math.sin(i * 2.7));
      const pl = new THREE.Mesh(circleGeo, new THREE.MeshBasicMaterial({ map: dither(i + 5), transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
      pl.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.7, (Math.random() - 0.5) * 1.5); pl.userData = { base: base * 0.42 }; pl.scale.setScalar(0.001);
      pl.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xF4F2EC, transparent: true, opacity: 0.25 })));
      const sh = new THREE.Mesh(circleGeo, new THREE.MeshBasicMaterial({ map: SHADE, transparent: true, depthWrite: false })); sh.position.z = 0.002; pl.add(sh);
      constel.add(pl);
      new THREE.TextureLoader().setCrossOrigin("anonymous").load(thumbUrl(k), t => { t.colorSpace = THREE.SRGBColorSpace; pl.material.map = t; pl.material.needsUpdate = true; });
    });
    constelT = 0;
  }
  function release(closeToo) { auto = null; pendingWarp = null; if (focus) { focus = null; clearConstellation(); closeDrawer(); } reticle.material.opacity = 0; if (closeToo) thrust = 0; }
  addEventListener("orb:release", () => release(true));

  function starRecord(index) {
    const galaxy = stars.galaxyOf(index), j = stars.local[index];
    const nm = nameOf(manifest, galaxy, j);           // may be null until the shard arrives
    const pos = stars.positionOf(index, new THREE.Vector3());
    const slug = nm ? nm[0] : null; const item = slug ? planets.bySlug.get(slug) : null;
    return { index, slug, galaxy, j, lastmod: nm ? nm[1] : null, cover: item ? item.cover : null, item, pos };
  }
  async function enterStar(index) {
    release();
    const galaxy = stars.galaxyOf(index); const j = stars.local[index];
    // make sure its name shard is in before opening the drawer
    if (!nameOf(manifest, galaxy, j)) { const { shardFor, loadShard } = await import("./data.js"); const s = shardFor(manifest, galaxy, j); if (s?.file) await loadShard(s.file); }
    const star = starRecord(index); if (!star.slug) return;
    focus = star; activeDom = galaxy; markDom(galaxy === "Uncharted" ? null : galaxy);
    flyTo(star.pos, star.item ? star.item.size * 5 : 3.2);
    reticle.position.copy(star.pos); reticle.material.opacity = star.item ? 0 : 0.9;
    openDrawer(star); showConstellation(star); tag.hide();
    history.replaceState(null, "", "#" + star.slug);
  }
  function enterPlanet(item) { const G = galaxies[item.dom]; const idx = stars.start[item.dom] + item.j; enterStar(idx); }
  function goDomain(k) { release(); activeDom = k; markDom(k); const G = galaxies[k]; flyTo(G.center.clone(), G.radius * 0.55); galaxyShards(manifest, k); history.replaceState(null, "", "#galaxy/" + k.toLowerCase()); }
  function randomJump() {
    const pickPlanet = Math.random() < 0.7 && planets.items.length;
    if (pickPlanet) { const it = planets.items[Math.floor(Math.random() * planets.items.length)]; enterPlanet(it); }
    else enterStar(Math.floor(Math.random() * stars.total));
    // always give the jump its hyperspace treatment
    setTimeout(() => { if (auto && !warpPhase && auto.target.distanceTo(ship.position) <= JUMP && !reduce) hyperspace(auto.target, auto.standoff); }, 0);
  }
  $("rnd").addEventListener("click", randomJump);

  /* ---------- input ---------- */
  let dragging = false, lx = 0, ly = 0, moved = 0, mx = innerWidth / 2, my = innerHeight / 2; const mouse = new THREE.Vector2(0, 0);
  canvas.addEventListener("pointerdown", e => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = -(e.clientY / innerHeight) * 2 + 1; mx = e.clientX; my = e.clientY;
    if (!dragging) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) { canvas.classList.add("dragging"); if (auto) auto = null; tYaw -= dx * 0.0038; tPitch = Math.max(-1.3, Math.min(1.3, tPitch + dy * 0.0032)); }
  });
  canvas.addEventListener("pointerup", e => { dragging = false; canvas.classList.remove("dragging"); if (moved < 6) clickAt(e.clientX, e.clientY); });
  canvas.addEventListener("wheel", e => { e.preventDefault(); tCamDist = Math.max(4.5, Math.min(220, tCamDist * (1 + e.deltaY * 0.0016))); }, { passive: false });
  addEventListener("keydown", e => { if (e.key === "Escape") release(true); if (e.key === "r" || e.key === "R") randomJump(); if (e.key === "m" || e.key === "M") tCamDist = tCamDist > 60 ? 6.5 : 180; });
  addEventListener("resize", onResize); function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); } onResize();

  const ray = new THREE.Raycaster();
  function clickAt(x, y) {
    const nd = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(nd, camera);
    const hits = ray.intersectObjects(planets.active(), false); if (hits.length) { enterPlanet(hits[0].object.userData.item); return; }
    const camP = camera.getWorldPosition(tmp2); let best = -1, bd = 0.018;
    for (const [i, dist] of stars.near(ship.position, 90)) { stars.positionOf(i, v3).sub(camP); const len = v3.length(); const ang = Math.acos(Math.max(-1, Math.min(1, v3.dot(ray.ray.direction) / len))); const w = ang * Math.sqrt(len / 30); if (w < bd) { bd = w; best = i; } }
    if (best >= 0) { enterStar(best); return; }
    let bg = null, bga = 1e9; domains.forEach(k => { const G = galaxies[k]; v3.copy(G.center).sub(camP); const len = v3.length(); const ang = Math.acos(Math.max(-1, Math.min(1, v3.dot(ray.ray.direction) / len))); const app = Math.atan2(G.radius * 0.95, len); if (ang < app && ang / app < bga) { bga = ang / app; bg = k; } });
    if (bg) { goDomain(bg); return; }
    release(); const P = camP.clone().add(ray.ray.direction.clone().multiplyScalar(45)); flyTo(P, 0.5);
  }

  /* ---------- hover + scanner ---------- */
  let hot = null, hotStar = -1;
  function hover() {
    if (dragging) return;
    ray.setFromCamera(mouse, camera); const hits = ray.intersectObjects(planets.active(), false); const h = hits.length ? hits[0].object : null;
    if (h !== hot) { hot = h; if (h && (!focus || h.userData.item !== focus.item)) { const it = h.userData.item; tag.show(`${esc(prettyName(it.slug))}<small>${esc(it.dom)}</small>`, mx, my); } else if (hotStar < 0) tag.hide(); }
    if (h && (!focus || h.userData.item !== focus.item)) tag.move(mx, my);
    canvas.classList.toggle("hot", !!h || hotStar >= 0);
  }
  const slabels = makeScanPool(22);
  function scan() {
    const cand = []; const cx = innerWidth / 2, cy = innerHeight / 2;
    for (const [i, dist] of stars.near(ship.position, 42)) {
      stars.positionOf(i, v3).project(camera); if (v3.z > 1 || Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1) continue;
      const sx = (v3.x * 0.5 + 0.5) * innerWidth, sy = (-v3.y * 0.5 + 0.5) * innerHeight; cand.push({ i, dist, sx, sy, sc: Math.hypot(sx - cx, sy - cy) + dist * 6 });
    }
    cand.sort((a, b) => a.sc - b.sc);
    const placed = [], picked = [];
    for (const c of cand) { if (picked.length >= slabels.length) break; if (placed.some(p => Math.abs(p.sy - c.sy) < 14 && Math.abs(p.sx - c.sx) < 170)) continue; const nm = nameOf(manifest, stars.galaxyOf(c.i), stars.local[c.i]); if (!nm) continue; c.nm = nm; placed.push(c); picked.push(c); }
    let hs = -1, hd = 18, hsc = null;
    for (let k = 0; k < slabels.length; k++) {
      const el = slabels[k]; const c = picked[k]; if (!c || tCamDist > 40) { el.style.opacity = 0; continue; }
      el.textContent = prettyName(c.nm[0]); el.style.transform = `translate(${c.sx}px,${c.sy}px) translate(8px,-50%)`; el.style.opacity = Math.max(0.18, 1 - c.dist / 42) * (focus && focus.index === c.i ? 1 : 0.75);
      const d2 = Math.hypot(c.sx - mx, c.sy - my); if (d2 < hd) { hd = d2; hs = c.i; hsc = c; }
    }
    if (hs !== hotStar) { hotStar = hs; if (hs >= 0 && (!focus || focus.index !== hs)) tag.show(`${esc(prettyName(hsc.nm[0]))}<small>${esc(stars.galaxyOf(hs))} · updated ${monthName(hsc.nm[1])}</small>`, mx, my); else if (!hot) tag.hide(); }
    if (hs >= 0 && (!focus || focus.index !== hs)) tag.move(mx, my);
  }

  /* ---------- labels & readout ---------- */
  const labelEls = makeLabels(layout, manifest);
  function placeLabels() {
    domains.forEach(k => { const G = galaxies[k]; v3.copy(G.center); v3.y += G.radius * 0.75 + 3; const dW = ship.position.distanceTo(G.center); v3.project(camera); const el = labelEls[k];
      if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) { el.style.opacity = 0; return; }
      const inside = dW < G.radius * 1.1; el.style.opacity = inside ? 0.22 : Math.max(0.3, Math.min(1, 1 - (dW - 200) / 500));
      el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * innerWidth}px,${(-v3.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%)`; });
  }
  function updateReadout() {
    let key, name, meta;
    if (focus) { key = auto ? "Flying to" : "Holding at"; name = prettyName(focus.slug); meta = `<span>${focus.galaxy}</span><span>updated ${monthName(focus.lastmod)}</span>`; }
    else if (auto) { key = "Flying"; let g = null, gd = 1e9; domains.forEach(k => { const dd = galaxies[k].center.distanceTo(auto.target); if (dd < gd) { gd = dd; g = k; } }); const inG = gd < galaxies[g].radius * 1.2; name = inG ? g : "Open space"; meta = inG ? `<span>${fmt(manifest.galaxies[g].n)} datasets</span>` : ""; }
    else {
      let best = null, bd = 1e9; camera.getWorldDirection(fwd);
      for (const m of planets.active()) { v3.copy(m.position).sub(ship.position); const along = v3.dot(fwd); if (along < 0) continue; const off = tmp.copy(v3).sub(tmp2.copy(fwd).multiplyScalar(along)).length(); const sc = Math.atan2(off, along) + along * 0.004; if (sc < bd) { bd = sc; best = m; } }
      if (best) { const it = best.userData.item; key = "Ahead"; name = prettyName(it.slug); meta = `<span>${it.dom}</span><span>${fmt(Math.round(best.position.distanceTo(ship.position)))} away</span>`; } else { key = "Ahead"; name = "Open space"; meta = ""; }
    }
    readout.set(key, name, meta);
    let g = null, gd = 1e9; domains.forEach(k => { const dd = galaxies[k].center.distanceTo(ship.position); if (dd < gd) { gd = dd; g = k; } });
    readout.sector(gd < galaxies[g].radius * 1.15 ? g : "Interstellar");
    readout.range(auto ? fmt(Math.max(0, Math.round(auto.target.distanceTo(ship.position) - auto.standoff))) : (focus ? "0" : "—"));
  }
  buildRail(manifest, layout, goDomain);

  /* ---------- loop ---------- */
  const clock = new THREE.Clock(); let t = 0, frame = 0; const qBill = new THREE.Quaternion();
  function loop() {
    requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), 0.05); t += dt; frame++;
    updateWarp(dt);
    if (auto && !warpPhase) {
      tmp.copy(auto.target).sub(ship.position); const dist = tmp.length(); const h = headingTo(tmp); tYaw = yaw + wrap(h.yaw - yaw); tPitch = h.pitch;
      const remain = dist - auto.standoff; thrust = remain > 0.4 ? Math.min(40, Math.sqrt(Math.max(0, remain) * 16) + 0.4) : 0;
      if (remain <= 0.4) { auto = null; thrust = 0; if (focus && innerWidth > 720) tYaw = yaw - 0.22; }
    }
    const py = yaw; yaw += wrap(tYaw - yaw) * Math.min(1, dt * 4.5); pitch += (tPitch - pitch) * Math.min(1, dt * 4.5); yawVel = (yaw - py) / Math.max(dt, 1e-3);
    ship.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
    camRig.rotation.z += ((-yawVel * 0.1) - camRig.rotation.z) * Math.min(1, dt * 3);
    const target = focus && !auto ? 0 : (auto ? thrust : CRUISE + thrust); speed += (target - speed) * Math.min(1, dt * (target < speed ? 5 : 2.2)); if (!auto) thrust += (0 - thrust) * Math.min(1, dt * 0.35);
    fwd.set(0, 0, -1).applyQuaternion(ship.quaternion); if (!warpPhase) ship.position.addScaledVector(fwd, speed * dt); else speed = 0;
    const rr = ship.position.length(); if (rr > WORLD * 1.9) ship.position.multiplyScalar(WORLD * 1.9 / rr);
    camDist += (tCamDist - camDist) * Math.min(1, dt * 3); camera.position.set(0, 0.9 + camDist * 0.12, camDist); camera.lookAt(camRig.localToWorld(v3.set(0, camDist * 0.03, -camDist * 0.5)));
    orb.position.y = Math.sin(t * 0.9) * 0.03; orb.rotation.y = t * 0.05; orb.scale.setScalar(1 + Math.max(0, camDist - 6.5) * 0.06);
    camera.getWorldQuaternion(qBill); const camP = camera.getWorldPosition(tmp2);
    if (frame % 8 === 0) planets.assign(ship.position, focus?.item || null);
    for (const m of planets.active()) { m.quaternion.copy(qBill); const it = m.userData.item; const s = it.size * (m === hot ? 1.12 : 1); m.scale.x += (s - m.scale.x) * 0.2; m.scale.y = m.scale.z = m.scale.x;
      const dc = m.position.distanceTo(camP); const fade = Math.max(0, Math.min(1, (dc - 2) / 3)); m.material.opacity = 0.96 * fade; m.userData.edge.material.opacity = ((m === hot || (focus && focus.item === it)) ? 0.9 : 0.2) * fade; m.userData.glow.material.opacity = 0.32 * Math.min(1, dc / 60) * fade; }
    domains.forEach(k => { const G = galaxies[k]; const dd = ship.position.distanceTo(G.center); G.haze.material.opacity = 0.2 * Math.max(0.15, Math.min(1, (dd - G.radius * 0.6) / (G.radius * 1.2))); });
    if (constel.children.length) { constelT += dt; constel.children.forEach((c, i) => { c.quaternion.copy(qBill); const k = Math.min(1, Math.max(0, (constelT - i * 0.07) * 2.2)); const e = 1 - Math.pow(1 - k, 3); c.scale.setScalar(c.userData.base * e + 0.001); }); }
    if (reticle.material.opacity > 0) { reticle.material.rotation = t * 0.6; const rd = reticle.position.distanceTo(camP); reticle.scale.setScalar(0.06 * rd + 0.6); }
    updateStreaks(dt); hover();
    if (frame % 2 === 0) { orb.visible = false; streaks.visible = false; cubeCam.position.copy(orb.getWorldPosition(v3)); cubeCam.update(renderer, scene); orb.visible = true; streaks.visible = warp > 0.001; }
    renderer.render(scene, camera);
    if (frame % 3 === 0) { placeLabels(); updateReadout(); }
    if (frame % 4 === 1) scan();
  }
  loop();

  // arrive: from far outside, on a hyperspace flight into a galaxy (or the dataset in the URL hash)
  setTimeout(async () => {
    $("intro").classList.add("gone");
    const hash = decodeURIComponent(location.hash.slice(1));
    const first = domains[Math.floor(Math.random() * domains.length)]; const G = galaxies[first];
    ship.position.copy(G.center).add(new THREE.Vector3(0.3, 0.25, 1).normalize().multiplyScalar(WORLD * 1.6));
    if (hash.startsWith("galaxy/")) { const k = domains.find(d => d.toLowerCase() === hash.slice(7)); if (k) return goDomain(k); }
    if (hash.includes("/")) { const found = await findSlug(hash); if (found >= 0) return enterStar(found); }
    goDomain(first);
  }, 1400);
  async function findSlug(slug) {
    // search shards for a slug (loads at most all shards once; used only for deep links)
    for (const k of [...domains, "Uncharted"]) { const lists = await galaxyShards(manifest, k); let j = 0; for (const list of lists) { for (const e of list) { if (e[0] === slug) return stars.start[k] + j; j++; } } }
    return -1;
  }
  window.__u = { ship, camera, stars, planets, galaxies, enterStar, goDomain, randomJump, get focus() { return focus; }, get auto() { return auto; }, get warp() { return warp; } };
}
boot().catch(e => { console.error(e); $("intro-p").textContent = "Could not load the index. " + e.message; });
