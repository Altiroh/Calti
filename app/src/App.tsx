import { useEffect, useState, type CSSProperties } from "react";
import { useBrave } from "./brave/useBrave";
import { braveNameOf, useBraveInstalls } from "./brave/useBraveInstalls";
import { BookmarksDrawer } from "./components/BookmarksDrawer";
import { ConnectPanel } from "./components/ConnectPanel";
import { renderBlock } from "./components/HomeBlocks";
import { HomeGrid } from "./components/HomeGrid";
import { LayoutEditor } from "./components/LayoutEditor";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { withTransition } from "./motion";
import { useBackground } from "./settings/backgrounds";
import type { Block } from "./settings/layout";
import { applyTheme, useSettings } from "./settings/settings";

export type DrawerName = "bookmarks" | "settings" | null;

export function App() {
  const installs = useBraveInstalls();
  const brave = useBrave(installs);
  const { themeFor, profileName } = useSettings();
  const [drawer, setDrawer] = useState<DrawerName>(null);
  const [editingLayout, setEditingLayout] = useState(false);
  const [connectDismissed, setConnectDismissed] = useState(false);
  const showConnect = !connectDismissed && !editingLayout
    && (brave.profiles.length === 0 || installs.some((i) => !i.extensionInstalled));
  const toggle = (name: Exclude<DrawerName, null>) => setDrawer((d) => (d === name ? null : name));

  // Chaque profil Brave a son propre environnement.
  const themeKey = brave.profile?.id ?? "default";
  const theme = themeFor(themeKey);
  const background = useBackground(themeKey, theme.background);
  useEffect(() => applyTheme(theme), [theme]);

  const profileIndex = brave.profiles.findIndex((p) => p.id === themeKey);
  const profileLabel = profileIndex >= 0
    ? profileName(themeKey, profileIndex, braveNameOf(installs, themeKey))
    : "Environnement par défaut";
  const render = (block: Block) => renderBlock(block, brave, theme, () => setDrawer("bookmarks"));
  const tint = parseInt(theme.tint.slice(1), 16);
  const ambiance = {
    "--dim": theme.dim,
    "--tint": `${(tint >> 16) & 255}, ${(tint >> 8) & 255}, ${tint & 255}`,
    "--vignette": theme.vignette,
    "--grain": theme.grain,
  } as CSSProperties;

  return (
    <div className={`shell tone-${theme.tone}`}>
      <div className="scenery" aria-hidden="true" style={ambiance}>
        {background ? (
          <>
            <div className="scenery__image" key={background}
              style={{ backgroundImage: `url("${background}")`, filter: theme.blur ? `blur(${theme.blur}px)` : undefined }} />
          </>
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

      <Sidebar drawer={drawer} onToggle={toggle} send={brave.send} />

      <div className="page">
        <TopBar brave={brave} installs={installs} />
        <div className="page__inner">
          {editingLayout ? (
            <LayoutEditor key={themeKey} themeKey={themeKey} profileLabel={profileLabel} render={render}
              onClose={() => setEditingLayout(false)} />
          ) : (
            <>
              {showConnect && (
                <ConnectPanel installs={installs} profiles={brave.profiles} onDismiss={() => setConnectDismissed(true)} />
              )}
              <HomeGrid layout={theme.layout} render={render} />
            </>
          )}
        </div>
      </div>

      <BookmarksDrawer open={drawer === "bookmarks"} bookmarks={brave.bookmarks} send={brave.send}
        onClose={() => setDrawer(null)} />
      <SettingsDrawer open={drawer === "settings"} brave={brave} installs={installs} themeKey={themeKey}
        onClose={() => setDrawer(null)}
        onEditLayout={() => {
          setDrawer(null);
          withTransition(() => setEditingLayout(true));
        }} />
    </div>
  );
}
