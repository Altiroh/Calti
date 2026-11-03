import { useLayoutEffect, useRef, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { type Browser, type BrowserTab, type ProfileId, type TabGroup } from "../browser/useBrowser";
import { Favicon } from "./Favicon";
import { openGroupDialog } from "./GroupDialog";
import { Icon } from "./Icon";
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
 * Clic droit : menu natif (affiché par-dessus les pages) sur l'onglet ou le groupe.
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
    Menu.new({
      items: [
        { id: "new-group", text: "Ajouter à un nouveau groupe…", action: () => openGroupDialog({ kind: "create", tabId: tab.id, ...at }) },
        ...(others.length ? [{
          text: "Ajouter au groupe",
          items: others.map((g) => ({ id: `group-${g.id}`, text: g.name || "Groupe sans nom", action: () => browser.addToGroup(tab.id, g.id) })),
        }] : []),
        ...(current ? [{ id: "ungroup-tab", text: `Retirer du groupe « ${current.name || "sans nom"} »`, action: () => browser.removeFromGroup(tab.id) }] : []),
        { item: "Separator" as const },
        { id: "reload", text: "Recharger", action: () => { invoke("browser_action", { id: tab.id, action: "reload" }).catch(() => {}); } },
        { id: "duplicate", text: "Dupliquer l'onglet", action: () => browser.go(tab.url, profile, true) },
        { id: "copy", text: "Copier l'adresse", action: () => { navigator.clipboard.writeText(tab.url).catch(() => {}); } },
        { item: "Separator" as const },
        { id: "close", text: "Fermer l'onglet\tCtrl+W", action: () => browser.close(tab.id) },
        { id: "close-others", text: "Fermer les autres onglets", enabled: siblings.length > 0, action: () => siblings.forEach((t) => browser.close(t.id)) },
      ],
    }).then((menu) => menu.popup()).catch(() => {});
  };

  const groupMenu = (e: MouseEvent, group: TabGroup) => {
    e.preventDefault();
    const at = below(e);
    Menu.new({
      items: [
        { id: "edit", text: "Nom et couleur…", action: () => openGroupDialog({ kind: "edit", groupId: group.id, ...at }) },
        { id: "collapse", text: group.collapsed ? "Déplier" : "Replier", action: () => browser.updateGroup(group.id, { collapsed: !group.collapsed }) },
        { item: "Separator" as const },
        { id: "ungroup", text: "Dissocier (garder les onglets)", action: () => browser.ungroup(group.id) },
        { id: "close-group", text: "Fermer le groupe", action: () => browser.closeGroup(group.id) },
      ],
    }).then((menu) => menu.popup()).catch(() => {});
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
