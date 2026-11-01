// The arena's new content against a real server: generated maps, chests and items, bots that top
// up a round, progress tied to a browser token, quick chat and private rooms.
// Run: npm test
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { ARENA_RADIUS, BLOCK, CLOSE_NO_ROOM, HILL_RADIUS, ITEM_IDS, MAX_HEIGHT, PROTOCOL_VERSION, Voxels, spawnPoint, startRadius } from "../src/game/shared.ts";
import type { Vec3 } from "../src/game/shared.ts";
import { Profiles } from "./profiles.ts";
import { Rooms } from "./rooms.ts";
import { THEME_IDS, generateTerrain, seededRandom } from "./terrain.ts";
import { Bot, LAN, facing, idle, idleUntil, lookAt, match, run, startServer, waitFor, walkPath } from "./test-utils.ts";
import type { TestServer } from "./test-utils.ts";

const noPoints = (srv: TestServer) => assert.deepEqual(srv.violations.filter((v) => v.points > 0), []);
const TOKEN_A = "a".repeat(48);
const TOKEN_B = "b".repeat(48);
const use = (b: Bot, item: (typeof ITEM_IDS)[number]) => {
  b.flushMove();
  b.send({ t: "use", item, yaw: b.yaw, pitch: b.pitch, tk: b.lastTick });
};
const columnTop = (v: Voxels, x: number, z: number) => {
  for (let y = MAX_HEIGHT - 1; y >= 0; y--) if (v.get(x, y, z)) return y + 1;
  return 0;
};

describe("terrain", () => {
  const keep = Array.from({ length: 8 }, (_, i) => ({ ...spawnPoint(i, 8, 0.4), r: 2.5 }));

  it("every theme builds a varied map with room to stand and spawns free of obstacles", () => {
    for (const theme of THEME_IDS) {
      for (const seed of [1, 2, 3]) {
        const vox = new Voxels();
        const t = generateTerrain(vox, { mode: "classic", radius: ARENA_RADIUS, keep, rnd: seededRandom(seed), theme });
        assert.equal(t.theme, theme);
        assert.ok(vox.filled.size > 300, `${theme}/${seed}: only ${vox.filled.size} blocks`);
        const types = new Set([...vox.filled].map((i) => vox.data[i]));
        assert.ok(types.size >= 5, `${theme}/${seed}: ${types.size} block types`);
        for (const i of vox.filled) assert.ok(Voxels.decode(i)[1] < MAX_HEIGHT - 3, "structures leave room under the ceiling");
        for (const k of keep) {
          for (let x = Math.floor(k.x - k.r); x <= k.x + k.r; x++)
            for (let z = Math.floor(k.z - k.r); z <= k.z + k.r; z++) {
              if (Math.hypot(x + 0.5 - k.x, z + 0.5 - k.z) > k.r) continue;
              const top = columnTop(vox, x, z);
              for (let y = 0; y < top; y++) {
                const b = vox.get(x, y, z);
                assert.ok(b === BLOCK.grass || b === BLOCK.dirt || b === BLOCK.stone, `${theme}/${seed}: object block ${b} on a spawn`);
              }
              // Plain ground: no step higher than a jump.
              for (const [dx, dz] of [[1, 0], [0, 1]]) {
                if (Math.hypot(x + dx + 0.5 - k.x, z + dz + 0.5 - k.z) > k.r) continue;
                assert.ok(Math.abs(columnTop(vox, x + dx, z + dz) - top) <= 1, `${theme}/${seed}: a step at a spawn`);
              }
            }
        }
        assert.ok(t.spots.length >= 10, `${theme}/${seed}: ${t.spots.length} chest spots`);
        for (const s of t.spots) assert.ok(!vox.get(s.x, s.y, s.z) && !vox.get(s.x, s.y + 1, s.z), "a chest spot has room above");
      }
    }
  });

  it("the same seed gives the same map; another seed a different one", () => {
    const build = (seed: number) => {
      const v = new Voxels();
      generateTerrain(v, { mode: "classic", radius: ARENA_RADIUS, keep, rnd: seededRandom(seed) });
      return v.toQuads().join(",");
    };
    assert.equal(build(42), build(42));
    assert.notEqual(build(42), build(43));
  });

  it("King of the Hill keeps its hill low, Sumo gets a few posts, Spleef stays as it was", () => {
    const koth = new Voxels();
    generateTerrain(koth, { mode: "koth", radius: ARENA_RADIUS, keep, rnd: seededRandom(5), theme: "forest" });
    for (let x = -HILL_RADIUS; x <= HILL_RADIUS; x++)
      for (let z = -HILL_RADIUS; z <= HILL_RADIUS; z++) if (Math.hypot(x + 0.5, z + 0.5) <= HILL_RADIUS) assert.ok(columnTop(koth, x, z) <= 2);
    const sumo = new Voxels();
    generateTerrain(sumo, { mode: "sumo", radius: startRadius("sumo"), keep: [], rnd: seededRandom(5) });
    assert.ok(sumo.filled.size > 0 && sumo.filled.size <= 6);
    const spleef = new Voxels();
    generateTerrain(spleef, { mode: "spleef", radius: startRadius("spleef"), keep: [], rnd: seededRandom(5) });
    assert.equal(spleef.filled.size, 0);
  });

  it("players start standing on the generated map and play without anticheat trouble", { timeout: 30_000 }, async () => {
    const { srv, bots } = await match({ terrain: true, terrainSeed: 7, terrainTheme: "hills", timeScale: 0.1 }, 2);
    for (const b of bots) {
      assert.ok(b.world.filled.size > 300, "the map came with the world");
      const p = b.body.pos;
      assert.ok(!b.world.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)), "not inside a block");
      const corners = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];
      assert.ok(corners.some(([dx, dz]) => b.world.solid(Math.floor(p.x + dx), Math.round(p.y) - 1, Math.floor(p.z + dz))), "standing on something");
    }
    await Promise.all(bots.map((b) => run(b, idle(b), 1500)));
    noPoints(srv);
  });
});

describe("chests and items", () => {
  it("walking into a chest opens it and fills the item bar", { timeout: 40_000 }, async () => {
    const { bots } = await match({ mode: "sumo", chests: true, timeScale: 0.12, spawnPoints: facing(2) }, 2);
    const [p] = bots;
    await waitFor(() => !!p.last("chests")?.chests.length, 3000, "chests");
    const chest = p.last("chests")!.chests.reduce((a, c) => (Math.hypot(c.x - p.body.pos.x, c.z - p.body.pos.z) < Math.hypot(a.x - p.body.pos.x, a.z - p.body.pos.z) ? c : a));
    const ok = await walkPath(p, [{ x: chest.x, z: chest.z }], 15_000);
    assert.ok(ok, "reached the chest");
    await waitFor(() => p.items.some((n) => n > 0), 2000, "an item");
    assert.ok(!p.last("chests")!.chests.some((c) => c.id === chest.id), "the chest is gone for everyone");
    assert.ok(p.hints.some((h) => h.startsWith("Сундук:")));
  });

  it("apple heals, the shield blocks a hit, a snowball pushes without damage", { timeout: 40_000 }, async () => {
    const { srv, bots } = await match({ spawnPoints: facing(2.4), timeScale: 0.1, startItems: { apple: 1, shield: 1, snowball: 2 } }, 2);
    const [a, b] = bots;
    assert.deepEqual(a.items, [1, 0, 1, 2, 0]);
    // A swings until B is hurt, while B keeps reporting like an idle tab.
    const swing = async () => {
      const before = b.hurts.length;
      let done = false;
      const attack = run(
        a,
        (dt, now) => {
          a.interp(dt);
          const v = a.view.get(b.id);
          if (!v) return;
          lookAt(a, { x: v.pos.x, y: v.pos.y + 1.2, z: v.pos.z });
          a.step(dt, { forward: 0, strafe: 0, jump: false, yaw: a.yaw });
          a.maybeSendMove(now);
          if (a.canHit() && b.hurts.length === before) a.hit(b.id);
        },
        3000,
        () => b.hurts.length > before,
      ).then(() => (done = true));
      await Promise.all([attack, idleUntil(b, () => done, 4000)]);
      await run(b, idle(b), 300);
      return b.hurts.at(-1)!;
    };

    // A hit, then the apple.
    const hit = await swing();
    assert.ok(hit.dmg > 0 && b.hp < 20);
    const hurtHp = b.hp;
    use(b, "apple");
    await idleUntil(b, () => b.hp > hurtHp, 2000);
    assert.ok(b.hp > hurtHp, "the apple healed");
    assert.equal(b.items[0], 0);

    // Shield up (items are spaced 350 ms apart): the next hit only pushes a little.
    await run(b, idle(b), 400);
    use(b, "shield");
    await waitFor(() => b.shieldMs > 0 && !!b.roster.find((p) => p.id === b.id)?.shield, 2000, "shield up");
    const hpBefore = b.hp;
    const blocked = await swing();
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.dmg, 0);
    assert.equal(b.hp, hpBefore);
    await waitFor(() => !b.roster.find((p) => p.id === b.id)?.shield, 2000, "shield broke");

    // A snowball in the face: knockback, no damage.
    const seen = a.view.get(b.id)!.pos;
    lookAt(a, { x: seen.x, y: seen.y + 1.2, z: seen.z });
    const n = b.hurts.length;
    await run(a, idle(a), 200);
    use(a, "snowball");
    await Promise.all([idleUntil(b, () => b.hurts.length > n, 3000), run(a, idle(a), 800)]);
    const snow = b.hurts.at(-1)!;
    assert.equal(snow.dmg, 0);
    assert.ok(Math.hypot(snow.kx, snow.kz) > 3, "pushed");
    await Promise.all(bots.map((x) => run(x, idle(x), 1200)));
    noPoints(srv);
  });

  it("an ender pearl moves the thrower, TNT goes off where it lands", { timeout: 40_000 }, async () => {
    const { srv, bots } = await match({ spawnPoints: facing(12), timeScale: 0.1, startItems: { pearl: 1, tnt: 1 } }, 2);
    const [a] = bots;
    const start: Vec3 = { ...a.body.pos };
    a.pitch = -0.12;
    await run(a, idle(a), 200);
    const tps = a.teleports;
    use(a, "pearl");
    await idleUntil(a, () => a.teleports > tps, 4000);
    assert.ok(a.teleports > tps, "teleported");
    assert.ok(Math.hypot(a.body.pos.x - start.x, a.body.pos.z - start.z) > 4, "landed away from the start");
    const booms = a.booms;
    await run(a, idle(a), 400);
    use(a, "tnt");
    await idleUntil(a, () => a.booms > booms, 5000);
    assert.ok(a.booms > booms, "the TNT went off");
    await Promise.all(bots.map((x) => run(x, idle(x), 1000)));
    noPoints(srv);
  });
});

describe("bots", () => {
  it("one person gets a round topped up with bots that chase and hit, and the bots leave after it", { timeout: 60_000 }, async () => {
    const srv = await startServer({ bots: 4, timeScale: 0.06, spawnPoints: (i, n) => spawnPoint(i, n, 0, 5) });
    const human = await Bot.join(srv.url, "solo");
    await waitFor(() => human.inHub, 5000, "hub");
    await idleUntil(human, () => human.playing, 20_000);
    assert.ok(human.playing, "a round started for one person");
    const bots = human.roster.filter((p) => p.bot);
    assert.equal(bots.length, 3);
    assert.ok(bots.every((p) => p.role === "player" && p.name.startsWith("Бот ")));
    const ids = new Set(bots.map((p) => p.id));
    await idleUntil(human, () => human.hurts.some((h) => h.id === human.id && ids.has(h.by)) || human.phase === "ended", 20_000);
    assert.ok(human.hurts.some((h) => ids.has(h.by)), "the bots fight");
    await idleUntil(human, () => human.phase === "lobby" && human.inHub, 40_000);
    await waitFor(() => !human.roster.some((p) => p.bot), 3000, "bots gone");
    assert.equal(human.records?.wins.length ?? 0, 0, "a round against bots doesn't make the daily records");
  });

  it("no bots when enough people play", { timeout: 30_000 }, async () => {
    const { bots } = await match({ bots: 2, spawnPoints: facing(3) }, 2);
    assert.ok(!bots[0].roster.some((p) => p.bot));
  });
});

describe("progress", () => {
  const dir = mkdtempSync(join(tmpdir(), "pvp-profiles-"));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("profiles belong to a token hash: names, quests, unlocks and the weekly board", () => {
    let now = Date.UTC(2026, 9, 26, 12);
    const file = join(dir, "p.json");
    const p = new Profiles(file, () => now);
    assert.equal(Profiles.idOf("nope"), null);
    assert.equal(Profiles.idOf("Z".repeat(40)), null);
    const a = Profiles.idOf(TOKEN_A)!;
    const b = Profiles.idOf(TOKEN_B)!;
    assert.ok(a && b && a !== b && !a.includes(TOKEN_A.slice(0, 10)));
    assert.equal(Profiles.idOf(TOKEN_A), a);

    assert.ok(p.claimName(a, "Вася"));
    // Free while the owner has no progress…
    assert.ok(p.claimName(b, "вася"));
    assert.ok(p.claimName(a, "Вася"));
    p.addRound(a, 50, true, 2);
    // …reserved once it has.
    assert.equal(p.claimName(b, "ВАСЯ"), false);
    assert.ok(p.claimName(null, "Петя"), "no token: any free name");

    const info = p.info(a);
    assert.equal(info.quests.length, 3);
    assert.equal(info.wins, 1);
    const q = info.quests[0];
    const done = p.quest(a, q.id, q.target);
    assert.equal(done.length, 1);
    assert.ok(p.info(a).quests[0].done);
    assert.equal(p.quest(a, q.id, 5).length, 0, "a quest pays once");

    assert.equal(p.canWear(a, "steve", "gold").sword, false);
    p.addRound(a, 10, true, 0);
    const third = p.addRound(a, 10, true, 0);
    assert.ok(third.unlocked.some((u) => u.includes("олотой")), `gold sword after 3 wins: ${third.unlocked}`);
    assert.equal(p.canWear(a, "steve", "gold").sword, true);
    assert.equal(p.canWear(b, "goldknight", "stone").skin, false);

    p.addRound(b, 500, false, 9);
    const w = p.weekly();
    assert.deepEqual(
      w.rows.map((r) => r.name),
      ["вася", "Вася"],
    );
    p.flush();
    const again = new Profiles(file, () => now);
    assert.equal(again.info(a).wins, 3);
    // A new week empties the board; a new day brings new quests.
    now += 8 * 24 * 3600_000;
    assert.equal(again.weekly().rows.length, 0);
    assert.notEqual(again.info(a).day, info.day);
  });

  it("a round pays XP to the token, not to the name", { timeout: 40_000 }, async () => {
    const srv = await startServer({ spawnPoints: facing(2.4), mode: "oneshot", profilesFile: join(dir, "round.json") });
    const a = await Bot.join(srv.url, "Ann", LAN, undefined, PROTOCOL_VERSION, { token: TOKEN_A });
    const b = await Bot.join(srv.url, "Bob", LAN, undefined, PROTOCOL_VERSION, { token: TOKEN_B });
    await waitFor(() => !!a.last("profile") && !!b.last("profile"), 3000, "profiles");
    await waitFor(() => a.playing && b.playing, 20_000, "round");
    await run(
      a,
      (dt, now) => {
        a.interp(dt);
        const v = a.view.get(b.id);
        if (!v) return;
        lookAt(a, { x: v.pos.x, y: v.pos.y + 1.2, z: v.pos.z });
        a.step(dt, { forward: 0, strafe: 0, jump: false, yaw: a.yaw });
        a.maybeSendMove(now);
        if (a.canHit()) a.hit(b.id);
      },
      8000,
      () => a.phase === "ended",
    );
    await waitFor(() => !!a.last("reward") && !!b.last("reward"), 3000, "rewards");
    const ra = a.last("reward")!;
    assert.ok(ra.lines.some(([why]) => why === "Победа"));
    assert.ok(ra.xp > b.last("reward")!.xp);
    await waitFor(() => a.last("profile")!.p.wins === 1, 2000, "a win");
    a.ws.close();
    await waitFor(() => !b.roster.some((p) => p.id === a.id), 3000, "Ann left");
    // Someone else typing "Ann" gets none of it, and can't take the name.
    const c = await Bot.join(srv.url, "Ann", LAN, undefined, PROTOCOL_VERSION, { token: "c".repeat(48) });
    await waitFor(() => !!c.last("profile"), 3000, "profile");
    assert.equal(c.last("profile")!.p.wins, 0);
    await waitFor(() => c.roster.some((p) => p.id === c.id), 3000, "roster");
    assert.notEqual(c.roster.find((p) => p.id === c.id)!.name, "Ann");
    // The owner is back under any name.
    const a2 = await Bot.join(srv.url, "Anna", LAN, undefined, PROTOCOL_VERSION, { token: TOKEN_A });
    await waitFor(() => !!a2.last("profile"), 3000, "profile");
    assert.equal(a2.last("profile")!.p.wins, 1);
  });
});

describe("quick chat", () => {
  it("emotes reach everyone in the same world, not too often, and pointing carries the spot", { timeout: 20_000 }, async () => {
    const srv = await startServer({});
    const a = await Bot.join(srv.url, "a");
    const b = await Bot.join(srv.url, "b");
    await waitFor(() => a.inHub && b.inHub, 5000, "hub");
    a.send({ t: "emote", e: "gg" });
    a.send({ t: "emote", e: "lol" });
    await waitFor(() => !!b.last("emote"), 2000, "emote");
    await run(b, idle(b), 400);
    const got = b.other.filter((m) => m.t === "emote");
    assert.equal(got.length, 1, "the second one came too soon");
    assert.deepEqual(got[0], { t: "emote", id: a.id, e: "gg" });
    await run(a, idle(a), 1600);
    a.send({ t: "emote", e: "point", x: 3, y: 0, z: -4 });
    await waitFor(() => b.other.filter((m) => m.t === "emote").length === 2, 2000, "point");
    assert.deepEqual(b.last("emote"), { t: "emote", id: a.id, e: "point", x: 3, y: 0, z: -4 });
    noPoints(srv);
  });
});

describe("private rooms", () => {
  it("a room by code is a game of its own; a wrong code is refused; empty rooms close", { timeout: 30_000 }, async () => {
    const rooms = new Rooms({ timeScale: 0.05, recordsFile: null, profilesFile: null, terrain: false, chests: false, bots: 0, idleMs: 600, anticheat: { maxConnPerIp: 0 } });
    const http = createServer();
    http.on("upgrade", (req, socket, head) => {
      if (!rooms.handleUpgrade(req, socket, head)) socket.destroy();
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}/game-ws`;
    try {
      const pub = await Bot.join(url, "public");
      const host = await Bot.join(`${url}?room=new`, "host");
      await waitFor(() => pub.id > 0 && host.room !== null, 3000, "welcome");
      assert.equal(pub.room, null);
      assert.match(host.room!, /^[A-Z2-9]{5}$/);
      const friend = await Bot.join(`${url}?room=${host.room!.toLowerCase()}`, "friend");
      await waitFor(() => friend.room === host.room, 3000, "same room");
      await waitFor(() => host.roster.length === 2 && friend.roster.length === 2, 3000, "room roster");
      await waitFor(() => pub.roster.length === 1, 3000, "public roster");
      assert.ok(!pub.roster.some((p) => p.name === "host" || p.name === "friend"));
      assert.equal(rooms.roomCount, 1);

      const lost = new Bot(`${url}?room=ZZZZZ`, LAN);
      await waitFor(() => lost.closed !== null, 3000, "refused");
      assert.equal(lost.closed!.code, CLOSE_NO_ROOM);

      host.ws.close();
      friend.ws.close();
      await waitFor(() => rooms.roomCount === 0, 5000, "room closed");
    } finally {
      rooms.close();
      http.close();
    }
  });
});
