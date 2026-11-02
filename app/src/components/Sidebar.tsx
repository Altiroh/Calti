import type { DrawerName } from "../App";
import type { Command } from "../brave/types";
import { Icon, type IconName } from "./Icon";
import "./Sidebar.css";

interface Props {
  drawer: DrawerName;
  onToggle: (name: Exclude<DrawerName, null>) => void;
  send: (c: Command) => void;
}

function RailButton({ icon, label, on, onClick, disabled }:
  { icon: IconName; label: string; on?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button className={`rail-btn${on ? " rail-btn--on" : ""}`} onClick={onClick} title={label}
      aria-label={label} aria-pressed={on} disabled={disabled}>
      <Icon name={icon} size={20} />
    </button>
  );
}

/** Rail latéral flottant. */
export function Sidebar({ drawer, onToggle, send }: Props) {
  return (
    <aside className="rail glass">
      <RailButton icon="home" label="Accueil" on={drawer === null} onClick={() => drawer && onToggle(drawer)} />
      <RailButton icon="star" label="Favoris" on={drawer === "bookmarks"} onClick={() => onToggle("bookmarks")} />
      <span className="rail__sep" />
      <RailButton icon="plus" label="Nouvel onglet Brave" onClick={() => send({ type: "newTab" })} />
      <span className="rail__spacer" />
      <RailButton icon="settings" label="Réglages" on={drawer === "settings"} onClick={() => onToggle("settings")} />
    </aside>
  );
}
