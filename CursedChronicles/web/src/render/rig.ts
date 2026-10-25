// Builds rigidly-skinned models: every part follows exactly one bone, all parts
// merged into a single SkinnedMesh (+ an outline hull sharing the skeleton).
import * as THREE from 'three';
import { bakePart, mergeParts, PartOpts, V3 } from './geo';
import { outlineMaterial, toonMaterial } from './toon';

export interface RigModel {
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  outline?: THREE.SkinnedMesh;
  bones: Record<string, THREE.Bone>;
  rest: Record<string, { pos: THREE.Vector3; rot: THREE.Euler }>;
  height: number;
}

export class RigBuilder {
  bones: THREE.Bone[] = [];
  byName: Record<string, THREE.Bone> = {};
  private parts: { geo: THREE.BufferGeometry; bone: number }[] = [];
  private root: THREE.Bone;

  constructor() {
    this.root = this.bone('root', null, [0, 0, 0]);
  }

  bone(name: string, parent: string | null, pos: V3, rot: V3 = [0, 0, 0]) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(pos[0], pos[1], pos[2]);
    b.rotation.set(rot[0], rot[1], rot[2]);
    if (parent) this.byName[parent].add(b);
    this.bones.push(b);
    this.byName[name] = b;
    return b;
  }

  /** Add a part in the bone's local space. */
  part(boneName: string, geo: THREE.BufferGeometry, color: number, o: PartOpts = {}) {
    const b = this.byName[boneName];
    if (!b) throw new Error('No bone ' + boneName);
    this.root.updateMatrixWorld(true);
    const g = bakePart(geo, color, o, b.matrixWorld);
    this.parts.push({ geo: g, bone: this.bones.indexOf(b) });
    return this;
  }

  /** Mirror helper: add the same part to L and R bones with x mirrored. */
  pair(baseName: string, geo: THREE.BufferGeometry, color: number, o: PartOpts = {}) {
    const pos = o.pos ?? [0, 0, 0];
    const rot = o.rot ?? [0, 0, 0];
    this.part(baseName + 'L', geo, color, { ...o, pos: [pos[0], pos[1], pos[2]], rot });
    this.part(baseName + 'R', geo, color, { ...o, pos: [-pos[0], pos[1], pos[2]], rot: [rot[0], -rot[1], -rot[2]] });
    return this;
  }

  build(opts: { outline?: number | false; castShadow?: boolean } = {}): RigModel {
    const geo = mergeParts(this.parts, true);
    const group = new THREE.Group();
    const mesh = new THREE.SkinnedMesh(geo, toonMaterial());
    mesh.add(this.root);
    const skeleton = new THREE.Skeleton(this.bones);
    mesh.bind(skeleton);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.frustumCulled = false;
    group.add(mesh);
    let outline: THREE.SkinnedMesh | undefined;
    if (opts.outline !== false) {
      outline = new THREE.SkinnedMesh(geo, outlineMaterial(opts.outline ?? 0.022));
      outline.bind(skeleton, mesh.bindMatrix);
      outline.frustumCulled = false;
      outline.castShadow = false;
      group.add(outline);
    }
    const rest: RigModel['rest'] = {};
    for (const b of this.bones) rest[b.name] = { pos: b.position.clone(), rot: b.rotation.clone() };
    const bb = geo.boundingBox!;
    return { root: group, mesh, outline, bones: this.byName, rest, height: bb.max.y };
  }
}

/** Reset every bone to its bind pose (call before applying a procedural pose). */
export function resetPose(m: RigModel) {
  for (const k in m.bones) {
    const b = m.bones[k], r = m.rest[k];
    b.position.copy(r.pos);
    b.rotation.copy(r.rot);
    b.scale.set(1, 1, 1);
  }
}

/** Tint flash (hit feedback) by tweaking the shared glow via a per-model material clone. */
export function setModelFlash(m: RigModel, amount: number, color = 0xffffff) {
  const mat = m.mesh.material as THREE.MeshToonMaterial;
  if (amount > 0.001) {
    if (!(m.mesh.userData.flashMat)) {
      const fm = mat.clone() as THREE.MeshToonMaterial;
      fm.onBeforeCompile = mat.onBeforeCompile;
      fm.customProgramCacheKey = mat.customProgramCacheKey;
      m.mesh.userData.flashMat = fm;
      m.mesh.userData.baseMat = mat;
    }
    const fm = m.mesh.userData.flashMat as THREE.MeshToonMaterial;
    fm.emissive.setHex(color).multiplyScalar(amount);
    m.mesh.material = fm;
  } else if (m.mesh.userData.baseMat) {
    m.mesh.material = m.mesh.userData.baseMat;
  }
}
