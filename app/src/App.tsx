import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BookmarkNode } from "./brave/types";
import { useBraveInstalls } from "./brave/useBraveInstalls";
import { profileView } from "./browser/adapter";
import { useBrowser, type ProfileId } from "./browser/useBrowser";
import { BookmarksDrawer } from "./components/BookmarksDrawer";
import { BrowserPane } from "./components/BrowserPane";
import { dragWindow } from "./components/dragWindow";
import { renderBlock } from "./components/HomeBlocks";
import { HomeGrid } from "./components/HomeGrid";
import { LayoutEditor } from "./components/LayoutEditor";
import { SettingsDrawer, type SettingsTab } from "./components/SettingsDrawer";
import { RAIL_NARROW, Sidebar } from "./components/Sidebar";
import { WindowControls } from "./components/WindowControls";
import { withTransition } from "./motion";
import { useBackground } from "./settings/backgrounds";
import type { Block } from "./settings/layout";
import { applyTheme, BACKGROUND_KEY, searchEngines, useSettings } from "./settings/settings";

export type DrawerName = "bookmarks" | "settings" | null;

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
  const { theme, profile, profileIds } = settings;
  const installs = useBraveInstalls();
  const prefsOf = useCallback((p: ProfileId) => {
    const s = profile(p);
    return { searchUrl: searchEngines[s.search].url, startPage: s.startPage };
  }, [profile]);
  const browser = useBrowser(profileIds, prefsOf, theme.chrome.pageRadius);
  const rail = useRailWidth();
  const [drawer, setDrawer] = useState<DrawerName>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [editingLayout, setEditingLayout] = useState(false);
  const toggle = (name: Exclude<DrawerName, null>) => setDrawer((d) => (d === name ? null : name));

  // Le style est celui de l'application, quel que soit le profil affiché.
  const focused = browser.focused;
  const background = useBackground(BACKGROUND_KEY, theme.background);
  useEffect(() => applyTheme(theme), [theme]);

  // Favoris : profil Brave choisi dans les Réglages, sinon le n-ième profil Brave trouvé.
  const sources = Object.fromEntries(profileIds.map((p, i) => {
    const chosen = profile(p).bookmarksFrom;
    return [p, chosen === undefined ? installs[i]?.dir ?? null : chosen];
  })) as Record<ProfileId, string | null>;
  const bookmarks = useBookmarks(sources);

  // Les pages (vues natives) passent au-dessus de l'interface : on les masque pendant l'édition.
  useEffect(() => browser.setSuspended(editingLayout), [editingLayout]);

  const homeFor = (p: ProfileId) => {
    const view = profileView(browser, p, bookmarks[p] ?? null);
    return <HomeGrid layout={theme.layout} render={(block: Block) => renderBlock(block, view, theme, () => setDrawer("bookmarks"))} />;
  };

  const tint = parseInt(theme.tint.slice(1), 16);
  const ambiance = {
    "--dim": theme.dim,
    "--tint": `${(tint >> 16) & 255}, ${(tint >> 8) & 255}, ${tint & 255}`,
    "--vignette": theme.vignette,
    "--grain": theme.grain,
  } as CSSProperties;

  const visiblePanes = browser.split ? [focused, browser.secondary] : [focused];

  // Habillage (Réglages → Interface) : variables et attributs lus par styles/chrome.css.
  const c = theme.chrome;
  const chromeVars = {
    "--rail-width": `${rail.width}px`,
    "--win-pad": `${c.windowPadding}px`,
    "--ui-gap": `${c.gap}px`,
    "--bar-radius": `${c.barRadius}px`,
    "--bar-height": `${c.barHeight}px`,
    "--rail-radius": `${c.railRadius}px`,
    "--tab-radius": `${c.tabRadius}px`,
    "--tab-max": `${c.tabMaxWidth}px`,
    "--page-radius": `${c.pageRadius}px`,
  } as CSSProperties;
  const profiles = profileIds.map(profile);

  return (
    <div className={`shell tone-${theme.tone}${drawer ? " shell--drawer" : ""}${rail.resizing ? " shell--resizing" : ""}${c.motion ? "" : " no-motion"}`}
      style={chromeVars}
      data-bar={c.barStyle} data-bar-surface={c.barSurface}
      data-rail={c.railStyle} data-rail-surface={c.railSurface}
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

      <Sidebar width={rail.width} onResize={rail.onResize}
        profiles={profiles} focused={focused} tabCount={(p) => browser.tabsOf(p).length}
        onProfile={(p) => withTransition(() => browser.focus(p))}
        onManageProfiles={() => { setSettingsTab("profiles"); setDrawer("settings"); }}
        items={browser.strip(focused)} activeTab={browser.pane(focused).activeTab}
        onToggleGroup={(g) => browser.updateGroup(g, { collapsed: !browser.groups.find((x) => x.id === g)?.collapsed })}
        onActivate={browser.activate} onCloseTab={browser.close}
        drawer={drawer} onToggle={toggle} split={browser.split}
        onToggleSplit={() => withTransition(() => browser.setSplit(!browser.split))}
        onHome={() => browser.home()} onNewTab={() => browser.newTab()} />

      <div className="page">
        {editingLayout ? (
          <>
            <div className="drag-bar" onMouseDown={dragWindow}><WindowControls /></div>
            <div className="page__inner">
              <LayoutEditor
                render={(block) => renderBlock(block, profileView(browser, focused, bookmarks[focused] ?? null), theme, () => {})}
                onClose={() => setEditingLayout(false)} />
            </div>
          </>
        ) : (
          <div className={`panes${browser.split ? " panes--split" : ""}`}>
            {visiblePanes.map((p, i) => (
              <BrowserPane key={p} browser={browser} profile={profile(p)} split={browser.split} choices={profiles}
                onChooseProfile={(chosen) => withTransition(() => (i === 0 ? browser.focus(chosen) : browser.setSecondary(chosen)))}
                home={homeFor(p)} controls={i === visiblePanes.length - 1 ? <WindowControls /> : null} />
            ))}
          </div>
        )}
      </div>

      {browser.error && <div className="toast glass">{browser.error}</div>}

      <BookmarksDrawer open={drawer === "bookmarks"} bookmarks={bookmarks[focused] ?? null}
        send={(c) => c.type === "openUrl" && browser.go(c.url, focused, true)}
        onClose={() => setDrawer(null)} />
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
