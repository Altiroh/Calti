// Lecture en cours : carte (accueil, barre latérale) et mini-lecteur flottant, déplaçable et redimensionnable.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Brave } from "../browser/adapter";
import type { Cutout } from "../browser/useBrowser";
import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { openMenu, type MenuEntry } from "../components/ContextMenu";
import { appName, clock, control, isSpotify, useMedia } from "./media";
import { SpotifyPlus } from "../components/BrandIcons";
import "./MediaWidget.css";

const PlayIcon = ({ playing, size = 18 }: { playing: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l11-6.5z" />}
  </svg>
);
const SkipIcon = ({ next, size = 16 }: { next: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={next ? undefined : { transform: "scaleX(-1)" }}>
    <path d="M6 5.5v13l9-6.5zM16 5.5h2.5v13H16z" />
  </svg>
);

/** Lecteur : pochette, titre, artiste, progression, commandes. */
function Player({ brave, compact = false }: { brave?: Brave; compact?: boolean }) {
  const { media, position } = useMedia();
  if (!media) {
    return (
      <div className="media media--empty">
        <span className="media__cover media__cover--empty"><Icon name="sound" size={22} /></span>
        <span className="media__text">
          <strong>Rien en lecture</strong>
        </span>
        {brave && !compact && (
          <button className="chip-btn" onClick={() => brave.send({ type: "openUrl", url: "https://open.spotify.com/", where: "new" })}>Ouvrir Spotify</button>
        )}
      </div>
    );
  }
  const progress = media.duration > 0 ? Math.min(1, position / media.duration) : 0;
  return (
    <div className={`media${media.playing ? " media--playing" : ""}${isSpotify(media) ? " media--spotify" : ""}`}
      style={media.cover ? ({ "--cover": `url("${media.cover}")` } as CSSProperties) : undefined}>
      <span className="media__backdrop" aria-hidden="true" />
      <span className="media__cover">
        {media.cover ? <img src={media.cover} alt="" draggable={false} /> : <Icon name="sound" size={22} />}
      </span>
      <span className="media__text">
        <strong title={media.title}>{media.title || "Sans titre"}</strong>
        <span title={media.artist}>{media.artist || media.album || " "}</span>
        <small className="media__app">{isSpotify(media) && <span className="media__spotify" />}{appName(media.app)}</small>
      </span>
      <span className="media__controls">
        <button className="media__btn" aria-label="Précédent" title="Précédent" disabled={!media.canPrevious} onClick={() => control("previous")}><SkipIcon next={false} /></button>
        <button className="media__btn media__btn--play" aria-label={media.playing ? "Pause" : "Lecture"} title={media.playing ? "Pause" : "Lecture"}
          onClick={() => control("toggle")}><PlayIcon playing={media.playing} /></button>
        <button className="media__btn" aria-label="Suivant" title="Suivant" disabled={!media.canNext} onClick={() => control("next")}><SkipIcon next /></button>
      </span>
      {media.duration > 0 && (
        <span className="media__progress">
          <span className="media__time">{clock(position)}</span>
          <span className="media__bar"><span style={{ width: `${progress * 100}%` }} /></span>
          <span className="media__time">{clock(media.duration)}</span>
        </span>
      )}
    </div>
  );
}

/** Place du mini-lecteur : libre (où on veut), dans la barre latérale, ou en bordure de la fenêtre. */
export type PlayerDock = "free" | "rail" | "titlebar" | "top" | "bottom" | "right";
export const dockLabels: Record<PlayerDock, string> = {
  free: "Libre, où je veux", rail: "Dans la barre latérale", titlebar: "Barre du haut, discret",
  top: "Bord du haut", bottom: "Bord du bas", right: "Bord droit",
};
const dockIcons = { free: "layers", rail: "sidebar", titlebar: "window", top: "collapse", bottom: "collapse", right: "split" } as const;

/** Apparence du lecteur en bordure (réglages « Mini-lecteur » d'Apparence). */
export interface PlayerLook {
  style: "floating" | "attached" | "edge";
  surface: "glass" | "solid" | "none";
  edge: "color" | "glass" | "none";
  /** Couleur du bord renflé sombre ou claire : texte inversé. */
  tone?: "light" | "dark";
  align: "start" | "center" | "end";
  width: "s" | "m" | "l" | "full";
}

/** Entrées communes du clic droit : position, masquer. */
function playerMenu(dock: PlayerDock, setDock: (d: PlayerDock) => void, onHide: () => void, extra: MenuEntry[] = []): MenuEntry[] {
  return [
    { header: "Mini-lecteur" },
    ...extra,
    { label: "Position", icon: "layout", tone: "blue", value: dockLabels[dock].split(",")[0],
      items: (Object.keys(dockLabels) as PlayerDock[]).map((d) => ({ label: dockLabels[d], icon: dockIcons[d], tone: "slate" as const, checked: d === dock, action: () => setDock(d) })) },
    "-",
    { label: "Masquer le mini-lecteur", icon: "eye", danger: true, action: onHide },
  ];
}

interface DockProps {
  setDock: (d: PlayerDock) => void;
  onHide: () => void;
}

/** Largeur (haut, bas) ou largeur de colonne (droite) du lecteur en bordure, selon sa taille. */
const DOCK_WIDTH = { s: 420, m: 640, l: 920 } as const;
const SIDE_WIDTH = { s: 170, m: 210, l: 260, full: 260 } as const;

/** Zone des pages web (tous les volets visibles) : le lecteur par-dessus la page s'y place. */
function pagesArea(): DOMRect | null {
  const rects = [...document.querySelectorAll<HTMLElement>(".pane__content")]
    .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left)), top = Math.min(...rects.map((r) => r.top));
  return new DOMRect(left, top, Math.max(...rects.map((r) => r.right)) - left, Math.max(...rects.map((r) => r.bottom)) - top);
}

/**
 * Lecteur en bordure de la fenêtre (haut, bas, droite), avec les styles de la barre latérale : flottant, collé au
 * bord, ou bord renflé (liseré le long du bord, renflé là où est le lecteur). Les pages lui font place.
 */
/** Congés du bord renflé (voir MediaWidget.css) : coin du quart de cercle retiré, selon le bord et le côté. */
const FILLETS = {
  bottom: ["tl", "tr"], top: ["bl", "br"], right: ["tl", "bl"],
} as const;

export function DockedPlayer({ dock, look, setDock, onHide, overlay, onOverlay, onRects }: DockProps & {
  dock: "top" | "bottom" | "right";
  look: PlayerLook;
  /** Par-dessus la page : placé sur la zone des pages, qui est découpée à sa place (`onRects`). Le bord renflé y
   * court le long du bord de la page (liseré), le lecteur collé à lui. */
  overlay?: boolean;
  onOverlay?: (overlay: boolean) => void;
  onRects?: (r: Cutout[]) => void;
}) {
  const edge = look.style === "edge";
  const el = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const [line, setLine] = useState<CSSProperties | null>(null);

  // Par-dessus la page : position calculée sur la zone des pages, recalculée quand elle bouge.
  useLayoutEffect(() => {
    if (!overlay) { setPlace(null); return; }
    const gap = look.style === "floating" ? 12 : 0;
    const keepLine = (next: CSSProperties | null) => setLine((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    // Même place : rien ne change (ni rendu, ni découpe de la page).
    const keep = (next: CSSProperties) => setPlace((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    const update = () => {
      const area = pagesArea();
      if (!area) return setPlace(null);
      // Liseré du bord renflé : le long du bord de la page.
      const thick = 6;
      keepLine(!edge ? null
        : dock === "bottom" ? { left: area.left, top: area.bottom - thick, width: area.width, height: thick }
        : dock === "top" ? { left: area.left, top: area.top, width: area.width, height: thick }
        : { left: area.right - thick, top: area.top, width: thick, height: area.height });
      const own = el.current?.getBoundingClientRect();
      const along = (size: number, start: number, length: number) =>
        look.align === "start" ? start + gap : look.align === "end" ? start + length - gap - size : start + (length - size) / 2;
      if (dock === "right") {
        const width = Math.min(SIDE_WIDTH[look.width], area.width - 2 * gap);
        const full = look.width === "full";
        const height = full ? area.height - 2 * gap : Math.min(own?.height ?? 0, area.height - 2 * gap);
        keep({ left: area.right - gap - width, top: full ? area.top + gap : along(height, area.top, area.height), width, ...(full ? { height } : {}) });
      } else {
        const width = look.width === "full" ? area.width - 2 * gap : Math.min(DOCK_WIDTH[look.width], area.width - 2 * gap);
        const height = 64;
        keep({ left: along(width, area.left, area.width), top: dock === "top" ? area.top + gap : area.bottom - gap - height, width, height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    document.querySelectorAll(".pane__content").forEach((p) => observer.observe(p));
    if (el.current) observer.observe(el.current);
    window.addEventListener("resize", update);
    const timer = window.setInterval(update, 1000);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); clearInterval(timer); };
  }, [overlay, dock, look.style, look.width, look.align, edge]);

  // Découpe de la page native à la place du lecteur : vérifiée à chaque rendu (un arrondi ou une taille qui change
  // sans déplacer le lecteur), transmise seulement quand elle change.
  const sent = useRef("");
  useLayoutEffect(() => {
    const cuts: Cutout[] = [];
    if (overlay && place && el.current) {
      const r = el.current.getBoundingClientRect();
      const css = getComputedStyle(el.current);
      if (edge) {
        // Collé au bord : coins droits côté bord, arrondis côté page ; plus le liseré et les deux congés.
        const radius = parseFloat(dock === "top" ? css.borderBottomLeftRadius : css.borderTopLeftRadius) || 0;
        cuts.push({ x: r.left, y: r.top, width: r.width, height: r.height, radius, square: dock === "right" ? "right" : dock });
        if (look.edge !== "none" && line) {
          cuts.push({ x: Number(line.left), y: Number(line.top), width: Number(line.width), height: Number(line.height), radius: 0 });
          const c = parseFloat(getComputedStyle(el.current, "::before").width) || 0;
          const l = parseFloat(css.getPropertyValue("--edge-line")) || 6;
          const [a, b] = FILLETS[dock];
          if (c > 0) {
            if (dock === "bottom") {
              cuts.push({ x: r.left - c, y: r.bottom - l - c, width: c, height: c, fillet: a }, { x: r.right, y: r.bottom - l - c, width: c, height: c, fillet: b });
            } else if (dock === "top") {
              cuts.push({ x: r.left - c, y: r.top + l, width: c, height: c, fillet: a }, { x: r.right, y: r.top + l, width: c, height: c, fillet: b });
            } else {
              cuts.push({ x: r.right - l - c, y: r.top - c, width: c, height: c, fillet: a }, { x: r.right - l - c, y: r.bottom, width: c, height: c, fillet: b });
            }
          }
        }
      } else {
        const radius = parseFloat(css.borderTopLeftRadius) || 0;
        cuts.push({ x: r.left - 1, y: r.top - 1, width: r.width + 2, height: r.height + 2, radius: radius + 1 });
      }
    }
    const key = JSON.stringify(cuts);
    if (key !== sent.current) { sent.current = key; onRects?.(cuts); }
  });
  useEffect(() => () => onRects?.([]), []); // eslint-disable-line react-hooks/exhaustive-deps

  const menu = playerMenu(dock, setDock, onHide, onOverlay ? [
    { label: "Par-dessus la page", icon: "layers", tone: "violet", checked: !!overlay, action: () => onOverlay(!overlay) },
    "-",
  ] : []);
  return (
    <>
      {edge && look.edge !== "none" && (!overlay || line) && <span className={`media-line media-line--${dock}${overlay ? " media-line--overlay" : ""}`}
        data-edge={look.edge} style={overlay ? line ?? undefined : undefined} aria-hidden="true" />}
      <div ref={el} className={`media-dock media-dock--${dock}${overlay ? " media-dock--overlay" : ""} glass`} data-media-dock={dock}
        style={overlay ? (place ?? { visibility: "hidden" }) : undefined}
        data-style={look.style} data-surface={edge ? undefined : look.surface} data-edge={edge ? look.edge : undefined}
        data-tone={edge && look.edge === "color" ? look.tone : undefined} data-align={look.align} data-width={look.width}
        onContextMenu={(e) => { e.preventDefault(); openMenu(e, menu); }}>
        <div className="media-dock__inner"><Player compact /></div>
      </div>
    </>
  );
}

/** Lecteur discret dans la barre du haut, à gauche des boutons de la fenêtre. */
export interface TitleLook {
  surface: PlayerLook["surface"];
  text: boolean;
  progress: boolean;
}

export function TitlebarPlayer({ setDock, onHide, look, onLook }: DockProps & { look: TitleLook; onLook: (patch: Partial<TitleLook>) => void }) {
  const { media, position } = useMedia();
  const menu = (e: { clientX: number; clientY: number; preventDefault: () => void }) => {
    e.preventDefault();
    openMenu(e, playerMenu("titlebar", setDock, onHide, [
      { label: "Fond", icon: "palette", tone: "pink", items: ([["glass", "Verre"], ["solid", "Plein"], ["none", "Aucun"]] as const).map(([v, label]) => ({
        label, checked: look.surface === v, action: () => onLook({ surface: v }),
      })) },
      { label: "Titre", icon: "text", tone: "slate", checked: look.text, action: () => onLook({ text: !look.text }) },
      { label: "Progression", icon: "minimize", tone: "green", checked: look.progress, action: () => onLook({ progress: !look.progress }) },
      "-",
    ]));
  };
  const attrs = { "data-media-dock": "titlebar", "data-surface": look.surface, "data-text": look.text || undefined, "data-progress": look.progress || undefined };
  if (!media) {
    return (
      <span className="media-title media-title--idle" {...attrs} onContextMenu={menu} title="Rien en lecture">
        <SpotifyPlus size={18} />
      </span>
    );
  }
  const progress = media.duration > 0 ? Math.min(1, position / media.duration) : 0;
  return (
    <span className={`media-title${media.playing ? " media-title--playing" : ""}${isSpotify(media) ? " media--spotify" : ""}`}
      {...attrs} onContextMenu={menu} title={`${media.title}${media.artist ? ` — ${media.artist}` : ""}`}
      style={{ "--progress": progress } as CSSProperties}>
      <span className="media-title__cover">
        {media.cover ? <img src={media.cover} alt="" draggable={false} /> : <SpotifyPlus size={16} plus={false} />}
      </span>
      {look.text && (
        <span className="media-title__text">
          <strong>{media.title || "Sans titre"}</strong>
          {media.artist && <span>{media.artist}</span>}
        </span>
      )}
      <button className="media-title__btn" aria-label={media.playing ? "Pause" : "Lecture"} onClick={() => control("toggle")}>
        <PlayIcon playing={media.playing} size={13} />
      </button>
      <button className="media-title__btn" aria-label="Suivant" disabled={!media.canNext} onClick={() => control("next")}>
        <SkipIcon next size={12} />
      </button>
    </span>
  );
}

/** Lecteur dans la barre latérale : pochette et commandes empilées (étroite) ou en ligne (large). */
export function RailPlayer({ wide, setDock, onHide }: DockProps & { wide: boolean }) {
  const { media } = useMedia();
  const menu = (e: { clientX: number; clientY: number; preventDefault: () => void }) => { e.preventDefault(); openMenu(e, playerMenu("rail", setDock, onHide)); };
  if (wide) {
    return <div className="media-rail media-rail--wide" data-media-dock="rail" onContextMenu={menu}><Player compact /></div>;
  }
  const title = media ? `${media.title}${media.artist ? ` — ${media.artist}` : ""}` : "Rien en lecture";
  return (
    <div className={`media-rail${media?.playing ? " media-rail--playing" : ""}${isSpotify(media) ? " media--spotify" : ""}`} data-media-dock="rail" onContextMenu={menu} title={title}>
      <button className="media-rail__cover" aria-label={media?.playing ? "Pause" : "Lecture"} onClick={() => control("toggle")} disabled={!media}>
        {media?.cover ? <img src={media.cover} alt="" draggable={false} /> : <Icon name="sound" size={17} />}
        {media && <span className="media-rail__state"><PlayIcon playing={media.playing} size={14} /></span>}
      </button>
      {media && (
        <span className="media-rail__skip">
          <button aria-label="Précédent" disabled={!media.canPrevious} onClick={() => control("previous")}><SkipIcon next={false} size={12} /></button>
          <button aria-label="Suivant" disabled={!media.canNext} onClick={() => control("next")}><SkipIcon next size={12} /></button>
        </span>
      )}
    </div>
  );
}

/** Carte de l'accueil et panneau de la barre latérale. */
export function MediaWidget({ brave }: { brave?: Brave }) {
  return (
    <Card title="Lecture en cours" className="media-card">
      <Player brave={brave} />
    </Card>
  );
}

interface Box { x: number; y: number; w: number; h: number }
const BOX_KEY = "calti.mediaFloat";
const MIN = { w: 220, h: 64 };
const MAX = { w: 560, h: 420 };

function loadBox(): Box {
  try {
    const b = JSON.parse(localStorage.getItem(BOX_KEY) ?? "null") as Box | null;
    if (b && [b.x, b.y, b.w, b.h].every(Number.isFinite)) return b;
  } catch { /* défaut */ }
  return { x: window.innerWidth - 360, y: window.innerHeight - 130, w: 320, h: 96 };
}

/** Garde le lecteur entièrement dans la fenêtre. */
function clampBox(b: Box): Box {
  const w = Math.min(Math.max(b.w, MIN.w), MAX.w, window.innerWidth - 16);
  const h = Math.min(Math.max(b.h, MIN.h), MAX.h, window.innerHeight - 16);
  return { w, h, x: Math.min(Math.max(b.x, 8), window.innerWidth - w - 8), y: Math.min(Math.max(b.y, 8), window.innerHeight - h - 8) };
}

/** Mini-lecteur posé au-dessus des pages : glisser pour le déplacer, coin pour le redimensionner. */
export function FloatingPlayer({ onRect, onHide, setDock, surface }: DockProps & { onRect: (r: Cutout | null) => void; surface: PlayerLook["surface"] }) {
  const [box, setBox] = useState<Box>(() => clampBox(loadBox()));
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "move" | "resize"; x0: number; y0: number; start: Box } | null>(null);

  useEffect(() => {
    const onResize = () => setBox((b) => clampBox(b));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useLayoutEffect(() => {
    const radius = el.current ? parseFloat(getComputedStyle(el.current).borderTopLeftRadius) || 18 : 18;
    onRect({ x: box.x - 1, y: box.y - 1, width: box.w + 2, height: box.h + 2, radius: radius + 1 });
  }, [box]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onRect(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (mode: "move" | "resize") => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (mode === "move" && (e.target as Element).closest("button"))) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, x0: e.clientX, y0: e.clientY, start: box };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    setBox(clampBox(d.mode === "move" ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy } : { ...d.start, w: d.start.w + dx, h: d.start.h + dy }));
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    setBox((b) => {
      try { localStorage.setItem(BOX_KEY, JSON.stringify(b)); } catch { /* non persisté */ }
      return b;
    });
  };
  const size = (w: number, h: number) => {
    const next = clampBox({ ...box, w, h });
    setBox(next);
    try { localStorage.setItem(BOX_KEY, JSON.stringify(next)); } catch { /* non persisté */ }
  };

  const layout = box.h < 120 ? "bar" : box.w < 300 ? "tall" : "wide";
  return (
    <div ref={el} className={`media-float glass media-float--${layout}`} data-surface={surface}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      onPointerDown={start("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e, playerMenu("free", setDock, onHide, [
          { label: "Barre", icon: "minimize", tone: "slate", checked: layout === "bar", action: () => size(320, 96) },
          { label: "Carte", icon: "layout", tone: "blue", checked: layout === "wide", action: () => size(380, 210) },
          { label: "Pochette", icon: "image", tone: "violet", checked: layout === "tall", action: () => size(240, 330) },
          "-",
        ]));
      }}>
      <Player compact />
      <span className="media-float__grip" onPointerDown={start("resize")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        aria-label="Redimensionner" title="Redimensionner" />
    </div>
  );
}
