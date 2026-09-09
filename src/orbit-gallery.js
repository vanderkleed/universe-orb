import * as THREE from "three";
import { imageryFor, thumbUrl, prettyName } from "./data.js";

export function createOrbitGallery(scene, camera, reduced, viewer, onDetails, onLeave) {
  const group = new THREE.Group();
  scene.add(group);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const backdrop = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x121110, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
  backdrop.renderOrder = 10;
  const orbitGeometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * Math.PI * 2), Math.sin(i / 128 * Math.PI * 2), 0)));
  const orbit = new THREE.LineLoop(orbitGeometry, new THREE.LineBasicMaterial({ color: 0xF4F2EC, transparent: true, opacity: 0.13, depthTest: false, depthWrite: false, fog: false }));
  orbit.renderOrder = 12;
  const tray = document.getElementById("gallery");
  const list = document.getElementById("gallery-index");
  const status = document.getElementById("gallery-status");
  const viewButton = document.getElementById("gallery-view");
  const loader = new THREE.TextureLoader().setCrossOrigin("anonymous");
  const cameraPosition = new THREE.Vector3(), orientation = new THREE.Quaternion();
  let version = 0, star = null, samples = [], cards = [], arrived = false, age = 0, angle = 0, hot = -1;
  const inspect = index => {
    if (!arrived || !samples.length) return;
    viewer.show(star, samples, index, list.children[index] || viewButton);
  };
  viewButton.addEventListener("click", () => inspect(0));
  document.getElementById("gallery-details").addEventListener("click", onDetails);
  document.getElementById("gallery-leave").addEventListener("click", onLeave);
  function clear() {
    version++;
    viewer.close();
    for (const card of cards) { card.material.map?.dispose(); card.material.dispose(); }
    group.clear(); group.visible = false;
    cards = []; samples = []; star = null; arrived = false; hot = -1;
    tray.hidden = true; list.replaceChildren();
    document.body.classList.remove("gallery-active");
  }
  async function prepare(dataset) {
    clear(); star = dataset; group.add(backdrop, orbit);
    const current = version;
    document.getElementById("gallery-name").textContent = prettyName(star.slug);
    document.getElementById("gallery-sector").textContent = `${star.galaxy} / dataset orbit`;
    status.textContent = "Gathering sample images…";
    viewButton.disabled = true;
    const imagery = await imageryFor(star.slug);
    if (version !== current) return;
    samples = [...new Set(imagery?.s?.length ? imagery.s : [imagery?.c || star.cover].filter(Boolean))].slice(0, 8);
    status.textContent = samples.length ? `${samples.length} image${samples.length === 1 ? "" : "s"} in orbit · select to inspect` : "No sample images indexed. Dataset details are still available.";
    viewButton.disabled = !samples.length;
    for (let i = 0; i < samples.length; i++) {
      const button = document.createElement("button");
      button.textContent = String(i + 1).padStart(2, "0");
      button.setAttribute("aria-label", `Inspect image ${i + 1}`);
      button.addEventListener("click", () => inspect(i));
      list.appendChild(button);
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false });
      material.depthTest = false;
      const card = new THREE.Mesh(geometry, material);
      card.renderOrder = 13;
      card.userData = { index: i, aspect: 1.4, loaded: false };
      card.visible = false;
      group.add(card); cards.push(card);
    }
    let cursor = 0;
    async function loadNext() {
      while (version === current && cursor < samples.length) {
        const index = cursor++, card = cards[index], button = list.children[index];
        try {
          const texture = await loader.loadAsync(thumbUrl(samples[index]));
          if (version !== current) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          card.material.map = texture; card.material.needsUpdate = true;
          card.userData.aspect = texture.image.width / texture.image.height;
          card.userData.loaded = true; card.visible = true;
        } catch {
          if (version !== current) return;
          button.title = "Preview unavailable — try the original image";
          button.classList.add("unavailable");
        }
      }
    }
    await Promise.all([loadNext(), loadNext(), loadNext()]);
    if (version === current && samples.length && !cards.some(c => c.userData.loaded)) status.textContent = "Previews unavailable · select an image to try the original";
  }
  return {
    prepare, clear,
    arrive() { arrived = true; age = 0; angle = 0; tray.hidden = false; group.visible = true; document.body.classList.add("gallery-active"); },
    intersect(ray) { return arrived && group.visible ? ray.intersectObjects(cards.filter(c => c.visible && c.material.opacity > 0.5), false)[0]?.object.userData.index ?? -1 : -1; },
    hover(index) { hot = index; [...list.children].forEach((b, i) => b.classList.toggle("on", index === i)); },
    inspect,
    update(dt) {
      if (!star || !arrived) return;
      age += dt;
      const paused = hot >= 0 || viewer.open || tray.matches(":hover") || tray.contains(document.activeElement) || document.body.classList.contains("details-open");
      if (!reduced && !paused) angle += dt * 0.035;
      group.position.copy(star.pos);
      camera.getWorldQuaternion(orientation); group.quaternion.copy(orientation);
      camera.getWorldPosition(cameraPosition);
      const distance = cameraPosition.distanceTo(star.pos);
      const height = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const width = height * camera.aspect;
      const portrait = camera.aspect < 0.9;
      const ringX = width * (portrait ? 0.29 : 0.28);
      const mobile = innerWidth <= 720;
      const ringY = height * (mobile ? 0.18 : 0.21);
      const size = Math.min(width * (portrait ? 0.18 : 0.14), height * 0.18);
      backdrop.scale.set(width * 3, height * 3, 1);
      backdrop.material.opacity = reduced ? 0.88 : Math.min(0.88, age * 1.4);
      orbit.visible = samples.length > 0;
      orbit.scale.set(ringX, ringY, 1);
      cards.forEach((card, i) => {
        const a = i / cards.length * Math.PI * 2 - Math.PI / 2 + angle;
        const reveal = reduced ? 1 : 1 - Math.pow(1 - Math.min(1, Math.max(0, (age - i * 0.09) / 0.9)), 3);
        card.position.set(Math.cos(a) * ringX * reveal, Math.sin(a) * ringY * reveal, Math.cos(a) * height * 0.015);
        const emphasis = hot === i ? 1.1 : 1;
        const aspect = card.userData.aspect;
        card.scale.set(size * Math.min(1, aspect) * reveal * emphasis, size / Math.max(1, aspect) * reveal * emphasis, 1);
        card.material.opacity = reveal * (hot >= 0 && hot !== i ? 0.7 : 1);
      });
    },
  };
}
