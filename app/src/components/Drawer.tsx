import type { ReactNode } from "react";
import { Icon } from "./Icon";
import "./Drawer.css";

/** Panneau de verre qui glisse depuis la droite. */
export function Drawer({ open, title, onClose, children }:
  { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className={`drawer-scrim${open ? " drawer-scrim--open" : ""}`} onClick={onClose} />
      <aside className={`drawer glass${open ? " drawer--open" : ""}`} aria-hidden={!open} inert={!open}>
        <header className="drawer__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" size={16} /></button>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </>
  );
}
