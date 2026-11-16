// Téléchargements : à chaque nouveau fichier, une pastille sort du bouton cliqué dans la page et file jusqu'à l'icône
// Téléchargements (barre du haut si elle y est, sinon barre latérale, sinon pas d'animation). La page web est une vue
// native qui passe devant l'interface : la pastille fait le premier trajet dans la page (jusqu'à son bord, du côté de
// l'icône), puis l'interface reprend au même point jusqu'à l'icône, qui rebondit. Un anneau montre la progression,
// une coche la fin. Rien ne bouge si les animations sont coupées (réglage ou système).
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { BrowserTab } from "../browser/useBrowser";
import { Icon } from "./Icon";
import { useDownloads } from "./DownloadsDrawer";
import "./downloadAnimation.css";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Trajet dans la page, puis dans l'interface (ms). */
const IN_PAGE = 560;
const IN_UI = 340;
const arrowSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 19h14"/></svg>`;

const reduced = () =>
  !!document.querySelector(".shell.no-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Point = { x: number; y: number };

/** Points d'une courbe (départ, appui, arrivée) pour une animation. */
function curve(start: Point, control: Point, end: Point, steps: number, scale: (t: number) => number) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const x = (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x;
    const y = (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y;
    return { transform: `translate(${(x - 14).toFixed(1)}px, ${(y - 14).toFixed(1)}px) scale(${scale(t).toFixed(3)})` };
  });
}

/** Pastille dans l'interface, de `start` à l'icône, puis rebond de l'icône. */
function flyTo(button: HTMLElement, start: Point, duration: number, lift: number) {
  const b = button.getBoundingClientRect();
  const end = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  const control = { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - lift };
  const dot = document.createElement("div");
  dot.className = "dl-flight";
  dot.innerHTML = arrowSvg;
  document.body.append(dot);
  const frames = curve(start, control, end, 10, (t) => 1 - t * 0.4);
  dot.animate(frames, { duration, easing: "cubic-bezier(0.3, 0, 0.3, 1)", fill: "forwards" }).finished
    .catch(() => {})
    .finally(() => {
      dot.remove();
      button.animate([{ transform: "scale(1)" }, { transform: "scale(1.22)" }, { transform: "scale(0.94)" }, { transform: "scale(1)" }],
        { duration: 420, easing: EASE });
    });
}

/**
 * Script lancé dans la page : la pastille sort du dernier endroit cliqué (moins de 8 s, noté par native::LINK_SCRIPT ;
 * sinon le centre) et file jusqu'au point de sortie, au bord de la page. Construit sans HTML ni style en ligne
 * (Trusted Types, CSP des sites), dans une racine fermée, sans toucher aux clics.
 */
function pageScript(exit: Point, duration: number): string {
  return `(() => {
  const p = window.__caltiPointer, fresh = p && Date.now() - p.t < 8000;
  const s = { x: fresh ? p.x : innerWidth / 2, y: fresh ? p.y : innerHeight / 2 }, e = { x: ${exit.x.toFixed(1)}, y: ${exit.y.toFixed(1)} };
  const c = { x: (s.x + e.x) / 2, y: Math.min(s.y, e.y) - 70 };
  const host = document.createElement("calti-download");
  const hs = host.style;
  hs.setProperty("position", "fixed"); hs.setProperty("inset", "0"); hs.setProperty("pointer-events", "none"); hs.setProperty("z-index", "2147483647");
  const dot = document.createElement("div");
  const ds = dot.style;
  for (const [k, v] of [["position", "absolute"], ["left", "0"], ["top", "0"], ["width", "28px"], ["height", "28px"], ["border-radius", "50%"],
    ["display", "grid"], ["place-items", "center"], ["color", "#fff"], ["background", "linear-gradient(135deg, #34d399, #0f9d58)"],
    ["box-shadow", "0 6px 18px rgba(15, 157, 88, 0.45)"]]) ds.setProperty(k, v);
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
  for (const [k, v] of [["viewBox", "0 0 24 24"], ["width", "16"], ["height", "16"], ["fill", "none"], ["stroke", "currentColor"],
    ["stroke-width", "2"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"]]) svg.setAttribute(k, v);
  path.setAttribute("d", "M12 4v11M7 10l5 5 5-5M5 19h14");
  svg.append(path); dot.append(svg);
  host.attachShadow({ mode: "closed" }).append(dot);
  document.documentElement.append(host);
  const frames = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, x = (1 - t) ** 2 * s.x + 2 * (1 - t) * t * c.x + t ** 2 * e.x, y = (1 - t) ** 2 * s.y + 2 * (1 - t) * t * c.y + t ** 2 * e.y;
    const k = t < 0.18 ? 0.4 + t * 4.2 : 1.16 - (t - 0.18) * 0.2;
    frames.push({ transform: "translate(" + (x - 14) + "px, " + (y - 14) + "px) scale(" + k + ")" });
  }
  dot.animate(frames, { duration: ${duration}, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" }).finished
    .catch(() => {}).finally(() => host.remove());
})()`;
}

/** Icône Téléchargements visée : barre du haut si elle y est, sinon barre latérale, sinon aucune. */
function targetButton(): HTMLElement | null {
  const glyph = document.querySelector('[data-dl-target="bar"]') ?? document.querySelector('[data-dl-target="rail"]');
  return glyph?.closest<HTMLElement>(".bar-downloads, .rail-btn") ?? null;
}

/**
 * Animation de chaque téléchargement lancé depuis une page de cette fenêtre. `onUntargeted` : aucune icône
 * Téléchargements affichée (pas d'animation ; l'appelant peut le signaler autrement).
 */
export function useDownloadFlight(tabs: BrowserTab[], onUntargeted: () => void) {
  const latest = useRef({ tabs, onUntargeted });
  latest.current = { tabs, onUntargeted };
  useEffect(() => {
    const unlisten = listen<number>("browser:download-started", (e) => {
      const button = targetButton();
      if (!button) return latest.current.onUntargeted();
      if (reduced()) return;
      const toBar = button.classList.contains("bar-downloads");
      const tab = latest.current.tabs.find((t) => t.id === e.payload);
      const slot = tab && document.querySelector<HTMLElement>(`.pane__content[data-profile="${tab.profile}"]`);
      const page = slot?.getBoundingClientRect();
      if (!tab || !page || page.width < 40 || page.height < 40) {
        // Page introuvable (onglet en arrière-plan) : la pastille part de la barre d'adresse.
        const from = document.querySelector<HTMLElement>(".pane__address")?.getBoundingClientRect();
        if (from) flyTo(button, { x: from.left + 22, y: from.top + from.height / 2 }, 700, 40);
        return;
      }
      // Sortie de la page du côté de l'icône : en haut sous la barre, ou à gauche face à la barre latérale.
      const b = button.getBoundingClientRect();
      const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
      const exit = toBar
        ? { x: clamp(b.left + b.width / 2, page.left + 16, page.right - 16), y: page.top }
        : { x: page.left, y: clamp(b.top + b.height / 2, page.top + 16, page.bottom - 16) };
      const zoom = tab.zoom || 1;
      invoke("browser_eval", { id: tab.id, script: pageScript({ x: (exit.x - page.left) / zoom, y: (exit.y - page.top) / zoom }, IN_PAGE) })
        .catch(() => {});
      window.setTimeout(() => flyTo(button, exit, IN_UI, toBar ? 10 : 24), IN_PAGE);
    });
    return () => { unlisten.then((u) => u()); };
  }, []);
}

/**
 * Icône Téléchargements (barre du haut ou barre latérale, `target`) : anneau de progression pendant un
 * téléchargement, coche à la fin.
 */
export function DownloadGlyph({ target }: { target: "bar" | "rail" }) {
  const list = useDownloads();
  const [done, setDone] = useState(false);
  const active = list.filter((d) => d.state === "progress");
  const known = active.filter((d) => d.total > 0);
  const progress = known.length ? known.reduce((s, d) => s + d.received, 0) / known.reduce((s, d) => s + d.total, 0) : null;
  const wasActive = useRef(false);

  useEffect(() => {
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
    <span data-dl-target={target} className={`dl-glyph dl-glyph--${target}${active.length ? " dl-glyph--active" : ""}${done ? " dl-glyph--done" : ""}`}>
      <Icon name="download" size={target === "bar" ? 16 : 19} />
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
