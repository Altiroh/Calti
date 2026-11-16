// Téléchargements dans la barre latérale : à chaque nouveau fichier, une pastille part de la barre d'adresse et file
// en arc dans le bouton Téléchargements, qui rebondit ; un anneau montre la progression, une coche la fin. Tout passe
// par l'interface (barre d'adresse, barre latérale), que les pages ne recouvrent pas. Pas de mouvement si les
// animations sont coupées (réglage ou système).
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useDownloads } from "./DownloadsDrawer";
import "./downloadAnimation.css";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const arrowSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 19h14"/></svg>`;

const reduced = () =>
  !!document.querySelector(".shell.no-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Pastille de la barre d'adresse jusqu'au bouton (arc), puis rebond du bouton. */
function fly(button: HTMLElement) {
  const from = document.querySelector<HTMLElement>(".pane__address");
  if (!from || reduced()) return;
  const a = from.getBoundingClientRect();
  const b = button.getBoundingClientRect();
  const start = { x: a.left + 22, y: a.top + a.height / 2 };
  const end = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  // Arc : vers la gauche d'abord (au-dessus de la barre latérale), puis vers le bas jusqu'au bouton.
  const control = { x: end.x, y: start.y };
  const dot = document.createElement("div");
  dot.className = "dl-flight";
  dot.innerHTML = arrowSvg;
  document.body.append(dot);
  const steps = 14;
  const frames = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const x = (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x;
    const y = (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y;
    const scale = t < 0.15 ? 0.4 + t * 4 : 1 - t * 0.45;
    return { transform: `translate(${x - 14}px, ${y - 14}px) scale(${scale.toFixed(3)})`, opacity: t > 0.92 ? 0.3 : 1 };
  });
  dot.animate(frames, { duration: 760, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" }).finished
    .catch(() => {})
    .finally(() => {
      dot.remove();
      button.animate([{ transform: "scale(1)" }, { transform: "scale(1.22)" }, { transform: "scale(0.94)" }, { transform: "scale(1)" }],
        { duration: 420, easing: EASE });
    });
}

/**
 * Icône du bouton Téléchargements de la barre latérale : anneau de progression pendant un téléchargement, coche
 * à la fin ; lance la pastille pour chaque nouveau fichier (dans la fenêtre active seulement).
 */
export function DownloadGlyph() {
  const list = useDownloads();
  const seen = useRef(new Set<number>());
  const ring = useRef<HTMLSpanElement>(null);
  const [done, setDone] = useState(false);
  const active = list.filter((d) => d.state === "progress");
  const known = active.filter((d) => d.total > 0);
  const progress = known.length ? known.reduce((s, d) => s + d.received, 0) / known.reduce((s, d) => s + d.total, 0) : null;
  const wasActive = useRef(false);

  useEffect(() => {
    for (const d of list) {
      if (seen.current.has(d.id)) continue;
      seen.current.add(d.id);
      // Seulement un téléchargement qui commence (pas ceux déjà listés au lancement).
      const button = ring.current?.closest<HTMLElement>(".rail-btn");
      if (button && Date.now() - d.started < 15_000 && document.hasFocus()) fly(button);
    }
    // Plus rien en cours et un fichier fini : coche, puis retour à l'icône.
    if (wasActive.current && !active.length && list.some((d) => d.state === "done")) {
      setDone(true);
      const timer = window.setTimeout(() => setDone(false), 1800);
      wasActive.current = false;
      return () => clearTimeout(timer);
    }
    wasActive.current = active.length > 0;
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  const circumference = 2 * Math.PI * 16;
  return (
    <span ref={ring} className={`dl-glyph${active.length ? " dl-glyph--active" : ""}${done ? " dl-glyph--done" : ""}`}>
      <Icon name="download" size={19} />
      {active.length > 0 && (
        <svg className={`dl-glyph__ring${progress == null ? " dl-glyph__ring--spin" : ""}`} viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="16" />
          <circle className="dl-glyph__value" cx="18" cy="18" r="16"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - (progress ?? 0.25))} />
        </svg>
      )}
      {done && <span className="dl-glyph__check"><Icon name="check" size={10} /></span>}
    </span>
  );
}
