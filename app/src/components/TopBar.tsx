import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Brave } from "../brave/useBrave";
import { braveNameOf, type BraveInstall } from "../brave/useBraveInstalls";
import { useSettings } from "../settings/settings";
import { withTransition } from "../motion";
import { Icon } from "./Icon";
import "./TopBar.css";

/** Barre supérieure : choix du profil Brave, état de la liaison et contrôles de fenêtre. */
export function TopBar({ brave, installs }: { brave: Brave; installs: BraveInstall[] }) {
  const win = getCurrentWindow();
  const { themeFor, profileName } = useSettings();

  return (
    <header className="topbar" data-tauri-drag-region>
      {brave.profiles.length > 0 ? (
        <div className="profiles glass" role="tablist" aria-label="Profil Brave">
          {brave.profiles.map((p, i) => (
            <button key={p.id} role="tab" aria-selected={p.id === brave.profile?.id}
              className={`profiles__tab${p.id === brave.profile?.id ? " profiles__tab--on" : ""}`}
              onClick={() => withTransition(() => brave.selectProfile(p.id))}>
              <span className="profiles__dot" style={{ background: themeFor(p.id).accent }} />
              {profileName(p.id, i, braveNameOf(installs, p.id))}
              <span className="profiles__count">{p.snapshot?.tabs.length ?? 0}</span>
            </button>
          ))}
        </div>
      ) : (
        <span className="pill glass"><span className="pill__dot" />{brave.launching ? "Ouverture de Brave…" : "Brave fermé"}</span>
      )}

      <span className="topbar__spacer" data-tauri-drag-region />
      {brave.error && <span className="pill glass pill--error">{brave.error}</span>}

      <div className="topbar__controls glass">
        <button className="wc" onClick={() => win.minimize()} aria-label="Réduire"><Icon name="minimize" size={15} /></button>
        <button className="wc" onClick={() => win.toggleMaximize()} aria-label="Agrandir"><Icon name="maximize" size={13} /></button>
        <button className="wc wc--close" onClick={() => win.close()} aria-label="Fermer"><Icon name="close" size={15} /></button>
      </div>
    </header>
  );
}
