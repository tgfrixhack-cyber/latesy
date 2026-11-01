// Private rooms: the public server plus any number of rooms, each a complete game of its own (hub,
// arena, rounds) behind a 5-character code. Connections pick one with `?room=CODE` (or
// `?room=new` to open a room); the rest stays on the public server. Rooms share the IP guard,
// the daily records and the progress profiles, and close a while after the last person leaves.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { CLOSE_NO_ROOM, CLOSE_ROOMS_FULL, ROOM_ALPHABET, ROOM_CODE_LEN, WS_PATH, normalizeRoomCode } from "../src/game/shared.ts";
import { IpGuard, clientIp, configFromEnv, originAllowed } from "./anticheat.ts";
import type { AcConfig } from "./anticheat.ts";
import { PvpServer } from "./game.ts";
import type { ServerOptions } from "./game.ts";
import { Profiles } from "./profiles.ts";
import { Records } from "./records.ts";

export interface RoomsOptions extends ServerOptions {
  /** At most this many private rooms at once (default PVP_MAX_ROOMS or 50). */
  maxRooms?: number;
  /** An empty room closes after this long (default 2 minutes). */
  idleMs?: number;
}

function reject(socket: Duplex, status: string): void {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export class Rooms {
  readonly lobby: PvpServer;
  private rooms = new Map<string, { srv: PvpServer; emptySince: number }>();
  private readonly base: ServerOptions;
  private readonly cfg: AcConfig;
  private readonly guard: IpGuard;
  private readonly records: Records;
  private readonly profiles: Profiles;
  private readonly maxRooms: number;
  private readonly idleMs: number;
  /** Takes connections only to turn them away with a reason the client can show. */
  private readonly refusals = new WebSocketServer({ noServer: true });
  private readonly sweepTimer: ReturnType<typeof setInterval>;
  private warnedUnknownIp = false;

  constructor(opts: RoomsOptions = {}) {
    const { maxRooms, idleMs, ...game } = opts;
    this.cfg = { ...configFromEnv(), ...game.anticheat };
    this.guard = new IpGuard(this.cfg);
    const recordsFile = game.recordsFile !== undefined ? game.recordsFile : process.env.PVP_RECORDS_FILE || "data/records.json";
    const profilesFile = game.profilesFile !== undefined ? game.profilesFile : process.env.PVP_PROFILES_FILE || "data/profiles.json";
    this.records = new Records(recordsFile);
    this.profiles = new Profiles(profilesFile);
    this.maxRooms = maxRooms ?? (Number(process.env.PVP_MAX_ROOMS) || 50);
    this.idleMs = idleMs ?? 120_000;
    this.base = { ...game, guard: this.guard, records: this.records, profiles: this.profiles };
    this.lobby = new PvpServer({ ...this.base, room: null });
    this.sweepTimer = setInterval(() => this.sweep(Date.now()), Math.min(10_000, this.idleMs / 2));
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** Returns true when the upgrade request belonged to the game. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== WS_PATH) return false;
    const addr = clientIp(req, this.cfg.ipHeader);
    if (!addr.known && !this.warnedUnknownIp) {
      this.warnedUnknownIp = true;
      console.warn(`[anticheat] connections from ${addr.ip} carry no X-Forwarded-For: per-IP limits and bans are off for them`);
    }
    if (!originAllowed(req.headers.origin, this.cfg.allowedOrigins)) {
      reject(socket, "403 Forbidden");
      return true;
    }
    if (!this.guard.allowAttempt(addr, Date.now())) {
      reject(socket, "429 Too Many Requests");
      return true;
    }
    const wanted = url.searchParams.get("room");
    if (!wanted) {
      this.lobby.accept(req, socket, head, addr);
      return true;
    }
    if (wanted === "new") {
      const srv = this.open();
      if (srv) srv.accept(req, socket, head, addr);
      else this.refuse(req, socket, head, CLOSE_ROOMS_FULL, "too many rooms");
      return true;
    }
    const code = normalizeRoomCode(wanted);
    const room = code ? this.rooms.get(code) : undefined;
    if (room) room.srv.accept(req, socket, head, addr);
    else this.refuse(req, socket, head, CLOSE_NO_ROOM, "no such room");
    return true;
  }

  private refuse(req: IncomingMessage, socket: Duplex, head: Buffer, code: number, reason: string): void {
    this.refusals.handleUpgrade(req, socket, head, (ws) => ws.close(code, reason));
  }

  /** A new room with a fresh code, or null when there are too many. */
  private open(): PvpServer | null {
    if (this.rooms.size >= this.maxRooms) return null;
    let code = "";
    do {
      code = Array.from({ length: ROOM_CODE_LEN }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join("");
    } while (this.rooms.has(code));
    const srv = new PvpServer({ ...this.base, room: code });
    this.rooms.set(code, { srv, emptySince: Date.now() });
    console.log(`[pvp] room ${code} opened (${this.rooms.size} rooms)`);
    return srv;
  }

  /** Closes rooms nobody has been in for idleMs. */
  sweep(now: number): void {
    for (const [code, room] of this.rooms) {
      if (room.srv.humans > 0) {
        room.emptySince = now;
        continue;
      }
      if (now - room.emptySince < this.idleMs) continue;
      room.srv.close();
      this.rooms.delete(code);
      console.log(`[pvp] room ${code} closed (${this.rooms.size} rooms)`);
    }
  }

  close(): void {
    clearInterval(this.sweepTimer);
    for (const room of this.rooms.values()) room.srv.close();
    this.rooms.clear();
    this.lobby.close();
    this.refusals.close();
    this.records.flush();
    this.profiles.flush();
  }
}
