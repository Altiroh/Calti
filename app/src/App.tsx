import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "./browser/windowEvents";
import type { BookmarkNode } from "./brave/types";
import { useBraveInstalls } from "./brave/useBraveInstalls";
import { profileView } from "./browser/adapter";
import { mergeBookmarks, suggest, useCaltiBookmarks, useHistory } from "./browser/library";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { APP_EVENT, FULLSCREEN_EVENT, PROFILE_SWITCH_EVENT, useBrowser, type Cutout, type ProfileId } from "./browser/useBrowser";
import { useBlockerSync } from "./browser/blocker";
import { Drawer } from "./components/Drawer";
import { DownloadsDrawer } from "./components/DownloadsDrawer";
import { Palette, type PaletteCommand } from "./components/Palette";
import { MenuHost } from "./components/ContextMenu";
import { usePageMenu } from "./browser/pageMenu";
import { GroupDialog, useGroupDialogRequest } from "./components/GroupDialog";
import { BookmarksDrawer } from "./components/BookmarksDrawer";
import { BrowserPane } from "./components/BrowserPane";
import { ProfileBadge, readableOn } from "./components/ProfileBadge";
import { dragWindow } from "./components/dragWindow";
import { renderBlock, type HomeContext } from "./components/HomeBlocks";
import { HomeGrid } from "./components/HomeGrid";
import { LayoutEditor } from "./components/LayoutEditor";
import { SettingsDrawer, type SettingsTab } from "./components/SettingsDrawer";
import { RAIL_NARROW, Sidebar } from "./components/Sidebar";
import { WindowControls } from "./components/WindowControls";
import { withTransition } from "./motion";
import { ProfileSwitcher } from "./components/ProfileSwitcher";
import { ClaudePanel } from "./widgets/ClaudePanel";
import { claudeLogoUrl } from "./components/BrandIcons";
import { DockedPlayer, FloatingPlayer, RailPlayer, type PlayerDock } from "./widgets/MediaWidget";
import { askClaude, CLAUDE_EVENT, CLAUDE_HOME, claudeUrl, type ClaudeRequest } from "./browser/claude";
import { useBackground } from "./settings/backgrounds";
import type { Block } from "./settings/layout";
import { useClipboardRecorder } from "./widgets/clipboard";
import { useGridRuler } from "./widgets/gridRuler";
import { useWindowIdentity } from "./browser/windowIdentity";
import { RulerWidget } from "./widgets/RulerWidget";
import type { BarWidget } from "./settings/settings";
import { applyTheme, searchEngines, useSettings } from "./settings/settings";

export type DrawerName = "bookmarks" | "settings" | "downloads" | "history" | null;

const RAIL_KEY = "calti.rail";

/** Favoris de chaque profil, lus dans le profil Brave associé (Réglages). */
function useBookmarks(sources: Record<ProfileId, string | null>) {
  const [bookmarks, setBookmarks] = useState<Record<ProfileId, BookmarkNode[] | null>>({});
  const key = JSON.stringify(sources);
  useEffect(() => {
    for (const [profile, dir] of Object.entries(sources)) {
      if (!dir) {
        setBookmarks((b) => ({ ...b, [profile]: null }));
        continue;
      }
      invoke<BookmarkNode[]>("brave_bookmarks", { dir })
        .then((tree) => setBookmarks((b) => ({ ...b, [profile]: tree })))
        .catch(() => setBookmarks((b) => ({ ...b, [profile]: null })));
    }
  }, [key]);
  return bookmarks;
}

/** Largeur de la barre latérale, retenue d'une ouverture à l'autre. */
function useRailWidth() {
  const [width, setWidth] = useState(() => {
    try { return Number(localStorage.getItem(RAIL_KEY)) || RAIL_NARROW; } catch { return RAIL_NARROW; }
  });
  const [resizing, setResizing] = useState(false);
  const onResize = useCallback((w: number, done: boolean) => {
    setWidth(w);
    setResizing(!done);
    if (done) try { localStorage.setItem(RAIL_KEY, String(w)); } catch { /* non persisté */ }
  }, []);
  return { width, resizing, onResize };
}

export function App() {
  const settings = useSettings();
  const { theme, profile, profileIds, updateTheme } = settings;
  const installs = useBraveInstalls();
  const prefsOf = useCallback((p: ProfileId) => {
    const s = profile(p);
    return { searchUrl: searchEngines[s.search].url, startPage: s.startPage };
  }, [profile]);
  // Plein écran (F11) : contenu seul ; le badge du profil, discret, permet d'en sortir.
  const [fullscreen, setFullscreen] = useState(false);
  const [exitHover, setExitHover] = useState(false);
  const fullscreenRef = useRef(false);
  const toggleFullscreen = useCallback(() => {
    const on = !fullscreenRef.current;
    fullscreenRef.current = on;
    getCurrentWindow().setFullscreen(on).catch(() => {});
    setFullscreen(on);
    setExitHover(false);
  }, []);
  useEffect(() => {
    window.addEventListener(FULLSCREEN_EVENT, toggleFullscreen);
    return () => window.removeEventListener(FULLSCREEN_EVENT, toggleFullscreen);
  }, [toggleFullscreen]);
  // Plein écran demandé par une page (vidéo) : fenêtre en plein écran, cette page seule, sans badge.
  const [pageFullscreen, setPageFullscreen] = useState<number | null>(null);
  useEffect(() => {
    const unlisten = listen<[number, boolean]>("browser:page-fullscreen", async (e) => {
      const [tab, on] = e.payload;
      // Seule la fenêtre qui affiche cet onglet passe en plein écran.
      const own = await invoke<{ id: number; window: string }[]>("browser_tabs").catch(() => []);
      if (!own.some((t) => t.id === tab && t.window === getCurrentWindow().label)) return;
      setPageFullscreen((current) => (on ? tab : current === tab ? null : current));
      // La fenêtre ne quitte le plein écran que si F11 ne l'y avait pas mise.
      if (!fullscreenRef.current) getCurrentWindow().setFullscreen(on).catch(() => {});
    });
    return () => { unlisten.then((u) => u()); };
  }, []);
  const immersive = fullscreen || pageFullscreen != null;
  // Place du badge (voir .fullscreen-exit) : les pages y sont découpées pour le laisser voir.
  // Dialogue de groupe d'onglets (clic droit sur un onglet), lui aussi découpé dans les pages.
  const groupDialog = useGroupDialogRequest();
  const [dialogRect, setDialogRect] = useState<Cutout | null>(null);
  // Suggestions de la barre d’adresse, elles aussi découpées dans les pages.
  const [suggestRect, setSuggestRect] = useState<Cutout | null>(null);
  // Palette de commandes (Ctrl+K), ouverte pour un profil ; elle aussi découpée dans les pages.
  const [palette, setPalette] = useState<ProfileId | null>(null);
  const [paletteRect, setPaletteRect] = useState<Cutout | null>(null);
  // Menus contextuels (et leurs sous-menus), découpés eux aussi.
  const [menuRects, setMenuRects] = useState<Cutout[]>([]);
  // Mini-lecteur flottant, découpé lui aussi.
  const [playerRect, setPlayerRect] = useState<Cutout | null>(null);
  // Sélecteur de profils (Alt+²), découpé lui aussi.
  const [switcherRect, setSwitcherRect] = useState<Cutout | null>(null);
  const cutouts = [
    ...menuRects,
    ...(palette && paletteRect ? [paletteRect] : []),
    ...(fullscreen && pageFullscreen == null ? [{ x: 10, y: 10, width: exitHover ? 236 : 44, height: 44 }] : []),
    ...(groupDialog.request && dialogRect ? [dialogRect] : []),
    ...(suggestRect ? [suggestRect] : []),
    ...(switcherRect ? [switcherRect] : []),
    ...(playerRect ? [playerRect] : []),
  ];
  const browser = useBrowser(profileIds, prefsOf, immersive ? 0 : theme.chrome.pageRadius, cutouts);
  const claudeOn = theme.chrome.railWidgets.includes("claude");
  usePageMenu(browser.pages, claudeOn);
  const rail = useRailWidth();
  const [drawer, setDrawer] = useState<DrawerName>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [editingLayout, setEditingLayout] = useState(false);
  // Widget ouvert à côté de la page, par profil (barre du haut ou barre latérale).
  const [panels, setPanels] = useState<Record<ProfileId, BarWidget | null>>({});
  const setPanel = useCallback((p: ProfileId, kind: BarWidget | null) => setPanels((s) => ({ ...s, [p]: kind })), []);
  const toggle = (name: Exclude<DrawerName, null>) => setDrawer((d) => (d === name ? null : name));

  // Le style est celui de l'application, quel que soit le profil affiché.
  const focused = browser.focused;
  // Profils du plus récemment affiché au plus ancien, pour le sélecteur (comme Alt+Tab).
  const [recent, setRecent] = useState<ProfileId[]>([]);
  useEffect(() => setRecent((r) => [focused, ...r.filter((p) => p !== focused)]), [focused]);
  const byRecent = [...profileIds].sort((a, b) => {
    const ra = recent.indexOf(a);
    const rb = recent.indexOf(b);
    return (ra < 0 ? 1e3 + profileIds.indexOf(a) : ra) - (rb < 0 ? 1e3 + profileIds.indexOf(b) : rb);
  });
  const background = useBackground(settings.backgroundKey, theme.background);
  useEffect(() => applyTheme(theme), [theme]);

  // Favoris : profil Brave choisi dans les Réglages, sinon le n-ième profil Brave trouvé.
  const sources = Object.fromEntries(profileIds.map((p, i) => {
    const chosen = profile(p).bookmarksFrom;
    return [p, chosen === undefined ? installs[i]?.dir ?? null : chosen];
  })) as Record<ProfileId, string | null>;
  const braveBookmarks = useBookmarks(sources);
  const own = useCaltiBookmarks(profileIds);
  const history = useHistory(profileIds, browser.tabs);
  // Favoris de Calti (étoile, Ctrl+D) en tête de ceux de Brave.
  const bookmarks = Object.fromEntries(profileIds.map((p) => [p, mergeBookmarks(own.of(p), braveBookmarks[p] ?? null)]));

  // Pages affichées partout : le décor est caché derrière, ses animations et sa parallaxe s'arrêtent.
  const browsing = !editingLayout && (browser.split ? [browser.focused, browser.secondary] : [browser.focused])
    .every((p) => browser.pane(p).activeTab != null);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-browsing", browsing);
  }, [browsing]);
  useEffect(() => {
    // Fenêtre réduite ou cachée : plus rien ne s'anime.
    const onVisibility = () => document.documentElement.toggleAttribute("data-hidden", document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Les pages (vues natives) passent au-dessus de l'interface : on les masque pendant l'édition.
  useEffect(() => browser.setSuspended(editingLayout), [editingLayout]);

  useClipboardRecorder();
  useBlockerSync(profileIds.filter((p) => profile(p).blockAds !== false));

  // Palette, téléchargements, historique : demandés au clavier (page ou interface) ou depuis un menu.
  useEffect(() => {
    const onPalette = (e: Event) => setPalette((current) => (current ? null : (e as CustomEvent<ProfileId>).detail));
    const onDownloads = () => setDrawer((d) => (d === "downloads" ? null : "downloads"));
    const onHistory = () => setDrawer((d) => (d === "history" ? null : "history"));
    window.addEventListener(APP_EVENT.palette, onPalette);
    window.addEventListener(APP_EVENT.downloads, onDownloads);
    window.addEventListener(APP_EVENT.history, onHistory);
    return () => {
      window.removeEventListener(APP_EVENT.palette, onPalette);
      window.removeEventListener(APP_EVENT.downloads, onDownloads);
      window.removeEventListener(APP_EVENT.history, onHistory);
    };
  }, []);

  // Liens ouverts depuis d'autres applications (Calti navigateur par défaut) : nouveaux onglets de la fenêtre
  // principale, au lancement (après la reprise de la session) puis à chaque lien reçu.
  const browserRef = useRef(browser);
  browserRef.current = browser;
  // « Demander à Claude » (clic droit, palette, panneau) : panneau Claude du profil ouvert sur la question.
  useEffect(() => {
    const onClaude = (e: Event) => {
      const { profile: p, prompt } = (e as CustomEvent<ClaudeRequest>).detail;
      setPanel(p, "claude");
      browserRef.current.openPanelPage(p, prompt ? claudeUrl(prompt) : CLAUDE_HOME, !!prompt);
    };
    window.addEventListener(CLAUDE_EVENT, onClaude);
    return () => window.removeEventListener(CLAUDE_EVENT, onClaude);
  }, [setPanel]);
  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    const open = (urls: string[]) => urls.forEach((url) => browserRef.current.go(url, browserRef.current.focused, true));
    const timer = setTimeout(() => invoke<string[]>("take_launch_urls").then(open).catch(() => {}), 1200);
    const unlisten = listen<string[]>("browser:open-urls", (e) => open(e.payload));
    return () => {
      clearTimeout(timer);
      unlisten.then((u) => u());
    };
  }, []);

  // Barre latérale « bord renflé » demandée : appliquée une fois aux réglages existants (modifiable ensuite).
  useEffect(() => {
    try {
      if (localStorage.getItem("calti.edge-rail")) return;
      localStorage.setItem("calti.edge-rail", "1");
    } catch { return; }
    if (theme.chrome.railStyle !== "edge") updateTheme({ chrome: { ...theme.chrome, railStyle: "edge" } });
  }, []);

  // Mots de passe repris de Brave au lancement : on en donne le résultat.
  const [importNotice, setImportNotice] = useState<string | null>(null);
  useEffect(() => {
    invoke<{ profile: string; imported: number; already: number; error: string | null }[] | null>("password_import_result")
      .then((results) => results && setImportNotice(results.map((r) => r.error
        ? `${profile(r.profile).name} : import des mots de passe impossible (${r.error})`
        : `${profile(r.profile).name} : ${r.imported} mot(s) de passe importé(s), ${r.already} déjà présent(s)`).join(" · ")))
      .catch(() => {});
  }, []);
  // Téléchargement lancé depuis une page de cette fenêtre : signalé, le panneau reste à un raccourci.
  useEffect(() => {
    const unlisten = listen<number>("browser:download-started", () => setImportNotice("Téléchargement en cours · Ctrl+J pour le suivre"));
    return () => { unlisten.then((u) => u()); };
  }, []);
  useEffect(() => {
    if (!importNotice) return;
    const timer = setTimeout(() => setImportNotice(null), 9000);
    return () => clearTimeout(timer);
  }, [importNotice]);

  const homeContext = (p: ProfileId): HomeContext => ({
    brave: profileView(browser, p, bookmarks[p] ?? null),
    theme,
    profile: profile(p),
    history: { entries: history.of(p), clear: () => history.clear(p), remove: (at) => history.remove(p, at) },
    onShowAllBookmarks: () => setDrawer("bookmarks"),
    suggest: (input) => suggest(p, input, own.of(p), prefsOf(p).searchUrl),
    searchEngine: theme.chrome.webSuggestions
      ? (theme.chrome.suggestFrom === "profile" ? profile(p).search : theme.chrome.suggestFrom) : null,
  });

  const paletteCommands = (p: ProfileId): PaletteCommand[] => {
    const active = browser.pane(p).activeTab;
    const tab = browser.tabs.find((t) => t.id === active);
    const openSettings = (t: SettingsTab) => () => { setSettingsTab(t); setDrawer("settings"); };
    return [
      { label: "Nouvel onglet", keys: "Ctrl+T", icon: "plus", run: () => browser.newTab(p) },
      ...(claudeOn ? [
        { label: "Claude", icon: "spark" as const, image: claudeLogoUrl, run: () => askClaude(p) },
        ...(tab ? [{ label: "Résumer la page avec Claude", icon: "spark" as const, image: claudeLogoUrl,
          run: () => askClaude(p, `Résume cette page en français, en quelques points clés :\n${tab.title}\n${tab.url}`) }] : []),
      ] : []),
      ...(profileIds.length > 1 ? [{ label: "Changer de profil", keys: "Alt+²", icon: "user" as const,
        run: () => window.dispatchEvent(new CustomEvent(PROFILE_SWITCH_EVENT, { detail: { back: false, held: false } })) }] : []),
      { label: "Rouvrir l'onglet fermé", keys: "Ctrl+Maj+T", icon: "reload", run: () => browser.reopen(p) },
      { label: "Nouvelle fenêtre", keys: "Ctrl+N", icon: "window", run: () => browser.newWindow(p) },
      { label: "Téléchargements", keys: "Ctrl+J", icon: "download", run: () => setDrawer("downloads") },
      { label: "Historique", keys: "Ctrl+H", icon: "history", run: () => setDrawer("history") },
      { label: "Favoris", icon: "star", run: () => setDrawer("bookmarks") },
      { label: "Plein écran", keys: "F11", icon: "maximize", run: toggleFullscreen },
      { label: "Accueil", icon: "home", run: () => browser.home(p) },
      ...(tab ? [
        { label: "Recharger sans le cache", keys: "Ctrl+F5", icon: "reload" as const, run: () => browser.action("hard-reload", p) },
        { label: tab.muted ? "Réactiver le son de l'onglet" : "Couper le son de l'onglet", icon: "volume" as const, run: () => browser.action(tab.muted ? "unmute" : "mute", p) },
        { label: "Zoom : taille réelle", keys: "Ctrl+0", icon: "search" as const, run: () => browser.action("zoom-reset", p) },
        { label: "Fermer l'onglet", keys: "Ctrl+W", icon: "close" as const, run: () => browser.close(tab.id) },
      ] : []),
      { label: "Réglages généraux", icon: "settings", run: openSettings("general") },
      { label: "Profils", icon: "user", run: openSettings("profiles") },
      { label: "Apparence", icon: "palette", run: openSettings("appearance") },
      { label: "Confidentialité et données des sites", icon: "shield", run: openSettings("general") },
      { label: "Modifier la disposition de l'accueil", icon: "layout", run: () => withTransition(() => setEditingLayout(true)) },
    ];
  };

  const homeFor = (p: ProfileId) => {
    const context = homeContext(p);
    return <HomeGrid layout={theme.layout} render={(block: Block) => renderBlock(block, context)} />;
  };

  const tint = parseInt(theme.tint.slice(1), 16);
  const ambiance = {
    "--dim": theme.dim,
    "--tint": `${(tint >> 16) & 255}, ${(tint >> 8) & 255}, ${tint & 255}`,
    "--vignette": theme.vignette,
    "--grain": theme.grain,
  } as CSSProperties;

  const visiblePanes = browser.split ? [focused, browser.secondary] : [focused];
  // Barre des tâches : badge du profil affiché et titre de sa page.
  const shownTab = browser.tabs.find((t) => t.id === browser.pane(focused).activeTab);
  useWindowIdentity(profile(focused), shownTab?.title || null);
  // Règle et grille : dessinées dans les pages affichées quand l’outil est activé.
  const visibleTabs = visiblePanes.map((p) => browser.pane(p).activeTab).filter((id): id is number => id != null);
  useGridRuler(browser, visibleTabs);

  // Habillage (Réglages → Interface) : variables et attributs lus par styles/chrome.css.
  const c = theme.chrome;
  // Mini-lecteur : caché pendant la modification de l'accueil et en plein écran.
  const playerOn = c.mediaFloat && !editingLayout && !immersive;
  const playerProps = {
    setDock: (mediaDock: PlayerDock) => updateTheme({ chrome: { ...c, mediaDock } }),
    onHide: () => updateTheme({ chrome: { ...c, mediaFloat: false } }),
  };
  const edgeDock = playerOn && (c.mediaDock === "top" || c.mediaDock === "bottom" || c.mediaDock === "right") ? c.mediaDock : null;
  const chromeVars = {
    "--rail-width": c.railStyle === "edge" ? "58px" : `${rail.width}px`,
    "--win-pad": `${c.windowPadding}px`,
    "--ui-gap": `${c.gap}px`,
    "--bar-radius": `${c.barRadius}px`,
    "--bar-height": `${c.barHeight}px`,
    "--rail-radius": `${c.railRadius}px`,
    "--tab-radius": `${c.tabRadius}px`,
    "--tab-max": `${c.tabMaxWidth}px`,
    "--page-radius": `${c.pageRadius}px`,
    // Style global : arrondis des panneaux, cartes et menus, densité, flou et opacité du verre.
    "--radius-sm": `${Math.round(c.radius * 0.75)}px`,
    "--radius-md": `${c.radius}px`,
    "--radius-lg": `${Math.round(c.radius * 1.375)}px`,
    "--radius-xl": `${Math.round(c.radius * 1.75)}px`,
    "--menu-radius": `${Math.min(c.radius, 22)}px`,
    "--density": c.density,
    "--glass-blur": `${c.glassBlur}px`,
    "--menu-alpha": c.surface === "solid" ? 0.97 : Math.min(0.92, Math.max(0.72, theme.glassOpacity + 0.4)),
    "--edge-color": c.edgeOpacity == null ? c.edgeColor
      : `rgba(${parseInt(c.edgeColor.slice(1, 3), 16)}, ${parseInt(c.edgeColor.slice(3, 5), 16)}, ${parseInt(c.edgeColor.slice(5, 7), 16)}, ${c.edgeOpacity})`,
    ...(c.edgeOpacity != null ? { "--edge-alpha": c.edgeOpacity } : {}),
  } as CSSProperties;
  const profiles = profileIds.map(profile);

  return (
    <div className={`shell tone-${theme.tone}${immersive ? " shell--fullscreen" : ""}${pageFullscreen != null ? " shell--page-fullscreen" : ""}${drawer ? " shell--drawer" : ""}${rail.resizing ? " shell--resizing" : ""}${c.motion ? "" : " no-motion"}${edgeDock === "right" ? " shell--dock-right" : ""}`}
      style={chromeVars}
      data-surface={c.surface} data-bar={c.barStyle} data-bar-surface={c.barSurface} data-address={c.addressWidth}
      data-rail={c.railStyle} data-rail-surface={c.railSurface}
      data-edge={c.railStyle === "edge" ? c.edgeSurface : undefined}
      data-edge-tone={c.railStyle === "edge" && c.edgeSurface === "color" ? (readableOn(c.edgeColor) === "#fff" ? "light" : "dark") : undefined}
      data-tab-close={c.tabClose} data-tab-active={c.tabActive} data-tab-icons={c.tabIconsOnly || undefined}>
      {c.customCss.trim() && <style>{c.customCss}</style>}
      <div className="scenery" aria-hidden="true" style={ambiance}>
        {background ? (
          <div className="scenery__image" key={background}
            style={{ backgroundImage: `url("${background}")`, filter: theme.blur ? `blur(${theme.blur}px)` : undefined }} />
        ) : (
          <>
            <span className="scenery__mountain scenery__mountain--far" />
            <span className="scenery__mountain scenery__mountain--near" />
          </>
        )}
        <span className="scenery__mist scenery__mist--a" />
        <span className="scenery__mist scenery__mist--b" />
        {(background || theme.dim > 0.15 || theme.tint !== "#080e1a") && <div className="scenery__dim" />}
        {theme.vignette > 0 && <div className="scenery__vignette" />}
        {theme.spotlight && <div className="scenery__spot" />}
        {theme.grain > 0 && <div className="scenery__grain" />}
      </div>

      <Sidebar width={c.railStyle === "edge" ? RAIL_NARROW : rail.width} onResize={rail.onResize}
        profiles={profiles} focused={focused} tabCount={(p) => browser.tabsOf(p).length}
        onProfile={(p) => withTransition(() => browser.focus(p))}
        onProfileWindow={(p) => browser.newWindow(p)}
        onManageProfiles={() => { setSettingsTab("profiles"); setDrawer("settings"); }}
        items={browser.strip(focused)} activeTab={browser.pane(focused).activeTab}
        onToggleGroup={(g) => browser.updateGroup(g, { collapsed: !browser.groups.find((x) => x.id === g)?.collapsed })}
        onActivate={browser.activate} onCloseTab={browser.close}
        drawer={drawer} onToggle={toggle}
        onHome={() => browser.home()} onNewTab={() => browser.newTab()}
        widgets={c.railWidgets} panel={panels[focused] ?? null} onPanel={(kind) => setPanel(focused, kind)}
        player={playerOn && c.mediaDock === "rail" ? (wide) => <RailPlayer wide={wide} {...playerProps} /> : undefined} />

      <div className="page">
        {edgeDock === "top" && <DockedPlayer dock="top" {...playerProps} />}
        {editingLayout ? (
          <>
            <div className="drag-bar" onMouseDown={dragWindow}><WindowControls /></div>
            <div className="page__inner">
              <LayoutEditor
                render={(block) => renderBlock(block, { ...homeContext(focused), onShowAllBookmarks: () => {} })}
                onClose={() => setEditingLayout(false)} />
            </div>
          </>
        ) : (
          <div className={`panes${browser.split && pageFullscreen == null ? " panes--split" : ""}`}>
            {/* Vidéo en plein écran : seul le volet de sa page reste. */}
            {(pageFullscreen != null && visiblePanes.some((v) => browser.pane(v).activeTab === pageFullscreen)
              ? visiblePanes.filter((v) => browser.pane(v).activeTab === pageFullscreen) : visiblePanes).map((p, i) => (
              <BrowserPane key={p} browser={browser} profile={profile(p)} split={browser.split} choices={profiles}
                onChooseProfile={(chosen) => withTransition(() => (i === 0 ? browser.focus(chosen) : browser.setSecondary(chosen)))}
                home={homeFor(p)} controls={i === visiblePanes.length - 1 ? <WindowControls /> : null}
                isBookmarked={(url) => own.has(p, url)} onToggleBookmark={(url, title) => own.toggle(p, url, title)}
                onMoreSettings={() => { setSettingsTab("appearance"); setDrawer("settings"); }}
                onZoomSettings={() => { setSettingsTab("general"); setDrawer("settings"); }}
                panel={panels[p] ?? null} onPanel={(kind) => setPanel(p, kind)}
                suggest={(input) => suggest(p, input, own.of(p), prefsOf(p).searchUrl)} onSuggestRect={setSuggestRect}
                renderWidget={(kind) => kind === "ruler"
                  ? <RulerWidget visibleTabs={visibleTabs} />
                  : kind === "claude" ? <ClaudePanel browser={browser} profile={p} />
                  : renderBlock({ kind, x: 0, y: 0, w: 4, h: 8 }, homeContext(p))} />
            ))}
          </div>
        )}
        {edgeDock === "bottom" && <DockedPlayer dock="bottom" {...playerProps} />}
      </div>
      {edgeDock === "right" && <DockedPlayer dock="right" {...playerProps} />}

      {/* Toujours présent (caché hors plein écran) : l’image du profil est déjà chargée quand il apparaît. */}
      <button className={`fullscreen-exit${exitHover ? " fullscreen-exit--open" : ""}`} hidden={!fullscreen || pageFullscreen != null} onClick={toggleFullscreen}
        onMouseEnter={() => setExitHover(true)} onMouseLeave={() => setExitHover(false)} title="Quitter le plein écran (F11)">
        <ProfileBadge profile={profile(focused)} size={36} />
        <span className="fullscreen-exit__label">Quitter le plein écran</span>
      </button>

      {palette && (
        <Palette browser={browser} profile={palette} onClose={() => setPalette(null)} onRect={setPaletteRect}
          suggest={(input) => suggest(palette, input, own.of(palette), prefsOf(palette).searchUrl)}
          commands={paletteCommands(palette)} />
      )}

      <MenuHost onRects={setMenuRects} />

      {playerOn && c.mediaDock === "free" && <FloatingPlayer onRect={setPlayerRect} {...playerProps} />}

      <ProfileSwitcher profiles={byRecent.map(profile)} onRect={setSwitcherRect}
        onPick={(p) => withTransition(() => browser.focus(p))}
        info={(p) => {
          const active = browser.tabs.find((t) => t.id === browser.pane(p).activeTab);
          return { tabs: browser.tabsOf(p).length, page: active ? { title: active.title, url: active.url } : null };
        }} />

      {groupDialog.request && (
        <GroupDialog key={JSON.stringify(groupDialog.request)} request={groupDialog.request} browser={browser}
          onClose={groupDialog.close} onRect={setDialogRect} />
      )}

      {browser.error && <div className="toast glass">{browser.error}</div>}
      {importNotice && !browser.error && <div className="toast toast--info glass">{importNotice}</div>}

      <BookmarksDrawer open={drawer === "bookmarks"} bookmarks={bookmarks[focused] ?? null}
        send={(c) => c.type === "openUrl" && browser.go(c.url, focused, true)}
        onClose={() => setDrawer(null)} />
      <DownloadsDrawer open={drawer === "downloads"} onClose={() => setDrawer(null)} />
      <Drawer open={drawer === "history"} title="Historique" onClose={() => setDrawer(null)}>
        {drawer === "history" && renderBlock({ kind: "history", x: 0, y: 0, w: 4, h: 12 }, homeContext(focused))}
      </Drawer>
      <SettingsDrawer open={drawer === "settings"} tab={settingsTab} onTab={setSettingsTab}
        installs={installs} bookmarkSources={sources}
        onClose={() => setDrawer(null)}
        onEditLayout={() => {
          setDrawer(null);
          withTransition(() => setEditingLayout(true));
        }} />
    </div>
  );
}
