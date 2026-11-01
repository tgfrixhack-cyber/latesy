"use client";

// Touch controls for phones and tablets: a floating stick under the left thumb, swipe anywhere on
// the right to look, and a thumb cluster of big buttons in the bottom-right corner. Every button on
// the right also turns the view while the finger slides on it, so you can swing and aim at once.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { UiState } from "@/game/client/store";
import { swordIconUrl } from "@/game/client/sword";
import { dirtIconUrl } from "@/game/client/textures";

/** What the controls need from the engine. */
export interface TouchInput {
  touchStick(x: number, y: number): void;
  touchStickEnd(): void;
  touchLook(dx: number, dy: number): void;
  touchButton(button: "jump" | "down" | "attack" | "place", on: boolean): void;
  touchRelease(): void;
  toggleView(): void;
  toggleMute(): void;
  spectateNext(dir: number): void;
  shootBow(): void;
  wheelTouchStart(): void;
  wheelTouchMove(dx: number, dy: number): void;
  wheelTouchEnd(): void;
  wheelTap(x: number, y: number): void;
}

/** Stick reach (px), the share of it that does nothing, and the left share of the screen where a
 *  finger grabs the stick (the rest looks around). */
const STICK_R = 56;
const DEAD = 0.12;
const STICK_ZONE = 0.42;
const SPRINT_AT = 0.92;

type Finger = { kind: "stick" | "look"; x: number; y: number; ox: number; oy: number };

/** A button's centre measured from the bottom-right corner (inside the safe area). */
function corner(right: number, bottom: number, size: number): CSSProperties {
  return {
    width: size,
    height: size,
    right: `calc(env(safe-area-inset-right, 0px) + ${right - size / 2}px)`,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottom - size / 2}px)`,
  };
}

function fullscreenOn(): boolean {
  return typeof document !== "undefined" && !!document.fullscreenElement;
}

/** Fullscreen and landscape where the browser allows it (Android; iPhones keep the browser bar). */
export function enterFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenEnabled || document.fullscreenElement) return;
  el.requestFullscreen({ navigationUI: "hide" })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape"))
    .catch(() => {});
}

/** A held button: pressed while the finger is down; sliding on it reports the movement. */
function HoldButton({
  label,
  style,
  className = "",
  onPress,
  onRelease,
  onDrag,
  children,
}: {
  label: string;
  style: CSSProperties;
  className?: string;
  onPress?: () => void;
  onRelease?: () => void;
  onDrag?: (dx: number, dy: number) => void;
  children: ReactNode;
}) {
  const [on, setOn] = useState(false);
  const finger = useRef<{ id: number; x: number; y: number } | null>(null);
  const end = (e: ReactPointerEvent) => {
    if (finger.current?.id !== e.pointerId) return;
    finger.current = null;
    setOn(false);
    onRelease?.();
  };
  return (
    <div
      role="button"
      aria-label={label}
      aria-pressed={on}
      className={`pvp-tbtn ${on ? "pvp-tbtn-on" : ""} ${className}`}
      style={style}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (finger.current) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic events in tests have no real pointer to capture.
        }
        finger.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        setOn(true);
        onPress?.();
      }}
      onPointerMove={(e) => {
        const f = finger.current;
        if (!f || f.id !== e.pointerId) return;
        onDrag?.(e.clientX - f.x, e.clientY - f.y);
        f.x = e.clientX;
        f.y = e.clientY;
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      {children}
    </div>
  );
}

function Icon({ src, size }: { src: string; size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" draggable={false} className="pointer-events-none [image-rendering:pixelated]" style={{ width: size, height: size }} />;
}

/** Up / down chevron for jump and flying. */
function Chevron({ down = false }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="30" height="30" aria-hidden style={{ transform: down ? "rotate(180deg)" : undefined }}>
      <path d="M2 11 8 5l6 6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
  );
}

export function TouchControls({ ui, input }: { ui: UiState; input: () => TouchInput | null }) {
  const fingers = useRef(new Map<number, Finger>());
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(fullscreenOn);
  const mode = ui.inputMode;

  // Lifted fingers can't be reported once the controls are gone: let go of everything.
  useEffect(() => {
    const map = fingers.current;
    return () => {
      map.clear();
      input()?.touchRelease();
    };
  }, [input]);

  useEffect(() => {
    // iOS Safari pinch-zooms on gesture events even with touch-action: none.
    const stop = (e: Event) => e.preventDefault();
    const fs = () => setFull(fullscreenOn());
    document.addEventListener("gesturestart", stop);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("fullscreenchange", fs);
    };
  }, []);

  const showStick = (ox: number, oy: number, dx: number, dy: number, sprint: boolean) => {
    const b = base.current;
    const k = knob.current;
    if (!b || !k) return;
    b.classList.add("pvp-stick-on");
    b.style.left = `${ox - STICK_R}px`;
    b.style.top = `${oy - STICK_R}px`;
    b.style.bottom = "auto";
    k.style.transform = `translate(${dx}px, ${dy}px)`;
    k.classList.toggle("pvp-knob-sprint", sprint);
  };

  const hideStick = () => {
    const b = base.current;
    const k = knob.current;
    if (!b || !k) return;
    b.classList.remove("pvp-stick-on");
    b.style.left = b.style.top = b.style.bottom = "";
    k.style.transform = "";
    k.classList.remove("pvp-knob-sprint");
  };

  /** Stick from its centre to the finger: the base follows a finger that runs past its reach. */
  const steer = (f: Finger, x: number, y: number) => {
    let dx = x - f.ox;
    let dy = y - f.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      f.ox = x - (dx / d) * STICK_R;
      f.oy = y - (dy / d) * STICK_R;
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    const reach = Math.min(1, d / STICK_R);
    const amount = reach <= DEAD ? 0 : (reach - DEAD) / (1 - DEAD);
    const sx = d ? (dx / Math.max(d, 1e-6)) * amount : 0;
    const sy = d ? (-dy / Math.max(d, 1e-6)) * amount : 0;
    input()?.touchStick(sx, sy);
    showStick(f.ox, f.oy, dx, dy, reach >= SPRINT_AT && sy > 0.7 * amount);
  };

  const local = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const { x, y, w, h } = local(e);
    const map = fingers.current;
    const hasStick = [...map.values()].some((f) => f.kind === "stick");
    const moves = mode === "play" || mode === "spectate";
    const kind = !hasStick && moves && x < w * STICK_ZONE ? "stick" : "look";
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests have no real pointer to capture.
    }
    if (kind === "stick") {
      // The whole base stays on screen.
      const ox = Math.max(STICK_R + 6, x);
      const oy = Math.max(STICK_R + 6, Math.min(h - STICK_R - 6, y));
      const f: Finger = { kind, x, y, ox, oy };
      map.set(e.pointerId, f);
      steer(f, x, y);
    } else {
      map.set(e.pointerId, { kind, x, y, ox: x, oy: y });
    }
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = fingers.current.get(e.pointerId);
    if (!f) return;
    const { x, y } = local(e);
    if (f.kind === "stick") steer(f, x, y);
    else input()?.touchLook(x - f.x, y - f.y);
    f.x = x;
    f.y = y;
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = fingers.current.get(e.pointerId);
    if (!f) return;
    fingers.current.delete(e.pointerId);
    if (f.kind === "stick") {
      hideStick();
      input()?.touchStickEnd();
    }
  };

  const look = (dx: number, dy: number) => input()?.touchLook(dx, dy);
  const play = mode === "play";
  const spectate = mode === "spectate";
  const freeCam = spectate && ui.spectate?.mode === "free";
  const arena = ui.view === "arena";
  const canBuild = play && (arena ? ui.dirt > 0 : true);
  const swordIcon = swordIconUrl(ui.look.sword);

  return (
    <div
      className="pvp-touch"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {(play || spectate) && (
        <div ref={base} className="pvp-stick" aria-hidden>
          <div ref={knob} className="pvp-knob" />
        </div>
      )}

      <div className="pvp-tutil">
        {play && (
          <HoldButton
            label="Эмоции"
            style={{ width: 46, height: 46 }}
            className="!relative"
            onPress={() => input()?.wheelTouchStart()}
            onDrag={(dx, dy) => input()?.wheelTouchMove(dx, dy)}
            onRelease={() => input()?.wheelTouchEnd()}
          >
            <span className="text-2xl leading-none">😀</span>
          </HoldButton>
        )}
        {(play || spectate || mode === "frozen") && (
          <HoldButton label="Вид камеры" style={{ width: 46, height: 46 }} className="!relative" onPress={() => input()?.toggleView()}>
            <svg viewBox="0 0 16 16" width="24" height="24" aria-hidden>
              <path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8Z" fill="none" stroke="#fff" strokeWidth="1.6" />
              <circle cx="8" cy="8" r="2.2" fill="#fff" />
            </svg>
          </HoldButton>
        )}
        <HoldButton label={ui.muted ? "Включить звук" : "Выключить звук"} style={{ width: 46, height: 46 }} className="!relative" onPress={() => input()?.toggleMute()}>
          <span className="text-xl leading-none">{ui.muted ? "🔇" : "🔊"}</span>
        </HoldButton>
        {typeof document !== "undefined" && document.fullscreenEnabled && (
          <HoldButton
            label={full ? "Выйти из полноэкранного режима" : "На весь экран"}
            style={{ width: 46, height: 46 }}
            className="!relative"
            onPress={() => (full ? document.exitFullscreen().catch(() => {}) : enterFullscreen())}
          >
            <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden>
              <path d={full ? "M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5" : "M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5"} fill="none" stroke="#fff" strokeWidth="2" />
            </svg>
          </HoldButton>
        )}
      </div>

      {play && (
        <>
          <HoldButton
            label="Удар"
            style={corner(80, 80, 92)}
            className="pvp-tbtn-main"
            onPress={() => input()?.touchButton("attack", true)}
            onRelease={() => input()?.touchButton("attack", false)}
            onDrag={look}
          >
            <Icon src={swordIcon} size={50} />
          </HoldButton>
          <HoldButton
            label="Прыжок"
            style={corner(176, 48, 68)}
            onPress={() => input()?.touchButton("jump", true)}
            onRelease={() => input()?.touchButton("jump", false)}
            onDrag={look}
          >
            <Chevron />
          </HoldButton>
          <HoldButton
            label="Поставить блок"
            style={corner(64, 188, 62)}
            className={canBuild ? "" : "opacity-45"}
            onPress={() => input()?.touchButton("place", true)}
            onRelease={() => input()?.touchButton("place", false)}
            onDrag={look}
          >
            <Icon src={dirtIconUrl()} size={30} />
            {arena && <span className="pvp-tbadge">{ui.dirt}</span>}
          </HoldButton>
          {arena && ui.arrows > 0 && (
            <HoldButton label="Выстрел из лука" style={corner(160, 160, 58)} onPress={() => input()?.shootBow()} onDrag={look}>
              <span className="text-2xl leading-none">🏹</span>
              <span className="pvp-tbadge">{ui.arrows}</span>
            </HoldButton>
          )}
        </>
      )}

      {spectate && (
        <>
          <HoldButton label="Следующий игрок" style={corner(80, 80, 84)} className="pvp-tbtn-main" onPress={() => input()?.spectateNext(1)} onDrag={look}>
            <span className="pvp-outline text-2xl">▶</span>
          </HoldButton>
          <HoldButton label="Предыдущий игрок" style={corner(176, 48, 64)} onPress={() => input()?.spectateNext(-1)} onDrag={look}>
            <span className="pvp-outline text-xl">◀</span>
          </HoldButton>
          {freeCam && (
            <>
              <HoldButton label="Вверх" style={corner(64, 188, 58)} onPress={() => input()?.touchButton("jump", true)} onRelease={() => input()?.touchButton("jump", false)}>
                <Chevron />
              </HoldButton>
              <HoldButton label="Вниз" style={corner(150, 160, 58)} onPress={() => input()?.touchButton("down", true)} onRelease={() => input()?.touchButton("down", false)}>
                <Chevron down />
              </HoldButton>
            </>
          )}
        </>
      )}

      {/* A tap while the wheel stays open picks a sector, or closes it anywhere else. */}
      {ui.emoteWheel?.sticky && (
        <div
          className="absolute inset-0 z-30"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            input()?.wheelTap(e.clientX - r.left, e.clientY - r.top);
          }}
        />
      )}
    </div>
  );
}
