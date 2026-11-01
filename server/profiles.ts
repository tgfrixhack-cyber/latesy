// Player progress: XP and levels, wins, daily quests and the weekly board. A profile belongs to a
// random token kept in the player's browser, not to the nickname, so typing someone's name gets
// you none of their progress; the file only keeps a hash of each token. A nickname used by a
// profile with progress is reserved for it.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DAILY_QUESTS, QUESTS, QUEST_IDS, SKINS, SKIN_IDS, SWORDS, SWORD_KINDS, levelOf, unlocked } from "../src/game/shared.ts";
import type { ProfileInfo, QuestId, SkinId, SwordKind, WeeklyBoard } from "../src/game/shared.ts";
import { moscowDay } from "./records.ts";

interface Quest {
  id: QuestId;
  target: number;
  progress: number;
  done: boolean;
}

interface Saved {
  name: string;
  xp: number;
  wins: number;
  rounds: number;
  kills: number;
  seen: number;
  day: string;
  quests: Quest[];
  week: string;
  wxp: number;
  wwins: number;
  wkills: number;
}

interface FileData {
  profiles: Record<string, Saved>;
  /** Lower-cased nickname → profile id holding it. */
  names: Record<string, string>;
}

const TOKEN_RE = /^[a-f0-9]{32,64}$/;
/** A reserved nickname is freed when its owner hasn't played for this long. */
const NAME_HOLD_MS = 60 * 24 * 3600_000;
const MAX_PROFILES = 50_000;

/** Monday of the Moscow week (YYYY-MM-DD). Moscow keeps UTC+3 all year. */
export function moscowWeek(t = Date.now()): string {
  const d = new Date(t + 3 * 3600_000);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}

/** Stable pseudo-random numbers from a string (the day's quests of a profile). */
function hashRng(key: string): () => number {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Profiles {
  private data: FileData = { profiles: {}, names: {} };
  private dirty = false;
  private warned = false;
  private readonly file: string | null;
  private readonly clock: () => number;

  constructor(file: string | null, clock: () => number = Date.now) {
    this.file = file;
    this.clock = clock;
    if (!file) return;
    try {
      const saved = JSON.parse(readFileSync(file, "utf8")) as FileData;
      if (saved && typeof saved.profiles === "object") this.data = { profiles: saved.profiles, names: saved.names ?? {} };
    } catch {
      // No file yet, or unreadable: start fresh.
    }
  }

  /** Profile id for a browser token (a hash: the token itself is never stored), or null. */
  static idOf(token: unknown): string | null {
    if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
    return createHash("sha256").update(token).digest("hex").slice(0, 32);
  }

  private fresh(name: string): Saved {
    return { name, xp: 0, wins: 0, rounds: 0, kills: 0, seen: this.clock(), day: "", quests: [], week: moscowWeek(this.clock()), wxp: 0, wwins: 0, wkills: 0 };
  }

  private get(id: string): Saved {
    let p = this.data.profiles[id];
    if (!p) {
      if (Object.keys(this.data.profiles).length >= MAX_PROFILES) this.prune();
      p = this.data.profiles[id] = this.fresh("");
      this.dirty = true;
    }
    this.roll(p);
    return p;
  }

  /** New day: new quests. New week: the weekly counters start over. */
  private roll(p: Saved): void {
    const now = this.clock();
    const day = moscowDay(now);
    if (p.day !== day) {
      const r = hashRng(`${p.name}|${day}|${p.xp}`);
      const ids = [...QUEST_IDS].sort(() => r() - 0.5).slice(0, DAILY_QUESTS);
      p.quests = ids.map((id) => {
        const t = QUESTS[id].targets;
        return { id, target: t[Math.floor(r() * t.length)], progress: 0, done: false };
      });
      p.day = day;
      this.dirty = true;
    }
    const week = moscowWeek(now);
    if (p.week !== week) {
      Object.assign(p, { week, wxp: 0, wwins: 0, wkills: 0 });
      this.dirty = true;
    }
  }

  /** Drops the oldest profiles without progress when the file gets too big. */
  private prune(): void {
    const ids = Object.entries(this.data.profiles)
      .sort((a, b) => a[1].xp - b[1].xp || a[1].seen - b[1].seen)
      .slice(0, Math.ceil(MAX_PROFILES / 10))
      .map(([id]) => id);
    for (const id of ids) delete this.data.profiles[id];
    for (const [n, id] of Object.entries(this.data.names)) if (!this.data.profiles[id]) delete this.data.names[n];
  }

  /** Whether `id` may play as `name`: false when another profile with progress reserved it. Taking
   *  a free name reserves it for this profile. */
  claimName(id: string | null, name: string): boolean {
    const key = name.toLowerCase();
    const owner = this.data.names[key];
    const now = this.clock();
    if (owner && owner !== id) {
      const o = this.data.profiles[owner];
      if (o && o.xp > 0 && now - o.seen < NAME_HOLD_MS) return false;
    }
    if (!id) return true;
    const p = this.get(id);
    p.name = name;
    p.seen = now;
    if (owner !== id) {
      this.data.names[key] = id;
      this.dirty = true;
    }
    return true;
  }

  info(id: string): ProfileInfo {
    const p = this.get(id);
    const lv = levelOf(p.xp);
    return {
      level: lv.level,
      xp: p.xp,
      into: lv.into,
      next: lv.next,
      wins: p.wins,
      rounds: p.rounds,
      kills: p.kills,
      day: p.day,
      quests: p.quests.map((q) => ({ id: q.id, title: QUESTS[q.id].title.replace("{n}", String(q.target)), progress: Math.min(q.progress, q.target), target: q.target, xp: QUESTS[q.id].xp, done: q.done })),
    };
  }

  stats(id: string): { wins: number; level: number } {
    const p = this.get(id);
    return { wins: p.wins, level: levelOf(p.xp).level };
  }

  canWear(id: string | null, skin: SkinId, sword: SwordKind): { skin: boolean; sword: boolean } {
    const st = id ? this.stats(id) : { wins: 0, level: 1 };
    return { skin: unlocked(SKINS[skin]?.unlock, st), sword: unlocked(SWORDS[sword]?.unlock, st) };
  }

  /** Quest progress; returns the quests this completed as [title, xp] (their XP is added). */
  quest(id: string, q: QuestId, n = 1): [string, number][] {
    if (n <= 0) return [];
    const p = this.get(id);
    const out: [string, number][] = [];
    for (const it of p.quests) {
      if (it.id !== q || it.done) continue;
      it.progress += n;
      if (it.progress >= it.target) {
        it.done = true;
        const xp = QUESTS[q].xp;
        p.xp += xp;
        p.wxp += xp;
        out.push([`Задание: ${QUESTS[q].title.replace("{n}", String(it.target))}`, xp]);
      }
      this.dirty = true;
    }
    return out;
  }

  /** A round played: XP, and wins/kills for the profile and the week. Returns what got unlocked. */
  addRound(id: string, xp: number, won: boolean, kills: number): { levelUp: boolean; level: number; unlocked: string[] } {
    const p = this.get(id);
    const before = this.stats(id);
    p.xp += xp;
    p.wxp += xp;
    p.rounds++;
    p.kills += kills;
    p.wkills += kills;
    if (won) {
      p.wins++;
      p.wwins++;
    }
    p.seen = this.clock();
    this.dirty = true;
    return { ...this.unlocksSince(id, before), level: levelOf(p.xp).level };
  }

  /** Level and new skins/swords since `before` (quests may also add XP after the round). */
  unlocksSince(id: string, before: { wins: number; level: number }): { levelUp: boolean; unlocked: string[] } {
    const after = this.stats(id);
    const names: string[] = [];
    for (const s of SKIN_IDS) if (!unlocked(SKINS[s].unlock, before) && unlocked(SKINS[s].unlock, after)) names.push(`скин «${SKINS[s].title}»`);
    for (const s of SWORD_KINDS) if (!unlocked(SWORDS[s].unlock, before) && unlocked(SWORDS[s].unlock, after)) names.push(`${SWORDS[s].title.toLowerCase()} меч`);
    return { levelUp: after.level > before.level, unlocked: names };
  }

  weekly(n = 10): WeeklyBoard {
    const week = moscowWeek(this.clock());
    const rows = Object.values(this.data.profiles)
      .filter((p) => p.week === week && p.wxp > 0 && p.name)
      .sort((a, b) => b.wxp - a.wxp || b.wwins - a.wwins || a.name.localeCompare(b.name))
      .slice(0, n)
      .map((p) => ({ name: p.name, xp: p.wxp, wins: p.wwins, kills: p.wkills, level: levelOf(p.xp).level }));
    return { week, rows };
  }

  flush(): void {
    if (!this.dirty || !this.file) return;
    this.dirty = false;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data));
      renameSync(tmp, this.file);
    } catch (e) {
      if (!this.warned) console.warn(`[pvp] can't save profiles to ${this.file}: ${(e as Error).message}`);
      this.warned = true;
    }
  }
}
