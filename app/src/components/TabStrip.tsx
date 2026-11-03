import { useState, type CSSProperties } from "react";
import { groupColors, type Browser, type BrowserTab, type ProfileId, type TabGroup } from "../browser/useBrowser";
import { Favicon } from "./Favicon";
import { Icon } from "./Icon";
import { hostname, siteIcon } from "./siteIcon";
import "./TabStrip.css";

interface Props {
  browser: Browser;
  profile: ProfileId;
}

/** Action en cours, affichée sur place dans la barre (un menu flottant passerait sous la page). */
type Editing = { kind: "tab"; tabId: number } | { kind: "group"; groupId: string } | null;

/** Barre d'onglets d'un volet, avec groupes façon Brave. Clic droit : actions sur l'onglet ou le groupe. */
export function TabStrip({ browser, profile }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const pane = browser.pane(profile);
  const items = browser.strip(profile);

  // Onglet ou groupe disparu entre-temps : on revient simplement à la barre normale.
  const editedTab = editing?.kind === "tab" ? browser.tabs.find((t) => t.id === editing.tabId) : undefined;
  const editedGroup = editing?.kind === "group" ? browser.groups.find((g) => g.id === editing.groupId) : undefined;

  if (editedTab) {
    const tab = editedTab;
    const current = browser.groupOf(tab.id);
    const others = browser.groups.filter((g) => g.profile === profile && g.id !== current?.id
      && browser.tabs.some((t) => browser.groupOf(t.id)?.id === g.id));
    const done = () => setEditing(null);
    return (
      <div className="strip strip--editing">
        <span className="strip__label" title={tab.title}>{tab.title || hostname(tab.url)}</span>
        <button className="strip__action" onClick={() => { setEditing({ kind: "group", groupId: browser.createGroup(tab.id) }); }}>
          <Icon name="plus" size={12} /> Nouveau groupe
        </button>
        {others.map((g) => (
          <button key={g.id} className="strip__action" style={{ "--group": g.color } as CSSProperties}
            onClick={() => { browser.addToGroup(tab.id, g.id); done(); }}>
            <span className="strip__dot" /> {g.name || "Groupe"}
          </button>
        ))}
        {current && <button className="strip__action" onClick={() => { browser.removeFromGroup(tab.id); done(); }}>Retirer du groupe</button>}
        <button className="strip__action" onClick={() => { browser.close(tab.id); done(); }}>Fermer</button>
        <button className="icon-btn strip__done" aria-label="Terminé" onClick={done}><Icon name="close" size={13} /></button>
      </div>
    );
  }

  if (editedGroup) {
    const group = editedGroup;
    const done = () => setEditing(null);
    return (
      <div className="strip strip--editing" style={{ "--group": group.color } as CSSProperties}>
        <input className="strip__name" autoFocus value={group.name} placeholder="Nom du groupe"
          onChange={(e) => browser.updateGroup(group.id, { name: e.target.value })}
          onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && done()} />
        <div className="strip__colors">
          {groupColors.map((c) => (
            <button key={c} className={`strip__color${c === group.color ? " strip__color--on" : ""}`} style={{ background: c }}
              aria-label={c} onClick={() => browser.updateGroup(group.id, { color: c })} />
          ))}
        </div>
        <button className="strip__action" onClick={() => { browser.ungroup(group.id); done(); }}>Dissocier</button>
        <button className="strip__action" onClick={() => { browser.closeGroup(group.id); done(); }}>Fermer le groupe</button>
        <button className="icon-btn strip__done" aria-label="Terminé" onClick={done}><Icon name="close" size={13} /></button>
      </div>
    );
  }

  const tabChip = (t: BrowserTab, group?: TabGroup) => (
    <div key={t.id} role="button" tabIndex={0} title={`${t.title}\n${t.url}`}
      className={`ptab${t.id === pane.activeTab ? " ptab--active" : ""}${group ? " ptab--grouped" : ""}`}
      style={group ? ({ "--group": group.color } as CSSProperties) : undefined}
      onClick={() => browser.activate(t.id)}
      onAuxClick={(e) => e.button === 1 && browser.close(t.id)}
      onContextMenu={(e) => { e.preventDefault(); setEditing({ kind: "tab", tabId: t.id }); }}>
      {t.loading ? <span className="spinner" /> : <Favicon src={siteIcon(t.url)} size={15} />}
      <span className="ptab__title">{t.title || hostname(t.url)}</span>
      <button className="ptab__close" aria-label="Fermer l'onglet"
        onClick={(e) => { e.stopPropagation(); browser.close(t.id); }}>
        <Icon name="close" size={11} />
      </button>
    </div>
  );

  return (
    <div className="strip">
      {items.map((item) => item.kind === "tab" ? tabChip(item.tab) : (
        <div key={item.group.id} className={`tgroup${item.group.collapsed ? " tgroup--collapsed" : ""}`}
          style={{ "--group": item.group.color } as CSSProperties}>
          <button className="tgroup__chip" title={`${item.group.name || "Groupe"} · ${item.tabs.length} onglet${item.tabs.length > 1 ? "s" : ""} (clic droit : modifier)`}
            onClick={() => browser.updateGroup(item.group.id, { collapsed: !item.group.collapsed })}
            onContextMenu={(e) => { e.preventDefault(); setEditing({ kind: "group", groupId: item.group.id }); }}>
            {item.group.name || <span className="tgroup__count">{item.tabs.length}</span>}
          </button>
          {!item.group.collapsed && item.tabs.map((t) => tabChip(t, item.group))}
        </div>
      ))}
      <button className={`ptab ptab--new${pane.activeTab == null ? " ptab--active" : ""}`}
        aria-label="Nouvel onglet" title="Nouvel onglet (Ctrl+T)" onClick={() => browser.newTab(profile)}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
