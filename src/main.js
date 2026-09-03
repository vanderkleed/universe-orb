// Universe Orb: you are a mirrored orb flying through every public dataset on Roboflow Universe.
import * as THREE from "three";
import { loadManifest, loadImagery, nameOf, galaxyShards, prettyName, monthName, fmt, esc } from "./data.js";
import { buildLayout, buildStars, starNow, now, WORLD, FOG } from "./universe.js";
import { createSearch } from "./search.js";
import { createAudio } from "./audio.js";
import { buildPlanets } from "./planets.js";
import { HAZE, DOT, RING, SHADE, dither } from "./textures.js";
import { buildRail, markDom, makeLabels, makeScanPool, readout, tag, openDrawer, closeDrawer } from "./ui.js";
import { thumbUrl, imageryFor } from "./data.js";

const $ = id => document.getElementById(id);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const audio = createAudio();
{ const b = $("snd"); const label = on => { b.innerHTML = `Sound ${on ? "on" : "off"} <kbd>V</kbd>`; b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on); }; label(audio.on); audio.onChange(label); b.addEventListener("click", () => audio.toggle()); }

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
  let yaw = 0.4, pitch = 0, tYaw = 0.4, tPitch = 0, roll = 0, tRoll = 0, yawVel = 0, speed = 0, thrust = 0, strafe = 0;
  const CRUISE = reduce ? 0 : 0.5, JUMP = 110;
  let auto = null;
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const headingTo = vv => { const len = vv.length() || 1; return { yaw: Math.atan2(-vv.x, -vv.z), pitch: Math.asin(Math.max(-1, Math.min(1, vv.y / len))) }; };
  const wrap = a => { while (a > Math.PI) a -= 6.283185; while (a < -Math.PI) a += 6.283185; return a; };
  // steer in the pilot's own frame: a turn (h) is about the ship's up axis and a pitch (v) about its
  // right axis, so after a spin the controls still mean what the pilot sees (rolled 180°, left is left)
  const steer = (h, v) => { const c = Math.cos(roll), s = Math.sin(roll); tYaw += h * c + v * s; tPitch = Math.max(-1.3, Math.min(1.3, tPitch + v * c - h * s)); };
  function flyTo(P, standoff) {
    auto = { target: P.clone(), standoff }; tCamDist = 6.5;
    const dist = P.distanceTo(ship.position);
    if (dist > JUMP && reduce) jumpNear(P, standoff);
    else if (dist > JUMP) { if (!warpPhase) hyperspace(P, standoff); else pendingWarp = { P: P.clone(), standoff }; }
  }
  function jumpNear(P, standoff) { tmp.copy(P).sub(ship.position).normalize(); ship.position.copy(P).sub(tmp.multiplyScalar(standoff + 14)); const h = headingTo(tmp2.copy(P).sub(ship.position)); yaw = tYaw = h.yaw; pitch = tPitch = h.pitch; }
  function hyperspace(P, standoff) { const start = ship.position.clone(); const dir = P.clone().sub(start); const dist = dir.length(); dir.normalize(); const D = Math.max(0, dist - (standoff + 12)); warpRun = { start, dir, D, T: Math.min(3.6, 1.4 + D / 380), P: P.clone() }; warpPhase = "fly"; warpT = 0; audio.play.warp(warpRun.T); }
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
  function release(closeToo) { auto = null; pendingWarp = null; if (focus) { focus = null; clearConstellation(); closeDrawer(); if (closeToo) audio.play.close(); } reticle.material.opacity = 0; if (closeToo) thrust = 0; }
  addEventListener("orb:release", () => release(true));

  function starRecord(index) {
    const galaxy = stars.galaxyOf(index), j = stars.local[index];
    const nm = nameOf(manifest, galaxy, j);           // may be null until the shard arrives
    const pos = stars.positionOf(index, new THREE.Vector3());
    const slug = nm ? nm[0] : null; const item = slug ? planets.bySlug.get(slug) : null;
    return { index, slug, galaxy, G: galaxies[galaxy], j, lastmod: nm ? nm[1] : null, cover: item ? item.cover : null, item, pos };
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
    openDrawer(star); showConstellation(star); tag.hide(); audio.play.select(); audio.play.open();
    history.replaceState(null, "", "#" + star.slug);
  }
  function enterPlanet(item) { enterStar(stars.start[item.dom] + item.j); }
  function enterAt(galaxy, j) { enterStar(stars.start[galaxy] + j); }
  function goDomain(k) { release(); audio.play.select(); activeDom = k; markDom(k); const G = galaxies[k]; flyTo(G.center.clone(), G.radius * 0.55); galaxyShards(manifest, k); history.replaceState(null, "", "#galaxy/" + k.toLowerCase()); }
  function randomJump() {
    const pickPlanet = Math.random() < 0.7 && planets.items.length;
    if (pickPlanet) { const it = planets.items[Math.floor(Math.random() * planets.items.length)]; enterPlanet(it); }
    else enterStar(Math.floor(Math.random() * stars.total));
    // always give the jump its hyperspace treatment
    setTimeout(() => { if (auto && !warpPhase && auto.target.distanceTo(ship.position) <= JUMP && !reduce) hyperspace(auto.target, auto.standoff); }, 0);
  }
  $("rnd").addEventListener("click", randomJump);

  /* ---------- big bang: replay every dataset's arrival in creation order ---------- */
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let births = null, sortedBirths = null, replaying = false;
  async function loadBirths() {
    if (births) return;
    const attr = stars.birthAttr, arr = attr.array;
    for (const k of [...domains, "Uncharted"]) {
      const lists = await galaxyShards(manifest, k);
      let j = 0; const s = stars.start[k];
      for (const list of lists) for (const e of list) {
        const lm = e[1] || "";
        let m;
        if (/^\d{4}-\d{2}/.test(lm)) m = (+lm.slice(0, 4) - 2020) * 12 + (+lm.slice(5, 7) - 1);
        else m = 20 + (((j * 2654435761) >>> 0) % 1000) / 1000 * 44;   // undated: scatter through mid-history
        arr[s + j] = Math.max(0, m); j++;
      }
    }
    attr.needsUpdate = true; births = arr;
    sortedBirths = Float32Array.from(arr).sort();
  }
  const bornCount = play => { let lo = 0, hi = sortedBirths.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sortedBirths[m] <= play) lo = m + 1; else hi = m; } return lo; };
  async function bigbang() {
    if (replaying) return; replaying = true;
    $("ep-d").textContent = "Reading the record…"; $("ep-c").textContent = ""; $("epoch").classList.add("on");
    try { await loadBirths(); } catch { $("epoch").classList.remove("on"); replaying = false; return; }
    release(true); planets.group.visible = false;
    const lo = sortedBirths[0], hi = sortedBirths[sortedBirths.length - 1];
    const D = 16, t0 = performance.now(); let lastYear = -1;
    (function step() {
      const u = Math.min(1, (performance.now() - t0) / 1000 / D);
      const e2 = u * u * (3 - 2 * u);
      const play = lo - 1.2 + (hi - lo + 3) * e2;
      stars.setPlay(play);
      const mAbs = Math.max(0, Math.min(hi, play)); const yr = 2020 + Math.floor(mAbs / 12);
      $("ep-d").textContent = `${MO[Math.floor(mAbs) % 12]} ${yr}`;
      $("ep-c").textContent = `${fmt(bornCount(play))} datasets`;
      if (yr !== lastYear) { lastYear = yr; audio.play.tick(); }
      if (u < 1) requestAnimationFrame(step);
      else setTimeout(() => { stars.setPlay(1e9); planets.group.visible = true; $("epoch").classList.remove("on"); replaying = false; }, 1600);
    })();
  }

  /* ---------- comets: datasets touched this month or last streak with a faint tail ---------- */
  // each tail is three tapered segments (6 vertices) that sway slowly, so they read as plumes, not rods
  const NC = 80, SEG = 3; const cGeo = new THREE.BufferGeometry();
  const cPos = new Float32Array(NC * SEG * 6), cCol = new Float32Array(NC * SEG * 6);
  cGeo.setAttribute("position", new THREE.BufferAttribute(cPos, 3)); cGeo.setAttribute("color", new THREE.BufferAttribute(cCol, 3));
  const comets = new THREE.LineSegments(cGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  comets.frustumCulled = false; comets.visible = false; scene.add(comets);
  let cometIdx = []; const cq = new THREE.Vector3(), cn = new THREE.Vector3(), cp = new THREE.Vector3();
  const TAPER = [1, 0.42, 0.14, 0], KNOT = [0, 0.3, 0.62, 1];
  function pickComets() {
    if (!births || replaying) { comets.visible = false; return; }
    const cutoff = sortedBirths[sortedBirths.length - 1] - 1;
    cometIdx = stars.near(ship.position, 110).filter(([i]) => births[i] >= cutoff).sort((a, b) => a[1] - b[1]).slice(0, NC).map(c => c[0]);
    comets.visible = cometIdx.length > 0; cGeo.setDrawRange(0, cometIdx.length * SEG * 2);
  }
  function updateComets() {
    for (let n = 0; n < cometIdx.length; n++) {
      const i = cometIdx[n]; stars.positionOf(i, v3);
      const G = galaxies[stars.galaxyOf(i)];   // tail trails the star's orbital motion
      if (G.id === 0) cq.set(-v3.z, 0, v3.x); else { tmp.copy(v3).sub(G.center).applyQuaternion(G.qInv); cq.set(-tmp.z, 0, tmp.x).multiplyScalar(G.spin).applyQuaternion(G.q); }
      const L = 0.8 + (i % 7) * 0.13; cq.normalize();
      cn.set(cq.y, -cq.x, 0.3).normalize();   // sideways drift axis for the sway
      const sway = Math.sin(t * 0.6 + i * 0.37) * 0.16, tw = 0.75 + 0.25 * Math.sin(t * 1.7 + i);
      let o = n * SEG * 6;
      for (let s = 0; s < SEG; s++) for (let e = 0; e < 2; e++) {
        const k = KNOT[s + e];
        cp.copy(v3).addScaledVector(cq, -L * k).addScaledVector(cn, sway * k * k);
        cPos[o] = cp.x; cPos[o + 1] = cp.y; cPos[o + 2] = cp.z;
        cCol[o] = cCol[o + 1] = cCol[o + 2] = TAPER[s + e] * tw; o += 3;
      }
    }
    cGeo.attributes.position.needsUpdate = true; cGeo.attributes.color.needsUpdate = true;
  }
  // the dates arrive quietly in the background so comets appear without being asked for
  setTimeout(() => { if (!reduce && !(navigator.connection && navigator.connection.saveData)) loadBirths().catch(() => {}); }, 9000);

  /* ---------- guide + one-time hints ---------- */
  const SEEN = "universe-orb:seen";
  const seen = (() => { try { return new Set(JSON.parse(localStorage.getItem(SEEN) || "[]")); } catch { return new Set(); } })();
  const mark = k => { seen.add(k); try { localStorage.setItem(SEEN, JSON.stringify([...seen])); } catch {} };
  let hintT = null;
  function hintOnce(key, html, ms = 6500) {
    if (seen.has(key) || !$("guide").hidden) return; mark(key);
    const el = $("hint"); el.innerHTML = html; el.classList.add("show");
    clearTimeout(hintT); hintT = setTimeout(() => el.classList.remove("show"), ms);
  }
  function openGuide() { $("guide").hidden = false; }
  function closeGuide() { $("guide").hidden = true; mark("guide"); }
  $("help").addEventListener("click", openGuide);
  $("g-close").addEventListener("click", closeGuide);
  $("g-jump").addEventListener("click", () => { closeGuide(); randomJump(); });
  // first visit: the guide comes up once the arrival flight has begun
  if (!seen.has("guide")) setTimeout(openGuide, 3200);
  // gentle nudges, each shown once, spaced out
  let arrivals = 0, searched = false;
  setTimeout(() => { if (!searched) hintOnce("h-search", `<kbd>/</kbd> search all ${fmt(manifest.total)} datasets`); }, 75000);

  /* ---------- input ---------- */
  let dragging = false, lx = 0, ly = 0, moved = 0, mx = innerWidth / 2, my = innerHeight / 2; const mouse = new THREE.Vector2(0, 0);
  canvas.addEventListener("pointerdown", e => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = -(e.clientY / innerHeight) * 2 + 1; mx = e.clientX; my = e.clientY;
    if (!dragging) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) { canvas.classList.add("dragging"); if (auto) auto = null; steer(-dx * 0.0038, dy * 0.0032); }
  });
  canvas.addEventListener("pointerup", e => { dragging = false; canvas.classList.remove("dragging"); if (moved < 6) clickAt(e.clientX, e.clientY); });
  canvas.addEventListener("wheel", e => { e.preventDefault(); tCamDist = Math.max(4.5, Math.min(220, tCamDist * (1 + e.deltaY * 0.0016))); }, { passive: false });
  // WASD moves the ship in its own frame: W thrust, S reverse, A/D slide left and right; Q/E spin about the
  // view axis; hold Shift for turbo. Turning is the mouse's job (drag), with the arrow keys as a fallback.
  const keys = { w: 0, s: 0, a: 0, d: 0, l: 0, r: 0, q: 0, e: 0, boost: 0 };
  const keyMap = { w: "w", arrowup: "w", s: "s", arrowdown: "s", a: "a", d: "d", arrowleft: "l", arrowright: "r", q: "q", e: "e" };
  addEventListener("keydown", e => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.key === "Shift") keys.boost = 1;
    const k = keyMap[e.key.toLowerCase()]; if (k && !e.metaKey && !e.ctrlKey) { keys[k] = 1; e.preventDefault(); return; }
    if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); $("q").focus(); $("q").select(); return; }
    if (e.key === "Escape") { if (!$("guide").hidden) { closeGuide(); return; } release(true); } if (e.key === "r" || e.key === "R") randomJump(); if (e.key === "b" || e.key === "B") bigbang(); if (e.key === "m" || e.key === "M") tCamDist = tCamDist > 60 ? 6.5 : 180; if (e.key === "v" || e.key === "V") audio.toggle(); });
  addEventListener("keyup", e => { if (e.key === "Shift") keys.boost = 0; const k = keyMap[e.key.toLowerCase()]; if (k) keys[k] = 0; });
  addEventListener("blur", () => { keys.w = keys.s = keys.a = keys.d = keys.l = keys.r = keys.q = keys.e = keys.boost = 0; });
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
    if (h !== hot) { hot = h; if (h) audio.play.tick(); if (h && (!focus || h.userData.item !== focus.item)) { const it = h.userData.item; tag.show(`${esc(prettyName(it.slug))}<small>${esc(it.dom)}</small>`, mx, my); } else if (hotStar < 0) tag.hide(); }
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
    const placed = [], picked = []; const q = searchQuery.trim().toLowerCase();
    for (const c of cand) { if (picked.length >= slabels.length) break; if (placed.some(p => Math.abs(p.sy - c.sy) < 14 && Math.abs(p.sx - c.sx) < 170)) continue; const nm = nameOf(manifest, stars.galaxyOf(c.i), stars.local[c.i]); if (!nm) continue; c.nm = nm; c.hit = q && prettyName(nm[0]).toLowerCase().includes(q); if (q && !c.hit) continue; placed.push(c); picked.push(c); }
    let hs = -1, hd = 18, hsc = null;
    for (let k = 0; k < slabels.length; k++) {
      const el = slabels[k]; const c = picked[k]; if (!c || tCamDist > 40) { el.style.opacity = 0; continue; }
      el.textContent = prettyName(c.nm[0]); el.classList.toggle("hit", !!c.hit); el.style.transform = `translate(${c.sx}px,${c.sy}px) translate(8px,-50%)`; el.style.opacity = c.hit ? 1 : Math.max(0.18, 1 - c.dist / 42) * (focus && focus.index === c.i ? 1 : 0.75);
      const d2 = Math.hypot(c.sx - mx, c.sy - my); if (d2 < hd) { hd = d2; hs = c.i; hsc = c; }
    }
    if (hs !== hotStar) { hotStar = hs; if (hs >= 0) audio.play.tick(); if (hs >= 0 && (!focus || focus.index !== hs)) tag.show(`${esc(prettyName(hsc.nm[0]))}<small>${esc(stars.galaxyOf(hs))} · updated ${monthName(hsc.nm[1])}</small>`, mx, my); else if (!hot) tag.hide(); }
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
  let lastSector = -1;
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
    const inSector = gd < galaxies[g].radius * 1.15; readout.sector(inSector ? g : "Interstellar");
    const sid = inSector ? galaxies[g].id : 0; if (sid !== lastSector) { lastSector = sid; audio.setSector(sid); }
    readout.range(auto ? fmt(Math.max(0, Math.round(auto.target.distanceTo(ship.position) - auto.standoff))) : (focus ? "0" : "—"));
  }
  buildRail(manifest, layout, goDomain);

  /* ---------- search ---------- */
  let searchQuery = "";
  const qEl = $("q"), resEl = $("results"); let hits = [], sel = -1;
  const search = createSearch(manifest, layout, planets.bySlug.keys());
  function renderResults(r) {
    hits = r.hits; sel = hits.length ? 0 : -1;
    if (!r.q.trim()) { resEl.classList.remove("open"); resEl.innerHTML = ""; return; }
    resEl.innerHTML = `<div class="meta">${fmt(r.total)} match${r.total === 1 ? "" : "es"}${r.total > 12 ? " · top 12" : ""}</div>` +
      hits.map((h, i) => { const it = planets.bySlug.get(h.slug); return `<button role="option" data-i="${i}" class="${i === sel ? "on" : ""}"><span class="pl ${it ? "" : "empty"}">${it ? `<img src="${thumbUrl(it.cover)}" alt="" loading="lazy">` : ""}</span><span><div class="nm">${esc(prettyName(h.slug))}</div><div class="ws">${esc(h.slug.split("/")[0])}</div></span><span class="gx">${h.galaxy === "Uncharted" ? "Interstellar" : esc(h.galaxy)}</span></button>`; }).join("") +
      (hits.length ? "" : `<div class="meta">Nothing in the catalog by that name</div>`);
    resEl.classList.add("open");
    resEl.querySelectorAll("button").forEach(b => b.addEventListener("click", () => pick(+b.dataset.i)));
  }
  function pick(i) { const h = hits[i]; if (!h) return; resEl.classList.remove("open"); qEl.blur(); enterAt(h.galaxy, h.index); }
  qEl.addEventListener("input", () => { searchQuery = qEl.value; if (!searchQuery.trim()) { renderResults({ q: "", hits: [], total: 0 }); return; } resEl.innerHTML = `<div class="meta">${search.ready ? "Searching" : "Loading the catalog"}…</div>`; resEl.classList.add("open"); search.query(searchQuery, renderResults); });
  qEl.addEventListener("focus", () => { searched = true; search.load(); if (hits.length) resEl.classList.add("open"); });
  qEl.addEventListener("keydown", e => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!hits.length) return; sel = (sel + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length; resEl.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === sel)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(sel); } else if (e.key === "Escape") { qEl.value = ""; searchQuery = ""; renderResults({ q: "", hits: [], total: 0 }); qEl.blur(); } e.stopPropagation(); });
  document.addEventListener("pointerdown", e => { if (!$("search").contains(e.target)) resEl.classList.remove("open"); });

  /* ---------- loop ---------- */
  const clock = new THREE.Clock(); let t = 0, frame = 0; const qBill = new THREE.Quaternion();
  const prevStar = new THREE.Vector3();
  function loop() {
    requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), 0.05); t += dt; frame++;
    const T = now(); stars.tick(T);
    // the focused star is orbiting: keep the autopilot target, reticle and constellation on it,
    // and once holding, let the orbit carry the ship along with it
    if (focus) { prevStar.copy(focus.pos); starNow(focus.G, focus.j, T, focus.pos);
      if (auto) auto.target.copy(focus.pos); else ship.position.add(tmp.copy(focus.pos).sub(prevStar));
      reticle.position.copy(focus.pos); constel.position.copy(focus.pos); }
    updateWarp(dt);
    if (auto && !warpPhase) {
      tmp.copy(auto.target).sub(ship.position); const dist = tmp.length(); const h = headingTo(tmp); tYaw = yaw + wrap(h.yaw - yaw); tPitch = h.pitch;
      const remain = dist - auto.standoff; thrust = remain > 0.4 ? Math.min(40, Math.sqrt(Math.max(0, remain) * 16) + 0.4) : 0;
      if (remain <= 0.4) { auto = null; thrust = 0; if (focus && innerWidth > 720) tYaw = yaw - 0.22; audio.play.arrive();
        arrivals++; if (arrivals === 1 && !focus) setTimeout(() => hintOnce("h-click", "Every light is a dataset — <kbd>click</kbd> one to fly to it"), 1500);
        if (focus) setTimeout(() => hintOnce("h-random", "<kbd>R</kbd> jumps somewhere unexpected"), 2500); }
    }
    const fwdIn = keys.w - keys.s * 0.6, turn = keys.l - keys.r, rollIn = keys.q - keys.e, sideIn = keys.d - keys.a;
    if ((fwdIn || turn || rollIn || sideIn) && auto) { auto = null; pendingWarp = null; }
    if (turn) steer(turn * dt * (1.9 - Math.min(1, Math.abs(speed) / 40) * 0.9), 0);
    if (rollIn) tRoll += rollIn * dt * 1.7;
    const manual = fwdIn * 11 * (keys.boost ? 3.5 : 1);
    const py = yaw; yaw += wrap(tYaw - yaw) * Math.min(1, dt * 4.5); pitch += (tPitch - pitch) * Math.min(1, dt * 4.5); roll += (tRoll - roll) * Math.min(1, dt * 4.5); yawVel = (yaw - py) / Math.max(dt, 1e-3);
    ship.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
    camRig.rotation.z += ((-yawVel * 0.1) - camRig.rotation.z) * Math.min(1, dt * 3);
    const target = manual ? manual : (focus && !auto ? 0 : (auto ? thrust : CRUISE + thrust)); speed += (target - speed) * Math.min(1, dt * (target < speed ? 5 : 2.2)); if (!auto) thrust += (0 - thrust) * Math.min(1, dt * 0.35);
    fwd.set(0, 0, -1).applyQuaternion(ship.quaternion); if (!warpPhase) ship.position.addScaledVector(fwd, speed * dt); else speed = 0;
    strafe += (sideIn * 7 * (keys.boost ? 3.5 : 1) - strafe) * Math.min(1, dt * 5);   // A/D slide along the ship's own right axis
    if (Math.abs(strafe) > 0.01 && !warpPhase) { tmp.set(1, 0, 0).applyQuaternion(ship.quaternion); ship.position.addScaledVector(tmp, strafe * dt); }
    const rr = ship.position.length(); if (rr > WORLD * 1.9) ship.position.multiplyScalar(WORLD * 1.9 / rr);
    camDist += (tCamDist - camDist) * Math.min(1, dt * 3); camera.position.set(0, 0.9 + camDist * 0.12, camDist); camera.up.set(0, 1, 0).applyQuaternion(camRig.getWorldQuaternion(qBill)); camera.lookAt(camRig.localToWorld(v3.set(0, camDist * 0.03, -camDist * 0.5)));
    orb.position.y = Math.sin(t * 0.9) * 0.03; orb.rotation.y = t * 0.05; orb.scale.setScalar(1 + Math.max(0, camDist - 6.5) * 0.06);
    camera.getWorldQuaternion(qBill); const camP = camera.getWorldPosition(tmp2);
    if (frame % 8 === 0) planets.assign(ship.position, focus?.item || null);
    if (frame % 30 === 5) pickComets(); if (comets.visible) updateComets();
    for (const m of planets.active()) { m.quaternion.copy(qBill); const it = m.userData.item; planets.update(it, T); m.position.copy(it.pos); const s = it.size * (m === hot ? 1.12 : 1); m.scale.x += (s - m.scale.x) * 0.2; m.scale.y = m.scale.z = m.scale.x;
      const dc = m.position.distanceTo(camP); const fade = Math.max(0, Math.min(1, (dc - 2) / 3)); m.material.opacity = 0.96 * fade; m.userData.edge.material.opacity = ((m === hot || (focus && focus.item === it)) ? 0.9 : 0.2) * fade; m.userData.glow.material.opacity = 0.32 * Math.min(1, dc / 60) * fade; }
    domains.forEach(k => { const G = galaxies[k]; const dd = ship.position.distanceTo(G.center); G.haze.material.opacity = 0.2 * Math.max(0.15, Math.min(1, (dd - G.radius * 0.6) / (G.radius * 1.2))); });
    if (constel.children.length) { constelT += dt; constel.children.forEach((c, i) => { c.quaternion.copy(qBill); const k = Math.min(1, Math.max(0, (constelT - i * 0.07) * 2.2)); const e = 1 - Math.pow(1 - k, 3); c.scale.setScalar(c.userData.base * e + 0.001); }); }
    if (reticle.material.opacity > 0) { reticle.material.rotation = t * 0.6; const rd = reticle.position.distanceTo(camP); reticle.scale.setScalar(0.06 * rd + 0.6); }
    updateStreaks(dt); hover(); audio.update(speed / 25, warp);
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
  window.__u = { ship, camera, stars, planets, galaxies, enterStar, enterAt, goDomain, randomJump, bigbang, comets, search, audio, keys, get births() { return births; }, get speed() { return speed; }, get yaw() { return yaw; }, get pitch() { return pitch; }, get focus() { return focus; }, get auto() { return auto; }, get warp() { return warp; } };
}
boot().catch(e => { console.error(e); $("intro-p").textContent = "Could not load the index. " + e.message; });
