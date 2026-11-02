import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "./Icon";
import "./WindowControls.css";

/** Boutons réduire / agrandir / fermer de la fenêtre sans cadre. */
export function WindowControls() {
  const win = getCurrentWindow();
  return (
    <div className="window-controls">
      <button className="wc" onClick={() => win.minimize()} aria-label="Réduire"><Icon name="minimize" size={14} /></button>
      <button className="wc" onClick={() => win.toggleMaximize()} aria-label="Agrandir"><Icon name="maximize" size={12} /></button>
      <button className="wc wc--close" onClick={() => win.close()} aria-label="Fermer"><Icon name="close" size={14} /></button>
    </div>
  );
}
