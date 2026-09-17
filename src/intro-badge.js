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
  for (const [x, y, z, w, h] of [[-5, 3, 5, 3, 10], [5, 1, 3, 2, 8], [0, 6, -2, 12, 3], [0, -4, 4, 10, 1]]) {
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
  const paths = new SVGLoader().parse(badgeSvg).paths;
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
    if (style.stroke && style.stroke !== "none") {
      for (const subPath of path.subPaths) {
        const points = subPath.getPoints(64).map(p => new THREE.Vector3((p.x - 416) * .01, (193.5 - p.y) * .01, .24));
        const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, Number(style.strokeWidth) * .005, 12, false);
        geometries.push(geometry); badge.add(new THREE.Mesh(geometry, face));
      }
    }
  }
  let disposed = false;
  function render(seconds = 0) {
    if (disposed || document.hidden) return;
    const t = reducedMotion ? 0 : seconds;
    badge.rotation.set(.12 + Math.sin(t * .35) * .045, -.16 + Math.sin(t * .28) * .2, -.025);
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
