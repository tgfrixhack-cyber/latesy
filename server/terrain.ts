// Arena terrain, generated anew for every round out of the game's blocks: hills, ledges over the
// edge, trees, ruins (walls, columns, temples) and bridges between towers. Objects stay clear of
// the spawn points; the ground under them is a heightmap whose steps are never higher than one
// block, so every slope can be walked or jumped.
import { ARENA_RADIUS, BLOCK, GRID, HILL_RADIUS, MAX_HEIGHT, cellInRing } from "../src/game/shared.ts";
import type { GameMode, Voxels } from "../src/game/shared.ts";

export type ThemeId = "hills" | "ruins" | "forest" | "bridges";
export const THEMES: Record<ThemeId, string> = { hills: "Холмы", ruins: "Руины", forest: "Лес", bridges: "Мосты" };
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export interface TerrainOpts {
  mode: GameMode;
  /** Island radius at the start of the round. */
  radius: number;
  /** Circles kept free of objects (spawn points); the ground under them may still rise. */
  keep: { x: number; z: number; r: number }[];
  rnd: () => number;
  /** Fixed theme (tests); random otherwise. */
  theme?: ThemeId;
}

export interface Terrain {
  theme: ThemeId | null;
  /** Cells to stand on (top of the ground or of a structure) where chests may appear. */
  spots: { x: number; y: number; z: number }[];
}

/** Small fast PRNG (mulberry32), so a round's map can be reproduced from its seed. */
export function seededRandom(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Counts {
  hills: [number, number];
  ledges: [number, number];
  trees: [number, number];
  rocks: [number, number];
  walls: [number, number];
  columns: [number, number];
  temples: [number, number];
  bridges: [number, number];
}

const THEME_COUNTS: Record<ThemeId, Counts> = {
  hills: { hills: [5, 7], ledges: [2, 3], trees: [6, 10], rocks: [3, 5], walls: [1, 2], columns: [0, 2], temples: [0, 1], bridges: [1, 1] },
  ruins: { hills: [2, 3], ledges: [1, 2], trees: [2, 4], rocks: [2, 3], walls: [6, 9], columns: [6, 10], temples: [2, 2], bridges: [1, 2] },
  forest: { hills: [3, 4], ledges: [1, 2], trees: [24, 32], rocks: [4, 6], walls: [0, 1], columns: [0, 1], temples: [0, 1], bridges: [1, 1] },
  bridges: { hills: [2, 3], ledges: [2, 2], trees: [3, 5], rocks: [2, 3], walls: [1, 2], columns: [3, 5], temples: [0, 1], bridges: [4, 5] },
};

/** Highest block of any structure; leaves room to stand and jump under the ceiling. */
const TOP = MAX_HEIGHT - 4;

class Builder {
  readonly h = new Int8Array(GRID * GRID);
  /** Cells taken by an object (and a margin around it). */
  private used = new Uint8Array(GRID * GRID);
  readonly spots: { x: number; z: number }[] = [];
  readonly ledgeCells = new Set<number>();
  readonly vox: Voxels;
  readonly o: TerrainOpts;

  constructor(vox: Voxels, o: TerrainOpts) {
    this.vox = vox;
    this.o = o;
  }

  private idx(x: number, z: number) {
    return (z + ARENA_RADIUS) * GRID + (x + ARENA_RADIUS);
  }

  inside(x: number, z: number, margin = 1): boolean {
    return cellInRing(x, z, this.o.radius - margin);
  }

  height(x: number, z: number): number {
    return Math.abs(x) <= ARENA_RADIUS && Math.abs(z) <= ARENA_RADIUS ? this.h[this.idx(x, z)] : 0;
  }

  raise(x: number, z: number, h: number) {
    if (!this.inside(x, z, 0)) return;
    const i = this.idx(x, z);
    this.h[i] = Math.max(this.h[i], Math.min(6, h));
  }

  rand(lo: number, hi: number) {
    return lo + Math.floor(this.o.rnd() * (hi - lo + 1));
  }

  /** A random cell within `maxR` of the centre (uniform over the disc). */
  cell(minR: number, maxR: number): [number, number] {
    const a = this.o.rnd() * Math.PI * 2;
    const d = Math.sqrt(minR * minR + this.o.rnd() * (maxR * maxR - minR * minR));
    return [Math.floor(Math.cos(a) * d), Math.floor(Math.sin(a) * d)];
  }

  /** Free for an object of radius r: inside the island, off the spawns and other objects. */
  free(x: number, z: number, r: number, edge = 3): boolean {
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const cx = x + dx;
        const cz = z + dz;
        if (!this.inside(cx, cz, edge) || this.used[this.idx(cx, cz)]) return false;
      }
    for (const k of this.o.keep) if (Math.hypot(x + 0.5 - k.x, z + 0.5 - k.z) < k.r + r + 0.5) return false;
    if (this.o.mode === "koth" && Math.hypot(x + 0.5, z + 0.5) < HILL_RADIUS + 3 + r) return false;
    return true;
  }

  claim(x: number, z: number, r: number) {
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) if (Math.abs(x + dx) <= ARENA_RADIUS && Math.abs(z + dz) <= ARENA_RADIUS) this.used[this.idx(x + dx, z + dz)] = 1;
  }

  /** Finds a free place for an object, or null after a few tries. */
  place(r: number, minR: number, maxR: number, edge = 3): [number, number] | null {
    for (let i = 0; i < 40; i++) {
      const [x, z] = this.cell(minR, maxR);
      if (this.free(x, z, r, edge)) return [x, z];
    }
    return null;
  }

  set(x: number, y: number, z: number, t: number) {
    if (y < 0 || y > TOP || !this.inside(x, z, 0)) return;
    this.vox.set(x, y, z, t);
  }

  get(x: number, y: number, z: number) {
    return this.vox.get(x, y, z);
  }

  /** Ground level under objects: top of the heightmap. */
  ground(x: number, z: number) {
    return this.height(x, z);
  }

  /** Spawns stay plain ground whatever reached into them (a crown, a stair). */
  clearKeep() {
    for (const k of this.o.keep)
      for (let x = Math.floor(k.x - k.r) - 1; x <= k.x + k.r + 1; x++)
        for (let z = Math.floor(k.z - k.r) - 1; z <= k.z + k.r + 1; z++) {
          if (Math.hypot(x + 0.5 - k.x, z + 0.5 - k.z) > k.r) continue;
          for (let y = this.height(x, z); y <= TOP; y++) if (this.vox.get(x, y, z)) this.vox.set(x, y, z, 0);
        }
  }

  /** Every step of the heightmap at most one block, so slopes can be climbed. */
  smooth() {
    for (let pass = 0; pass < 64; pass++) {
      let changed = false;
      for (let x = -ARENA_RADIUS; x <= ARENA_RADIUS; x++)
        for (let z = -ARENA_RADIUS; z <= ARENA_RADIUS; z++) {
          const i = this.idx(x, z);
          const h = this.h[i];
          if (!h) continue;
          const low = Math.min(this.height(x + 1, z), this.height(x - 1, z), this.height(x, z + 1), this.height(x, z - 1));
          // The island's edge is a cliff on purpose: the drop there is the point of a ledge.
          const edge = !this.inside(x + 1, z, 0) || !this.inside(x - 1, z, 0) || !this.inside(x, z + 1, 0) || !this.inside(x, z - 1, 0);
          if (!edge && h > low + 1) {
            this.h[i] = low + 1;
            changed = true;
          }
        }
      if (!changed) break;
    }
  }

  /** Fills the heightmap with blocks: grass on top, dirt below, stone deeper down. */
  fillGround(ledgeStone: Set<number>) {
    for (let x = -ARENA_RADIUS; x <= ARENA_RADIUS; x++)
      for (let z = -ARENA_RADIUS; z <= ARENA_RADIUS; z++) {
        const h = this.height(x, z);
        const rocky = ledgeStone.has(this.idx(x, z));
        for (let y = 0; y < h; y++) this.set(x, y, z, y === h - 1 ? (rocky ? BLOCK.stone : BLOCK.grass) : y >= h - 3 ? BLOCK.dirt : BLOCK.stone);
      }
  }

  /** A raised shelf right at the island's edge: the outer side drops straight into the void. */
  ledge() {
    const a0 = this.o.rnd() * Math.PI * 2;
    const width = 0.22 + this.o.rnd() * 0.18;
    const depth = this.rand(4, 7);
    const h = this.rand(2, 3);
    const R = this.o.radius;
    for (let x = -R; x <= R; x++)
      for (let z = -R; z <= R; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d < R - depth || !this.inside(x, z, 0)) continue;
        let da = Math.atan2(z + 0.5, x + 0.5) - a0;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > width) continue;
        // Ragged rim: the shelf rises towards the edge.
        const t = (d - (R - depth)) / depth;
        const hh = Math.max(1, Math.round(h * Math.min(1, t * 1.6)));
        this.raise(x, z, hh);
        if (this.o.rnd() < 0.5) this.ledgeCells.add(this.idx(x, z));
      }
  }

  hill() {
    const spot = this.place(0, 6, this.o.radius * 0.78, 6);
    if (!spot) return;
    const [cx, cz] = spot;
    const r = 4 + this.o.rnd() * 5;
    const H = this.rand(2, 4);
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      for (let z = Math.floor(cz - r); z <= cz + r; z++) {
        const d = Math.hypot(x - cx, z - cz) / r;
        if (d >= 1) continue;
        this.raise(x, z, Math.round(H * (1 - d * d) + 0.2));
      }
  }

  /** KotH: a low mound in the centre (the hill itself). */
  mound() {
    for (let x = -HILL_RADIUS - 2; x <= HILL_RADIUS + 2; x++)
      for (let z = -HILL_RADIUS - 2; z <= HILL_RADIUS + 2; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d <= 2) this.raise(x, z, 2);
        else if (d <= HILL_RADIUS + 1) this.raise(x, z, 1);
      }
  }

  tree() {
    // The crown spreads two cells around the trunk.
    const spot = this.place(2, 4, this.o.radius - 3);
    if (!spot) return;
    const [x, z] = spot;
    this.claim(x, z, 2);
    const g = this.ground(x, z);
    const trunk = this.rand(3, 5);
    for (let y = g; y < g + trunk; y++) this.set(x, y, z, BLOCK.log);
    const top = g + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy <= -1 ? 2 : 1;
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && this.o.rnd() < 0.7) continue;
          if (dy === 1 && Math.abs(dx) + Math.abs(dz) > 1) continue;
          const y = top + dy;
          if (!this.get(x + dx, y, z + dz)) this.set(x + dx, y, z + dz, BLOCK.leaves);
        }
    }
  }

  rock() {
    const spot = this.place(1, 4, this.o.radius - 3);
    if (!spot) return;
    const [x, z] = spot;
    this.claim(x, z, 1);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (this.o.rnd() < 0.35) continue;
        const g = this.ground(x + dx, z + dz);
        const hh = dx === 0 && dz === 0 ? 2 : 1;
        for (let y = g; y < g + hh; y++) this.set(x + dx, y, z + dz, BLOCK.stone);
      }
  }

  /** A broken wall: cover to hide behind, with gaps to shoot and walk through. */
  wall() {
    const len = this.rand(4, 8);
    const spot = this.place(Math.ceil(len / 2), 5, this.o.radius - 4);
    if (!spot) return;
    const [cx, cz] = spot;
    this.claim(cx, cz, Math.ceil(len / 2));
    const alongX = this.o.rnd() < 0.5;
    const mat = this.o.rnd() < 0.6 ? BLOCK.bricks : BLOCK.stone;
    const hh = this.rand(2, 3);
    for (let i = 0; i < len; i++) {
      const x = alongX ? cx - Math.floor(len / 2) + i : cx;
      const z = alongX ? cz : cz - Math.floor(len / 2) + i;
      if (this.o.rnd() < 0.15) continue;
      const g = this.ground(x, z);
      const top = hh - (this.o.rnd() < 0.35 ? 1 : 0);
      for (let y = g; y < g + top; y++) this.set(x, y, z, mat);
    }
  }

  column(x: number, z: number, hh: number, mat: number) {
    const g = this.ground(x, z);
    for (let y = g; y < g + hh; y++) this.set(x, y, z, mat);
    return g + hh;
  }

  columns() {
    const spot = this.place(1, 5, this.o.radius - 3);
    if (!spot) return;
    const [x, z] = spot;
    this.claim(x, z, 1);
    this.column(x, z, this.rand(3, 6), this.o.rnd() < 0.5 ? BLOCK.stone : BLOCK.bricks);
  }

  /** A ring of columns, part of its stone roof still on top: high ground and shelter. */
  temple() {
    const spot = this.place(4, 6, this.o.radius - 6);
    if (!spot) return;
    const [cx, cz] = spot;
    this.claim(cx, cz, 4);
    const hh = this.rand(3, 4);
    const g = this.ground(cx, cz);
    const roofY = g + hh;
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -3], [0, 3], [-3, 0], [3, 0]]) {
      if (this.o.rnd() < 0.2) continue;
      const x = cx + dx;
      const z = cz + dz;
      for (let y = this.ground(x, z); y < roofY; y++) this.set(x, y, z, BLOCK.stone);
    }
    // The floor and what's left of the roof.
    for (let dx = -3; dx <= 3; dx++)
      for (let dz = -3; dz <= 3; dz++) {
        if (this.ground(cx + dx, cz + dz) === g && this.o.rnd() < 0.5) this.set(cx + dx, g - 1, cz + dz, this.o.rnd() < 0.15 ? BLOCK.gold : BLOCK.bricks);
        if (this.o.rnd() < 0.55) this.set(cx + dx, roofY, cz + dz, BLOCK.stone);
      }
    // A stair up to the roof on one side.
    const side = this.rand(0, 3);
    for (let s = 0; s < hh; s++) {
      const off = 4 + (hh - 1 - s);
      const [x, z] = [[cx + off, cz], [cx - off, cz], [cx, cz + off], [cx, cz - off]][side];
      if (!this.free(x, z, 0, 2)) break;
      const gg = this.ground(x, z);
      for (let y = gg; y <= g + s; y++) this.set(x, y, z, BLOCK.planks);
    }
    this.spots.push({ x: cx, z: cz });
  }

  /** Two towers with a plank walkway between them, and a stair up the first one. */
  bridge() {
    for (let tries = 0; tries < 20; tries++) {
      const a = this.place(1, 6, this.o.radius - 5);
      if (!a) return;
      const ang = this.o.rnd() * Math.PI * 2;
      const len = this.rand(7, 11);
      const b: [number, number] = [Math.round(a[0] + Math.cos(ang) * len), Math.round(a[1] + Math.sin(ang) * len)];
      if (!this.free(b[0], b[1], 1, 5)) continue;
      // The deck must not run through other objects.
      const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      const path: [number, number][] = [];
      for (let i = 0; i <= steps; i++) path.push([Math.round(a[0] + ((b[0] - a[0]) * i) / steps), Math.round(a[1] + ((b[1] - a[1]) * i) / steps)]);
      if (!path.every(([x, z]) => this.free(x, z, 0, 4))) continue;
      const deck = Math.max(this.ground(a[0], a[1]), this.ground(b[0], b[1])) + this.rand(3, 4);
      if (deck > TOP - 3) continue;
      for (const [x, z] of path) this.claim(x, z, 1);
      for (const [x, z] of [a, b]) {
        for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) for (let y = this.ground(x + dx, z + dz); y < deck; y++) this.set(x + dx, y, z + dz, BLOCK.log);
      }
      const wide = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
      for (const [x, z] of path) {
        this.set(x, deck, z, BLOCK.planks);
        this.set(wide ? x : x + 1, deck, wide ? z + 1 : z, BLOCK.planks);
      }
      // Stair up the first tower, one block per cell, leading away from the bridge.
      const alongX = Math.abs(a[0] - b[0]) >= Math.abs(a[1] - b[1]);
      const dir = Math.sign(alongX ? a[0] - b[0] : a[1] - b[1]) || 1;
      for (let s = deck; s >= 1; s--) {
        const k = deck - s + 1;
        const off = dir > 0 ? 1 + k : -k;
        const x = alongX ? a[0] + off : a[0];
        const z = alongX ? a[1] : a[1] + off;
        if (!this.free(x, z, 0, 2) || this.get(x, this.ground(x, z), z)) break;
        for (let y = this.ground(x, z); y < s; y++) this.set(x, y, z, BLOCK.planks);
      }
      this.spots.push({ x: path[Math.floor(path.length / 2)][0], z: path[Math.floor(path.length / 2)][1] });
      return;
    }
  }
}

/** Fills an empty arena with a random map. Spleef keeps its snow, Sumo gets just a few posts. */
export function generateTerrain(vox: Voxels, o: TerrainOpts): Terrain {
  const b = new Builder(vox, o);
  if (o.mode === "spleef") return { theme: null, spots: [] };
  if (o.mode === "sumo") {
    for (let i = 0; i < 3; i++) {
      const spot = b.place(0, 3, o.radius - 3, 2);
      if (!spot) continue;
      b.claim(spot[0], spot[1], 1);
      b.column(spot[0], spot[1], 2, BLOCK.stone);
    }
    return { theme: null, spots: [] };
  }
  const theme = o.theme ?? THEME_IDS[Math.floor(o.rnd() * THEME_IDS.length)];
  const c = THEME_COUNTS[theme];
  const n = (k: keyof Counts) => b.rand(c[k][0], c[k][1]);
  if (o.mode === "koth") b.mound();
  for (let i = n("ledges"); i > 0; i--) b.ledge();
  for (let i = n("hills"); i > 0; i--) b.hill();
  b.smooth();
  b.fillGround(b.ledgeCells);
  // Big objects first, while there is room for them.
  for (let i = n("bridges"); i > 0; i--) b.bridge();
  for (let i = n("temples"); i > 0; i--) b.temple();
  for (let i = n("walls"); i > 0; i--) b.wall();
  for (let i = n("columns"); i > 0; i--) b.columns();
  for (let i = n("trees"); i > 0; i--) b.tree();
  for (let i = n("rocks"); i > 0; i--) b.rock();
  b.clearKeep();
  return { theme, spots: chestSpots(b, o) };
}

/** Places to stand: bridge decks and temple roofs first, then open ground away from the edge. */
function chestSpots(b: Builder, o: TerrainOpts): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  const standable = (x: number, z: number) => {
    let top = 0;
    for (let y = TOP; y >= 0; y--)
      if (b.vox.get(x, y, z)) {
        top = y + 1;
        break;
      }
    const t = b.vox.get(x, top - 1, z);
    if (top > 0 && t === BLOCK.leaves) return null;
    return b.vox.get(x, top, z) || b.vox.get(x, top + 1, z) ? null : top;
  };
  for (const s of b.spots) {
    const y = standable(s.x, s.z);
    if (y !== null) out.push({ x: s.x, y, z: s.z });
  }
  for (let i = 0; i < 400 && out.length < 40; i++) {
    const [x, z] = b.cell(3, o.radius - 4);
    if (o.keep.some((k) => Math.hypot(x + 0.5 - k.x, z + 0.5 - k.z) < k.r + 1)) continue;
    const y = standable(x, z);
    if (y === null || out.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
    out.push({ x, y, z });
  }
  return out;
}
