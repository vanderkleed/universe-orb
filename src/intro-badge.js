import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import badgeSvg from "../public/images/universe-badge.svg?raw";

export function createIntroBadge(host, reducedMotion) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    return { update() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  camera.position.z = 18;
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x161616);
  const panelGeometry = new THREE.PlaneGeometry(1, 1);
  const panelMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5), side: THREE.DoubleSide });
  for (const [x, y, z, w, h] of [[-5, 3, 5, 3, 10], [5, 1, 3, 2, 8], [0, 6, -2, 12, 3], [0, -4, 4, 10, 1], [-1, 2, 7, 3, 6], [0, -6, -2, 8, 2]]) {
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.position.set(x, y, z); panel.scale.set(w, h, 1); panel.lookAt(0, 0, 0); studio.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, .04, .1, 50);
  scene.environment = environment.texture;
  pmrem.dispose(); panelGeometry.dispose(); panelMaterial.dispose();
  const face = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 1, roughness: .2, envMapIntensity: 1.5 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1, roughness: .13, envMapIntensity: 1.5 });
  const badge = new THREE.Group(); scene.add(badge);
  const geometries = [];
  // Keep the original vector logomark, not the flat orbit wings or foreground stroke.
  const paths = new SVGLoader().parse(badgeSvg).paths.filter(path => path.userData.node.closest("g[clip-path]"));
  for (const path of paths) {
    const style = path.userData.style;
    if (style.fill && style.fill !== "none" && (!style.stroke || style.stroke === "none")) {
      const shapes = SVGLoader.createShapes(path);
      if (!shapes.length) continue;
      const geometry = new THREE.ExtrudeGeometry(shapes, { depth: 22, bevelEnabled: true, bevelThickness: 5, bevelSize: 4, bevelSegments: 4, curveSegments: 24, steps: 1 });
      geometry.translate(-416, -193.5, -11);
      geometry.rotateX(Math.PI);
      geometry.scale(.01, .01, .01);
      // A gently domed face bends the studio reflections without changing the SVG silhouette.
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i);
        positions.setZ(i, positions.getZ(i) + .13 * (1 - (x * x + y * y) / 20));
      }
      geometry.computeVertexNormals(); geometries.push(geometry);
      badge.add(new THREE.Mesh(geometry, [face, edge]));
    }
  }
  const discShape = new THREE.Shape();
  discShape.absarc(0, 0, 3.85, 0, Math.PI * 2, false);
  const aperture = new THREE.Path();
  aperture.absarc(0, 0, 2.95, 0, Math.PI * 2, true);
  discShape.holes.push(aperture);
  const discGeometry = new THREE.ExtrudeGeometry(discShape, {
    depth: .1, bevelEnabled: true, bevelThickness: .025, bevelSize: .035,
    bevelSegments: 3, curveSegments: 96, steps: 1,
  });
  discGeometry.translate(0, 0, -.05);
  geometries.push(discGeometry);
  const disc = new THREE.Mesh(discGeometry, [face, edge]);
  // Center the orbit in the mark's depth so its near edge passes in front and its far edge behind.
  disc.rotation.set(-1.55, 0, -.16, "ZYX");
  const logoBounds = new THREE.Box3().setFromObject(badge);
  const logoCenter = logoBounds.getCenter(new THREE.Vector3());
  disc.position.copy(logoCenter);
  badge.add(disc);
  let disposed = false;
  function render(seconds = 0) {
    if (disposed || document.hidden) return;
    const t = reducedMotion ? 0 : seconds;
    // Keep forward pitch within 0.3–2 degrees so the near rim only dips slightly.
    badge.rotation.set(.02 + Math.sin(t * .35) * .015, -.06 + Math.sin(t * .28) * .04, 0);
    renderer.render(scene, camera);
    host.classList.add("badge-ready");
  }
  const observer = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.position.z = Math.max(10, 4.9 / (Math.tan(THREE.MathUtils.degToRad(16)) * camera.aspect));
    camera.updateProjectionMatrix(); renderer.setSize(width, height); render();
  });
  observer.observe(host);
  return {
    update: render,
    dispose() {
      disposed = true; observer.disconnect(); geometries.forEach(geometry => geometry.dispose());
      face.dispose(); edge.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
