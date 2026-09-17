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
    depthWrite: true,
    vertexShader: `
      uniform float progress;
      varying vec3 surface;
      varying float wrapDistance;
      void main() {
        surface = normalize(position);
        float angle = atan(surface.y, surface.x);
        float wave = sin(angle * 3.0 + progress * 5.0) * 0.045 * (1.0 - surface.z * surface.z);
        float front = mix(-0.12, 1.16, progress);
        wrapDistance = front - surface.z - wave;
        float moving = sin(progress * 3.14159265);
        float lip = exp(-pow(wrapDistance / 0.055, 2.0)) * 0.024 * moving;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + surface * lip, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D cover;
      uniform bool hasCover;
      uniform vec2 aspect;
      uniform float progress;
      varying vec3 surface;
      varying float wrapDistance;
      void main() {
        // Opaque coverage travels from the silhouette inward, leaving a shrinking chrome center.
        if (wrapDistance < 0.0) discard;
        vec3 n = normalize(surface);
        vec2 sphericalUV = vec2(atan(n.x, max(n.z, 0.0001)), asin(clamp(n.y, -1.0, 1.0))) / 3.14159265;
        vec2 uv = sphericalUV * aspect + 0.5;
        vec3 color = hasCover ? texture2D(cover, uv).rgb : vec3(0.18);
        vec3 lightDirection = normalize(vec3(-0.6, 0.75, 1.0));
        float diffuse = max(dot(n, lightDirection), 0.0);
        float limb = pow(max(n.z, 0.0), 0.38);
        float light = (0.2 + 0.8 * diffuse) * (0.38 + 0.62 * limb);
        vec3 halfDirection = normalize(lightDirection + vec3(0.0, 0.0, 1.0));
        float highlight = pow(max(dot(n, halfDirection), 0.0), 72.0) * 0.22;
        float rim = pow(1.0 - max(n.z, 0.0), 4.0) * 0.045;
        float lip = (1.0 - smoothstep(0.0, 0.045, wrapDistance)) * sin(progress * 3.14159265);
        vec3 shaded = color * light + vec3(highlight + rim);
        // A narrow metallic meniscus gives the advancing edge thickness without fading the photograph.
        shaded = mix(shaded, vec3(0.22 + diffuse * 0.5), lip * 0.85);
        gl_FragColor = vec4(shaded, 1.0);
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
      amount = reducedMotion ? goal : THREE.MathUtils.clamp(amount + Math.sign(goal - amount) * Math.min(dt / 1.9, Math.abs(goal - amount)), 0, 1);
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
