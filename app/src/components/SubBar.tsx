// Seconde barre, sous la barre du haut : groupes enregistrés (un clic les rouvre) et, au choix, les favoris.
// Panneau « Groupes » : groupes ouverts et enregistrés du profil.
import { useRef, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import type { Browser, ProfileId, SavedGroup } from "../browser/useBrowser";
import { useSettings } from "../settings/settings";
import type { MenuEntry } from "./ContextMenu";
import type { LibraryEntry } from "../browser/library";
import { Card } from "./Card";
import { openMenu } from "./ContextMenu";
import { Favicon } from "./Favicon";
import { FaIcon } from "./FaIcon";
import { Icon } from "./Icon";
import { hostname, siteIcon } from "./siteIcon";
import "./SubBar.css";

const savedMenu = (e: MouseEvent, browser: Browser, g: SavedGroup, display: MenuEntry[]) => {
  e.preventDefault();
  e.stopPropagation();
  openMenu(e, [
    { header: g.name || "Groupe sans nom" },
    { label: "Rouvrir", icon: "undo", tone: "teal", action: () => browser.reopenGroup(g.id) },
    "-",
    { label: "Supprimer le groupe enregistré", icon: "trash", danger: true, action: () => browser.deleteSavedGroup(g.id) },
    "-",
    ...display,
  ]);
};

function GroupMark({ g }: { g: { name: string; color: string; icon?: string } }) {
  return g.icon ? <FaIcon name={g.icon} size={12} /> : <span className="sgroup-dot" />;
}

export function SubBar({ browser, profile, bookmarks, groups, marks }: {
  browser: Browser;
  profile: ProfileId;
  bookmarks: LibraryEntry[];
  /** Montrer les groupes enregistrés, les favoris. */
  groups: boolean;
  marks: boolean;
}) {
  const { theme, updateTheme } = useSettings();
  const c = theme.chrome;
  const saved = groups ? browser.savedGroups.filter((g) => g.profile === profile) : [];
  const shownMarks = marks ? bookmarks : [];
  // Clic droit : ce que la barre affiche (catégories), et la masquer.
  const display: MenuEntry[] = [
    { header: "Afficher" },
    { label: "Groupes enregistrés", icon: "layers", tone: "violet", checked: groups, action: () => updateTheme({ chrome: { ...c, subBarGroups: !groups } }) },
    { label: "Favoris", icon: "star", tone: "amber", checked: marks, action: () => updateTheme({ chrome: { ...c, subBarBookmarks: !marks } }) },
    "-",
    { label: "Masquer la seconde barre", icon: "eye", tone: "slate", action: () => updateTheme({ chrome: { ...c, subBar: false } }) },
  ];
  const barMenu = (e: MouseEvent) => { e.preventDefault(); openMenu(e, display); };
  const markMenu = (e: MouseEvent, b: LibraryEntry) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(e, [
      { header: b.title || hostname(b.url) },
      { label: "Ouvrir", image: siteIcon(b.url), action: () => browser.go(b.url, profile) },
      { label: "Ouvrir dans un nouvel onglet", icon: "plus", tone: "green", action: () => browser.go(b.url, profile, true) },
      { label: "Copier l'adresse", icon: "link", tone: "violet", action: () => { navigator.clipboard.writeText(b.url).catch(() => {}); } },
      "-",
      ...display,
    ]);
  };
  // Glisser un groupe enregistré : il change de place dans la barre.
  const drag = useRef<{ id: string; el: HTMLElement; x0: number; moved: boolean; items: { id: string; el: HTMLElement; mid: number }[] } | null>(null);
  const suppress = useRef(false);
  const start = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return;
    const bar = e.currentTarget.parentElement!;
    const items = [...bar.querySelectorAll<HTMLElement>(".subbar__group")].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.saved!, el, mid: (r.left + r.right) / 2 };
    });
    drag.current = { id, el: e.currentTarget, x0: e.clientX, moved: false, items };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 6) return;
    d.moved = true;
    d.el.style.transform = `translateX(${dx}px)`;
    d.el.classList.add("subbar__group--dragging");
  };
  const end = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    d.el.style.transform = "";
    d.el.classList.remove("subbar__group--dragging");
    if (!d.moved) return;
    suppress.current = true;
    setTimeout(() => { suppress.current = false; }, 0);
    const others = d.items.filter((i) => i.id !== d.id);
    const before = others.find((i) => e.clientX < i.mid)?.id ?? null;
    browser.moveSavedGroup(d.id, before);
  };
  if (!groups && !marks) return null;
  return (
    <nav className="subbar glass" aria-label="Seconde barre" onContextMenu={barMenu}>
      {groups && <span className="subbar__cat" title="Groupes enregistrés"><Icon name="layers" size={14} /></span>}
      {saved.map((g) => (
        <button key={g.id} data-saved={g.id} className="subbar__group" style={{ "--group": g.color } as CSSProperties}
          onPointerDown={(e) => start(e, g.id)} onPointerMove={moveDrag} onPointerUp={end} onPointerCancel={end}
          title={`${g.name || "Groupe"} · ${g.tabs.length} onglet${g.tabs.length > 1 ? "s" : ""}`}
          onClick={() => !suppress.current && browser.reopenGroup(g.id)} onContextMenu={(e) => savedMenu(e, browser, g, display)}>
          <GroupMark g={g} />
          <span>{g.name || "Groupe"}</span>
          <small>{g.tabs.length}</small>
        </button>
      ))}
      {groups && marks && <span className="subbar__sep" />}
      {marks && <span className="subbar__cat" title="Favoris"><Icon name="star" size={14} /></span>}
      {shownMarks.map((b) => (
        <button key={b.url} className="subbar__mark" title={b.url} onContextMenu={(e) => markMenu(e, b)}
          onClick={() => browser.go(b.url, profile)}
          onMouseDown={(e) => e.button === 1 && e.preventDefault()}
          onAuxClick={(e) => e.button === 1 && browser.go(b.url, profile, true, true)}>
          <Favicon src={siteIcon(b.url)} size={14} />
          <span>{b.title || hostname(b.url)}</span>
        </button>
      ))}
    </nav>
  );
}

/** Panneau « Groupes » : ouverts (déplier, fermer et enregistrer) et enregistrés (rouvrir, supprimer). */
export function GroupsWidget({ browser, profile }: { browser: Browser; profile: ProfileId }) {
  const open = browser.groups.filter((g) => g.profile === profile && browser.tabsOf(profile).some((t) => browser.groupOf(t.id)?.id === g.id));
  const saved = browser.savedGroups.filter((g) => g.profile === profile);
  return (
    <Card title="Groupes" className="groups-card">
      <div className="groups">
        {open.length > 0 && <h3>Ouverts</h3>}
        {open.map((g) => {
          const tabs = browser.tabsOf(profile).filter((t) => browser.groupOf(t.id)?.id === g.id);
          return (
            <div key={g.id} className="groups__row" style={{ "--group": g.color } as CSSProperties}>
              <button className="groups__main" onClick={() => { browser.updateGroup(g.id, { collapsed: false }); if (tabs[0]) browser.activate(tabs[0].id); }}>
                <span className="groups__mark"><GroupMark g={g} /></span>
                <span className="groups__name">{g.name || "Groupe"}</span>
                <small>{tabs.length}</small>
              </button>
              <button className="groups__act" title="Fermer et enregistrer" aria-label="Fermer et enregistrer" onClick={() => browser.closeGroup(g.id, true)}>
                <Icon name="save" size={13} />
              </button>
            </div>
          );
        })}
        {saved.length > 0 && <h3>Enregistrés</h3>}
        {saved.map((g) => (
          <div key={g.id} className="groups__row" style={{ "--group": g.color } as CSSProperties}>
            <button className="groups__main" title={g.tabs.map((t) => t.title || hostname(t.url)).join("\n")} onClick={() => browser.reopenGroup(g.id)}>
              <span className="groups__mark"><GroupMark g={g} /></span>
              <span className="groups__name">{g.name || "Groupe"}</span>
              <small>{g.tabs.length}</small>
            </button>
            <button className="groups__act" title="Supprimer" aria-label="Supprimer" onClick={() => browser.deleteSavedGroup(g.id)}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
        {!open.length && !saved.length && <p className="muted">Aucun groupe</p>}
      </div>
    </Card>
  );
}
