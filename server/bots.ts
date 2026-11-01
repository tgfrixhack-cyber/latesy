// Bots that top up a round when few people are online. A bot is a regular round participant on
// the server (same hit boxes, damage, buffs and items); this module only decides what it does each
// tick: who to chase, where it is safe to step, when to swing, jump or use an item.
import { EYE_HEIGHT, HILL_RADIUS, HIT_COOLDOWN_MS, HIT_REACH, ITEM_IDS, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, SKIN_IDS, SWORD_KINDS, segmentClear } from "../src/game/shared.ts";
import type { Body, GameMode, ItemId, MoveInput, SkinId, SwordKind, Vec3, Voxels } from "../src/game/shared.ts";

export const BOT_NAMES = ["Кубик", "Пиксель", "Крипер", "Шахтёр", "Стёпа", "Гриф", "Ежевика", "Булыжник", "Факел", "Редстоун", "Кирка", "Тыква"];
/** Free skins and swords a bot may wear. */
export const BOT_SKINS: SkinId[] = SKIN_IDS.slice(0, 6);
export const BOT_SWORDS: SwordKind[] = SWORD_KINDS.slice(0, 4);

export interface BotTarget extends Vec3 {
  id: number;
  hp: number;
  size: number;
}

/** What a bot knows about the round this tick. */
export interface BotSense {
  now: number;
  vox: Voxels;
  /** Island radius now, and the one it crumbles to next (warned), if any. */
  floorR: number;
  nextR: number | null;
  mode: GameMode;
  enemies: BotTarget[];
  chests: Vec3[];
  /** Hot potato: who holds the bomb. */
  bomb: number | null;
  /** Lava surface (-1: none). */
  lava: number;
  arrows: number;
  items: number[];
  hp: number;
  maxHp: number;
  shielded: boolean;
}

export interface BotIntent {
  input: MoveInput;
  pitch: number;
  /** Swing at this player now (the server checks reach and walls again). */
  attack: number | null;
  /** Use an item along yaw/pitch. */
  use: ItemId | null;
  shoot: boolean;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** A bot's state of mind between ticks. */
export class BotBrain {
  readonly body: Body;
  target: number | null = null;
  private nextHitAt = 0;
  private nextUseAt = 0;
  private nextShotAt = 0;
  private strafe = 0;
  private strafeUntil = 0;
  private wanderYaw = Math.random() * Math.PI * 2;
  private wanderUntil = 0;
  private stuckSince = 0;
  private lastPos: Vec3 = { x: 0, y: 0, z: 0 };
  private refuge: Vec3 | null = null;
  /** Hit chance and extra reaction time: bots should be beatable. */
  readonly accuracy = rand(0.62, 0.82);
  readonly reaction = rand(60, 220);

  constructor(pos: Vec3) {
    this.body = { pos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, onGround: false, jumpsLeft: 0, jumpHeld: false };
  }

  /** Teleported (spawn, swap, pearl): fresh physics at the new spot. */
  moveTo(p: Vec3) {
    this.body.pos = { x: p.x, y: p.y, z: p.z };
    this.body.vel = { x: 0, y: 0, z: 0 };
    this.body.onGround = false;
    this.lastPos = { ...p };
  }

  knock(kx: number, ky: number, kz: number) {
    this.body.vel.x += kx;
    this.body.vel.z += kz;
    if (ky) this.body.vel.y = Math.max(this.body.vel.y, ky);
    this.body.onGround = false;
  }

  hitLanded(): boolean {
    return Math.random() < this.accuracy;
  }

  think(self: { id: number; size: number }, s: BotSense): BotIntent {
    const me = this.body.pos;
    const now = s.now;
    const intent: BotIntent = { input: { forward: 0, strafe: 0, jump: false, yaw: 0, sprint: false }, pitch: 0, attack: null, use: null, shoot: false };
    const dist = (p: Vec3) => Math.hypot(p.x - me.x, p.z - me.z);
    const enemies = s.enemies.filter((e) => e.id !== self.id);

    // Keep a target while it's still around; otherwise the nearest (the bomb holder chases anyone).
    let target = enemies.find((e) => e.id === this.target) ?? null;
    if (!target || dist(target) > 26 || Math.random() < 0.01) {
      target = enemies.reduce<BotTarget | null>((best, e) => (!best || dist(e) < dist(best) ? e : best), null);
    }
    this.target = target?.id ?? null;

    let goal: Vec3 | null = target;
    let fleeing = false;
    const bombHolder = s.bomb !== null && s.bomb !== self.id ? enemies.find((e) => e.id === s.bomb) : undefined;
    if (bombHolder && dist(bombHolder) < 9) {
      // Run from the hot potato.
      goal = { x: me.x + (me.x - bombHolder.x), y: me.y, z: me.z + (me.z - bombHolder.z) };
      fleeing = true;
    }
    if (s.mode === "koth" && !fleeing) {
      const onHill = Math.hypot(me.x, me.z) < HILL_RADIUS - 1;
      const close = target && dist(target) < 4;
      if (!onHill && !close) goal = { x: 0.5, y: 0, z: 0.5 };
    }
    const chest = s.chests.reduce<Vec3 | null>((best, c) => (dist(c) < 14 && (!best || dist(c) < dist(best)) ? c : best), null);
    if (chest && !fleeing && (!target || dist(target) > 7)) goal = chest;
    if (s.lava >= 0 && me.y <= s.lava + 1.05 && !fleeing) {
      if (!this.refuge || this.columnTop(s.vox, this.refuge.x, this.refuge.z) <= s.lava + 1) this.refuge = this.findHigh(s, s.lava + 2);
      if (this.refuge) goal = this.refuge;
    }
    if (!goal) {
      if (now > this.wanderUntil) {
        this.wanderYaw = Math.atan2(-(0 - me.x) + rand(-6, 6), -(0 - me.z) + rand(-6, 6));
        this.wanderUntil = now + rand(1500, 3500);
      }
      goal = { x: me.x - Math.sin(this.wanderYaw) * 5, y: me.y, z: me.z - Math.cos(this.wanderYaw) * 5 };
    }

    const d = dist(goal);
    let yaw = Math.atan2(-(goal.x - me.x), -(goal.z - me.z));
    const fighting = !!target && goal === target;
    let forward = d > (fighting ? 1.9 : 0.6) ? 1 : 0;
    let strafe = 0;
    if (fighting && d < 4.5) {
      if (now > this.strafeUntil) {
        this.strafe = Math.random() < 0.35 ? 0 : Math.random() < 0.5 ? -1 : 1;
        this.strafeUntil = now + rand(400, 1100);
      }
      strafe = this.strafe;
    }

    // Stay on the island: never step where there's nothing to stand on.
    const safeR = Math.max(2, Math.min(s.floorR, s.nextR ?? Infinity) - 2.2);
    const unsafe = (yw: number, f: number, st: number) => {
      const sin = Math.sin(yw);
      const cos = Math.cos(yw);
      const wx = -sin * f + cos * st;
      const wz = -cos * f - sin * st;
      const len = Math.hypot(wx, wz);
      if (!len) return false;
      for (const step of [0.8, 1.6]) {
        const px = me.x + (wx / len) * step;
        const pz = me.z + (wz / len) * step;
        if (Math.hypot(px, pz) > safeR && Math.hypot(px, pz) > Math.hypot(me.x, me.z)) return true;
        if (!this.groundNear(s.vox, px, me.y, pz)) return true;
      }
      return false;
    };
    if ((forward || strafe) && unsafe(yaw, forward, strafe)) {
      strafe = 0;
      if (unsafe(yaw, forward, 0)) {
        // Turn towards the middle instead.
        const home = Math.atan2(me.x, me.z);
        forward = unsafe(home, 1, 0) ? 0 : 1;
        if (forward) yaw = home;
      }
    }

    // Stuck against something: jump, then try another way round.
    const moved = Math.hypot(me.x - this.lastPos.x, me.z - this.lastPos.z);
    this.lastPos = { ...me };
    if (forward && moved < 0.02) {
      if (!this.stuckSince) this.stuckSince = now;
    } else {
      this.stuckSince = 0;
    }
    const stuck = this.stuckSince && now - this.stuckSince > 300;
    if (stuck && now - this.stuckSince > 1200) {
      strafe = Math.random() < 0.5 ? -1 : 1;
      this.stuckSince = now;
    }
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const ahead = { x: me.x - sin * (PLAYER_HALF_WIDTH + 0.45), z: me.z - cos * (PLAYER_HALF_WIDTH + 0.45) };
    const step = forward && s.vox.solid(Math.floor(ahead.x), Math.floor(me.y + 0.1), Math.floor(ahead.z));
    let jump = !!(step || stuck);
    // Jump into a hit: the falling swing is a crit.
    if (fighting && d < 3.6 && this.body.onGround && Math.random() < 0.04) jump = true;

    intent.input = { forward, strafe, jump, yaw, sprint: forward > 0 && d > 4 && !fleeing };
    if (target) {
      const eye = { x: me.x, y: me.y + EYE_HEIGHT * self.size, z: me.z };
      const ty = target.y + PLAYER_HEIGHT * target.size * 0.55;
      intent.pitch = Math.atan2(ty - eye.y, Math.max(0.1, dist(target)));
      const reach = HIT_REACH * Math.max(1, self.size) - 0.45;
      const close = Math.hypot(target.x - me.x, ty - eye.y, target.z - me.z) <= reach + PLAYER_HALF_WIDTH * target.size;
      if (fighting) intent.input.yaw = Math.atan2(-(target.x - me.x), -(target.z - me.z));
      const clear = segmentClear(s.vox, eye, { x: target.x, y: ty, z: target.z }, Math.floor(target.x), Math.floor(ty), Math.floor(target.z));
      if (close && clear && now >= this.nextHitAt && (fighting || s.bomb === self.id)) {
        this.nextHitAt = now + HIT_COOLDOWN_MS + this.reaction;
        intent.attack = target.id;
      }
      const td = dist(target);
      if (!intent.attack && now >= this.nextUseAt && clear) intent.use = this.pickItem(s, td);
      if (intent.use) {
        this.nextUseAt = now + rand(1200, 2500);
        intent.input.yaw = Math.atan2(-(target.x - me.x), -(target.z - me.z));
        if (intent.use === "pearl") intent.input.yaw = Math.atan2(me.x, me.z);
        const arc = intent.use === "tnt" ? 0.35 : Math.min(0.25, td * 0.012);
        intent.pitch += arc;
      }
      if (!intent.attack && !intent.use && s.arrows > 0 && td > 6 && td < 24 && clear && now >= this.nextShotAt) {
        this.nextShotAt = now + rand(1200, 2200);
        intent.input.yaw = Math.atan2(-(target.x - me.x), -(target.z - me.z));
        intent.pitch += Math.min(0.2, td * 0.008);
        intent.shoot = true;
      }
    } else if (s.hp < s.maxHp * 0.5 && s.items[ITEM_IDS.indexOf("apple")] > 0 && now >= this.nextUseAt) {
      this.nextUseAt = now + 1500;
      intent.use = "apple";
    }
    return intent;
  }

  private pickItem(s: BotSense, td: number): ItemId | null {
    const has = (i: ItemId) => s.items[ITEM_IDS.indexOf(i)] > 0;
    if (has("apple") && s.hp <= s.maxHp * 0.45) return "apple";
    if (has("shield") && !s.shielded && td < 5) return "shield";
    if (has("pearl") && s.hp <= s.maxHp * 0.25 && td < 4) return "pearl";
    if (has("tnt") && td > 5 && td < 10 && Math.random() < 0.5) return "tnt";
    if (has("snowball") && td > 3.5 && td < 14) return "snowball";
    return null;
  }

  private columnTop(vox: Voxels, x: number, z: number): number {
    for (let y = 15; y >= 0; y--) if (vox.get(Math.floor(x), y, Math.floor(z))) return y + 1;
    return 0;
  }

  /** Is there something to land on at (x, z) not far below `y`? */
  private groundNear(vox: Voxels, x: number, y: number, z: number): boolean {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    for (let k = Math.floor(y + 0.5); k >= Math.floor(y) - 4; k--) if (vox.solid(ix, k, iz)) return true;
    return false;
  }

  private findHigh(s: BotSense, minTop: number): Vec3 | null {
    const me = this.body.pos;
    let best: Vec3 | null = null;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 14;
      const x = Math.floor(me.x + Math.cos(a) * r) + 0.5;
      const z = Math.floor(me.z + Math.sin(a) * r) + 0.5;
      const top = this.columnTop(s.vox, x, z);
      if (top >= minTop && (!best || Math.hypot(x - me.x, z - me.z) < Math.hypot(best.x - me.x, best.z - me.z))) best = { x, y: top, z };
    }
    return best;
  }
}
