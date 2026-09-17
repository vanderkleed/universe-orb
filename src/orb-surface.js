import * as THREE from "three";
import { thumbUrl } from "./data.js";

export function createOrbSurface(orb, reducedMotion) {
  const loader = new THREE.TextureLoader().setCrossOrigin("anonymous");
  const uniforms = {
    cover: { value: null },
    hasCover: { value: false },
    aspect: { value: new THREE.Vector2(1, 1) },
    progress: { value: 0 },
    contactAge: { value: -1 },
    settleAge: { value: -1 },
    motion: { value: reducedMotion ? 0 : 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthWrite: true,
    vertexShader: `
      uniform float progress, contactAge, settleAge, motion;
      varying vec3 surface;
      varying vec3 viewPosition;
      varying float wrapDistance;
      void main() {
        surface = normalize(position);
        float angle = atan(surface.y, surface.x);
        float wave = sin(angle * 3.0 + progress * 5.0) * 0.045 * (1.0 - surface.z * surface.z);
        float front = mix(-0.12, 1.16, progress);
        wrapDistance = front - surface.z - wave;
        float moving = sin(progress * 3.14159265) * motion;
        float lip = exp(-pow(wrapDistance / 0.055, 2.0)) * 0.024 * moving;
        float ripple = 0.0;
        if (contactAge >= 0.0 && contactAge < 0.9) {
          float waveDistance = acos(clamp(surface.z, -1.0, 1.0)) - (1.65 - contactAge * 2.0);
          float envelope = pow(1.0 - contactAge / 0.9, 2.0);
          ripple = exp(-pow(waveDistance / 0.17, 2.0)) * 0.016 * envelope * motion;
        }
        float settle = 0.0;
        if (settleAge >= 0.0 && settleAge < 0.6) {
          float phase = settleAge / 0.6;
          settle = sin(phase * 3.14159265) * exp(-phase * 3.0) * 0.035 * motion;
        }
        // Outward-only displacement keeps the chrome core inside the settling dataset skin.
        vec3 displaced = position + surface * (lip + ripple + settle * (1.0 - surface.z * surface.z));
        vec4 viewed = modelViewMatrix * vec4(displaced, 1.0);
        viewPosition = viewed.xyz;
        gl_Position = projectionMatrix * viewed;
      }
    `,
    fragmentShader: `
      uniform sampler2D cover;
      uniform bool hasCover;
      uniform vec2 aspect;
      uniform float progress, contactAge, settleAge, motion;
      varying vec3 surface;
      varying vec3 viewPosition;
      varying float wrapDistance;
      void main() {
        vec3 sphereNormal = normalize(surface);
        vec3 displacedNormal = normalize(cross(dFdx(viewPosition), dFdy(viewPosition)));
        // Evaluate derivatives before discarding edge fragments to keep neighboring normals valid.
        if (wrapDistance < 0.0) discard;
        float rippleActive = contactAge >= 0.0 ? 1.0 - smoothstep(0.55, 0.9, contactAge) : 0.0;
        float settleActive = settleAge >= 0.0 ? 1.0 - smoothstep(0.3, 0.6, settleAge) : 0.0;
        float normalMotion = max(sin(progress * 3.14159265), max(rippleActive, settleActive));
        vec3 n = normalize(mix(sphereNormal, displacedNormal, motion * normalMotion * 0.75));
        vec2 sphericalUV = vec2(atan(sphereNormal.x, max(sphereNormal.z, 0.0001)), asin(clamp(sphereNormal.y, -1.0, 1.0))) / 3.14159265;
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
        shaded = mix(shaded, vec3(0.22 + diffuse * 0.5), lip * 0.85 * motion);
        float glintDirection = cos(atan(surface.y, surface.x) - (2.4 - progress * 2.8));
        float glint = pow(max(glintDirection, 0.0), 18.0) * exp(-pow(wrapDistance / 0.018, 2.0));
        shaded += vec3(glint * sin(progress * 3.14159265) * 0.32 * motion);
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
      uniforms.contactAge.value = -1;
      uniforms.settleAge.value = -1;
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
    contact(progress) { target = THREE.MathUtils.clamp(progress, 0, 1); },
    arrive() { target = 1; },
    get ready() { return ready; },
    leave() {
      ++request; target = 0; departing = true;
      uniforms.contactAge.value = -1;
      uniforms.settleAge.value = -1;
    },
    update(dt, cameraRotation) {
      const goal = ready ? target : 0;
      const previous = amount;
      amount = reducedMotion || !departing ? goal : THREE.MathUtils.clamp(amount - dt / 1.9, 0, 1);
      if (!reducedMotion && !departing) {
        if (previous === 0 && amount > 0) uniforms.contactAge.value = 0;
        if (previous < 1 && amount === 1) uniforms.settleAge.value = 0;
        if (uniforms.contactAge.value >= 0) uniforms.contactAge.value = Math.min(0.9, uniforms.contactAge.value + dt);
        if (uniforms.settleAge.value >= 0) uniforms.settleAge.value = Math.min(0.6, uniforms.settleAge.value + dt);
      }
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
