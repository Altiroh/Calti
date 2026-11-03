import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { DrawerName } from "../App";
import type { BrowserTab, TabGroup, TabStripItem } from "../browser/useBrowser";
import type { ProfileSettings } from "../settings/settings";
import { dragWindow } from "./dragWindow";
import { Favicon } from "./Favicon";
import { Icon, type IconName } from "./Icon";
import { ProfileBadge } from "./ProfileBadge";
import { hostname, siteIcon } from "./siteIcon";
import "./Sidebar.css";

/** Largeurs de la barre : icônes seules, ou large (libellés et onglets). */
export const RAIL_NARROW = 64;
export const RAIL_WIDE_MIN = 200;
export const RAIL_MAX = 360;

interface Props {
  width: number;
  onResize: (width: number, done: boolean) => void;
  profiles: ProfileSettings[];
  focused: string;
  tabCount: (profile: string) => number;
  onProfile: (id: string) => void;
  onManageProfiles: () => void;
  /** Onglets (et groupes) du profil principal, affichés quand la barre est large. */
  items: TabStripItem[];
  onToggleGroup: (groupId: string) => void;
  activeTab: number | null;
  onActivate: (id: number) => void;
  onCloseTab: (id: number) => void;
  drawer: DrawerName;
  onToggle: (name: Exclude<DrawerName, null>) => void;
  split: boolean;
  onToggleSplit: () => void;
  onHome: () => void;
  onNewTab: () => void;
}

function RailButton({ icon, label, on, wide, onClick }:
  { icon: IconName; label: string; on?: boolean; wide: boolean; onClick: () => void }) {
  return (
    <button className={`rail-btn${on ? " rail-btn--on" : ""}`} onClick={onClick} title={wide ? undefined : label}
      aria-label={label} aria-pressed={on}>
      <Icon name={icon} size={19} />
      {wide && <span className="rail-btn__label">{label}</span>}
    </button>
  );
}

/** Barre latérale : sélecteur de profil, navigation, onglets (en large) et réglages. */
export function Sidebar(props: Props) {
  const { width, profiles, focused, drawer, onToggle, split } = props;
  const wide = width >= RAIL_WIDE_MIN;
  const [switching, setSwitching] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const current = profiles.find((p) => p.id === focused) ?? profiles[0];

  const vtab = (t: BrowserTab, group?: TabGroup) => (
    <div key={t.id} role="button" tabIndex={0} title={t.url}
      className={`vtab${t.id === props.activeTab ? " vtab--active" : ""}${group ? " vtab--grouped" : ""}`}
      onClick={() => props.onActivate(t.id)}
      onAuxClick={(e) => e.button === 1 && props.onCloseTab(t.id)}>
      {t.loading ? <span className="spinner" /> : <Favicon src={siteIcon(t.url)} size={15} />}
      <span className="vtab__title">{t.title || hostname(t.url)}</span>
      <button className="vtab__close" aria-label="Fermer l'onglet"
        onClick={(e) => { e.stopPropagation(); props.onCloseTab(t.id); }}>
        <Icon name="close" size={11} />
      </button>
    </div>
  );

  const startResize = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width };
  };
  const resize = (e: PointerEvent) => {
    if (!drag.current) return;
    const w = Math.max(RAIL_NARROW, Math.min(RAIL_MAX, drag.current.width + e.clientX - drag.current.x));
    props.onResize(w, false);
  };
  const endResize = () => {
    if (!drag.current) return;
    drag.current = null;
    // Entre les deux tailles, on rejoint la plus proche.
    const snapped = width < RAIL_WIDE_MIN ? (width < (RAIL_NARROW + RAIL_WIDE_MIN) / 2 ? RAIL_NARROW : RAIL_WIDE_MIN) : width;
    props.onResize(snapped, true);
  };

  return (
    <aside className={`rail glass${wide ? " rail--wide" : ""}`} onMouseDown={dragWindow}>
      <div className={`switcher${switching ? " switcher--open" : ""}`}>
        <button className="switcher__current" onClick={() => setSwitching((s) => !s)} aria-expanded={switching}
          title={wide ? "Changer de profil" : `${current.name} · changer de profil`}>
          <ProfileBadge profile={current} size={wide ? 34 : 40} count={props.tabCount(current.id)} />
          {wide && (
            <>
              <span className="switcher__name">{current.name}</span>
              <span className={`switcher__chevron${switching ? " switcher__chevron--open" : ""}`}><Icon name="chevron" size={13} /></span>
            </>
          )}
        </button>
        {switching && (
          <div className="switcher__menu" role="menu">
            {profiles.filter((p) => p.id !== current.id).map((p) => (
              <button key={p.id} role="menuitem" className="switcher__item" title={p.name}
                onClick={() => { props.onProfile(p.id); setSwitching(false); }}>
                <ProfileBadge profile={p} size={wide ? 28 : 34} count={props.tabCount(p.id)} />
                {wide && <span className="switcher__item-name">{p.name}</span>}
              </button>
            ))}
            <button className="switcher__item switcher__item--manage" title="Gérer les profils"
              onClick={() => { props.onManageProfiles(); setSwitching(false); }}>
              <span className="switcher__plus"><Icon name="plus" size={15} /></span>
              {wide && <span className="switcher__item-name">Gérer les profils</span>}
            </button>
          </div>
        )}
      </div>

      <span className="rail__sep" />
      <RailButton icon="plus" label="Nouvel onglet" wide={wide} onClick={props.onNewTab} />
      <RailButton icon="home" label="Accueil" wide={wide} onClick={() => { if (drawer) onToggle(drawer); props.onHome(); }} />
      <RailButton icon="split" label="Côte à côte" on={split} wide={wide} onClick={props.onToggleSplit} />
      <RailButton icon="star" label="Favoris" on={drawer === "bookmarks"} wide={wide} onClick={() => onToggle("bookmarks")} />

      {wide ? (
        <div className="rail__tabs">
          {props.items.map((item) => item.kind === "tab" ? vtab(item.tab) : (
            <div key={item.group.id} className="vgroup" style={{ "--group": item.group.color } as CSSProperties}>
              <button className="vgroup__head" onClick={() => props.onToggleGroup(item.group.id)}>
                <span className={`vgroup__chevron${item.group.collapsed ? "" : " vgroup__chevron--open"}`}><Icon name="chevron" size={11} /></span>
                <span className="vgroup__name">{item.group.name || "Groupe"}</span>
                <span className="vgroup__count">{item.tabs.length}</span>
              </button>
              {!item.group.collapsed && item.tabs.map((t) => vtab(t, item.group))}
            </div>
          ))}
        </div>
      ) : (
        <span className="rail__spacer" />
      )}

      <RailButton icon="settings" label="Réglages" on={drawer === "settings"} wide={wide} onClick={() => onToggle("settings")} />

      <span className="rail__resize" role="separator" aria-orientation="vertical" aria-label="Redimensionner la barre"
        onPointerDown={startResize} onPointerMove={resize} onPointerUp={endResize} onPointerCancel={endResize}
        onDoubleClick={() => props.onResize(wide ? RAIL_NARROW : 260, true)} />
    </aside>
  );
}
