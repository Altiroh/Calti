import type { CSSProperties } from "react";
import type { DrawerName } from "../App";
import { dragWindow } from "./dragWindow";
import { Icon, type IconName } from "./Icon";
import "./Sidebar.css";

export interface RailProfile {
  id: string;
  label: string;
  accent: string;
  tabs: number;
}

interface Props {
  profiles: RailProfile[];
  focused: string;
  onProfile: (id: string) => void;
  drawer: DrawerName;
  onToggle: (name: Exclude<DrawerName, null>) => void;
  split: boolean;
  onHome: () => void;
  onToggleSplit: () => void;
}

function RailButton({ icon, label, on, onClick }: { icon: IconName; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button className={`rail-btn${on ? " rail-btn--on" : ""}`} onClick={onClick} title={label}
      aria-label={label} aria-pressed={on}>
      <Icon name={icon} size={20} />
    </button>
  );
}

/** Texte sombre sur un accent clair, blanc sinon. */
function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luminance > 0.6 ? "#14213a" : "#fff";
}

/** Deux premières lettres du nom (« Pe », « Pr »), pour distinguer des profils de même initiale. */
const initials = (label: string) => label.trim().slice(0, 2).replace(/^./, (c) => c.toUpperCase());

/** Rail latéral : profils en pastilles rondes, puis navigation et réglages. */
export function Sidebar({ profiles, focused, onProfile, drawer, onToggle, split, onHome, onToggleSplit }: Props) {
  return (
    <aside className="rail glass" onMouseDown={dragWindow}>
      <div className="rail__profiles" role="tablist" aria-label="Profil">
        {profiles.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === focused} title={`${p.label} · ${p.tabs} onglet${p.tabs > 1 ? "s" : ""}`}
            className={`avatar${p.id === focused ? " avatar--on" : ""}`} style={{ "--avatar": p.accent, "--avatar-text": readableOn(p.accent) } as CSSProperties}
            onClick={() => onProfile(p.id)}>
            {initials(p.label)}
            {p.tabs > 0 && <span className="avatar__count">{p.tabs}</span>}
          </button>
        ))}
      </div>
      <span className="rail__sep" />
      <RailButton icon="home" label="Accueil (nouvel onglet)" onClick={() => { if (drawer) onToggle(drawer); onHome(); }} />
      <RailButton icon="split" label="Personnel et Pro côte à côte" on={split} onClick={onToggleSplit} />
      <RailButton icon="star" label="Favoris" on={drawer === "bookmarks"} onClick={() => onToggle("bookmarks")} />
      <span className="rail__spacer" />
      <RailButton icon="settings" label="Réglages" on={drawer === "settings"} onClick={() => onToggle("settings")} />
    </aside>
  );
}
