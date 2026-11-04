// Panneau des outils de développement ancrés, à côté ou sous la page. Sa zone (`registerDevtoolsSlot`) reçoit la
// fenêtre des outils de WebView2, posée par app/src-tauri/src/devtools.rs.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Browser, ProfileId } from "../browser/useBrowser";
import { Icon } from "./Icon";
import "./DevtoolsPanel.css";

const KEY = "calti.devtools";

export interface DevtoolsDock {
  side: "right" | "bottom";
  /** Largeur (à droite) ou hauteur (en bas), en pixels. */
  size: number;
}

function load(): DevtoolsDock {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { side: d.side === "bottom" ? "bottom" : "right", size: Number(d.size) || 520 };
  } catch {
    return { side: "right", size: 520 };
  }
}

/** Place des outils (côté, taille), retenue pour toutes les fenêtres. */
export function useDevtoolsDock() {
  const [dock, setDock] = useState(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(dock)); } catch { /* non persisté */ }
  }, [dock]);
  return [dock, setDock] as const;
}

export function DevtoolsPanel({ browser, profile, tabId, dock, onDock }: {
  browser: Browser;
  profile: ProfileId;
  tabId: number;
  dock: DevtoolsDock;
  onDock: (dock: DevtoolsDock) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);

  // Poignée : on glisse le bord du panneau pour le redimensionner.
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const body = panel.current?.parentElement?.getBoundingClientRect();
    if (!body) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const size = dock.side === "right" ? body.right - ev.clientX : body.bottom - ev.clientY;
      const max = (dock.side === "right" ? body.width : body.height) - 160;
      onDock({ ...dock, size: Math.round(Math.min(Math.max(size, 220), max)) });
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <aside ref={panel} className={`devtools devtools--${dock.side}${dragging ? " devtools--dragging" : ""}`}
      style={{ flexBasis: dock.size }} aria-label="Outils de développement">
      <div className="devtools__grip" onPointerDown={startResize} title="Glisser pour redimensionner" />
      <div className="devtools__frame glass">
        <header className="devtools__bar">
          <span className="devtools__title"><Icon name="code" size={13} /> Outils de développement</span>
          <button className="icon-btn" title={dock.side === "right" ? "Ancrer en bas" : "Ancrer à droite"}
            onClick={() => onDock({ ...dock, side: dock.side === "right" ? "bottom" : "right" })}>
            <Icon name={dock.side === "right" ? "layout" : "sidebar"} size={13} />
          </button>
          <button className="icon-btn" title="Détacher dans une fenêtre" onClick={() => browser.undockDevtools(tabId)}>
            <Icon name="popout" size={13} />
          </button>
          <button className="icon-btn" title="Fermer (F12)" onClick={() => browser.toggleDevtools(profile)}>
            <Icon name="close" size={13} />
          </button>
        </header>
        <div className="devtools__slot" ref={(el) => browser.registerDevtoolsSlot(profile, el)}>
          <span className="devtools__wait">Ouverture des outils…</span>
        </div>
      </div>
    </aside>
  );
}
