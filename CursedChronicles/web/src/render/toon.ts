// Shared toon materials. Every model in the game uses one of these so the GPU
// only ever compiles a handful of programs.
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** Shared uniforms: geometry between the camera and the player is dithered away. */
export const occlusion = {
  uOccA: { value: new THREE.Vector3() },
  uOccB: { value: new THREE.Vector3(0, -999, 0) },
  uViewInv: { value: new THREE.Matrix4() },
  uOccOn: { value: 1 },
  uOccDepth: { value: 0 },
};

/** Anime-style rim light shared by all toon materials (tinted per map). */
export const rim = { uRim: { value: 0.3 }, uRimColor: { value: new THREE.Color(0x9ab8ff) } };

// three.js only defines USE_SKINNING for the vertex stage, so skinned meshes (characters)
// are flagged through a varying to keep them out of the dither/cutaway.
const OCC_VERT_HEAD = 'uniform mat4 uViewInv;\nvarying vec3 vOccW;\nvarying float vOccD;\nvarying float vOccSkin;';
const OCC_VERT_BODY = `vOccW = (uViewInv * mvPosition).xyz;\nvOccD = -mvPosition.z;
#ifdef USE_SKINNING
vOccSkin = 1.0;
#else
vOccSkin = 0.0;
#endif`;
const OCC_FRAG_HEAD = `uniform vec3 uOccA; uniform vec3 uOccB; uniform float uOccOn; uniform float uOccDepth; varying vec3 vOccW; varying float vOccD; varying float vOccSkin;
float occBayer(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;
const OCC_FRAG_BODY = `if (uOccOn > 0.5 && vOccSkin < 0.5) { vec3 ab = uOccB - uOccA; float tt = clamp(dot(vOccW - uOccA, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
  float dd = length(vOccW - (uOccA + ab * tt)); float kk = smoothstep(2.4, 1.0, dd) * step(tt, 0.88) * step(0.35, vOccW.y) * 0.82;
  vec3 nrm = normalize(vec3(ab.z, 0.0, -ab.x)); float lat = abs(dot(vOccW - uOccA, nrm));
  float cut = smoothstep(1.2, 3.0, uOccDepth - vOccD) * smoothstep(1.6, 2.8, vOccW.y) * smoothstep(9.0, 6.0, lat) * 0.96;
  kk = max(kk, cut);
  #ifdef OCC_OUTLINE
  if (uOccDepth - vOccD > 1.0) discard;
  #endif
  if (kk > 0.0 && occBayer(gl_FragCoord.xy) < kk) discard; }`;

function injectOcclusion(shader: any, outline = false) {
  if (outline) shader.fragmentShader = '#define OCC_OUTLINE\n' + shader.fragmentShader;
  shader.uniforms.uOccA = occlusion.uOccA;
  shader.uniforms.uOccB = occlusion.uOccB;
  shader.uniforms.uViewInv = occlusion.uViewInv;
  shader.uniforms.uOccOn = occlusion.uOccOn;
  shader.uniforms.uOccDepth = occlusion.uOccDepth;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + OCC_VERT_HEAD)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + OCC_VERT_BODY);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + OCC_FRAG_HEAD)
    .replace('void main() {', 'void main() {\n' + OCC_FRAG_BODY);
}

export function toonGradient() {
  if (gradient) return gradient;
  // 4-band ramp with a soft shadow band, tuned for an anime cel look.
  const tones = [70, 140, 205, 255];
  const data = new Uint8Array(tones.length * 4);
  tones.forEach((t, i) => { data.set([t, t, t, 255], i * 4); });
  gradient = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

/** Injects a per-vertex `glow` attribute into a material as emissive light. */
function addGlow(mat: THREE.Material, strength = 2.2) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uGlowStrength;')
      .replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uRimColor;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlowStrength;
float rimK = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
totalEmissiveRadiance += uRimColor * smoothstep(0.62, 0.95, rimK) * uRim;`);
    shader.uniforms.uRim = rim.uRim;
    shader.uniforms.uRimColor = rim.uRimColor;
    injectOcclusion(shader);
    (mat as any).userData.shader = shader;
  };
  mat.customProgramCacheKey = () => 'glow' + strength;
}

const cache = new Map<string, THREE.Material>();

export function toonMaterial(): THREE.MeshToonMaterial {
  let m = cache.get('toon') as THREE.MeshToonMaterial;
  if (!m) {
    m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    addGlow(m);
    cache.set('toon', m);
  }
  return m;
}

/** Same as toonMaterial but double sided (thin cloth, leaves, banners). */
export function toonMaterialDS(): THREE.MeshToonMaterial {
  let m = cache.get('toonDS') as THREE.MeshToonMaterial;
  if (!m) {
    m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide });
    addGlow(m);
    cache.set('toonDS', m);
  }
  return m;
}

/** Inverted-hull outline. The offset happens before skinning so rigid parts keep their outline. */
export function outlineMaterial(width = 0.022, color = 0x07060c): THREE.MeshBasicMaterial {
  const key = 'outline' + width + ':' + color;
  let m = cache.get(key) as THREE.MeshBasicMaterial;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\ntransformed += normalize(normal) * ${width.toFixed(4)};`,
      );
      injectOcclusion(shader, true);
    };
    m.customProgramCacheKey = () => key;
    cache.set(key, m);
  }
  return m;
}

/** Unlit additive material for effects. */
export function fxMaterial(color: number, opacity = 1, additive = true, map?: THREE.Texture) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, map,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
}
