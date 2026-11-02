import type { MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Éléments qui gardent leur propre comportement au clic. */
const INTERACTIVE = "button, a, input, textarea, select, [role=button], [role=tab]";

/**
 * Déplace la fenêtre depuis n'importe quel point non interactif d'une barre ;
 * un double-clic l'agrandit ou la restaure.
 */
export function dragWindow(e: MouseEvent) {
  if (e.button !== 0 || (e.target as Element).closest(INTERACTIVE)) return;
  const win = getCurrentWindow();
  if (e.detail === 2) {
    win.toggleMaximize();
    return;
  }
  win.startDragging();
}
