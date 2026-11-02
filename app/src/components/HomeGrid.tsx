import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import {
  GRID, blockLabel, clampBlock, collides, usedRows, type Block, type Layout, type Placement,
} from "../settings/layout";
import { Icon } from "./Icon";
import "./HomeGrid.css";

interface Props {
  layout: Layout;
  render: (block: Block) => ReactNode;
  /** Mode édition : déplacement, redimensionnement, sélection, masquage. */
  editing?: boolean;
  showGrid?: boolean;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (layout: Layout) => void;
}

const area = (p: Placement): CSSProperties => ({
  gridColumn: `${p.x + 1} / span ${p.w}`,
  gridRow: `${p.y + 1} / span ${p.h}`,
});

/** Style d'un bloc traduit en variables CSS et attributs (voir HomeGrid.css). */
function styleAttributes(block: Block) {
  const s = block.style ?? {};
  const vars: Record<string, string | number> = {};
  if (s.opacity != null) vars["--glass-alpha"] = s.opacity;
  if (s.blur != null) vars["--glass-blur"] = `${s.blur}px`;
  if (s.radius != null) vars["--block-radius"] = `${s.radius}px`;
  const tone = s.surface === "glass-dark" ? "light" : s.tone;
  return {
    vars,
    className: tone ? ` tone-${tone}` : "",
    surface: s.surface ?? "default",
    radius: s.radius != null,
  };
}

/** Grille de l'accueil. En édition, les blocs s'aimantent aux cellules et ne peuvent pas se chevaucher. */
export function HomeGrid({ layout, render, editing = false, showGrid = false, selected, onSelect, onChange }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ target: Placement; valid: boolean } | null>(null);
  // Rangées libres sous les blocs en édition, pour pouvoir descendre un bloc.
  const rows = Math.max(usedRows(layout) + (editing ? 8 : 0), 1);

  const steps = () => {
    const width = gridRef.current?.clientWidth ?? 1;
    return { col: (width + GRID.gap) / GRID.cols, row: GRID.row + GRID.gap };
  };

  const visible = Object.entries(layout).filter(([, b]) => !b.hidden);

  return (
    <div ref={gridRef} className={`home-grid${editing ? " home-grid--editing" : ""}`}
      style={{ gridTemplateRows: `repeat(${rows}, ${GRID.row}px)` }}
      onPointerDown={(e) => editing && e.target === e.currentTarget && onSelect?.(null)}>
      {editing && showGrid && Array.from({ length: rows * GRID.cols }, (_, i) => (
        <span key={i} className="home-grid__cell"
          style={{ gridColumn: (i % GRID.cols) + 1, gridRow: Math.floor(i / GRID.cols) + 1 }} />
      ))}

      {ghost && (
        <div className={`home-grid__ghost${ghost.valid ? "" : " home-grid__ghost--invalid"}`} style={area(ghost.target)} />
      )}

      {visible.map(([id, block], index) => (
        <GridBlock key={id} id={id} block={block} index={index} editing={editing} selected={selected === id}
          steps={steps}
          onPreview={(target) => setGhost(target && { target, valid: !collides(layout, id, target) })}
          onCommit={(target) => {
            setGhost(null);
            if (target && !collides(layout, id, target)) {
              onChange?.({ ...layout, [id]: clampBlock(block, target) });
              return true;
            }
            return false;
          }}
          onSelect={() => onSelect?.(id)}
          onRemove={() => {
            // Un bloc texte se supprime ; un bloc intégré se masque et peut être réaffiché.
            const next = { ...layout };
            if (block.kind === "text") delete next[id];
            else next[id] = { ...block, hidden: true };
            onChange?.(next);
            if (selected === id) onSelect?.(null);
          }}>
          {render(block)}
        </GridBlock>
      ))}
    </div>
  );
}

interface BlockProps {
  id: string;
  block: Block;
  index: number;
  editing: boolean;
  selected: boolean;
  steps: () => { col: number; row: number };
  onPreview: (target: Placement | null) => void;
  /** Renvoie vrai si la nouvelle place est acceptée. */
  onCommit: (target: Placement | null) => boolean;
  onSelect: () => void;
  onRemove: () => void;
  children: ReactNode;
}

const SPRING = "cubic-bezier(0.2, 0.9, 0.25, 1.05)";
/** En dessous de cette distance (px), un appui est un clic de sélection, pas un glisser. */
const CLICK_SLOP = 4;

function flip(el: HTMLElement, from: DOMRect) {
  const to = el.getBoundingClientRect();
  el.animate([
    {
      transformOrigin: "top left",
      transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
    },
    { transformOrigin: "top left", transform: "none" },
  ], { duration: 420, easing: SPRING });
}

function GridBlock({ id, block, index, editing, selected, steps, onPreview, onCommit, onSelect, onRemove, children }: BlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const flipFrom = useRef<DOMRect | null>(null);
  const gesture = useRef<{
    mode: "move" | "resize"; x: number; y: number; w: number; h: number; target: Placement; moved: boolean;
  } | null>(null);
  const attrs = styleAttributes(block);

  // FLIP : le bloc part de sa position visuelle au relâchement et glisse jusqu'à sa cellule.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !flipFrom.current) return;
    flip(el, flipFrom.current);
    flipFrom.current = null;
  });

  const start = (mode: "move" | "resize") => (e: PointerEvent) => {
    if (!editing || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = ref.current!.getBoundingClientRect();
    ref.current!.setPointerCapture(e.pointerId);
    gesture.current = { mode, x: e.clientX, y: e.clientY, w: rect.width, h: rect.height, target: block, moved: false };
  };

  const move = (e: PointerEvent) => {
    const g = gesture.current;
    const el = ref.current;
    if (!g || !el) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < CLICK_SLOP) return;
      g.moved = true;
      el.classList.add("grid-block--active");
    }
    const s = steps();
    let target: Placement;
    if (g.mode === "move") {
      // Le bloc suit le pointeur au pixel près ; la silhouette montre la cellule d'arrivée.
      el.style.transform = `translate(${dx}px, ${dy}px) scale(1.015)`;
      target = clampBlock(block, { ...block, x: block.x + Math.round(dx / s.col), y: block.y + Math.round(dy / s.row) });
    } else {
      el.style.width = `${Math.max(40, g.w + dx)}px`;
      el.style.height = `${Math.max(GRID.row, g.h + dy)}px`;
      target = clampBlock(block, {
        ...block,
        w: Math.round((g.w + dx + GRID.gap) / s.col),
        h: Math.round((g.h + dy + GRID.gap) / s.row),
      });
    }
    if (target.x !== g.target.x || target.y !== g.target.y || target.w !== g.target.w || target.h !== g.target.h || g.target === block) {
      g.target = target;
      onPreview(target);
    }
  };

  const end = () => {
    const g = gesture.current;
    const el = ref.current;
    if (!g || !el) return;
    gesture.current = null;
    if (!g.moved) {
      onSelect();
      return;
    }
    flipFrom.current = el.getBoundingClientRect();
    el.style.transform = "";
    el.style.width = "";
    el.style.height = "";
    el.classList.remove("grid-block--active");
    const changed = g.target.x !== block.x || g.target.y !== block.y || g.target.w !== block.w || g.target.h !== block.h;
    if (!(changed && onCommit(g.target))) {
      onCommit(null);
      // Refusé ou inchangé : retour animé à la place d'origine, déclenché ici faute de nouveau rendu.
      const from = flipFrom.current;
      flipFrom.current = null;
      flip(el, from);
    }
    onSelect();
  };

  return (
    <div ref={ref}
      className={`grid-block grid-block--${block.kind}${editing ? " grid-block--editing" : ""}${selected ? " grid-block--selected" : ""}${attrs.className}`}
      data-surface={attrs.surface} data-radius={attrs.radius || undefined}
      style={{ ...area(block), ...attrs.vars, viewTransitionName: `block-${id}`, "--i": index } as CSSProperties}
      onPointerDown={start("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {children}
      {editing && (
        <div className="block-edit">
          <span className="block-edit__label">{blockLabel(block)} · {block.w}×{block.h}</span>
          <button className="block-edit__hide" title={block.kind === "text" ? "Supprimer" : "Masquer"}
            aria-label={block.kind === "text" ? "Supprimer" : "Masquer"}
            onPointerDown={(e) => e.stopPropagation()} onClick={onRemove}>
            <Icon name="close" size={13} />
          </button>
          <span className="block-edit__resize" onPointerDown={start("resize")} aria-label="Redimensionner" />
        </div>
      )}
    </div>
  );
}
