import * as THREE from 'three'

export const MAX_RIPPLES = 16

/**
 * The water: a disc with a soft deep-to-shallow gradient, drifting caustic
 * light, a foamy edge and rings that spread from every splash and bonk.
 */
export function makeWater(radius) {
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0))
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      radius: { value: radius },
      deep: { value: new THREE.Color('#3fb8e8') },
      shallow: { value: new THREE.Color('#a8e8ff') },
      foam: { value: new THREE.Color('#ffffff') },
      ripples: { value: ripples },
      rain: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vXZ;
      void main() {
        vXZ = position.xy * vec2(1.0, -1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float time, radius, rain;
      uniform vec3 deep, shallow, foam;
      uniform vec4 ripples[${MAX_RIPPLES}];
      varying vec2 vXZ;
      void main() {
        float d = length(vXZ);
        vec3 c = mix(deep, shallow, smoothstep(radius * 0.15, radius * 1.0, d) * 0.65);
        // Drifting light: overlapping sine waves, bright where they meet.
        vec2 p = vXZ * 0.55;
        float w = sin(p.x * 1.7 + time * 0.9 + sin(p.y * 1.3 + time * 0.6))
                + sin(p.y * 1.9 - time * 0.8 + sin(p.x * 1.1 - time * 0.5))
                + sin((p.x + p.y) * 1.2 + time * 0.7);
        c += smoothstep(1.5, 2.6, w) * 0.22;
        c -= smoothstep(-1.0, -2.6, w) * 0.05;
        // Rings from splashes, bonks and raindrops.
        float ring = 0.0;
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec4 r = ripples[i];
          float age = time - r.z;
          if (age < 0.0 || age > 2.2) continue;
          float rr = age * (2.2 + r.w * 1.5) + 0.3;
          float dist = length(vXZ - r.xy);
          float band = exp(-pow((dist - rr) * 3.2, 2.0)) + 0.6 * exp(-pow((dist - rr * 0.62) * 3.6, 2.0));
          ring += band * (1.0 - age / 2.2) * (0.35 + r.w * 0.35);
        }
        c = mix(c, foam, clamp(ring, 0.0, 0.8));
        // Foam where the water meets the edge.
        float edge = smoothstep(radius - 0.9, radius - 0.15, d + sin(atan(vXZ.y, vXZ.x) * 14.0 + time * 1.5) * 0.12);
        c = mix(c, foam, edge * 0.75);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius + 0.6, 96), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = -1
  let next = 0
  return {
    mesh,
    material,
    setColors({ deep, shallow, foam }) {
      material.uniforms.deep.value.set(deep)
      material.uniforms.shallow.value.set(shallow)
      material.uniforms.foam.value.set(foam)
    },
    ripple(x, z, strength = 1) {
      ripples[next].set(x, z, material.uniforms.time.value, Math.min(2, strength))
      next = (next + 1) % MAX_RIPPLES
    },
    clear() {
      for (const r of ripples) r.z = -100
    },
    update(t) {
      material.uniforms.time.value = t
    },
  }
}

/** A soap bubble: see-through in the middle, rainbow round the edge, with a shine. */
/** A soap bubble; with `tint`, a gently coloured one (Pond helpers sorts bubbles by colour). */
export function makeBubbleMaterial(tint = null) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, tint: { value: new THREE.Color(tint ?? '#ffffff') }, tintAmount: { value: tint ? 0.8 : 0 } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 tint;
      uniform float tintAmount;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec3 n = normalize(vN);
        float f = 1.0 - abs(dot(n, normalize(vV)));
        vec3 rainbow = 0.55 + 0.45 * cos(6.2831 * (f * 1.4 + vec3(0.0, 0.33, 0.67)) + time * 1.5);
        vec3 c = mix(vec3(1.0), rainbow, 0.75);
        c = mix(c, tint, tintAmount);
        float a = 0.22 + tintAmount * 0.4 + pow(f, 1.5) * 0.75;
        float shine = smoothstep(0.86, 0.95, dot(n, normalize(vec3(-0.45, 0.6, 0.66))));
        float shine2 = smoothstep(0.93, 0.97, dot(n, normalize(vec3(0.5, -0.4, 0.77))));
        c = mix(c, vec3(1.0), max(shine, shine2 * 0.6));
        a = max(a, max(shine * 0.95, shine2 * 0.5));
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  })
}
