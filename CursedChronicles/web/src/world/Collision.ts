// Static collision: axis-aligned boxes and circles in a spatial hash.

export interface BoxCol { kind: 'box'; x0: number; z0: number; x1: number; z1: number }
export interface CircleCol { kind: 'circle'; x: number; z: number; r: number }
export type Col = BoxCol | CircleCol;

const CELL = 4;

export class CollisionWorld {
  private grid = new Map<number, Col[]>();
  all: Col[] = [];
  bounds = { x0: -40, z0: -40, x1: 40, z1: 40 };

  clear() { this.grid.clear(); this.all = []; }

  private key(cx: number, cz: number) { return (cx + 512) * 4096 + (cz + 512); }

  private insert(c: Col) {
    this.all.push(c);
    const [x0, z0, x1, z1] = c.kind === 'box' ? [c.x0, c.z0, c.x1, c.z1] : [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = this.key(cx, cz);
        let a = this.grid.get(k);
        if (!a) { a = []; this.grid.set(k, a); }
        a.push(c);
      }
    }
  }

  addBox(cx: number, cz: number, w: number, d: number) {
    if (w <= 0 || d <= 0) return;
    this.insert({ kind: 'box', x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
  }
  addCircle(x: number, z: number, r: number) {
    if (r <= 0) return;
    this.insert({ kind: 'circle', x, z, r });
  }

  private near(x: number, z: number, r: number) {
    const out = new Set<Col>();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const a = this.grid.get(this.key(cx, cz));
        if (a) for (const c of a) out.add(c);
      }
    }
    return out;
  }

  /** Push a circle out of all static colliders; returns corrected position. */
  resolve(x: number, z: number, r: number): [number, number] {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.near(x, z, r + 0.5)) {
        if (c.kind === 'box') {
          const px = Math.max(c.x0, Math.min(x, c.x1));
          const pz = Math.max(c.z0, Math.min(z, c.z1));
          let dx = x - px, dz = z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              x = px + (dx / d) * r;
              z = pz + (dz / d) * r;
            } else {
              // centre inside the box: push out along the shallowest axis
              const l = x - c.x0, rr = c.x1 - x, t = z - c.z0, b = c.z1 - z;
              const m = Math.min(l, rr, t, b);
              if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r; else if (m === t) z = c.z0 - r; else z = c.z1 + r;
            }
            moved = true;
          }
          void dx; void dz;
        } else {
          const dx = x - c.x, dz = z - c.z;
          const rr = r + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.001;
            x = c.x + (dx / d) * rr;
            z = c.z + (dz / d) * rr;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    const b = this.bounds;
    x = Math.max(b.x0 + r, Math.min(b.x1 - r, x));
    z = Math.max(b.z0 + r, Math.min(b.z1 - r, z));
    return [x, z];
  }

  blocked(x: number, z: number, r: number) {
    const b = this.bounds;
    if (x - r < b.x0 || x + r > b.x1 || z - r < b.z0 || z + r > b.z1) return true;
    for (const c of this.near(x, z, r + 0.5)) {
      if (c.kind === 'box') {
        const px = Math.max(c.x0, Math.min(x, c.x1));
        const pz = Math.max(c.z0, Math.min(z, c.z1));
        if ((x - px) ** 2 + (z - pz) ** 2 < r * r) return true;
      } else if ((x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2) return true;
    }
    return false;
  }

  /** Does a segment pass through any collider (line of sight for projectiles). */
  segmentHit(x0: number, z0: number, x1: number, z1: number, r = 0.1) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(len / 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.blocked(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, r)) return true;
    }
    return false;
  }
}
