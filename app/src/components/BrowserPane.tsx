import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from "react";
import type { Suggestion } from "../browser/library";
import { useSuggestions } from "../browser/webSuggestions";
import { APP_EVENT, PANE_EVENT, type Browser, type Cutout } from "../browser/useBrowser";
import { useSiteAllowed } from "../browser/blocker";
import { withTransition } from "../motion";
import { barWidgetLabels, useSettings, type BarWidget, type ChromeSettings, type ProfileSettings } from "../settings/settings";
import { dragWindow } from "./dragWindow";
import { Favicon } from "./Favicon";
import { Icon } from "./Icon";
import { openMenu, type MenuEntry } from "./ContextMenu";
import { DevtoolsPanel, useDevtoolsDock } from "./DevtoolsPanel";
import { invoke } from "@tauri-apps/api/core";
import { siteIcon } from "./siteIcon";
import { ProfileBadge } from "./ProfileBadge";
import { TabStrip } from "./TabStrip";
import "./BrowserPane.css";

interface Props {
  browser: Browser;
  profile: ProfileSettings;
  /** Vue partagée : chaque volet montre son profil et permet d'en changer. */
  split: boolean;
  /** Profils proposés pour ce volet (vue partagée). */
  choices: ProfileSettings[];
  onChooseProfile: (id: string) => void;
  /** Page d'accueil du volet, affichée quand aucun onglet n'est ouvert. */
  home: ReactNode;
  /** Boutons de fenêtre, au bout de la barre du volet de droite. */
  controls?: ReactNode;
  /** Favoris de Calti : la page affichée y est-elle, et bascule. */
  isBookmarked: (url: string) => boolean;
  onToggleBookmark: (url: string, title: string) => void;
  /** Ouvre les réglages du zoom (Général). */
  onZoomSettings: () => void;
  /** Réglages → Interface. */
  onMoreSettings: () => void;
  /** Widget ouvert à côté de la page (barre du haut ou barre latérale), et son contenu. */
  panel: BarWidget | null;
  onPanel: (kind: BarWidget | null) => void;
  renderWidget: (kind: BarWidget) => ReactNode;
  /** Suggestions pour la saisie (recherches passées, favoris, historique du profil). */
  suggest: (input: string) => Suggestion[];
  /** Place de la liste de suggestions, retirée des pages pour la laisser voir. */
  onSuggestRect: (rect: Cutout | null) => void;
}

/** Éléments de la barre qui gardent leur propre menu (clic droit). */
const OWN_MENU = "button, a, input, .ptab, .tgroup";

/** Volet de navigation d'un profil : une seule barre (navigation, adresse, onglets), puis le contenu. */
export function BrowserPane({
  browser, profile, split, choices, onChooseProfile, home, controls, isBookmarked, onToggleBookmark, onMoreSettings, onZoomSettings, panel, onPanel, renderWidget, suggest, onSuggestRect,
}: Props) {
  const id = profile.id;
  const { theme, updateTheme } = useSettings();
  const c = theme.chrome;
  const show = c.barButtons;
  const tabs = browser.tabsOf(id);
  const pane = browser.pane(id);
  const active = tabs.find((t) => t.id === pane.activeTab) ?? null;
  const focused = browser.focused === id;
  const [draft, setDraft] = useState<string | null>(null);
  // Suggestions : seulement une fois que l’on tape (pas pour l’adresse affichée au focus).
  const [typed, setTyped] = useState(false);
  const [picked, setPicked] = useState(-1);
  const query = typed ? draft ?? "" : "";
  const suggestions = useSuggestions(query.trim() ? suggest(query) : [], query, c.webSuggestions ? (c.suggestFrom === "profile" ? profile.search : c.suggestFrom) : null);
  const [menu, setMenu] = useState<"profiles" | null>(null);
  const shownPanel = panel;

  // Échap referme le widget ouvert.
  useEffect(() => {
    if (!shownPanel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onPanel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shownPanel, onPanel]);
  const address = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  const bookmarked = !!active && isBookmarked(active.url);
  const toggleBookmark = useRef(() => {});
  toggleBookmark.current = () => active && onToggleBookmark(active.url, active.title);

  // Ctrl+L, F6 (saisie d'adresse) et Ctrl+D (favori), y compris depuis une page.
  useEffect(() => {
    const onAddress = (e: Event) => {
      if ((e as CustomEvent).detail !== id) return;
      address.current?.focus();
      address.current?.select();
    };
    const onBookmark = (e: Event) => (e as CustomEvent).detail === id && toggleBookmark.current();
    // Nouvel onglet : le curseur va dans la recherche de l'accueil (une fois affiché), sinon dans l'adresse.
    const onSearch = (e: Event) => {
      if ((e as CustomEvent).detail !== id) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const home = root.current?.querySelector<HTMLInputElement>(".pane__home .search__input");
        (home ?? address.current)?.focus();
      }));
    };
    window.addEventListener(PANE_EVENT.search, onSearch);
    window.addEventListener(PANE_EVENT.address, onAddress);
    window.addEventListener(PANE_EVENT.bookmark, onBookmark);
    return () => {
      window.removeEventListener(PANE_EVENT.address, onAddress);
      window.removeEventListener(PANE_EVENT.bookmark, onBookmark);
      window.removeEventListener(PANE_EVENT.search, onSearch);
    };
  }, [id]);

  const go = (input: string) => {
    if (input.trim()) browser.go(input, id);
    setDraft(null);
    setTyped(false);
    address.current?.blur();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = suggestions[picked];
    go(s ? s.url ?? s.text : draft ?? "");
  };

  // Clic droit sur un espace libre de la barre : menu d'actions aux couleurs du thème.
  const onContextMenu = (e: MouseEvent) => {
    if ((e.target as Element).closest(OWN_MENU)) return;
    e.preventDefault();
    const setButton = (key: keyof ChromeSettings["barButtons"]) => () =>
      updateTheme({ chrome: { ...c, barButtons: { ...c.barButtons, [key]: !c.barButtons[key] } } });
    const send = (name: string) => () => window.dispatchEvent(new CustomEvent(name, { detail: id }));
    const zoom = Math.round((active?.zoom ?? 1) * 100);
    const items: MenuEntry[] = [
      { header: active ? active.title || "Page" : "Navigation" },
      { label: "Précédent", icon: "back", tone: "slate", disabled: !active, action: () => browser.action("back", id) },
      { label: "Suivant", icon: "forward", tone: "slate", disabled: !active, action: () => browser.action("forward", id) },
      { label: "Recharger", icon: "reload", tone: "blue", shortcut: "F5", disabled: !active, action: () => browser.action("reload", id) },
      { label: "Recharger sans le cache", icon: "reload", tone: "teal", shortcut: "Ctrl+F5", disabled: !active, action: () => browser.action("hard-reload", id) },
      "-",
      {
        label: bookmarked ? "Retirer des favoris" : "Ajouter aux favoris", icon: "star", tone: "amber", shortcut: "Ctrl+D",
        disabled: !active, action: () => toggleBookmark.current(),
      },
      { label: "Copier l'adresse", icon: "link", tone: "violet", disabled: !active, action: () => active && navigator.clipboard.writeText(active.url).catch(() => {}) },
      {
        label: "Zoom de la page", icon: "zoomIn", tone: "teal", value: `${zoom} %`, disabled: !active,
        items: [
          { label: "Agrandir", icon: "zoomIn", tone: "teal", shortcut: "Ctrl+Plus", action: () => browser.action("zoom-in", id) },
          { label: "Réduire", icon: "zoomOut", tone: "teal", shortcut: "Ctrl+Moins", action: () => browser.action("zoom-out", id) },
          { label: "Zoom par défaut", icon: "zoomReset", tone: "slate", shortcut: "Ctrl+0", action: () => browser.action("zoom-reset", id) },
          "-",
          { label: "Réglages du zoom…", icon: "settings", tone: "slate", action: onZoomSettings },
        ],
      },
      {
        label: active?.muted ? "Réactiver le son de l'onglet" : "Couper le son de l'onglet", icon: active?.muted ? "sound" : "mute", tone: "pink",
        disabled: !active, action: () => browser.action(active?.muted ? "unmute" : "mute", id),
      },
      "-",
      { label: "Palette de commandes", icon: "command", tone: "violet", shortcut: "Ctrl+K", action: send(APP_EVENT.palette) },
      { label: "Téléchargements", icon: "download", tone: "green", shortcut: "Ctrl+J", action: send(APP_EVENT.downloads) },
      { label: "Historique", icon: "history", tone: "blue", shortcut: "Ctrl+H", action: send(APP_EVENT.history) },
      "-",
      { label: "Nouvel onglet", icon: "plus", tone: "green", shortcut: "Ctrl+T", action: () => browser.newTab(id) },
      { label: "Rouvrir l'onglet fermé", icon: "undo", tone: "amber", shortcut: "Ctrl+Maj+T", action: () => browser.reopen(id) },
      { label: "Nouvelle fenêtre", icon: "window", tone: "blue", shortcut: "Ctrl+N", action: () => browser.newWindow(id) },
      { label: "Ouvrir ce profil dans sa propre fenêtre", icon: "popout", tone: "slate", action: () => browser.newWindow(id, true) },
      {
        label: "Deux profils côte à côte", icon: "split", tone: "violet", checked: browser.split, disabled: choices.length < 2,
        action: () => withTransition(() => browser.setSplit(!browser.split)),
      },
      "-",
      {
        label: "Afficher dans la barre", icon: "layout", tone: "slate",
        items: [
          { label: "Précédent / suivant", icon: "back", tone: "slate", checked: c.barButtons.nav, action: setButton("nav") },
          { label: "Recharger", icon: "reload", tone: "blue", checked: c.barButtons.reload, action: setButton("reload") },
          { label: "Favori", icon: "star", tone: "amber", checked: c.barButtons.star, action: setButton("star") },
        ],
      },
      {
        label: "Outils de développement", icon: "code", tone: "slate",
        items: [
          {
            label: active && browser.devtoolsOpen(active.id) ? "Fermer les outils de la page" : "Inspecter la page (éléments, console, réseau)",
            icon: "inspect", tone: "violet", shortcut: "F12", disabled: !active, action: () => browser.toggleDevtools(id),
          },
          { label: "Ouvrir les outils dans une fenêtre à part", icon: "popout", tone: "slate", disabled: !active, action: () => browser.action("devtools", id) },
          "-",
          { label: "Inspecter l'interface de Calti", icon: "layout", tone: "pink", action: () => { invoke("ui_devtools").catch(() => {}); } },
        ],
      },
      { label: "Personnaliser l'interface…", icon: "palette", tone: "pink", action: onMoreSettings },
    ];
    openMenu(e, items);
  };

  // Outils de développement ancrés (F12) : à droite de la page ou dessous.
  const [dock, setDock] = useDevtoolsDock();
  const tools = active && browser.devtoolsOpen(active.id)
    ? <DevtoolsPanel browser={browser} profile={id} tabId={active.id} dock={dock} onDock={setDock} />
    : null;
  const content = (
    <div className="pane__content" data-profile={id} ref={(el) => browser.registerSlot(id, el)}>
      {pane.activeTab == null && <div className="pane__home">{home}</div>}
    </div>
  );

  const secure = active?.url.startsWith("https://");
  const [siteAllowed, toggleSiteAllowed] = useSiteAllowed(id, active?.url);
  const others = choices.filter((p) => p.id !== id);

  return (
    <section ref={root} className={`pane${focused ? " pane--focused" : ""}`} style={{ "--pane-accent": profile.color } as CSSProperties}>
      <header className="pane__bar glass" onMouseDown={dragWindow} onContextMenu={onContextMenu}>
        {split && (
          <button className="pane__who" title={`${profile.name} · changer le profil de ce volet`}
            aria-expanded={menu === "profiles"} onClick={() => setMenu((m) => (m === "profiles" ? null : "profiles"))}>
            <ProfileBadge profile={profile} size={26} />
          </button>
        )}

        {(show.nav || show.reload) && (
          <div className="pane__nav">
            {show.nav && (
              <>
                <button className="icon-btn" disabled={!active} aria-label="Précédent" title="Précédent"
                  onClick={() => browser.action("back", id)}>
                  <Icon name="back" size={16} />
                </button>
                <button className="icon-btn" disabled={!active} aria-label="Suivant" title="Suivant"
                  onClick={() => browser.action("forward", id)}>
                  <Icon name="forward" size={16} />
                </button>
              </>
            )}
            {show.reload && (
              <button className="icon-btn" disabled={!active} aria-label={active?.loading ? "Arrêter" : "Recharger"}
                title={active?.loading ? "Arrêter" : "Recharger (F5) · sans le cache : Ctrl+F5"}
                onClick={(e) => browser.action(active?.loading ? "stop" : e.ctrlKey || e.shiftKey ? "hard-reload" : "reload", id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!active) return;
                  openMenu(e, [
                    { header: "Recharger la page" },
                    { label: "Recharger", icon: "reload", tone: "blue", shortcut: "F5", action: () => browser.action("reload", id) },
                    { label: "Recharger sans le cache", icon: "reload", tone: "teal", shortcut: "Ctrl+F5", action: () => browser.action("hard-reload", id) },
                    { label: "Vider le cache et recharger", icon: "trash", tone: "amber", action: () => browser.action("empty-cache-reload", id) },
                  ]);
                }}>
                <Icon name={active?.loading ? "close" : "reload"} size={15} />
              </button>
            )}
          </div>
        )}

        <form className="pane__address" onSubmit={submit}>
          {active && <span className={`pane__lock${secure ? "" : " pane__lock--off"}`}><Icon name={secure ? "lock" : "globe"} size={13} /></span>}
          <input ref={address} value={draft ?? active?.url ?? ""} spellCheck={false}
            placeholder={`Rechercher ou saisir une adresse · ${profile.name}`}
            onFocus={(e) => { browser.focus(id); setDraft(e.target.value); requestAnimationFrame(() => e.target.select()); }}
            onBlur={() => { setDraft(null); setTyped(false); setPicked(-1); }}
            onChange={(e) => { setDraft(e.target.value); setTyped(true); setPicked(-1); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") address.current?.blur();
              else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && suggestions.length) {
                e.preventDefault();
                // De -1 (la saisie elle-même) à la dernière suggestion, en boucle.
                const n = suggestions.length;
                setPicked((p) => (e.key === "ArrowDown" ? (p + 1 >= n ? -1 : p + 1) : (p - 1 < -1 ? n - 1 : p - 1)));
              }
            }} />
          {active && Math.abs(active.zoom - 1) > 0.001 && (
            <button type="button" className="pane__chip" title="Zoom de ce site · cliquer pour revenir à 100 % (Ctrl+0)"
              onClick={() => browser.action("zoom-reset", id)}>
              {Math.round(active.zoom * 100)} %
            </button>
          )}
          {active && siteAllowed !== null && profile.blockAds !== false && (
            <button type="button" className={`pane__chip pane__shield${siteAllowed ? " pane__shield--off" : ""}`}
              title={siteAllowed
                ? "Blocage des publicités suspendu sur ce site · cliquer pour le réactiver"
                : `${active.blocked} publicité(s) et traqueur(s) bloqué(s) · cliquer pour suspendre le blocage sur ce site`}
              onClick={() => { toggleSiteAllowed(); browser.action("reload", id); }}>
              <Icon name="shield" size={13} />
              {!siteAllowed && active.blocked > 0 && <span>{active.blocked > 99 ? "99+" : active.blocked}</span>}
            </button>
          )}
          {show.star && active && (
            <button type="button" className={`pane__star${bookmarked ? " pane__star--on" : ""}`}
              aria-pressed={bookmarked} title={bookmarked ? "Retirer des favoris (Ctrl+D)" : "Ajouter aux favoris (Ctrl+D)"}
              onClick={() => toggleBookmark.current()}>
              <Icon name="star" size={15} />
            </button>
          )}
          {suggestions.length > 0 && (
            <SuggestionList items={suggestions} picked={picked} query={draft ?? ""} onPick={(s) => go(s.url ?? s.text)} onRect={onSuggestRect} />
          )}
        </form>

        {menu === "profiles" ? (
          // Choix du profil de ce volet, sur place (un menu flottant passerait sous la page).
          <div className="pane__choices">
            {others.map((p) => (
              <button key={p.id} className="pane__choice" onClick={() => { onChooseProfile(p.id); setMenu(null); }}>
                <ProfileBadge profile={p} size={22} />
                <span>{p.name}</span>
              </button>
            ))}
            <button className="icon-btn" aria-label="Annuler" onClick={() => setMenu(null)}><Icon name="close" size={13} /></button>
          </div>
        ) : (
          <TabStrip browser={browser} profile={id} />
        )}

        {controls}
      </header>

      <div className="pane__body">
        {tools && dock.side === "bottom" ? <div className="pane__stack">{content}{tools}</div> : <>{content}{tools}</>}
        {/* Widget ouvert depuis la barre : la page se resserre à côté (une vue native passerait par-dessus). */}
        {shownPanel && (
          <aside className="pane__panel" key={shownPanel} aria-label={barWidgetLabels[shownPanel]}>
            {renderWidget(shownPanel)}
          </aside>
        )}
      </div>
    </section>
  );
}

const kindIcon = { search: "search", history: "history", bookmark: "star" } as const;

/** Mots saisis mis en gras dans la suggestion. */
function highlight(text: string, query: string): ReactNode {
  const i = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (!query.trim() || i < 0) return text;
  const end = i + query.trim().length;
  return <>{text.slice(0, i)}<strong>{text.slice(i, end)}</strong>{text.slice(end)}</>;
}

/** Suggestions sous la barre d’adresse ; la page est découpée à leur place (onRect) pour les laisser voir. */
export function SuggestionList({ items, picked, query, onPick, onRect }: {
  items: Suggestion[];
  picked: number;
  query: string;
  onPick: (s: Suggestion) => void;
  onRect: (rect: Cutout | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    const radius = box.current ? parseFloat(getComputedStyle(box.current).borderTopLeftRadius) || 16 : 16;
    onRect(r ? { x: r.left - 2, y: r.top - 2, width: r.width + 4, height: r.height + 4, radius: radius + 2 } : null);
  }, [items.length]);
  useEffect(() => () => onRect(null), []);
  return (
    <div ref={box} className="suggest glass" role="listbox">
      {items.map((s, i) => (
        <div key={(s.url ?? "?") + s.text} role="option" aria-selected={i === picked}
          className={`suggest__item${i === picked ? " suggest__item--on" : ""}`}
          // mousedown : avant que la barre d’adresse perde le focus (et ferme la liste).
          onMouseDown={(e) => { e.preventDefault(); onPick(s); }}>
          {/* Page connue (historique, favori) : icône du site, avec un repère de sa provenance ; recherche : loupe. */}
          {s.url ? (
            <span className="suggest__icon suggest__icon--site" title={s.kind === "bookmark" ? "Favori" : "Historique"}>
              <Favicon src={siteIcon(s.url)} size={16} />
              <span className="suggest__kind"><Icon name={kindIcon[s.kind]} size={8} /></span>
            </span>
          ) : (
            <span className="suggest__icon"><Icon name="search" size={13} /></span>
          )}
          <span className="suggest__text">{highlight(s.text, query)}</span>
          {s.url && <span className="suggest__url">{s.url.replace(/^https?:\/\/(www\.)?/, "")}</span>}
        </div>
      ))}
    </div>
  );
}
