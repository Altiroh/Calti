// Fermeture d'un onglet : une poubelle sort de l'onglet, l'onglet saute dedans, le couvercle se referme et la
// poubelle disparaît. Un fantôme de l'onglet (copie posée au-dessus de la barre) fait l'animation pendant que
// l'onglet réel est déjà retiré ; ses voisins glissent à leur nouvelle place (FLIP). Tout reste dans la barre du
// haut, que les pages ne recouvrent pas. Pas d'animation si les mouvements sont coupés (réglage ou système).
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
let running = 0;

const trashSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <g class="trash-lid"><path d="M4 6h16"/><path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6"/></g>
  <path d="M6 6.5l1 13a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19.5l1-13"/><path d="M10 10.5v6M14 10.5v6"/></svg>`;

const reduced = () =>
  !!document.querySelector(".shell.no-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Lance l'animation pour l'onglet `id` s'il est affiché dans une barre d'onglets ; à appeler avant de le retirer. */
export function animateTabClose(id: number) {
  const tab = document.querySelector<HTMLElement>(`.strip .ptab[data-tab="${id}"]`);
  const shell = tab?.closest<HTMLElement>(".shell");
  if (!tab || !shell || reduced()) return;
  const r = tab.getBoundingClientRect();
  if (r.width < 8) return;
  const strip = tab.closest<HTMLElement>(".strip")!;

  // Voisins : leur place avant, pour les faire glisser ensuite depuis là.
  const before = new Map<HTMLElement, DOMRect>();
  for (const el of strip.querySelectorAll<HTMLElement>(".ptab, .tgroup")) if (el !== tab) before.set(el, el.getBoundingClientRect());

  // Plusieurs fermetures d'un coup (fermer les autres onglets) : un simple fondu, pas une pluie de poubelles.
  const many = running >= 2;
  running++;
  const done = () => { running = Math.max(0, running - 1); };

  const ghost = tab.cloneNode(true) as HTMLElement;
  ghost.classList.add("ptab--ghost");
  ghost.removeAttribute("data-tab");
  Object.assign(ghost.style, {
    position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    margin: "0", zIndex: "90", pointerEvents: "none", animation: "none", transformOrigin: "50% 50%",
  });
  shell.appendChild(ghost);
  // Les voisins gardent leur place pendant le saut (le trou reste), puis glissent pour le refermer.
  slideNeighbours(before, many ? 0 : 960);

  if (many) {
    ghost.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.9)" }], { duration: 220, easing: EASE })
      .finished.finally(() => { ghost.remove(); done(); });
    return;
  }

  // La poubelle sort de l'onglet et se pose dans sa place, côté droit, couvercle ouvert.
  const trash = document.createElement("div");
  trash.className = "tab-trash";
  trash.innerHTML = trashSvg;
  const size = 34;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const tx = r.width >= size * 2.4 ? r.right - size - 4 : Math.min(r.right + 6, window.innerWidth - size - 8);
  Object.assign(trash.style, { left: `${tx}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px` });
  shell.appendChild(trash);
  const dx0 = cx - (tx + size / 2);
  const lid = trash.querySelector<SVGGElement>(".trash-lid")!;

  trash.animate([
    { transform: `translate(${dx0}px, 0) scale(0.2)`, opacity: 0 },
    { transform: "translate(0, -2px) scale(1.12)", opacity: 1, offset: 0.7 },
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
  ], { duration: 320, easing: EASE, fill: "forwards" });
  lid.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(-28deg)" }], { duration: 220, delay: 160, easing: EASE, fill: "forwards" });

  // L'onglet rétrécit et saute dans la poubelle : une petite courbe vers le haut, puis la chute.
  const tcx = tx + size / 2;
  const dx = tcx - cx;
  const jump = ghost.animate([
    { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
    { transform: `translate(${dx * 0.45}px, -16px) scale(0.55) rotate(-8deg)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${dx}px, 2px) scale(0.12) rotate(14deg)`, opacity: 0.2 },
  ], { duration: 520, delay: 200, easing: "cubic-bezier(0.45, 0, 0.3, 1)", fill: "forwards" });

  jump.finished.then(() => {
    ghost.remove();
    // Couvercle refermé, la poubelle s'écrase un peu sous le choc, puis disparaît.
    lid.animate([{ transform: "rotate(-28deg)" }, { transform: "rotate(6deg)", offset: 0.7 }, { transform: "rotate(0deg)" }], { duration: 200, easing: EASE, fill: "forwards" });
    return trash.animate([
      { transform: "scale(1, 1)", opacity: 1 },
      { transform: "scale(1.1, 0.88)", opacity: 1, offset: 0.25 },
      { transform: "scale(1, 1)", opacity: 1, offset: 0.5 },
      { transform: "scale(0.3)", opacity: 0 },
    ], { duration: 420, delay: 80, easing: EASE, fill: "forwards" }).finished;
  }).finally(() => { trash.remove(); ghost.remove(); done(); });
}

/** Les éléments restants de la barre glissent de leur ancienne place à la nouvelle, une fois l'onglet retiré. */
function slideNeighbours(before: Map<HTMLElement, DOMRect>, hold: number) {
  const start = performance.now();
  const step = () => {
    // L'onglet n'est retiré qu'au retour de Calti : on attend que la barre ait bougé (500 ms au plus).
    const moved = [...before].some(([el, r]) => el.isConnected && Math.abs(el.getBoundingClientRect().left - r.left) > 0.5);
    if (!moved && performance.now() - start < 500) { requestAnimationFrame(step); return; }
    const wait = Math.max(0, hold - (performance.now() - start));
    for (const [el, r] of before) {
      if (!el.isConnected) continue;
      const dx = r.left - el.getBoundingClientRect().left;
      if (Math.abs(dx) < 0.5) continue;
      // Tenus à leur ancienne place le temps du saut (fill: backwards), puis glissés à la nouvelle.
      el.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }], { duration: 340, delay: wait, easing: EASE, fill: "backwards" });
    }
  };
  requestAnimationFrame(step);
}
