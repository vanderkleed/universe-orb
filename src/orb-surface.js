import * as THREE from "three";
import { thumbUrl } from "./data.js";

export function createOrbSurface(orb, reducedMotion) {
  const loader = new THREE.TextureLoader().setCrossOrigin("anonymous");
  const uniforms = {
    cover: { value: null },
    hasCover: { value: false },
    aspect: { value: new THREE.Vector2(1, 1) },
    progress: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 surface;
      void main() {
        surface = position / 0.725;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D cover;
      uniform bool hasCover;
      uniform vec2 aspect;
      uniform float progress;
      varying vec3 surface;
      void main() {
        vec3 n = normalize(surface);
        vec2 uv = n.xy * 0.5 * aspect + 0.5;
        vec3 color = hasCover ? texture2D(cover, uv).rgb : vec3(0.18);
        float light = 0.52 + 0.48 * pow(max(0.0, n.z), 0.45);
        // A soft wave spreads from the facing pole around the sphere, uncovering chrome in reverse on departure.
        float boundary = mix(1.15, -0.3, progress);
        float reveal = smoothstep(boundary - 0.12, boundary + 0.12, n.z);
        gl_FragColor = vec4(color * light, reveal);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.725, 64, 64), material);
  shell.name = "dataset-surface";
  shell.visible = false;
  orb.add(shell);
  const parentRotation = new THREE.Quaternion();
  let request = 0, amount = 0, target = 0, current = null, ready = false, departing = false;

  function resetTexture() {
    uniforms.cover.value?.dispose();
    uniforms.cover.value = null;
    uniforms.hasCover.value = false;
    uniforms.aspect.value.set(1, 1);
  }

  return {
    prepare(star) {
      const version = ++request;
      resetTexture();
      current = star;
      departing = false;
      amount = 0;
      target = 0;
      ready = !star.cover;
      if (!star.cover) return;
      loader.load(thumbUrl(star.cover), texture => {
        // Navigating again must not let a late thumbnail paint the next dataset.
        if (version !== request) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        uniforms.cover.value = texture;
        uniforms.hasCover.value = true;
        const ratio = texture.image.width / texture.image.height;
        uniforms.aspect.value.set(Math.min(1, 1 / ratio), Math.min(1, ratio));
        ready = true;
      }, undefined, () => { if (version === request) ready = true; });
    },
    arrive() { target = 1; },
    leave() { ++request; target = 0; departing = true; },
    update(dt, cameraRotation) {
      const goal = ready ? target : 0;
      amount = reducedMotion ? goal : THREE.MathUtils.clamp(amount + Math.sign(goal - amount) * dt / 1.35, 0, 1);
      uniforms.progress.value = amount * amount * (3 - 2 * amount);
      shell.visible = amount > 0;
      // Keep photographs upright while the mirror and flight rig turn independently.
      orb.getWorldQuaternion(parentRotation);
      shell.quaternion.copy(parentRotation.invert()).multiply(cameraRotation);
      if (amount === 0 && departing) {
        resetTexture();
        current = null;
        ready = false;
        departing = false;
      }
    },
    get amount() { return uniforms.progress.value; },
    get star() { return current; },
  };
}
