import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { textVars } from "../components/RichText";
import type { Block, ClockStyle } from "../settings/layout";
import { hasSurface } from "./TextWidget";
import { useNow } from "./useNow";
import "./ClockWidget.css";

const pad = (n: number) => String(n).padStart(2, "0");
const wrap = (n: number, m: number) => ((n % m) + m) % m;

interface Unit { value: number; mod: number; label: string }

export function ClockWidget({ block }: { block: Block }) {
  const style = block.style ?? {};
  const kind: ClockStyle = style.clockStyle ?? "classic";
  const seconds = style.showSeconds ?? kind === "labels";
  // Sans secondes, un rafraîchissement toutes les 15 s suffit.
  const now = useNow(seconds ? 1000 : 15000);
  const units: Unit[] = [
    { value: now.getHours(), mod: 24, label: "Heures" },
    { value: now.getMinutes(), mod: 60, label: "Minutes" },
  ];
  if (seconds) units.push({ value: now.getSeconds(), mod: 60, label: "Secondes" });
  const time = units.map((u) => pad(u.value)).join(":");
  const date = style.showDate !== false
    ? now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : null;
  const align = style.align ?? "right";
  const classes = [
    "clock-block", `clock-block--${align}`, `clock-block--${kind}`, `text-block--v-${style.vAlign ?? "bottom"}`,
    seconds ? "clock-block--sec" : "", hasSurface(block) ? "glass" : "",
  ];

  return (
    <section className={classes.filter(Boolean).join(" ")} style={textVars(style)}>
      {kind === "orbit" ? <Orbit hour={now.getHours()} time={time} caption={date} /> : (
        <>
          {kind === "labels" ? <Labels units={units} />
            : kind === "flip" ? <Flip units={units} />
            : kind === "capsule" ? <Capsule units={units} />
            : <Digits time={time} kind={kind} />}
          {date && <div className="clock-block__date">{date}</div>}
        </>
      )}
    </section>
  );
}

/** Valeur courante et précédente : de quoi animer le passage de l'une à l'autre. */
function useChange<T>(value: T): [T, T | undefined] {
  const [pair, setPair] = useState<[T, T | undefined]>([value, undefined]);
  if (pair[0] !== value) {
    const next: [T, T | undefined] = [value, pair[0]];
    setPair(next);
    return next;
  }
  return pair;
}

/** Classique, hologramme, néon et matrice : chiffres simples, chacun animé seulement quand il change. */
function Digits({ time, kind }: { time: string; kind: ClockStyle }) {
  return (
    <div className="clock-block__face">
      {kind === "matrix" && <MatrixRain />}
      {kind === "hologram" && <span className="ck-holo__base" />}
      <div className="clock-block__time">
        {[...time].map((c, i) => <span key={`${i}-${c}`} className="clock-block__digit">{c}</span>)}
      </div>
    </div>
  );
}

/* --- Compte à rebours : chiffres roulants et légendes ------------------------ */

function Roll({ c }: { c: string }) {
  const [cur, prev] = useChange(c);
  return (
    <span className="ck-roll">
      {prev === undefined ? <span>{cur}</span> : (
        <span key={cur} className="ck-roll__track"><span>{prev}</span><span>{cur}</span></span>
      )}
    </span>
  );
}

function Labels({ units }: { units: Unit[] }) {
  return (
    <div className="ck-labels">
      {units.map((u, i) => (
        <Fragment key={u.label}>
          {i > 0 && <span className="ck-labels__sep">:</span>}
          <div className="ck-labels__unit">
            <div className="ck-labels__digits">{[...pad(u.value)].map((c, j) => <Roll key={j} c={c} />)}</div>
            <span className="ck-labels__cap">{u.label}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/* --- Volets : la moitié haute bascule sur la charnière ----------------------- */

function Flap({ c }: { c: string }) {
  const [cur, prev = cur] = useChange(c);
  return (
    <span className="ck-flap">
      <span className="ck-flap__half ck-flap__top"><span>{cur}</span></span>
      <span className="ck-flap__half ck-flap__bottom"><span>{prev}</span></span>
      {prev !== cur && (
        <Fragment key={cur}>
          <span className="ck-flap__half ck-flap__top ck-flap__fold-top"><span>{prev}</span></span>
          <span className="ck-flap__half ck-flap__bottom ck-flap__fold-bottom"><span>{cur}</span></span>
        </Fragment>
      )}
    </span>
  );
}

function Flip({ units }: { units: Unit[] }) {
  return (
    <div className="ck-flip">
      {units.map((u, i) => (
        <Fragment key={u.label}>
          {i > 0 && <span className="ck-flip__sep">:</span>}
          <span className="ck-flip__pair">{[...pad(u.value)].map((c, j) => <Flap key={j} c={c} />)}</span>
        </Fragment>
      ))}
    </div>
  );
}

/* --- Tambour : valeurs voisines visibles au-dessus et au-dessous ------------- */

function Drum({ value, mod }: { value: number; mod: number }) {
  const [cur, prev] = useChange(value);
  return (
    <span className="ck-drum">
      <span key={cur} className={`ck-drum__track${prev === undefined ? "" : " ck-drum__track--turn"}`}>
        {[-2, -1, 0, 1].map((d) => (
          <span key={d} className={d === 0 ? "is-current" : undefined}>{pad(wrap(cur + d, mod))}</span>
        ))}
      </span>
    </span>
  );
}

function Capsule({ units }: { units: Unit[] }) {
  return (
    <div className="ck-capsule">
      {units.map((u, i) => (
        <Fragment key={u.label}>
          {i > 0 && <span className="ck-capsule__sep">:</span>}
          <Drum value={u.value} mod={u.mod} />
        </Fragment>
      ))}
    </div>
  );
}

/* --- Orbite : les heures sur un grand cercle qui tourne ---------------------- */

function Orbit({ hour, time, caption }: { hour: number; time: string; caption: string | null }) {
  // Tours complets cumulés : 23 h → 0 h continue de tourner dans le même sens.
  const [turn, setTurn] = useState({ hour, laps: 0 });
  let t = turn;
  if (t.hour !== hour) {
    t = { hour, laps: t.laps + (hour < t.hour ? 1 : 0) };
    setTurn(t);
  }
  return (
    <div className="ck-orbit">
      <div className="ck-orbit__wheel" style={{ transform: `rotate(${-(t.laps * 24 + hour) * 15}deg)` }}>
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="ck-orbit__n" data-d={Math.min(wrap(h - hour, 24), wrap(hour - h, 24), 4)}
            style={{ "--a": `${h * 15}deg` } as CSSProperties}>
            <span>{pad(h)}</span>
          </span>
        ))}
      </div>
      <div className="ck-orbit__info">
        <div className="ck-orbit__time">{time}</div>
        <div className="ck-orbit__cap">{caption ?? "Heure locale"}</div>
      </div>
    </div>
  );
}

/* --- Matrice : pluie de caractères, ~15 images/s, à l'arrêt hors de vue ------ */

const GLYPHS = "01アイウエオカキクケコサシスセソタチツテト0123456789";
const CELL = 14;

function MatrixRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let drops: number[] = [];
    let raf = 0;
    let last = 0;
    let inView = true;
    let color = "";

    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      drops = Array.from({ length: Math.ceil(canvas.width / CELL) }, () => Math.random() * -canvas.height / CELL);
      ctx.font = `${CELL}px "Cascadia Mono", Consolas, monospace`;
      color = getComputedStyle(canvas).color;
    };
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 66 || canvas.closest(".no-motion")) return;
      last = t;
      // Estompe l'image précédente sans peindre de fond : le bloc reste transparent.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = color;
      drops.forEach((y, i) => {
        ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], i * CELL, y * CELL);
        drops[i] = y * CELL > canvas.height && Math.random() > 0.96 ? 0 : y + 1;
      });
    };
    const update = () => {
      cancelAnimationFrame(raf);
      raf = inView && !document.hidden ? requestAnimationFrame(frame) : 0;
    };

    resize();
    const sizes = new ResizeObserver(resize);
    sizes.observe(canvas);
    const seen = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); });
    seen.observe(canvas);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      cancelAnimationFrame(raf);
      sizes.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return <canvas ref={ref} className="ck-matrix__rain" aria-hidden />;
}
