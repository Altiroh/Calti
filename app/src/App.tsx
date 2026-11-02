import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BookmarkNode } from "./brave/types";
import { useBraveInstalls } from "./brave/useBraveInstalls";
import { profileView } from "./browser/adapter";
import { defaultProfileNames, PROFILE_IDS, useBrowser, type ProfileId } from "./browser/useBrowser";
import { BookmarksDrawer } from "./components/BookmarksDrawer";
import { BrowserPane } from "./components/BrowserPane";
import { renderBlock } from "./components/HomeBlocks";
import { HomeGrid } from "./components/HomeGrid";
import { LayoutEditor } from "./components/LayoutEditor";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { Sidebar } from "./components/Sidebar";
import { dragWindow } from "./components/dragWindow";
import { WindowControls } from "./components/WindowControls";
import { withTransition } from "./motion";
import { useBackground } from "./settings/backgrounds";
import type { Block } from "./settings/layout";
import { applyTheme, useSettings } from "./settings/settings";

export type DrawerName = "bookmarks" | "settings" | null;

/** Favoris de chaque profil, lus dans le profil Brave associé (Réglages). */
function useBookmarks(sources: Record<ProfileId, string | null>) {
  const [bookmarks, setBookmarks] = useState<Record<ProfileId, BookmarkNode[] | null>>({ personnel: null, pro: null });
  const key = JSON.stringify(sources);
  useEffect(() => {
    for (const profile of PROFILE_IDS) {
      const dir = sources[profile];
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

export function App() {
  const browser = useBrowser();
  const installs = useBraveInstalls();
  const { themeFor, profileName } = useSettings();
  const [drawer, setDrawer] = useState<DrawerName>(null);
  const [editingLayout, setEditingLayout] = useState(false);
  const toggle = (name: Exclude<DrawerName, null>) => setDrawer((d) => (d === name ? null : name));

  // L'environnement (fond, couleurs) suit le profil du volet actif.
  const focused = browser.focused;
  const theme = themeFor(focused);
  const background = useBackground(focused, theme.background);
  useEffect(() => applyTheme(theme), [theme]);

  // Favoris : profil Brave choisi dans les Réglages, sinon le n-ième profil Brave trouvé.
  const sources = Object.fromEntries(PROFILE_IDS.map((p, i) => {
    const chosen = themeFor(p).bookmarksFrom;
    return [p, chosen === undefined ? installs[i]?.dir ?? null : chosen];
  })) as Record<ProfileId, string | null>;
  const bookmarks = useBookmarks(sources);

  // Les pages (vues natives) passent au-dessus de l'interface : on les masque pendant l'édition.
  useEffect(() => browser.setSuspended(editingLayout), [editingLayout]);

  const labelOf = (p: ProfileId) => profileName(p, PROFILE_IDS.indexOf(p), defaultProfileNames[p]);
  const homeFor = (profile: ProfileId) => {
    const view = profileView(browser, profile, bookmarks[profile]);
    const t = themeFor(profile);
    return <HomeGrid layout={t.layout} render={(block: Block) => renderBlock(block, view, t, () => setDrawer("bookmarks"))} />;
  };

  const tint = parseInt(theme.tint.slice(1), 16);
  const ambiance = {
    "--dim": theme.dim,
    "--tint": `${(tint >> 16) & 255}, ${(tint >> 8) & 255}, ${tint & 255}`,
    "--vignette": theme.vignette,
    "--grain": theme.grain,
  } as CSSProperties;

  const visiblePanes = browser.split ? PROFILE_IDS : [focused];

  return (
    <div className={`shell tone-${theme.tone}${drawer ? " shell--drawer" : ""}`}>
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

      <Sidebar profiles={PROFILE_IDS.map((p) => ({ id: p, label: labelOf(p), accent: themeFor(p).accent, tabs: browser.tabsOf(p).length }))}
        focused={focused} onProfile={(p) => withTransition(() => browser.focus(p as ProfileId))}
        drawer={drawer} onToggle={toggle} split={browser.split}
        onHome={() => browser.home()} onToggleSplit={() => withTransition(() => browser.setSplit(!browser.split))} />

      <div className="page">
        {editingLayout ? (
          <>
            <div className="drag-bar" onMouseDown={dragWindow}><WindowControls /></div>
            <div className="page__inner">
              <LayoutEditor key={focused} themeKey={focused} profileLabel={labelOf(focused)}
                render={(block) => renderBlock(block, profileView(browser, focused, bookmarks[focused]), theme, () => {})}
                onClose={() => setEditingLayout(false)} />
            </div>
          </>
        ) : (
          <div className={`panes${browser.split ? " panes--split" : ""}`}>
            {visiblePanes.map((p, i) => (
              <BrowserPane key={p} browser={browser} profile={p} label={labelOf(p)} accent={themeFor(p).accent}
                home={homeFor(p)} controls={i === visiblePanes.length - 1 ? <WindowControls /> : null} />
            ))}
          </div>
        )}
      </div>

      {browser.error && <div className="toast glass">{browser.error}</div>}

      <BookmarksDrawer open={drawer === "bookmarks"} bookmarks={bookmarks[focused]}
        send={(c) => c.type === "openUrl" && browser.go(c.url, focused, true)}
        onClose={() => setDrawer(null)} />
      <SettingsDrawer open={drawer === "settings"} themeKey={focused} profileIndex={PROFILE_IDS.indexOf(focused)}
        installs={installs} bookmarksSource={sources[focused]}
        onClose={() => setDrawer(null)}
        onEditLayout={() => {
          setDrawer(null);
          withTransition(() => setEditingLayout(true));
        }} />
    </div>
  );
}
