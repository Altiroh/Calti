// Mouvement : transitions de vue entre états, reflets qui suivent le pointeur, parallaxe du fond.
import { flushSync } from "react-dom";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Applique un changement d'état avec une transition de vue : les blocs qui portent un
 * `view-transition-name` glissent de leur ancienne place à la nouvelle, le reste se fond.
 */
export function withTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || reducedMotion()) {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}

/** Reflet de verre sous le pointeur et légère parallaxe du décor. À appeler une fois. */
export function installPointerEffects() {
  if (reducedMotion()) return;
  let frame = 0;
  let last: PointerEvent | null = null;
  const root = document.documentElement.style;

  window.addEventListener("pointermove", (e) => {
    last = e;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!last) return;
      // Décor caché par les pages : inutile de le déplacer.
      if (document.documentElement.hasAttribute("data-browsing")) return;
      root.setProperty("--px", (last.clientX / innerWidth - 0.5).toFixed(3));
      root.setProperty("--py", (last.clientY / innerHeight - 0.5).toFixed(3));
      const glass = (last.target as Element | null)?.closest?.(".glass") as HTMLElement | null;
      if (glass) {
        const r = glass.getBoundingClientRect();
        glass.style.setProperty("--mx", `${last.clientX - r.left}px`);
        glass.style.setProperty("--my", `${last.clientY - r.top}px`);
      }
    });
  }, { passive: true });
}
