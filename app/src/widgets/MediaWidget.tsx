// Lecture en cours : carte (accueil, barre latérale) et mini-lecteur flottant, déplaçable et redimensionnable.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Brave } from "../browser/adapter";
import type { Cutout } from "../browser/useBrowser";
import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { openMenu, type MenuEntry } from "../components/ContextMenu";
import { appName, clock, control, isSpotify, useMedia } from "./media";
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
          <span>Lancez Spotify ou une vidéo : elle s'affichera ici.</span>
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
export type PlayerDock = "free" | "rail" | "top" | "bottom" | "right";
export const dockLabels: Record<PlayerDock, string> = {
  free: "Libre, où je veux", rail: "Dans la barre latérale", top: "En haut", bottom: "En bas", right: "À droite",
};
const dockIcons = { free: "layers", rail: "sidebar", top: "collapse", bottom: "collapse", right: "split" } as const;

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

/** Lecteur en bordure de la fenêtre (haut, bas, droite), flottant comme la barre latérale : les pages lui font place. */
export function DockedPlayer({ dock, setDock, onHide }: DockProps & { dock: "top" | "bottom" | "right" }) {
  return (
    <div className={`media-dock media-dock--${dock} glass`} data-media-dock={dock}
      onContextMenu={(e) => { e.preventDefault(); openMenu(e, playerMenu(dock, setDock, onHide)); }}>
      <Player compact />
    </div>
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
export function FloatingPlayer({ onRect, onHide, setDock }: DockProps & { onRect: (r: Cutout | null) => void }) {
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
    <div ref={el} className={`media-float glass media-float--${layout}`}
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
