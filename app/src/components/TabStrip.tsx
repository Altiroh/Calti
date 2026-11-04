import { useLayoutEffect, useRef, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { type Browser, type BrowserTab, type ProfileId, type TabGroup } from "../browser/useBrowser";
import { Favicon } from "./Favicon";
import { openGroupDialog } from "./GroupDialog";
import { Icon } from "./Icon";
import { openMenu } from "./ContextMenu";
import { hostname, siteIcon } from "./siteIcon";
import "./TabStrip.css";

interface Props {
  browser: Browser;
  profile: ProfileId;
}

/** Sous l'élément cliqué : place du dialogue de groupe. */
const below = (e: MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.left, y: r.bottom + 10 };
};

/**
 * Barre d'onglets d'un volet, avec groupes façon Brave.
 * Clic droit : menu de Calti (ContextMenu) sur l'onglet ou le groupe.
 */
export function TabStrip({ browser, profile }: Props) {
  const pane = browser.pane(profile);
  const items = browser.strip(profile);

  const tabMenu = (e: MouseEvent, tab: BrowserTab) => {
    e.preventDefault();
    const at = below(e);
    const current = browser.groupOf(tab.id);
    const others = browser.groups.filter((g) => g.profile === profile && g.id !== current?.id
      && browser.tabs.some((t) => browser.groupOf(t.id)?.id === g.id));
    const siblings = browser.tabsOf(profile).filter((t) => t.id !== tab.id);
    openMenu(e, [
      { header: tab.title || hostname(tab.url) },
      { label: "Ajouter à un nouveau groupe…", icon: "layers", tone: "violet", action: () => openGroupDialog({ kind: "create", tabId: tab.id, ...at }) },
      ...(others.length ? [{
        label: "Ajouter au groupe", icon: "tabs" as const, tone: "violet" as const,
        items: others.map((g) => ({ label: g.name || "Groupe sans nom", color: g.color, action: () => browser.addToGroup(tab.id, g.id) })),
      }] : []),
      ...(current ? [{ label: `Retirer du groupe « ${current.name || "sans nom"} »`, color: current.color, action: () => browser.removeFromGroup(tab.id) }] : []),
      "-",
      { label: "Recharger", icon: "reload", tone: "blue", action: () => { invoke("browser_action", { id: tab.id, action: "reload" }).catch(() => {}); } },
      {
        label: tab.muted ? "Réactiver le son de l'onglet" : "Couper le son de l'onglet", icon: tab.muted ? "sound" : "mute", tone: "pink",
        action: () => browser.tabAction(tab.id, tab.muted ? "unmute" : "mute"),
      },
      { label: "Dupliquer l'onglet", icon: "duplicate", tone: "teal", action: () => browser.go(tab.url, profile, true) },
      { label: "Copier l'adresse", icon: "link", tone: "violet", action: () => { navigator.clipboard.writeText(tab.url).catch(() => {}); } },
      "-",
      { label: "Rouvrir l'onglet fermé", icon: "undo", tone: "amber", shortcut: "Ctrl+Maj+T", action: () => browser.reopen(profile) },
      { label: "Fermer les autres onglets", icon: "tabs", tone: "slate", disabled: siblings.length === 0, action: () => siblings.forEach((t) => browser.close(t.id)) },
      { label: "Fermer l'onglet", icon: "close", danger: true, shortcut: "Ctrl+W", action: () => browser.close(tab.id) },
    ]);
  };

  const groupMenu = (e: MouseEvent, group: TabGroup) => {
    e.preventDefault();
    const at = below(e);
    openMenu(e, [
      { header: group.name || "Groupe sans nom" },
      { label: "Nom et couleur…", icon: "edit", tone: "violet", action: () => openGroupDialog({ kind: "edit", groupId: group.id, ...at }) },
      { label: group.collapsed ? "Déplier" : "Replier", icon: "collapse", tone: "blue", action: () => browser.updateGroup(group.id, { collapsed: !group.collapsed }) },
      "-",
      { label: "Dissocier (garder les onglets)", icon: "layers", tone: "slate", action: () => browser.ungroup(group.id) },
      { label: "Fermer le groupe", icon: "close", danger: true, action: () => browser.closeGroup(group.id) },
    ]);
  };

  // Glisser un onglet : il suit le pointeur, les autres s'écartent pour lui faire de la place ; lâché loin de la
  // barre (ou hors de la fenêtre), il part dans une nouvelle fenêtre.
  const drag = useRef<{
    id: number; el: HTMLElement; x0: number; y0: number; moved: boolean; out: boolean;
    chips: { id: number; el: HTMLElement; left: number; right: number }[]; from: number; target: number;
  } | null>(null);
  const suppressClick = useRef(false);
  // Onglets laissés à leur place visuelle le temps que le nouvel ordre arrive : pas de saut à l'arrivée.
  const settling = useRef<HTMLElement[]>([]);
  const order = items.map((i) => (i.kind === "tab" ? i.tab.id : i.tabs.map((t) => t.id).join(","))).join("|");
  useLayoutEffect(() => {
    for (const el of settling.current) {
      el.style.transition = "none";
      el.style.transform = "";
      requestAnimationFrame(() => { el.style.transition = ""; });
    }
    settling.current = [];
  }, [order]);

  const startDrag = (e: PointerEvent<HTMLDivElement>, t: BrowserTab) => {
    if (e.button !== 0 || (e.target as Element).closest(".ptab__close")) return;
    const strip = e.currentTarget.closest(".strip");
    if (!strip) return;
    const chips = [...strip.querySelectorAll<HTMLElement>(".ptab[data-tab]")].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: Number(el.dataset.tab), el, left: r.left, right: r.right };
    });
    const from = chips.findIndex((c) => c.id === t.id);
    drag.current = { id: t.id, el: e.currentTarget, x0: e.clientX, y0: e.clientY, moved: false, out: false, chips, from, target: from };
    // Capture : le glisser continue même hors de la barre ou de la fenêtre.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      d.el.classList.add("ptab--dragging");
    }
    const me = d.chips[d.from];
    const bar = d.el.closest(".pane__bar")?.getBoundingClientRect();
    d.out = !!bar && (e.clientY > bar.bottom + 40 || e.clientY < -10 || e.clientX < -10 || e.clientX > innerWidth + 10);
    d.el.classList.toggle("ptab--detaching", d.out);
    d.el.style.transform = `translate(${dx}px, ${d.out ? dy : Math.max(-6, Math.min(dy, 8))}px)`;

    // Place visée : le centre de l'onglet tiré dépasse le milieu d'un voisin.
    const center = (me.left + me.right) / 2 + dx;
    let target = d.from;
    for (let i = d.from + 1; i < d.chips.length; i++) if (center > (d.chips[i].left + d.chips[i].right) / 2) target = i;
    for (let i = d.from - 1; i >= 0; i--) if (center < (d.chips[i].left + d.chips[i].right) / 2) target = i;
    d.target = d.out ? d.from : target;
    const width = me.right - me.left + 4;
    d.chips.forEach((c, i) => {
      if (i === d.from) return;
      const shift = i > d.from && i <= d.target ? -width : i < d.from && i >= d.target ? width : 0;
      c.el.style.transform = shift ? `translateX(${shift}px)` : "";
    });
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    d.el.classList.remove("ptab--dragging", "ptab--detaching");
    if (!d.moved) return;
    // Le clic qui suit le relâchement n'active pas l'onglet.
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    const reset = () => d.chips.forEach((c) => { c.el.style.transform = ""; });
    if (d.out) {
      reset();
      browser.newWindow(profile, false, d.id);
      return;
    }
    if (d.target === d.from) {
      reset();
      return;
    }
    // L'onglet se pose dans le trou laissé par ses voisins ; tout reprend sa place quand le nouvel ordre arrive.
    const me = d.chips[d.from];
    const slot = d.chips[d.target];
    d.el.style.transform = `translateX(${d.target > d.from ? slot.right - me.right : slot.left - me.left}px)`;
    settling.current = d.chips.map((c) => c.el);
    setTimeout(() => { if (settling.current.length) { reset(); settling.current = []; } }, 600);
    const before = d.target > d.from ? d.chips[d.target + 1]?.id ?? null : slot.id;
    browser.move(d.id, before);
    // Posé parmi les onglets d'un groupe : il le rejoint ; sinon il en sort.
    const group = browser.groupOf(slot.id);
    if (group) browser.addToGroup(d.id, group.id);
    else browser.removeFromGroup(d.id);
  };

  const tabChip = (t: BrowserTab, group?: TabGroup) => (
    <div key={t.id} role="button" tabIndex={0} title={`${t.title}\n${t.url}`} data-tab={t.id}
      className={`ptab${t.id === pane.activeTab ? " ptab--active" : ""}${group ? " ptab--grouped" : ""}`}
      style={group ? ({ "--group": group.color } as CSSProperties) : undefined}
      onClick={() => !suppressClick.current && browser.activate(t.id)}
      onAuxClick={(e) => e.button === 1 && browser.close(t.id)}
      onContextMenu={(e) => tabMenu(e, t)}
      onPointerDown={(e) => startDrag(e, t)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}>
      {t.loading ? <span className="spinner" /> : <Favicon src={siteIcon(t.url)} size={15} />}
      <span className="ptab__title">{t.title || hostname(t.url)}</span>
      {(t.audible || t.muted) && (
        <button className={`ptab__sound${t.muted ? " ptab__sound--muted" : ""}`}
          aria-label={t.muted ? "Réactiver le son" : "Couper le son"} title={t.muted ? "Réactiver le son" : "Couper le son"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); browser.tabAction(t.id, t.muted ? "unmute" : "mute"); }}>
          <Icon name={t.muted ? "mute" : "volume"} size={13} />
        </button>
      )}
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
          <button className="tgroup__chip" title={`${item.group.name || "Groupe"} · ${item.tabs.length} onglet${item.tabs.length > 1 ? "s" : ""} (clic droit : options)`}
            onClick={() => browser.updateGroup(item.group.id, { collapsed: !item.group.collapsed })}
            onContextMenu={(e) => groupMenu(e, item.group)}>
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
