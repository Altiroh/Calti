// Règle et grille (outil de développement, comme l'extension Grid Ruler) : règles, repères déplaçables,
// coordonnées du pointeur et grille de colonnes, dessinés dans la page affichée.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Browser } from "../browser/useBrowser";

export interface RulerSettings {
  enabled: boolean;
  rulers: boolean;
  grid: boolean;
  columns: number;
  gutter: number;
  /** Largeur maximale du contenu (0 = toute la largeur), centré. */
  maxWidth: number;
  margin: number;
  color: string;
  opacity: number;
}

export const defaultRuler: RulerSettings = {
  enabled: false, rulers: true, grid: true, columns: 12, gutter: 24, maxWidth: 1200, margin: 16, color: "#ff3d7f", opacity: 0.12,
};

const KEY = "calti.ruler";
const CHANGED = "calti:ruler";

function read(): RulerSettings {
  try { return { ...defaultRuler, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return defaultRuler; }
}

let cache = read();
const subscribe = (notify: () => void) => {
  const onChange = () => { cache = read(); notify(); };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
};

/** Réglages de l'outil, partagés par les fenêtres. */
export function useRulerSettings(): [RulerSettings, (patch: Partial<RulerSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, () => cache);
  const update = (patch: Partial<RulerSettings>) => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch { /* non persisté */ }
    window.dispatchEvent(new Event(CHANGED));
  };
  return [settings, update];
}

/** Script injecté : idempotent (il remplace l'outil déjà présent), sans dépendance, isolé dans un shadow DOM. */
export function rulerScript(s: RulerSettings | null): string {
  return `(() => {
  window.__caltiRuler?.destroy();
  const s = ${JSON.stringify(s)};
  if (!s) return;
  const STORE = "calti.ruler.guides";
  const R = s.rulers ? 18 : 0;
  const host = document.createElement("calti-ruler");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "open" });
  // Pas de innerHTML : refusé par les sites qui imposent les Trusted Types (Google, YouTube…).
  const style = document.createElement("style");
  style.textContent = \`
    :host { all: initial; }
    .grid { position: absolute; inset: 0 0 0 0; display: flex; justify-content: center; }
    .cols { display: grid; height: 100%; width: 100%; box-sizing: border-box; }
    .col { background: \${s.color}; opacity: \${s.opacity}; }
    .ruler { position: absolute; background: rgba(250, 250, 252, 0.94); pointer-events: auto; box-shadow: 0 0 0 1px rgba(0,0,0,0.12); }
    .top { left: 0; right: 0; top: 0; height: \${R}px; cursor: row-resize; }
    .left { top: 0; bottom: 0; left: 0; width: \${R}px; cursor: col-resize; }
    canvas { position: absolute; inset: 0; }
    .corner { position: absolute; left: 0; top: 0; width: \${R}px; height: \${R}px; background: #fff; z-index: 2; }
    .guide { position: absolute; background: #00b3ff; pointer-events: auto; }
    .guide::after { content: ""; position: absolute; inset: -4px; }
    .guide.h { left: 0; right: 0; height: 1px; cursor: row-resize; }
    .guide.v { top: 0; bottom: 0; width: 1px; cursor: col-resize; }
    .tip { position: absolute; padding: 2px 6px; border-radius: 4px; font: 11px/1.4 ui-monospace, Consolas, monospace;
      color: #fff; background: rgba(20, 24, 33, 0.85); white-space: nowrap; pointer-events: none; }
  \`;
  root.appendChild(style);
  const el =(cls, parent = root) => { const e = document.createElement("div"); e.className = cls; parent.appendChild(e); return e; };

  if (s.grid) {
    const grid = el("grid");
    const cols = el("cols", grid);
    cols.style.maxWidth = s.maxWidth ? s.maxWidth + "px" : "none";
    cols.style.padding = "0 " + s.margin + "px";
    cols.style.gridTemplateColumns = "repeat(" + s.columns + ", 1fr)";
    cols.style.columnGap = s.gutter + "px";
    for (let i = 0; i < s.columns; i++) el("col", cols);
  }

  // Repères gardés par site le temps de la session (rechargements compris).
  let guides = [];
  try { guides = JSON.parse(sessionStorage.getItem(STORE) || "[]"); } catch {}
  const save = () => { try { sessionStorage.setItem(STORE, JSON.stringify(guides)); } catch {} };
  const layer = el("guides");
  const tip = el("tip"); tip.style.display = "none";
  const drawGuides = () => {
    layer.replaceChildren();
    guides.forEach((g, i) => {
      const line = el("guide " + g.axis, layer);
      if (g.axis === "h") line.style.top = g.pos + "px"; else line.style.left = g.pos + "px";
      line.title = g.pos + " px · double-clic : retirer";
      line.addEventListener("pointerdown", (e) => drag(e, i));
      line.addEventListener("dblclick", () => { guides.splice(i, 1); save(); drawGuides(); });
    });
  };
  const showTip = (x, y, text) => { tip.style.display = "block"; tip.textContent = text; tip.style.left = (x + 12) + "px"; tip.style.top = (y + 12) + "px"; };
  // Glisser un repère existant (index) ou en tirer un nouveau d'une règle (axe).
  const drag = (e, index, axis) => {
    e.preventDefault();
    if (index == null) { guides.push({ axis, pos: axis === "h" ? e.clientY : e.clientX }); index = guides.length - 1; drawGuides(); }
    const g = guides[index];
    const move = (ev) => {
      g.pos = Math.round(g.axis === "h" ? ev.clientY : ev.clientX);
      const line = layer.children[index];
      if (g.axis === "h") line.style.top = g.pos + "px"; else line.style.left = g.pos + "px";
      showTip(ev.clientX, ev.clientY, g.pos + " px");
    };
    const up = (ev) => {
      removeEventListener("pointermove", move, true); removeEventListener("pointerup", up, true);
      tip.style.display = "none";
      // Ramené sur sa règle : le repère est retiré.
      if ((g.axis === "h" ? ev.clientY : ev.clientX) < R) guides.splice(index, 1);
      save(); drawGuides();
    };
    addEventListener("pointermove", move, true); addEventListener("pointerup", up, true);
  };
  drawGuides();

  let readout = null;
  if (R) {
    const top = el("ruler top"), left = el("ruler left");
    el("corner");
    const tops = document.createElement("canvas"), lefts = document.createElement("canvas");
    top.appendChild(tops); left.appendChild(lefts);
    const draw = () => {
      const dpr = devicePixelRatio || 1;
      for (const [c, horizontal] of [[tops, true], [lefts, false]]) {
        const len = horizontal ? innerWidth : innerHeight;
        c.width = (horizontal ? len : R) * dpr; c.height = (horizontal ? R : len) * dpr;
        c.style.width = (horizontal ? len : R) + "px"; c.style.height = (horizontal ? R : len) + "px";
        const g = c.getContext("2d"); g.scale(dpr, dpr);
        g.strokeStyle = "rgba(20,24,33,0.55)"; g.fillStyle = "rgba(20,24,33,0.75)"; g.font = "9px ui-monospace, Consolas, monospace"; g.lineWidth = 1;
        for (let p = 0; p <= len; p += 5) {
          const size = p % 100 === 0 ? R : p % 50 === 0 ? R * 0.55 : p % 10 === 0 ? R * 0.35 : R * 0.18;
          g.beginPath();
          if (horizontal) { g.moveTo(p + 0.5, R); g.lineTo(p + 0.5, R - size); } else { g.moveTo(R, p + 0.5); g.lineTo(R - size, p + 0.5); }
          g.stroke();
          if (p % 100 === 0 && p > 0) {
            if (horizontal) g.fillText(String(p), p + 3, 9);
            else { g.save(); g.translate(9, p + 3); g.rotate(Math.PI / 2); g.fillText(String(p), 0, 0); g.restore(); }
          }
        }
      }
    };
    draw();
    addEventListener("resize", draw);
    top.addEventListener("pointerdown", (e) => drag(e, null, "h"));
    left.addEventListener("pointerdown", (e) => drag(e, null, "v"));
    // Coordonnées du pointeur, dans le coin.
    readout = el("tip"); readout.style.left = (R + 4) + "px"; readout.style.top = (R + 4) + "px";
    readout.textContent = "x — · y —";
    const onMove = (e) => { readout.textContent = "x " + e.clientX + " · y " + e.clientY; };
    addEventListener("pointermove", onMove, { passive: true });
    window.__caltiRulerCleanup = () => { removeEventListener("resize", draw); removeEventListener("pointermove", onMove); };
  }

  (document.body || document.documentElement).appendChild(host);
  window.__caltiRuler = {
    destroy() { window.__caltiRulerCleanup?.(); host.remove(); delete window.__caltiRuler; },
    clear() { guides = []; save(); drawGuides(); },
  };
})();`;
}

/** Applique l'outil aux pages affichées : à chaque réglage, changement d'onglet ou fin de chargement. */
export function useGridRuler(browser: Browser, visibleTabs: number[]) {
  const [settings] = useRulerSettings();
  const applied = useRef(new Set<number>());
  const loading = browser.tabs.filter((t) => visibleTabs.includes(t.id)).map((t) => `${t.id}:${t.loading}:${t.url}`).join("|");
  useEffect(() => {
    // Outil éteint et jamais posé : rien à injecter.
    if (!settings.enabled && applied.current.size === 0) return;
    const script = rulerScript(settings.enabled ? settings : null);
    for (const id of visibleTabs) invoke("browser_eval", { id, script }).catch(() => {});
    // Onglets qui ne sont plus affichés : l'outil en est retiré.
    for (const id of applied.current) {
      if (!visibleTabs.includes(id)) invoke("browser_eval", { id, script: rulerScript(null) }).catch(() => {});
    }
    applied.current = new Set(settings.enabled ? visibleTabs : []);
  }, [settings, visibleTabs.join("|"), loading]);
}

/** Efface les repères de la page affichée. */
export function clearGuides(visibleTabs: number[]) {
  for (const id of visibleTabs) invoke("browser_eval", { id, script: "window.__caltiRuler?.clear()" }).catch(() => {});
}
