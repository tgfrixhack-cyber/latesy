"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  BOT_FILL,
  BUFFS,
  EMOTES,
  EMOTE_IDS,
  HILL_TARGET,
  HOT_STREAK,
  ITEMS,
  ITEM_IDS,
  MAX_HP,
  MAX_PLAYERS,
  MODES,
  MODE_IDS,
  PLAYER_COLORS,
  SHIELD_MS,
  SKINS,
  SKIN_IDS,
  SWORDS,
  SWORD_KINDS,
  buffAt,
  buffCount,
  buffIndexAt,
  normalizeRoomCode,
  roundClock,
  unlockText,
  unlocked,
} from "@/game/shared";
import type { BuffId, GameMode, PlayerInfo, ProfileInfo, SkinId, SwordKind, TrainStats } from "@/game/shared";
import { Engine, SENS_MAX, SENS_MIN, WHEEL_R, emoteWheelAngle, loadToken, saveToken } from "@/game/client/engine";
import { createStore, initialUi } from "@/game/client/store";
import type { UiState } from "@/game/client/store";
import { hairFor, skinFaceUrl } from "@/game/client/skins";
import { dirtIconUrl, itemIconUrl } from "@/game/client/textures";
import { TouchControls, enterFullscreen } from "./touch-controls";
import type { TouchInput } from "./touch-controls";
import { sfx } from "@/game/client/sound";
import "./pvp.css";

const NAME_KEY = "pvp-name";

/** The engine calls this UI relies on; typed locally so the HUD does not depend on the engine's other members. */
type EngineApi = {
  join(name: string, room: string | null): void;
  switchRoom(room: string | null): void;
  reconnect(): void;
  toggleMute(): void;
  setSens(v: number): void;
  setLook(color: string, skin: SkinId, sword?: SwordKind): void;
  useItem(i: number): void;
  setProfile(open: boolean): void;
  setWardrobe(open: boolean): void;
  setHelp(open: boolean): void;
  answerDuel(accept: boolean): void;
  toggleWatch(): void;
  vote(i: number): void;
  challengeDuel(): void;
  setAimAssist(on: boolean): void;
} & TouchInput;

interface HudActions {
  /** The engine's touch input (null before it starts). */
  input(): TouchInput | null;
  useItem(i: number): void;
  toggleWatch(): void;
  challengeDuel(): void;
  setAimAssist(on: boolean): void;
  toggleMute(): void;
  setSens(v: number): void;
  setLook(color: string, skin: SkinId, sword?: SwordKind): void;
  switchRoom(room: string | null): void;
  setProfile(open: boolean): void;
  setWardrobe(open: boolean): void;
  setHelp(open: boolean): void;
  answerDuel(accept: boolean): void;
  vote(i: number): void;
}

function useNow(interval = 200) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const fmtTenths = (ms: number) => (Math.max(0, ms) / 1000).toFixed(1);

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pvp-panel ${className}`}>{children}</div>;
}

function McButton({ children, onClick, tone = "stone", className = "", disabled }: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "stone" | "green" | "red";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button type={onClick ? "button" : "submit"} onClick={onClick} disabled={disabled} className={`pvp-btn pvp-btn-${tone} ${className}`}>
      {children}
    </button>
  );
}

const CONTROLS: [string, string][] = [
  ["WASD", "ходьба"],
  ["W W", "спринт (дважды быстро)"],
  ["Пробел", "прыжок"],
  ["Мышь", "обзор"],
  ["ЛКМ", "удар / сломать блок"],
  ["ПКМ", "поставить землю"],
  ["Прыжок + удар", "крит ×1.5"],
  ["Q", "выстрел (баф «Луки»)"],
  ["1–5", "предметы из сундуков"],
  ["1 / 2 / 3", "голос за баф (выбывшим)"],
  ["Зажать E", "колесо эмоций: наведи мышью, отпусти"],
  ["P", "профиль, задания, комнаты"],
  ["V", "вид от 1-го / 3-го лица"],
  ["T", "смотреть арену / в лобби"],
  ["E у стойки", "гардероб (короткое нажатие)"],
  ["F", "вызвать на дуэль"],
  ["Y / N", "принять / отказать"],
  ["H", "помощь"],
  ["M", "звук вкл/выкл"],
];

const TOUCH_CONTROLS: [string, string][] = [
  ["Левый палец", "ходьба: где коснёшься, там и стик; до упора вперёд — бег"],
  ["Правый палец", "обзор: веди по экрану"],
  ["Меч", "удар и ломать блоки; держи — бьёт сам, веди по кнопке — целишься"],
  ["Стрелка", "прыжок; прыжок и удар на падении — крит ×1.5"],
  ["Земля", "поставить блок"],
  ["Иконки внизу", "предметы из сундуков"],
  ["😀", "эмоции: потяни к нужной или коснись и выбери"],
  ["Глаз", "вид от 1-го / 3-го лица"],
];

function Controls({ className = "grid-cols-2", touch = false }: { className?: string; touch?: boolean }) {
  return (
    <ul className={`grid gap-x-4 gap-y-1 text-sm text-white/80 ${className}`}>
      {(touch ? TOUCH_CONTROLS : CONTROLS).map(([k, v]) => (
        <li key={k}>
          <span className="pvp-key">{k}</span> {v}
        </li>
      ))}
    </ul>
  );
}

function SensSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm text-white/85">
      <span className="shrink-0">Чувствительность мыши</span>
      <input
        type="range"
        min={SENS_MIN}
        max={SENS_MAX}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-[#ffde59]"
      />
      <b className="w-12 shrink-0 text-right tabular-nums text-[#ffde59]">{value.toFixed(2)}×</b>
    </label>
  );
}

/** Room code from the page's address (?room=ABCDE): a friend's invitation link. */
function invitedRoom(): string | null {
  try {
    return normalizeRoomCode(new URL(location.href).searchParams.get("room"));
  } catch {
    return null;
  }
}

function JoinScreen({ onJoin, sens, onSens, touch }: { onJoin: (name: string, room: string | null) => void; sens: number; onSens: (v: number) => void; touch: boolean }) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? "");
  const [invite] = useState(invitedRoom);
  const [code, setCode] = useState("");
  const go = (room: string | null) => {
    const n = name.trim().slice(0, 16);
    localStorage.setItem(NAME_KEY, n);
    // The tap on "Play" is the user gesture fullscreen needs.
    if (touch) enterFullscreen();
    onJoin(n, room);
  };
  const typed = normalizeRoomCode(code);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/35 p-4">
      <Panel className="max-h-full w-full max-w-xl overflow-y-auto">
        <h1 className="pvp-title text-center text-3xl text-[#ffde59] md:text-4xl">БЛОК-АРЕНА</h1>
        <p className="mt-2 text-center text-white/85">
          PvP до последнего выжившего · до {MAX_PLAYERS} игроков · боты, если людей мало
        </p>
        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go(invite);
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваш ник"
            aria-label="Ник"
            className="pvp-input flex-1"
          />
          <McButton tone="green">{invite ? `В комнату ${invite}` : "Играть"}</McButton>
        </form>
        {invite && (
          <p className="mt-2 text-sm text-white/75">
            Вас пригласили в приватную комнату <b className="text-[#ffde59]">{invite}</b>.{" "}
            <button type="button" className="underline" onClick={() => go(null)}>
              Играть на общем сервере
            </button>
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-white/75">С друзьями:</span>
          <McButton onClick={() => go("new")}>Создать комнату</McButton>
          <input
            value={code}
            maxLength={5}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="КОД"
            aria-label="Код комнаты"
            className="pvp-input w-24 text-center uppercase"
          />
          <McButton disabled={!typed} onClick={() => typed && go(typed)}>
            Войти
          </McButton>
        </div>
        <div className="mt-3">
          <SensSlider value={sens} onChange={onSens} />
        </div>
        <ul className="mt-5 space-y-1 text-sm text-white/80">
          <li>• Между раундами ты ходишь по лобби: тренируйся на скелетах, стреляй в тире, бегай паркур, дуэлься, меняй облик в гардеробе.</li>
          <li>• Раунд стартует сам: через 60 с, когда в лобби двое, или через 10 с, если больше половины встали в зелёный круг у портала. Если людей меньше {BOT_FILL}, раунд добирают боты — можно играть даже одному.</li>
          <li>• Каждый раунд — новая карта: холмы, руины, лес, мосты. На ней появляются сундуки с предметами (клавиши 1–5).</li>
          <li>• За раунды растёт уровень, за победы открываются скины и мечи, каждый день — новые задания (P). Прогресс хранится в этом браузере.</li>
          <li>• Режим выбирают голосованием — встань на одну из 9 цветных площадок.</li>
          <li>• На арене у каждого 10 блоков земли и меч. Убитый теряет всё. Удар в падении — крит ×1.5, строить можно до 20 блоков.</li>
          <li>• Выбыл — смотришь до конца раунда. Потом все возвращаются в лобби, победитель получает корону.</li>
          <li>• Раунд — 6 минут: первый баф на 30-й секунде, дальше новый каждую минуту.</li>
          <li>• Край острова — обрыв. Упал — выбыл; если тебя сбросили ударом, убийство засчитают сбросившему.</li>
          <li>• С 2-й минуты остров осыпается с краёв: красные клетки скоро рухнут вместе с блоками на них.</li>
          <li>• После 6:00 — овертайм: любой удар убивает, регенерации нет. Через минуту побеждает лучший по убийствам и урону.</li>
          <li>• Последний баф раунда — «Хаос»: два сразу. Выбывшие голосуют за следующий баф клавишами 1–3.</li>
        </ul>
        <div className="mt-4">
          <Controls touch={touch} />
        </div>
      </Panel>
    </div>
  );
}

const HEART_ROWS = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];

function Heart({ fill }: { fill: 0 | 1 | 2 }) {
  return (
    <svg viewBox="-0.5 -0.5 8 7" className="h-6 w-6" shapeRendering="crispEdges" aria-hidden>
      {HEART_ROWS.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "X" ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill === 2 || (fill === 1 && x <= 3) ? "#e11d48" : "#3f3f46"} stroke="#000" strokeWidth={0.12} />
          ) : null,
        ),
      )}
    </svg>
  );
}

/** Ten hearts; extra health (giants, vampire kills) adds golden ones. */
function Hearts({ hp, max = MAX_HP }: { hp: number; max?: number }) {
  return (
    <div className="flex max-w-[22rem] flex-wrap justify-center gap-0.5" aria-label={`Здоровье ${hp} из ${max}`}>
      {Array.from({ length: Math.ceil(max / 2) }, (_, i) => {
        const v = hp - i * 2;
        return (
          <span key={i} className={i >= MAX_HP / 2 ? "pvp-heart-gold" : ""}>
            <Heart fill={v >= 2 ? 2 : v === 1 ? 1 : 0} />
          </span>
        );
      })}
    </div>
  );
}

function ModeBadge({ mode }: { mode: GameMode }) {
  const m = MODES[mode];
  return (
    <span className="pvp-badge" style={{ borderColor: m.color, color: m.color }}>
      {m.title}
    </span>
  );
}

// ---------------------------------------------------------------- arena

/** Team score, survivors or the hill, depending on the mode. */
function ModeScore({ ui }: { ui: UiState }) {
  const sc = ui.score;
  const def = MODES[ui.mode];
  if (!sc) return null;
  if (def.teams && sc.teams.length === 2) {
    const [a, b] = def.teams;
    return (
      <Panel className="!px-3 !py-1.5 text-lg tabular-nums">
        <b style={{ color: a.color }}>{a.name}</b> <b className="text-2xl">{sc.teams[0]}</b> : <b className="text-2xl">{sc.teams[1]}</b> <b style={{ color: b.color }}>{b.name}</b>
        {sc.target > 0 && <span className="ml-2 text-sm text-white/70">до {sc.target}</span>}
      </Panel>
    );
  }
  if (ui.mode === "koth") {
    const holder = ui.players.find((p) => p.id === sc.hill);
    return (
      <Panel className="!px-3 !py-1.5 text-base">
        Холм:{" "}
        {sc.contested ? (
          <b className="pvp-pulse text-red-400">оспаривается</b>
        ) : holder ? (
          <b style={{ color: holder.color }}>{holder.name}</b>
        ) : (
          <span className="text-white/70">свободен</span>
        )}
        <span className="ml-2 text-sm text-white/70">до {HILL_TARGET} очков</span>
      </Panel>
    );
  }
  return null;
}

function TopBar({ ui, now }: { ui: UiState; now: number }) {
  const elapsed = Math.max(0, now - ui.phaseStartedAt);
  const t = ui.timings;
  const participants = ui.players.filter((p) => p.role === "player");
  const alive = participants.filter((p) => p.alive).length;
  const clock = roundClock(elapsed, t);
  const index = buffIndexAt(elapsed, t, buffCount(t));
  const nextBuff = index + 1;
  // The current buff lasts until the next one, or (the Chaos finale) to the end of overtime.
  const buffEnds = nextBuff < buffCount(t) ? buffAt(nextBuff, t) : t.roundMs + t.overtimeMs;
  const buffLeft = index >= 0 ? Math.max(0, Math.min(1, (buffEnds - elapsed) / (buffEnds - buffAt(index, t)))) : 0;
  const crumble = ui.phase === "playing" ? ui.crumble : null;
  const respawn = MODES[ui.mode].respawn;
  const color = ui.buffs.length ? BUFFS[ui.buffs[0]].color : "#ffffff";
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1.5">
      <div className="flex items-center gap-3">
        <Panel className={`pvp-title !px-4 !py-2 text-xl ${clock.overtime ? "pvp-pulse text-red-400" : ""}`}>
          {clock.overtime ? `ОВЕРТАЙМ ${fmt(clock.left)}` : fmt(clock.left)}
        </Panel>
        {respawn ? (
          <ModeScore ui={ui} />
        ) : (
          <Panel className="!px-3 !py-1.5 text-lg">
            Живых <b className="text-[#7CFC00]">{alive}</b>/{participants.length}
          </Panel>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        {ui.mode !== "classic" && <ModeBadge mode={ui.mode} />}
        {ui.buffs.length > 1 && <span className="pvp-badge pvp-pulse border-fuchsia-400 text-fuchsia-300">ХАОС</span>}
        {ui.buffs.length ? (
          ui.buffs.map((b) => (
            <span key={b} className="pvp-badge" style={{ borderColor: BUFFS[b].color, color: BUFFS[b].color }}>
              {BUFFS[b].title}
            </span>
          ))
        ) : (
          <span className="pvp-badge border-white/40 text-white/70">без бафа</span>
        )}
        {crumble ? (
          <span className="pvp-badge pvp-pulse border-red-400 text-red-300">Край рухнет через {fmt(crumble.at - now)}!</span>
        ) : clock.overtime ? (
          <span className="pvp-badge pvp-pulse border-red-400 text-red-300">{MODES[ui.mode].noDamage ? "Остров рушится" : "Любой удар убивает"}</span>
        ) : nextBuff < buffCount(t) ? (
          <span className="bg-black/45 px-2 py-0.5 text-white">новый баф через {fmt(buffAt(nextBuff, t) - elapsed)}</span>
        ) : null}
      </div>
      {index >= 0 && ui.buffs.length > 0 && (
        <div className="h-1.5 w-56 overflow-hidden bg-black/50" title="Сколько осталось бафу">
          <div className="h-full transition-[width] duration-200" style={{ width: `${buffLeft * 100}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
        </div>
      )}
    </div>
  );
}

/** Icons next to a name: team role, size, bounty, bomb. */
function playerTags(ui: UiState, p: PlayerInfo): string {
  const tags: string[] = [];
  if (ui.mode === "infection" && p.team === 1) tags.push("🧟");
  if (p.size > 1.2) tags.push("⬆");
  if (p.size < 0.8) tags.push("⬇");
  if (ui.bounty === p.id) tags.push("🎯");
  if (ui.bomb?.holder === p.id) tags.push("💣");
  if (p.shield) tags.push("🛡️");
  if (p.bot) tags.push("🤖");
  return tags.join("");
}

function Scoreboard({ ui }: { ui: UiState }) {
  const teams = MODES[ui.mode].teams;
  const participants = ui.players
    .filter((p) => p.role === "player")
    .sort((a, b) => (teams ? (a.team ?? 0) - (b.team ?? 0) : 0) || (ui.mode === "koth" ? b.score - a.score : 0));
  const respawn = MODES[ui.mode].respawn;
  return (
    <div className="pointer-events-none absolute left-3 top-3 w-48 space-y-0.5 text-sm">
      {participants.map((p) => (
        <div
          key={p.id}
          className={`flex items-center gap-1.5 bg-black/35 px-2 py-0.5 ${p.alive ? "" : respawn ? "opacity-60" : "opacity-45 line-through"}`}
          style={teams && p.team !== null ? { borderLeft: `3px solid ${teams[p.team].color}` } : undefined}
        >
          <span className="h-2.5 w-2.5 shrink-0" style={{ background: p.color }} />
          <span className="flex-1 truncate">
            {p.level > 0 && <span className="mr-1 text-[11px] text-[#7dd3fc]">{p.level}</span>}
            {p.name}
          </span>
          <span>{playerTags(ui, p)}</span>
          {ui.mode === "koth" && <span className="text-[#fbbf24]">★{p.score}</span>}
          {p.kills >= HOT_STREAK && !respawn ? <span className="text-orange-400">🔥{p.kills}</span> : <span className="text-white/70">⚔{p.kills}</span>}
        </div>
      ))}
    </div>
  );
}

const DEATH_TEXT: Record<string, [string, string]> = {
  fall: ["сбросил", "упал с острова"],
  lava: ["утопил в лаве", "сгорел в лаве"],
  boom: ["взорвал", "взорвался"],
};

function KillFeed({ ui, now }: { ui: UiState; now: number }) {
  const items = ui.feed.filter((f) => now - f.at < 7000);
  return (
    <div className={`pointer-events-none absolute right-3 flex flex-col items-end gap-1 text-sm ${top}`}>
      {items.map((f) => {
        const [withKiller, alone] = DEATH_TEXT[f.reason] ?? ["⚔", "погиб"];
        const verb = f.reason === "kill" && ui.mode === "infection" ? "заразил" : withKiller;
        return (
          <div key={f.key} className="pvp-feed bg-black/45 px-2 py-1">
            {f.reason === "leave" || !f.killer ? (
              <>
                <span style={{ color: f.victim.color }}>{f.victim.name}</span> <span className="text-white/70">{f.reason === "leave" ? "вышел" : alone}</span>
              </>
            ) : (
              <>
                <span style={{ color: f.killer.color }}>{f.killer.name}</span> <span className="text-white/70">{verb}</span>{" "}
                <span style={{ color: f.victim.color }}>{f.victim.name}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Announcement({ buffs }: { buffs: BuffId[] }) {
  const chaos = buffs.length > 1;
  const color = chaos ? "#e879f9" : BUFFS[buffs[0]].color;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
      <div className="pvp-flash absolute inset-0" style={{ background: `radial-gradient(circle at center, ${color}aa 0%, transparent 65%)` }} />
      <div className="pvp-sub pvp-outline relative text-base tracking-[0.5em] text-white/90">{chaos ? "ХАОС · ДВА БАФА СРАЗУ" : "НОВЫЙ БАФ"}</div>
      {buffs.map((id) => {
        const b = BUFFS[id];
        return (
          <div key={id} className="relative">
            <div className="pvp-shake relative">
              <div className={`pvp-announce relative px-4 ${chaos ? "text-3xl md:text-5xl" : "text-4xl md:text-6xl"}`} style={{ color: b.color, textShadow: `0 0 28px ${b.color}, 5px 5px 0 #000` }}>
                {b.title}
              </div>
            </div>
            <div className={`pvp-sub pvp-outline relative px-6 ${chaos ? "mt-1 text-lg md:text-xl" : "mt-4 text-xl md:text-2xl"}`}>{b.description}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Each buff tints the screen's edges in its colour; night darkens them. */
function BuffTint({ buffs }: { buffs: BuffId[] }) {
  if (!buffs.length) return null;
  const night = buffs.includes("night");
  const color = night ? "#000010" : BUFFS[buffs[0]].color;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: `radial-gradient(ellipse at center, transparent ${night ? 30 : 55}%, ${color}${night ? "e6" : "40"} 100%)` }}
    />
  );
}

/** The bomb: a big warning for its holder, a small line for everyone else. */
function BombBanner({ ui, now }: { ui: UiState; now: number }) {
  const b = ui.bomb;
  if (!b) return null;
  const left = Math.max(0, b.endsAt - now);
  const holder = ui.players.find((p) => p.id === b.holder);
  if (b.holder === ui.myId) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[22%] flex flex-col items-center text-center">
        <div className="pvp-pulse pvp-title text-3xl text-orange-400 md:text-4xl" style={{ textShadow: "0 0 18px #f97316, 3px 3px 0 #000" }}>
          💣 У ТЕБЯ БОМБА! {fmtTenths(left)}
        </div>
        <div className="pvp-outline mt-2 text-lg">Ударь соперника, чтобы передать её</div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute left-1/2 top-[7.5rem] -translate-x-1/2 bg-black/55 px-3 py-1 text-base">
      💣 бомба у <b style={{ color: holder?.color ?? "#fff" }}>{holder?.name ?? "?"}</b> · <span className={left < 5000 ? "text-red-400" : ""}>{fmtTenths(left)}</span>
    </div>
  );
}

/** First blood, kill streaks, overtime: a short banner under the top bar. */
function Callout({ c }: { c: NonNullable<UiState["callout"]> }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[24%] flex flex-col items-center text-center">
      <div className="pvp-announce-in pvp-title px-4 text-3xl md:text-5xl" style={{ color: c.color, textShadow: `0 0 24px ${c.color}, 4px 4px 0 #000` }}>
        {c.text}
      </div>
      {c.sub && <div className="pvp-outline mt-3 px-6 text-lg md:text-xl">{c.sub}</div>}
    </div>
  );
}

/** Big centred number (or word) that re-animates whenever `text` changes. */
function BigCount({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
      {sub && <div className="pvp-outline px-4 text-center text-xl">{sub}</div>}
      <div key={text} className="pvp-count pvp-title text-8xl text-[#ffde59]">
        {text}
      </div>
    </div>
  );
}

function Countdown({ ui, now }: { ui: UiState; now: number }) {
  const elapsed = Math.max(0, now - ui.phaseStartedAt);
  if (ui.phase === "countdown") {
    return <BigCount text={String(Math.max(1, Math.ceil((ui.timings.countdownMs - elapsed) / 1000)))} sub="Высадка на арену!" />;
  }
  if (ui.phase === "playing" && elapsed < 1200) return <BigCount text="БОЙ!" />;
  return null;
}

/** Eliminated players choose the next buff (keys 1–3 or a click). */
function VotePanel({ ui, now, onVote }: { ui: UiState; now: number; onVote: (i: number) => void }) {
  const v = ui.vote;
  if (!v) return null;
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
      <div className="pvp-outline text-base text-[#ffde59]">Выбери следующий баф · {fmt(v.endsAt - now)}</div>
      <div className="flex flex-wrap justify-center gap-2">
        {v.options.map((id, i) => {
          const b = BUFFS[id];
          const mine = v.mine === i;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onVote(i)}
              className="pvp-panel w-44 !px-2 !py-1.5 text-left"
              style={{ borderColor: mine ? b.color : undefined, boxShadow: mine ? `0 0 12px ${b.color}` : undefined }}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="pvp-key">{i + 1}</span>
                <span className="text-white/80">голосов: {v.votes[i] ?? 0}</span>
              </div>
              <div className="mt-0.5 text-sm" style={{ color: b.color }}>
                {b.title}
              </div>
              <div className="text-[11px] leading-tight text-white/70">{b.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpectatorBar({ ui, now, onVote }: { ui: UiState; now: number; onVote: (i: number) => void }) {
  const s = ui.spectate;
  const modeName = s?.mode === "first" ? "1-е лицо" : s?.mode === "third" ? "3-е лицо" : "свободная камера";
  const respawning = !ui.watching && ui.respawnAt > now;
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-center">
      {!ui.watching && <VotePanel ui={ui} now={now} onVote={onVote} />}
      <Panel className="!py-2">
        <div className="text-lg text-[#ffde59]">
          {ui.watching ? "Вы смотрите раунд" : respawning ? `Возрождение через ${Math.ceil((ui.respawnAt - now) / 1000)}…` : "Вы выбыли — наблюдение"}
        </div>
        <div className="text-white/90">
          {s?.target && s.mode !== "free" ? (
            <>
              Смотрите за <b>{s.target}</b> · {modeName}
            </>
          ) : (
            modeName
          )}
        </div>
        {!respawning && (
          <div className="mt-1 text-sm text-white/90">
            <span className="pvp-key">T</span> вернуться в лобби
          </div>
        )}
        <div className="mt-1 text-xs text-white/65">
          <span className="pvp-key">V</span> режим · ЛКМ/ПКМ или <span className="pvp-key">←</span>/<span className="pvp-key">→</span> — игрок ·{" "}
          <span className="pvp-key">WASD</span> <span className="pvp-key">Пробел</span>/<span className="pvp-key">Shift</span> — полёт
        </div>
      </Panel>
    </div>
  );
}

function EndScreen({ ui, now }: { ui: UiState; now: number }) {
  const left = ui.timings.endMs - Math.max(0, now - ui.phaseStartedAt);
  const winner = ui.players.find((p) => p.id === ui.winnerId);
  const res = ui.results;
  const rows = res?.rows.slice(0, 8) ?? [];
  const winTeam = ui.winTeam !== null ? MODES[ui.mode].teams?.[ui.winTeam] : undefined;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 p-4">
      <Panel className="max-h-full w-full max-w-xl overflow-y-auto text-center !p-4">
        {ui.winnerName ? (
          <>
            <div className="text-base tracking-[0.4em] text-white/80">ПОБЕДИТЕЛЬ</div>
            <div className="pvp-announce-in pvp-title mt-2 text-3xl md:text-4xl" style={{ color: winner?.color ?? "#ffde59" }}>
              {ui.winnerName}
            </div>
            {ui.winnerId === ui.myId && <div className="mt-1 text-2xl text-[#7CFC00]">Это вы!</div>}
            {winTeam && (
              <div className="mt-2 text-xl" style={{ color: winTeam.color }}>
                {winTeam.name} победили · корона лучшему в команде
              </div>
            )}
            {!winTeam && (ui.pointsWin || res?.pointsWin) && <div className="mt-2 text-sm text-white/80">Овертайм закончился — победил лучший по убийствам и урону</div>}
          </>
        ) : (
          <div className="pvp-title text-2xl text-white">Никто не выжил</div>
        )}
        {res && res.mode !== "classic" && (
          <div className="mt-2 text-sm">
            <ModeBadge mode={res.mode} />
          </div>
        )}
        {res && res.awards.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-1.5 text-left text-sm">
            {res.awards.map((a) => (
              <div key={a.title} className="bg-black/35 px-2 py-1">
                <div className="text-xs text-[#ffde59]">{a.title}</div>
                <div className="truncate">
                  <b style={{ color: a.color }}>{a.name}</b> <span className="text-white/70">{a.value}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {rows.length > 0 && (
          <table className="mt-3 w-full text-left text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-white/55">
                <th className="w-6 py-0.5 font-bold">#</th>
                <th className="font-bold">Игрок</th>
                <th className="w-12 text-right font-bold">⚔</th>
                <th className="w-16 text-right font-bold">Урон</th>
                <th className="w-14 text-right font-bold">Криты</th>
                <th className="w-14 text-right font-bold">Блоки</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={r.id === ui.myId ? "bg-white/10" : "odd:bg-black/20"}>
                  <td className="py-0.5 pl-1 text-white/60">{i + 1}</td>
                  <td className="max-w-0 truncate">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5" style={{ background: r.color }} />
                    {r.bot ? `🤖 ${r.name}` : r.name}
                  </td>
                  <td className="text-right">{r.kills}</td>
                  <td className="text-right">{Math.round(r.damage)}</td>
                  <td className="text-right">{r.crits}</td>
                  <td className="pr-1 text-right">{r.blocks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ui.reward && now - ui.reward.at < ui.timings.endMs + 1000 && <RewardPanel r={ui.reward} />}
        <div className="mt-3 text-sm text-white/60">Возврат в лобби через {Math.max(0, Math.ceil(left / 1000))} с</div>
      </Panel>
    </div>
  );
}

function RewardPanel({ r }: { r: NonNullable<UiState["reward"]> }) {
  return (
    <div className="mt-3 bg-black/35 px-3 py-2 text-left text-sm">
      <div className="flex items-baseline justify-between">
        <b className="text-[#7dd3fc]">+{r.xp} опыта</b>
        <span className={r.levelUp ? "pvp-announce-in text-[#ffde59]" : "text-white/70"}>{r.levelUp ? `Новый уровень: ${r.level}!` : `Уровень ${r.level}`}</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-white/75">
        {r.lines.map(([why, xp], i) => (
          <div key={i} className="flex justify-between gap-2">
            <span className="truncate">{why}</span>
            <span className="tabular-nums text-[#7dd3fc]">+{xp}</span>
          </div>
        ))}
      </div>
      {r.unlocked.length > 0 && <div className="mt-1 text-[#ffde59]">Открыто: {r.unlocked.join(", ")} — загляни в гардероб!</div>}
    </div>
  );
}

/** Items from chests: keys 1–5; a raised shield counts down over its slot. */
function ItemBar({ ui, now, onUse }: { ui: UiState; now: number; onUse?: (i: number) => void }) {
  if (!ui.items.some((n) => n > 0) && ui.shieldUntil <= now) return null;
  return (
    <div className={`flex gap-1 ${onUse ? "pointer-events-auto" : ""}`}>
      {ITEM_IDS.map((id, i) => {
        const n = ui.items[i] ?? 0;
        const shield = id === "shield" && ui.shieldUntil > now;
        return (
          <div
            key={id}
            role={onUse ? "button" : undefined}
            aria-label={onUse ? ITEMS[id].title : undefined}
            onPointerDown={
              onUse &&
              ((e) => {
                e.preventDefault();
                e.stopPropagation();
                onUse(i);
              })
            }
            className={`pvp-slot pvp-item relative ${n > 0 || shield ? "" : "opacity-35"} ${onUse ? "active:scale-90" : ""}`}
            title={`${ITEMS[id].title}: ${ITEMS[id].description}`}
          >
            <span className="absolute left-1 top-0.5 text-[10px] text-white/70">{i + 1}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={itemIconUrl(id)} alt={ITEMS[id].title} className="h-8 w-8 [image-rendering:pixelated]" />
            {n > 0 && <span className="pvp-outline absolute bottom-0 right-1 text-sm tabular-nums">{n}</span>}
            {shield && <span className="absolute inset-x-0 bottom-0 h-1 bg-[#93c5fd]" style={{ width: `${Math.max(0, (ui.shieldUntil - now) / SHIELD_MS) * 100}%` }} />}
          </div>
        );
      })}
    </div>
  );
}

/** Emote wheel while E is held: opens where the cursor was, the mouse picks a sector. */
function EmoteWheel({ w }: { w: NonNullable<UiState["emoteWheel"]> }) {
  const sel = w.sel === null ? null : EMOTE_IDS[w.sel];
  const item = WHEEL_R * 0.68;
  return (
    <div className="pvp-wheel pointer-events-none absolute" style={{ left: w.x, top: w.y }}>
      <div className="pvp-wheel-ring" style={{ width: WHEEL_R * 2, height: WHEEL_R * 2 }} />
      {w.sel !== null && <div className="pvp-wheel-arrow" style={{ transform: `rotate(${emoteWheelAngle(w.sel)}rad)` }} />}
      {EMOTE_IDS.map((e, i) => {
        const a = emoteWheelAngle(i);
        const on = w.sel === i;
        return (
          <div
            key={e}
            className={`pvp-wheel-item ${on ? "pvp-wheel-on" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${Math.cos(a) * item}px, ${Math.sin(a) * item}px) scale(${on ? 1.18 : 1})` }}
          >
            <span className="text-3xl leading-none">{EMOTES[e].icon}</span>
            <span className="pvp-outline text-xs">{EMOTES[e].label}</span>
          </div>
        );
      })}
      <div className="pvp-wheel-center pvp-outline">{sel ? EMOTES[sel].text : "отпусти E"}</div>
    </div>
  );
}

function ChatLog({ ui, now, touch }: { ui: UiState; now: number; touch: boolean }) {
  const lines = ui.chat.filter((c) => now - c.at < 7000);
  if (!lines.length) return null;
  return (
    <div className={`pointer-events-none absolute left-3 space-y-0.5 text-sm ${touch ? "bottom-40" : "bottom-28"}`}>
      {lines.map((c) => (
        <div key={c.key} className="pvp-outline bg-black/40 px-2 py-0.5">
          <b style={{ color: c.color }}>{c.name}</b>: {EMOTES[c.e].icon} {EMOTES[c.e].text}
        </div>
      ))}
    </div>
  );
}

function RoomBadge({ room, onLeave }: { room: string; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const url = new URL(location.href);
    url.searchParams.set("room", room);
    void navigator.clipboard?.writeText(url.toString()).then(() => setCopied(true));
  };
  return (
    <div className="pointer-events-auto absolute left-3 top-12 flex items-center gap-1.5 bg-black/45 px-2 py-1 text-sm">
      Комната <b className="tracking-widest text-[#ffde59]">{room}</b>
      <button type="button" className="underline" onClick={copy}>
        {copied ? "ссылка скопирована" : "скопировать ссылку"}
      </button>
      ·
      <button type="button" className="underline" onClick={onLeave}>
        выйти
      </button>
    </div>
  );
}

function Lock({ u, p }: { u: { wins?: number; level?: number } | undefined; p: ProfileInfo | null }) {
  const st = { wins: p?.wins ?? 0, level: p?.level ?? 1 };
  if (unlocked(u, st)) return null;
  return <span className="block text-[10px] text-white/60">🔒 {unlockText(u)}</span>;
}

function ProfileOverlay({ ui, actions }: { ui: UiState; actions: HudActions }) {
  const p = ui.profile;
  const [code, setCode] = useState("");
  const [tokenShown, setTokenShown] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);
  const typed = normalizeRoomCode(code);
  const st = { wins: p?.wins ?? 0, level: p?.level ?? 1 };
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/55 p-4">
      <Panel className="pvp-panel-solid flex max-h-full w-full max-w-3xl flex-col !p-4">
        <h2 className="pvp-title text-center text-2xl text-[#ffde59]">ПРОФИЛЬ</h2>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1 text-sm">
          {p ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="pvp-title text-xl text-[#7dd3fc]">Уровень {p.level}</span>
                <div className="h-3 min-w-40 flex-1 bg-black/50">
                  <div className="h-full bg-[#7dd3fc]" style={{ width: `${(p.into / p.next) * 100}%` }} />
                </div>
                <span className="tabular-nums text-white/75">
                  {p.into}/{p.next} опыта
                </span>
              </div>
              <div className="mt-1 text-white/75">
                Побед <b className="text-white">{p.wins}</b> · раундов <b className="text-white">{p.rounds}</b> · убийств <b className="text-white">{p.kills}</b>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-[#ffde59]">Задания на сегодня</div>
                  <ul className="mt-1 space-y-1.5">
                    {p.quests.map((q) => (
                      <li key={q.id} className={q.done ? "text-[#7CFC00]" : ""}>
                        <div className="flex justify-between gap-2">
                          <span>
                            {q.done ? "✔ " : ""}
                            {q.title}
                          </span>
                          <span className="text-xs text-[#7dd3fc]">+{q.xp}</span>
                        </div>
                        <div className="mt-0.5 h-1.5 bg-black/50">
                          <div className="h-full bg-[#7CFC00]" style={{ width: `${(q.progress / q.target) * 100}%` }} />
                        </div>
                        <div className="text-[11px] text-white/60">
                          {q.progress}/{q.target}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 text-[#ffde59]">Награды</div>
                  <ul className="mt-1 grid grid-cols-2 gap-x-3 text-xs">
                    {[...SKIN_IDS.filter((id) => SKINS[id].unlock).map((id) => [`Скин «${SKINS[id].title}»`, SKINS[id].unlock] as const), ...SWORD_KINDS.filter((k) => SWORDS[k].unlock).map((k) => [`${SWORDS[k].title} меч`, SWORDS[k].unlock] as const)].map(([title, u]) => (
                      <li key={title} className={unlocked(u, st) ? "text-[#7CFC00]" : "text-white/60"}>
                        {unlocked(u, st) ? "✔" : "🔒"} {title}
                        {!unlocked(u, st) && <span className="text-white/45"> — {unlockText(u)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[#ffde59]">Лучшие за неделю</div>
                  {ui.weekly && ui.weekly.rows.length ? (
                    <table className="mt-1 w-full text-left text-xs tabular-nums">
                      <thead>
                        <tr className="text-white/55">
                          <th className="w-5">#</th>
                          <th>Игрок</th>
                          <th className="text-right">Опыт</th>
                          <th className="text-right">Победы</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ui.weekly.rows.map((r, i) => (
                          <tr key={r.name} className="odd:bg-black/20">
                            <td className="text-white/60">{i + 1}</td>
                            <td className="max-w-0 truncate">
                              <span className="mr-1 text-[#7dd3fc]">{r.level}</span>
                              {r.name}
                            </td>
                            <td className="text-right">{r.xp}</td>
                            <td className="text-right">{r.wins}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="mt-1 text-white/60">На этой неделе ещё никто не играл</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-white/70">Профиль загружается…</div>
          )}
          <div className="mt-4 text-[#ffde59]">Приватная комната</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {ui.room ? (
              <>
                Ты в комнате <b className="tracking-widest">{ui.room}</b>
                <McButton onClick={() => actions.switchRoom(null)}>На общий сервер</McButton>
              </>
            ) : (
              <McButton onClick={() => actions.switchRoom("new")}>Создать комнату</McButton>
            )}
            <input value={code} maxLength={5} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="КОД" aria-label="Код комнаты" className="pvp-input w-24 text-center uppercase" />
            <McButton disabled={!typed} onClick={() => typed && actions.switchRoom(typed)}>
              Войти по коду
            </McButton>
          </div>
          <div className="mt-4 text-[#ffde59]">Перенос прогресса</div>
          <p className="mt-1 text-xs text-white/70">
            Прогресс привязан к секретному коду этого браузера, а не к нику. Чтобы играть с другого устройства, вставь там этот код. Никому его не показывай.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {tokenShown ? <code className="select-all break-all bg-black/50 px-1 text-xs">{loadToken()}</code> : <McButton onClick={() => setTokenShown(true)}>Показать мой код</McButton>}
            <input onChange={(e) => setMoved(e.target.value)} placeholder="код с другого устройства" aria-label="Код прогресса" className="pvp-input min-w-0 flex-1 text-xs" />
            <McButton
              disabled={!moved}
              onClick={() => {
                if (moved && saveToken(moved)) location.reload();
                else setMoved(null);
              }}
            >
              Применить
            </McButton>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-white/60">
            <span className="pvp-key">P</span> / <span className="pvp-key">Esc</span> — закрыть
          </span>
          <McButton tone="green" onClick={() => actions.setProfile(false)}>
            Закрыть
          </McButton>
        </div>
      </Panel>
    </div>
  );
}

const REEL_ITEM_H = 46;

/** Slot-machine reel that decelerates onto the next buff, timed to land just before it activates. */
function Roulette({ r }: { r: NonNullable<UiState["roulette"]> }) {
  const reelRef = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const start = r.endsAt - r.duration;
    const n = r.items.length - 1;
    const loop = () => {
      const u = Math.min(1, Math.max(0, (performance.now() - start) / r.duration));
      const p = n * (1 - Math.pow(1 - u, 3));
      if (reelRef.current) reelRef.current.style.transform = `translateY(${-p * REEL_ITEM_H}px)`;
      const idx = Math.round(p);
      if (idx !== last) {
        if (last >= 0) sfx.rouletteTick(u);
        last = idx;
      }
      if (u >= 1) {
        sfx.rouletteStop();
        setLanded(true);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [r]);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[17%] flex flex-col items-center">
      <div className="pvp-outline mb-2 text-sm tracking-[0.4em] text-white/90">СЛЕДУЮЩИЙ БАФ</div>
      <div className={`pvp-reel ${landed ? "pvp-reel-landed" : ""}`} style={{ height: REEL_ITEM_H * 3 }}>
        <div ref={reelRef} style={{ paddingTop: REEL_ITEM_H }}>
          {r.items.map((b, i) => (
            <div key={i} className="pvp-title flex items-center justify-center text-lg" style={{ height: REEL_ITEM_H, color: BUFFS[b].color }}>
              {BUFFS[b].title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DeathBanner({ d }: { d: NonNullable<UiState["death"]> }) {
  return (
    <div className="pvp-death pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-[22vh] text-center">
      <div className="pvp-title text-4xl text-[#ff4d4d] md:text-5xl">{d.fall ? "ВЫ УПАЛИ" : "ВЫ ПОГИБЛИ"}</div>
      {d.killer && (
        <div className="pvp-outline mt-5 text-xl">
          {d.fall ? "Вас сбросил" : "Вас убил"} <span style={{ color: d.color ?? "#fff" }}>{d.killer}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- hub

function leadingMode(votes: Record<GameMode, number>): GameMode | null {
  let best: GameMode | null = null;
  for (const m of MODE_IDS) if ((votes[m] ?? 0) > 0 && (best === null || votes[m] > votes[best])) best = m;
  return best;
}

function HubStatus({ ui, now }: { ui: UiState; now: number }) {
  if (ui.phase === "ended") {
    const winner = ui.players.find((p) => p.id === ui.winnerId);
    return (
      <Panel className="!px-4 !py-2 text-center text-lg">
        {ui.winnerName ? (
          <>
            Победил{" "}
            <b key={ui.winnerId} className="pvp-announce-in inline-block" style={{ color: winner?.color ?? "#ffde59" }}>
              {ui.winnerName}
            </b>
          </>
        ) : (
          "Никто не выжил"
        )}
      </Panel>
    );
  }

  if (ui.phase !== "lobby") {
    const participants = ui.players.filter((p) => p.role === "player");
    const alive = participants.filter((p) => p.alive).length;
    const clock = ui.phase === "playing" ? roundClock(Math.max(0, now - ui.phaseStartedAt), ui.timings) : { overtime: false, left: ui.timings.roundMs };
    return (
      <Panel className="!px-4 !py-2 text-center">
        <div className="text-base">
          Идёт раунд · <b style={{ color: MODES[ui.mode].color }}>{MODES[ui.mode].title}</b> · {clock.overtime ? "овертайм " : ""}
          {fmt(clock.left)} · живых{" "}
          <b className="text-[#7CFC00]">{alive}</b>/{participants.length}
        </div>
        <div className="text-sm text-white/85">
          <span className="pvp-key">T</span> смотреть
        </div>
        <div className="text-sm text-[#ffde59]">Вы в очереди на следующий раунд</div>
      </Panel>
    );
  }

  const hub = ui.hub;
  if (!hub) return null;
  const lead = leadingMode(hub.votes);
  const myVote = hub.myVote ? MODES[hub.myVote] : null;
  return (
    <Panel className="!px-4 !py-2 text-center">
      <div className="pvp-title text-sm text-[#ffde59] md:text-base">
        {hub.startAt !== null ? `Старт через ${fmt(hub.startAt - now)}` : `Ждём игроков: нужно ещё ${Math.max(0, hub.need - hub.active)}`}
      </div>
      {hub.bots > hub.active && (
        <div className="text-xs text-white/70">
          Людей меньше {hub.bots} — раунд доберут боты 🤖
        </div>
      )}
      <div className="mt-1.5 text-sm text-white/90">
        Готовы{" "}
        <b className="text-[#7CFC00]">
          {hub.ready}/{hub.active}
        </b>{" "}
        — встань в зелёный круг у портала
      </div>
      <div className="text-sm text-white/90">
        {lead ? (
          <>
            Лидирует: <b style={{ color: MODES[lead].color }}>{MODES[lead].title}</b>
          </>
        ) : (
          <span className="text-white/70">Голосуй за режим на цветных площадках</span>
        )}
        {myVote && (
          <span className="text-white/70">
            {" "}
            (твой голос: <b style={{ color: myVote.color }}>{myVote.title}</b>)
          </span>
        )}
      </div>
    </Panel>
  );
}

/** Range, parkour and duel panels stacked under the hub status. */
function HubActivity({ ui, now }: { ui: UiState; now: number }) {
  const { range, parkour, duel } = ui;
  const opp = duel ? ui.players.find((p) => p.id === duel.opponent) : undefined;
  return (
    <>
      {range?.state === "running" && (
        <Panel className="!px-4 !py-1.5 text-center">
          <span className="pvp-title text-sm text-[#ffde59]">ТИР {fmt(range.endsAt - now)}</span> · очки <b className="text-[#7CFC00]">{range.score}</b>
        </Panel>
      )}
      {range?.state === "done" && now - range.at < 5000 && (
        <Panel className="!px-4 !py-1.5 text-center">
          Результат <b className="text-[#7CFC00]">{range.score}</b> · лучший сегодня <b>{range.best}</b>
        </Panel>
      )}
      {parkour?.state === "ready" && <Panel className="!px-4 !py-1.5 text-center">Беги! Таймер стартует, когда сойдёшь с круга</Panel>}
      {parkour?.state === "running" && (
        <Panel className="!px-4 !py-1.5 text-center">
          <span className="pvp-title text-sm text-[#ffde59]">ПАРКУР {fmtTenths(now - parkour.startedAt)} с</span>
        </Panel>
      )}
      {parkour?.state === "done" && now - parkour.at < 6000 && (
        <Panel className="!px-4 !py-1.5 text-center">
          Финиш: <b className="text-[#7CFC00]">{fmtTenths(parkour.time)} с</b>
          {parkour.best !== null && (
            <>
              {" "}
              · лучшее сегодня <b>{fmtTenths(parkour.best)} с</b>
            </>
          )}
        </Panel>
      )}
      {duel?.state === "fight" && (
        <Panel className="!px-4 !py-1.5 text-center">
          <span className="pvp-title text-sm text-[#ffde59]">ДУЭЛЬ</span> · <b style={{ color: opp?.color ?? "#fff" }}>{opp?.name ?? "соперник"}</b> · {fmt(duel.endsAt - now)}
        </Panel>
      )}
    </>
  );
}

/** Centred big numbers and verdicts: range / duel countdown, duel result. */
function HubCenter({ ui, now }: { ui: UiState; now: number }) {
  const { range, duel } = ui;
  const opp = duel ? ui.players.find((p) => p.id === duel.opponent) : undefined;
  if (range?.state === "countdown") return <BigCount text={String(Math.max(1, Math.ceil((range.endsAt - now) / 1000)))} sub="Тир" />;
  if (duel?.state === "countdown") {
    return <BigCount text={String(Math.max(1, Math.ceil((duel.endsAt - now) / 1000)))} sub={`Дуэль с ${opp?.name ?? "соперником"}`} />;
  }
  if (duel?.state === "over" && now - duel.at < 4000) {
    const [text, color] = duel.won === null ? ["Ничья", "#ffffff"] : duel.won ? ["ПОБЕДА!", "#7CFC00"] : ["Поражение", "#ff4d4d"];
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div key={duel.at} className="pvp-announce-in pvp-title text-4xl md:text-5xl" style={{ color, textShadow: "4px 4px 0 #000" }}>
          {text}
        </div>
      </div>
    );
  }
  return null;
}

function TrainPanel({ t, touch }: { t: TrainStats; touch: boolean }) {
  const pct = t.hits > 0 ? Math.round((t.crits / t.hits) * 100) : 0;
  const rows: [string, string | number][] = [
    ["Удары", t.hits],
    ["Криты", `${t.crits} (${pct}%)`],
    ["Серия", `${t.combo} · макс ${t.best}`],
    ["Урон/с", t.dps.toFixed(1)],
    ["Скелетов побеждено", t.kills],
    ["Сбито с обрыва", t.knocked],
    ["Стрелы: уклонился / попаданий", `${t.dodged} / ${t.arrowHits}`],
  ];
  return (
    <div className={`pvp-train pointer-events-none absolute left-3 px-3 py-2 text-xs ${touch ? "top-14 w-[15rem] origin-top-left scale-90" : "bottom-3 w-[19rem]"}`}>
      <div className="pvp-title mb-1 text-[0.65rem] text-[#ffde59]">ТРЕНИРОВКА</div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-white/70">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Notices({ ui, now, className }: { ui: UiState; now: number; className: string }) {
  const items = ui.notices.filter((n) => now - n.at < 6000).slice(-5);
  if (items.length === 0) return null;
  return (
    <div className={`pointer-events-none absolute right-3 flex max-w-60 flex-col items-end gap-1 text-sm ${className}`}>
      {items.map((n) => (
        <div key={n.key} className="pvp-feed bg-black/55 px-2 py-1 text-right" style={{ color: n.color }}>
          {n.text}
        </div>
      ))}
    </div>
  );
}

function InvitePrompt({ ui, onAnswer }: { ui: UiState; onAnswer: (accept: boolean) => void }) {
  const from = ui.players.find((p) => p.id === ui.invite?.from);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center px-4">
      <Panel className="pointer-events-auto !px-4 !py-3 text-center">
        <div className="text-lg">
          <b style={{ color: from?.color ?? "#fff" }}>{from?.name ?? "Игрок"}</b> вызывает на дуэль
        </div>
        <div className="mt-3 flex justify-center gap-3">
          <McButton tone="green" className="!px-4 !py-2" onClick={() => onAnswer(true)}>
            Принять [Y]
          </McButton>
          <McButton tone="red" className="!px-4 !py-2" onClick={() => onAnswer(false)}>
            Отказать [N]
          </McButton>
        </div>
      </Panel>
    </div>
  );
}

function Wardrobe({ look, myId, profile, onLook, onClose }: { look: UiState["look"]; myId: number | null; profile: ProfileInfo | null; onLook: (color: string, skin: SkinId, sword?: SwordKind) => void; onClose: () => void }) {
  const st = { wins: profile?.wins ?? 0, level: profile?.level ?? 1 };
  // Each skin's face in the chosen colour (Steve's hair follows the player's id, as in game).
  const faces = useMemo(() => Object.fromEntries(SKIN_IDS.map((id) => [id, skinFaceUrl(id, look.color, hairFor(myId ?? 0))])), [look.color, myId]);
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/55 p-4">
      <Panel className="pvp-panel-solid max-h-full w-full max-w-md overflow-y-auto">
        <h2 className="pvp-title text-center text-2xl text-[#ffde59]">ГАРДЕРОБ</h2>
        <div className="mt-4 text-sm text-white/75">Цвет</div>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {PLAYER_COLORS.map((c) => {
            const on = look.color.toLowerCase() === c;
            return (
              <button
                key={c}
                type="button"
                aria-label={`Цвет ${c}`}
                aria-pressed={on}
                onClick={() => onLook(c, look.skin, look.sword)}
                className={`pvp-swatch ${on ? "pvp-swatch-on" : ""}`}
                style={{ background: c }}
              />
            );
          })}
        </div>
        <div className="mt-4 text-sm text-white/75">Облик</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SKIN_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={look.skin === id}
              disabled={!unlocked(SKINS[id].unlock, st)}
              onClick={() => onLook(look.color, id)}
              className={`pvp-chip pvp-skin-chip ${look.skin === id ? "pvp-chip-on" : ""} ${unlocked(SKINS[id].unlock, st) ? "" : "opacity-50"}`}
            >
              <span className="pvp-skin-face" style={{ backgroundImage: `url(${faces[id]})` }} aria-hidden />
              <span>
                {SKINS[id].title}
                <Lock u={SKINS[id].unlock} p={profile} />
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 text-sm text-white/75">Меч</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SWORD_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={look.sword === k}
              disabled={!unlocked(SWORDS[k].unlock, st)}
              onClick={() => onLook(look.color, look.skin, k)}
              className={`pvp-chip ${look.sword === k ? "pvp-chip-on" : ""} ${unlocked(SWORDS[k].unlock, st) ? "" : "opacity-50"}`}
            >
              <span className="mr-1 inline-block h-2.5 w-2.5" style={{ background: SWORD_COLORS[k] }} />
              {SWORDS[k].title}
              <Lock u={SWORDS[k].unlock} p={profile} />
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-xs text-white/60">
            <span className="pvp-key">Esc</span> — закрыть
          </span>
          <McButton tone="green" onClick={onClose}>
            Готово
          </McButton>
        </div>
      </Panel>
    </div>
  );
}

const SWORD_COLORS: Record<SwordKind, string> = { wood: "#a07a45", stone: "#8a8a8a", iron: "#d8d8d8", gold: "#facc15", diamond: "#4ee6d8", netherite: "#4a3f45" };

const HELP_ITEMS: [string, string][] = [
  ["Карты", "Каждый раунд арена генерируется заново: холмы, руины, лес или мосты. Прячься за стенами, занимай высоты, сталкивай с уступов у края."],
  ["Сундуки", "Подойди к сундуку, чтобы открыть. Клавиши 1–5: золотое яблоко (+4 сердца), эндер-жемчуг (бросок и телепорт), щит (8 с блокирует удар), снежки (отталкивают), TNT (взрыв через 2,5 с)."],
  ["Боты", `Если людей меньше ${BOT_FILL}, раунд добирают боты 🤖 — играть можно и одному. Победа над одними ботами даёт половину опыта.`],
  ["Прогресс", "Опыт за раунды, уровни, ежедневные задания и таблица недели — клавиша P. Новые скины и мечи открываются за победы и уровни. Прогресс привязан к этому браузеру, а не к нику."],
  ["Комнаты", "В профиле (P) создай приватную комнату и отправь друзьям ссылку или код из 5 символов."],
  ["Эмоции", "Зажми E — появится колесо там, где курсор (с захваченной мышью — у прицела). Наведи мышью на эмоцию и отпусти E: gg, ха-ха, помахать, показать (метка там, где нажата E), спасибо, упс. Esc или ПКМ — отмена."],
  ["Зелёный круг у портала", "Встань в него: когда в круге больше половины игроков, раунд начнётся через 10 с. Иначе старт через 60 с после того, как в лобби двое."],
  ["Цветные площадки", "Голосование за режим. Встань на площадку — режим с наибольшим числом голосов сыграют в раунде."],
  ["Спринт", "Дважды быстро нажми W, как в Minecraft. Бег быстрее на 30%, с прыжками ещё быстрее. Спринт сбивается, если отпустить W, врезаться в стену или ударить. Удар с разбега отбрасывает сильнее, но не критует."],
  ["Скелеты", "Манекены, ходячие скелеты, «Сбей меня!» на обрыве и лучник — его стрелы безвредны, учись уворачиваться. Статистика слева внизу."],
  ["Тир", "Встань на стартовую площадку: 30 секунд попадай по мишеням, каждая — очко. Лучший результат дня запоминается."],
  ["Паркур", "Встань на круг и беги: таймер стартует, когда сойдёшь с него, и останавливается на финише."],
  ["Дуэли", "Посмотри на игрока и нажми F. Соперник отвечает Y или N. Бой идёт в яме, до первой смерти."],
  ["Гардероб", "Подойди и нажми E: выбери цвет и облик."],
  ["Стройка", "Ставь блоки (ПКМ) на площадке для строительства — со временем они исчезают."],
  ["Раунд", "Нажми T, чтобы смотреть арену из лобби. После раунда все возвращаются сюда, победитель стоит на пьедестале в короне."],
  ["Бафы", "Каждую минуту — новый, в конце раунда «Хаос» из двух. Выбывшие выбирают следующий баф клавишами 1–3. «Луки»: Q — выстрел, у каждого 5 стрел."],
];

function Help({ onClose, sens, onSens }: { onClose: () => void; sens: number; onSens: (v: number) => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/55 p-4">
      <Panel className="pvp-panel-solid flex max-h-full w-full max-w-3xl flex-col !p-4">
        <h2 className="pvp-title text-center text-2xl text-[#ffde59]">ПОМОЩЬ</h2>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
          <ul className="grid gap-x-5 gap-y-1.5 text-[13px] leading-snug text-white/85 md:grid-cols-2">
            {HELP_ITEMS.map(([title, text]) => (
              <li key={title}>
                <b className="text-[#ffde59]">{title}.</b> {text}
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[13px] leading-snug text-white/85">
            <b className="text-[#ffde59]">Режимы.</b>{" "}
            {MODE_IDS.map((m, i) => (
              <span key={m}>
                {i > 0 && " · "}
                <b style={{ color: MODES[m].color }}>{MODES[m].title}</b> — {MODES[m].description}
              </span>
            ))}
          </div>
          <div className="mt-2">
            <Controls className="grid-cols-2 md:grid-cols-3" />
          </div>
          <div className="mt-3">
            <SensSlider value={sens} onChange={onSens} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-white/60">
            <span className="pvp-key">H</span> / <span className="pvp-key">Esc</span> — закрыть
          </span>
          <McButton tone="green" onClick={onClose}>
            Закрыть
          </McButton>
        </div>
      </Panel>
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden>
      <path d="M2 6h3l4-3v10l-4-3H2z" fill="#fff" />
      {muted ? (
        <path d="M11 5.5l4 5M15 5.5l-4 5" stroke="#ff6b6b" strokeWidth="1.6" />
      ) : (
        <path d="M11 5.5c1 .8 1 4.2 0 5M13 4c2 1.5 2 6.5 0 8" stroke="#fff" strokeWidth="1.4" fill="none" />
      )}
    </svg>
  );
}

function Hud({ ui, dirtIcon, actions }: { ui: UiState; dirtIcon: string; actions: HudActions }) {
  const now = useNow(100);
  const arena = ui.view === "arena" || ui.watching;
  const playing = ui.phase === "playing" || ui.phase === "countdown";
  const inRound = arena && playing;
  const spectating = inRound && (ui.watching || !ui.alive);
  const overlay = ui.wardrobe || ui.help || ui.profileOpen;
  const duelActive = ui.duel?.state === "countdown" || ui.duel?.state === "fight";
  const showCrosshair = !overlay && (arena ? inRound && ui.alive && !ui.watching : true);
  const touch = ui.touch;
  const showLockHint = !touch && !ui.locked && !overlay && !ui.emoteWheel && (arena ? inRound && !(spectating && ui.vote) : true);
  // Below the touch controls' top-right row.
  const topRight = touch ? "top-16" : "top-3";
  return (
    <>
      {ui.hurtKey > 0 && <div key={ui.hurtKey} className="pvp-hurt pointer-events-none absolute inset-0" />}
      {ui.arrowKey > 0 && <div key={`a${ui.arrowKey}`} className="pvp-arrow-flash pointer-events-none absolute inset-0" />}
      {/* First, so the HUD's own buttons (items, votes, prompts) stay on top of it. */}
      {touch && !overlay && <TouchControls ui={ui} input={actions.input} />}
      {touch && <PortraitHint />}
      {inRound && ui.phase === "playing" && <BuffTint buffs={ui.buffs} />}
      {inRound && ui.alive && !ui.watching && ui.lava >= 0 && <div className="pvp-lava pointer-events-none absolute inset-0" />}

      {!arena && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-3 flex w-max max-w-[min(32rem,56vw)] -translate-x-1/2 flex-col items-center gap-2">
            <HubStatus ui={ui} now={now} onWatch={touch ? actions.toggleWatch : undefined} />
            <HubActivity ui={ui} now={now} />
          </div>
          {touch ? (
            <div className="absolute left-3 top-3 flex gap-1.5">
              <McButton className="!px-2.5 !py-1 text-sm" onClick={() => actions.setHelp(true)}>
                Помощь
              </McButton>
              <McButton className="!px-2.5 !py-1 text-sm" onClick={() => actions.setProfile(true)}>
                Профиль{ui.profile ? ` · ${ui.profile.level}` : ""}
              </McButton>
            </div>
          ) : (
            <div className="pointer-events-none absolute left-3 top-3 bg-black/45 px-2 py-1 text-sm">
              <span className="pvp-key">H</span> помощь · <span className="pvp-key">P</span> профиль{ui.profile ? ` (ур. ${ui.profile.level})` : ""} · зажми <span className="pvp-key">E</span> — эмоции
            </div>
          )}
          {ui.room && <RoomBadge room={ui.room} onLeave={() => actions.switchRoom(null)} />}
          {ui.reward && ui.phase === "lobby" && now - ui.reward.at < ui.timings.endMs + 9000 && (
            <div className={`pointer-events-none absolute right-3 w-72 ${topRight}`}>
              <RewardPanel r={ui.reward} />
            </div>
          )}
          {ui.train && <TrainPanel t={ui.train} touch={touch} />}
          <HubCenter ui={ui} now={now} />
          {ui.hint && now - ui.hint.at < 3000 && (
            <div key={ui.hint.key} className="pvp-toast pointer-events-none absolute inset-x-0 top-[56%] flex justify-center px-4">
              <span className="pvp-outline bg-black/55 px-3 py-1.5 text-center text-lg">{ui.hint.text}</span>
            </div>
          )}
          {ui.invite && now - ui.invite.at < 15000 && <InvitePrompt ui={ui} onAnswer={actions.answerDuel} />}
          {touch && !duelActive && !overlay && (ui.duelTarget || ui.nearWardrobe) && (
            <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
              {ui.duelTarget && (
                <McButton tone="red" className="!px-3 !py-1.5" onClick={actions.challengeDuel}>
                  Дуэль: <b>{ui.duelTarget.name}</b>
                </McButton>
              )}
              {ui.nearWardrobe && (
                <McButton className="!px-3 !py-1.5" onClick={() => actions.setWardrobe(true)}>
                  Гардероб
                </McButton>
              )}
            </div>
          )}
          {!touch && !duelActive && !overlay && (ui.duelTarget || ui.nearWardrobe) && (
            <div className="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 text-lg">
              {ui.duelTarget && (
                <span className="pvp-outline bg-black/55 px-3 py-1">
                  <span className="pvp-key">F</span> вызвать <b style={{ color: ui.players.find((p) => p.id === ui.duelTarget?.id)?.color ?? "#fff" }}>{ui.duelTarget.name}</b> на дуэль
                </span>
              )}
              {ui.nearWardrobe && (
                <span className="pvp-outline bg-black/55 px-3 py-1">
                  <span className="pvp-key">E</span> гардероб
                </span>
              )}
            </div>
          )}
          {duelActive && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2">
              <div key={ui.hurtKey} className={ui.hurtKey ? "pvp-heart-shake" : ""}>
                <Hearts hp={ui.hp} />
              </div>
            </div>
          )}
          <Notices ui={ui} now={now} className={topRight} />
        </>
      )}

      {inRound && (
        <>
          <TopBar ui={ui} now={now} />
          <Scoreboard ui={ui} />
          <KillFeed ui={ui} now={now} top={topRight} />
          <Notices ui={ui} now={now} className="top-[34%]" />
          <Countdown ui={ui} now={now} />
          {ui.roulette && ui.phase === "playing" && <Roulette key={ui.roulette.key} r={ui.roulette} />}
          {ui.announce && ui.phase === "playing" && now - ui.announce.at < 4000 && <Announcement key={ui.announce.key} buffs={ui.announce.buffs} />}
          {ui.phase === "playing" && <BombBanner ui={ui} now={now} />}
          {ui.callout && ui.phase === "playing" && now - ui.callout.at < 3000 && <Callout key={ui.callout.key} c={ui.callout} />}
        </>
      )}

      {inRound && ui.alive && !ui.watching && (
        <div className={`pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center ${touch ? "bottom-2 gap-1" : "bottom-4 gap-2"}`}>
          <div key={ui.hurtKey} className={ui.hurtKey ? "pvp-heart-shake" : ""}>
            <Hearts hp={ui.hp} max={ui.maxHp} />
          </div>
          {/* On touch the dirt and arrow counts sit on their buttons. */}
          {!touch && ui.arrows > 0 && (
            <div className="pvp-outline bg-black/45 px-2 py-0.5 text-lg">
              🏹 <b className="tabular-nums">{ui.arrows}</b> · <span className="pvp-key">Q</span> выстрел
            </div>
          )}
          <div className="flex items-end gap-2">
            {!touch && (
              <div className="pvp-slot flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dirtIcon} alt="" className="h-9 w-9 [image-rendering:pixelated]" />
                <span className="pvp-outline text-2xl tabular-nums">{ui.dirt}</span>
              </div>
            )}
            <ItemBar ui={ui} now={now} onUse={touch ? actions.useItem : undefined} />
          </div>
        </div>
      )}

      {showCrosshair && <div className="pvp-crosshair pointer-events-none absolute left-1/2 top-1/2" />}

      {spectating && !ui.watching && ui.death && now - ui.death.at < 3200 && <DeathBanner key={ui.death.key} d={ui.death} />}
      {spectating && <SpectatorBar ui={ui} now={now} onVote={actions.vote} onLobby={touch ? actions.toggleWatch : undefined} />}

      {showLockHint && (
        <div className="pointer-events-none absolute inset-x-0 top-[66%] text-center">
          <span className="pvp-outline bg-black/45 px-3 py-1.5 text-lg">Кликните по экрану, чтобы управлять мышью</span>
        </div>
      )}

      {ui.ping !== null && (
        <div
          className={`pvp-outline pointer-events-none absolute bg-black/45 px-2 py-0.5 text-sm ${touch ? "left-1/2 top-[calc(env(safe-area-inset-top,0px)+0.25rem)] -translate-x-1/2 text-xs opacity-0" : "bottom-3.5 right-[4.75rem]"}`}
          title="Задержка до игрового сервера"
        >
          Пинг <b style={{ color: ui.ping < 80 ? "#7CFC00" : ui.ping < 160 ? "#facc15" : "#ff7b7b" }}>{ui.ping}</b> мс
        </div>
      )}

      {/* On touch the sound button is in the controls' top row. */}
      <button
        type="button"
        onClick={actions.toggleMute}
        className={`pvp-mute absolute bottom-3 right-3 ${touch ? "hidden" : ""}`}
        aria-label={ui.muted ? "Включить звук" : "Выключить звук"}
        title="Звук (M)"
      >
        <SpeakerIcon muted={ui.muted} />
        <span className="text-xs text-white/70">M</span>
      </button>

      <ChatLog ui={ui} now={now} touch={touch} />
      {ui.emoteWheel && <EmoteWheel w={ui.emoteWheel} />}
      {arena && ui.phase === "ended" && <EndScreen ui={ui} now={now} />}
      {ui.wardrobe && <Wardrobe look={ui.look} myId={ui.myId} profile={ui.profile} onLook={actions.setLook} onClose={() => actions.setWardrobe(false)} />}
      {ui.profileOpen && <ProfileOverlay ui={ui} actions={actions} />}
      {ui.help && <Help onClose={() => actions.setHelp(false)} sens={ui.sens} onSens={actions.setSens} touch={touch} aimAssist={ui.aimAssist} onAimAssist={actions.setAimAssist} />}
    </>
  );
}

export default function PvpGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [store] = useState(() => createStore(initialUi()));
  const [dirtIcon] = useState(() => dirtIconUrl());
  const ui = useSyncExternalStore(store.subscribe, store.get, store.get);

  useEffect(() => {
    const engine = new Engine(hostRef.current!, store);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [store]);

  const api = () => engineRef.current as unknown as EngineApi | null;
  const actions: HudActions = {
    toggleMute: () => api()?.toggleMute(),
    setSens: (v) => api()?.setSens(v),
    input: () => api(),
    useItem: (i) => api()?.useItem(i),
    toggleWatch: () => api()?.toggleWatch(),
    challengeDuel: () => api()?.challengeDuel(),
    setAimAssist: (on) => api()?.setAimAssist(on),
    setLook: (color, skin, sword) => api()?.setLook(color, skin, sword),
    switchRoom: (room) => api()?.switchRoom(room),
    setProfile: (open) => api()?.setProfile(open),
    setWardrobe: (open) => api()?.setWardrobe(open),
    setHelp: (open) => api()?.setHelp(open),
    answerDuel: (accept) => api()?.answerDuel(accept),
    vote: (i) => api()?.vote(i),
  };

  return (
    <div className="pvp-root fixed inset-0 select-none overflow-hidden bg-black text-white">
      <div ref={hostRef} className="absolute inset-0" />
      {ui.conn === "idle" && <JoinScreen onJoin={(name, room) => api()?.join(name, room)} sens={ui.sens} onSens={actions.setSens} touch={ui.touch} />}
      {ui.conn === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Panel className="text-xl">Подключение к серверу…</Panel>
        </div>
      )}
      {ui.conn === "closed" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4">
          <Panel className="max-w-md text-center">
            <div className="text-2xl text-[#ff7b7b]">{ui.closeReason ? "Отключено сервером" : "Нет связи с игровым сервером"}</div>
            <p className="mt-2 text-sm text-white/75">{ui.closeReason ?? "Сервер не запущен или соединение оборвалось."}</p>
            <McButton className="mt-4" onClick={() => api()?.reconnect()}>
              Переподключиться
            </McButton>
            {ui.closeReason?.startsWith("Комнат") && (
              <McButton className="ml-2 mt-4" onClick={() => api()?.switchRoom(null)}>
                На общий сервер
              </McButton>
            )}
          </Panel>
        </div>
      )}
      {ui.conn === "open" && <Hud ui={ui} dirtIcon={dirtIcon} actions={actions} />}
    </div>
  );
}
