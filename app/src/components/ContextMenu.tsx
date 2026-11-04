// Menu contextuel de Calti, dessiné dans l'interface (et non par Windows) pour suivre le thème : arrondi, verre ou
// surface opaque, espacement, couleurs. Les pages sont découpées à sa place (onRects) pour le laisser voir.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Cutout } from "../browser/useBrowser";
import { Favicon } from "./Favicon";
import { Icon, type IconName } from "./Icon";
import "./ContextMenu.css";

/** Teintes des pastilles d'icône, par famille d'actions. */
export type MenuTone = "blue" | "green" | "amber" | "violet" | "pink" | "teal" | "red" | "slate";

export interface MenuAction {
  label: string;
  icon?: IconName;
  /** Image (icône d'un site) à la place de l'icône. */
  image?: string | null;
  tone?: MenuTone;
  /** Pastille de couleur libre (groupe d'onglets…). */
  color?: string;
  shortcut?: string;
  disabled?: boolean;
  /** Case cochée (affichée à droite). */
  checked?: boolean;
  danger?: boolean;
  /** Valeur affichée à droite (zoom actuel…). */
  value?: string;
  action?: () => void;
  items?: MenuEntry[];
}
export type MenuEntry = MenuAction | "-" | { header: string };

interface Request {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose?: () => void;
}

const OPEN = "calti:menu";

/** Ouvre le menu au point donné (ou sous le pointeur de l'événement). */
export function openMenu(at: { clientX: number; clientY: number } | { x: number; y: number }, items: MenuEntry[], onClose?: () => void) {
  const x = "clientX" in at ? at.clientX : at.x;
  const y = "clientY" in at ? at.clientY : at.y;
  window.dispatchEvent(new CustomEvent<Request>(OPEN, { detail: { x, y, items, onClose } }));
}

/** Ferme le menu ouvert, s'il y en a un. */
export const closeMenu = () => window.dispatchEvent(new CustomEvent<Request | null>(OPEN, { detail: null }));

const isAction = (e: MenuEntry): e is MenuAction => typeof e === "object" && "label" in e;
const MARGIN = 8;

/** Hôte unique des menus de la fenêtre (posé dans App). */
export function MenuHost({ onRects }: { onRects: (rects: Cutout[]) => void }) {
  const [request, setRequest] = useState<Request | null>(null);
  // Chemin des sous-menus ouverts : index de l'entrée dans chaque niveau.
  const [path, setPath] = useState<number[]>([]);
  // Entrée mise en avant au clavier, par niveau.
  const [active, setActive] = useState<number[]>([-1]);
  const levels = useRef<(HTMLDivElement | null)[]>([]);
  const [places, setPlaces] = useState<{ x: number; y: number }[]>([]);
  const requestRef = useRef(request);
  requestRef.current = request;

  const close = () => {
    const r = requestRef.current;
    setRequest(null);
    setPath([]);
    setActive([-1]);
    setPlaces([]);
    r?.onClose?.();
  };

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<Request | null>).detail;
      requestRef.current?.onClose?.();
      setRequest(detail);
      setPath([]);
      setActive([-1]);
      setPlaces(detail ? [{ x: detail.x, y: detail.y }] : []);
    };
    window.addEventListener(OPEN, onOpen);
    return () => window.removeEventListener(OPEN, onOpen);
  }, []);

  // Fermeture : clic ailleurs, fenêtre quittée (clic dans une page), redimensionnement, défilement.
  useEffect(() => {
    if (!request) return;
    const onDown = (e: PointerEvent) => !(e.target as Element).closest(".cmenu") && close();
    const onBlur = () => close();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onBlur);
    };
  }, [request]);

  // Niveaux affichés : le menu, puis chaque sous-menu ouvert.
  const shown: MenuEntry[][] = [];
  if (request) {
    shown.push(request.items);
    for (const i of path) {
      const entry = shown[shown.length - 1][i];
      if (entry && isAction(entry) && entry.items) shown.push(entry.items);
      else break;
    }
  }

  // Place de chaque niveau, gardée dans la fenêtre ; les pages sont découpées à cet endroit.
  useLayoutEffect(() => {
    if (!request) { onRects([]); return; }
    const next: { x: number; y: number }[] = [];
    const rects: Cutout[] = [];
    shown.forEach((_, level) => {
      const el = levels.current[level];
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let x: number;
      let y: number;
      if (level === 0) {
        x = request.x + w + MARGIN > innerWidth ? request.x - w : request.x;
        y = request.y + h + MARGIN > innerHeight ? Math.max(MARGIN, request.y - h) : request.y;
      } else {
        const parent = next[level - 1];
        const parentEl = levels.current[level - 1]!;
        const row = parentEl.querySelector<HTMLElement>(`[data-index="${path[level - 1]}"]`);
        const pw = parentEl.offsetWidth;
        x = parent.x + pw - 4 + w + MARGIN > innerWidth ? parent.x - w + 4 : parent.x + pw - 4;
        y = parent.y + (row?.offsetTop ?? 0) - 6;
        if (y + h + MARGIN > innerHeight) y = innerHeight - h - MARGIN;
      }
      x = Math.min(Math.max(MARGIN, x), innerWidth - w - MARGIN);
      y = Math.max(MARGIN, y);
      next.push({ x, y });
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 14;
      rects.push({ x: x - 2, y: y - 2, width: w + 4, height: h + 4, radius: radius + 2 });
    });
    setPlaces((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    onRects(rects);
  }, [request, path.join(","), shown.length]);
  useEffect(() => () => onRects([]), []);

  const run = (entry: MenuAction) => {
    if (entry.disabled || entry.items) return;
    close();
    // Après la fermeture : l'action peut ouvrir un dialogue ou un autre menu.
    requestAnimationFrame(() => entry.action?.());
  };

  // Clavier : flèches, Entrée, Échap, gauche/droite pour les sous-menus.
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      const level = path.length;
      const entries = shown[level] ?? [];
      const selectable = entries.map((x, i) => (isAction(x) && !x.disabled ? i : -1)).filter((i) => i >= 0);
      const current = active[level] ?? -1;
      const at = selectable.indexOf(current);
      if (e.key === "Escape") {
        e.preventDefault();
        if (level > 0) { setPath(path.slice(0, -1)); setActive(active.slice(0, level)); }
        else close();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!selectable.length) return;
        const next = e.key === "ArrowDown" ? selectable[(at + 1) % selectable.length] : selectable[(at - 1 + selectable.length) % selectable.length];
        const copy = active.slice(0, level + 1);
        copy[level] = next;
        setActive(copy);
      } else if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
        const entry = entries[current];
        if (!entry || !isAction(entry)) return;
        e.preventDefault();
        if (entry.items && !entry.disabled) {
          setPath([...path.slice(0, level), current]);
          const first = entry.items.findIndex((x) => isAction(x) && !x.disabled);
          setActive([...active.slice(0, level + 1), first]);
        } else if (e.key !== "ArrowRight") run(entry);
      } else if (e.key === "ArrowLeft" && level > 0) {
        e.preventDefault();
        setPath(path.slice(0, -1));
        setActive(active.slice(0, level));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!request) return null;

  return (
    <>
      {shown.map((entries, level) => (
        <div key={level} ref={(el) => { levels.current[level] = el; }} role="menu"
          className={`cmenu glass${level ? " cmenu--sub" : ""}`}
          style={{ left: places[level]?.x ?? -9999, top: places[level]?.y ?? -9999, visibility: places[level] ? undefined : "hidden" } as CSSProperties}
          onContextMenu={(e) => e.preventDefault()}>
          {entries.map((entry, i) => {
            if (entry === "-") return <div key={i} className="cmenu__sep" role="separator" />;
            if (!isAction(entry)) return <div key={i} className="cmenu__header">{entry.header}</div>;
            const open = path[level] === i;
            const hot = active[level] === i || open;
            return (
              <button key={i} type="button" role="menuitem" data-index={i}
                className={`cmenu__item${hot ? " cmenu__item--hot" : ""}${entry.danger ? " cmenu__item--danger" : ""}`}
                disabled={entry.disabled} aria-haspopup={entry.items ? "menu" : undefined} aria-expanded={entry.items ? open : undefined}
                onPointerEnter={() => {
                  const copy = active.slice(0, level + 1);
                  copy[level] = i;
                  setActive(copy);
                  if (entry.items && !entry.disabled) setPath([...path.slice(0, level), i]);
                  else if (path.length > level) setPath(path.slice(0, level));
                }}
                onClick={() => run(entry)}>
                <span className={`cmenu__icon${entry.tone ? ` cmenu__icon--${entry.tone}` : ""}${entry.icon || entry.image || entry.color ? "" : " cmenu__icon--none"}`}
                  style={entry.color ? { "--chip": entry.color } as CSSProperties : undefined}>
                  {entry.image !== undefined ? <Favicon src={entry.image} size={14} />
                    : entry.icon ? <Icon name={entry.icon} size={14} />
                    : entry.color ? <i className="cmenu__dot" /> : null}
                </span>
                <span className="cmenu__label">{entry.label}</span>
                {entry.value && <span className="cmenu__value">{entry.value}</span>}
                {entry.shortcut && <span className="cmenu__keys">{entry.shortcut.split(/\s*·\s*/)[0].split("+").map((k, n) => <kbd key={n}>{k}</kbd>)}</span>}
                {entry.checked !== undefined && (
                  <span className={`cmenu__check${entry.checked ? " cmenu__check--on" : ""}`}>{entry.checked && <Icon name="check" size={11} />}</span>
                )}
                {entry.items && <span className="cmenu__more"><Icon name="chevron" size={12} /></span>}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}
