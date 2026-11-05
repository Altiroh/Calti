// Panneau Claude : la page claude.ai du profil (son compte, sans clé API), posée à côté de la page.
import { useCallback, useEffect } from "react";
import { askClaude, CLAUDE_HOME } from "../browser/claude";
import type { Browser, ProfileId } from "../browser/useBrowser";
import { Icon } from "../components/Icon";
import { ClaudeLogo } from "../components/BrandIcons";
import "./ClaudePanel.css";

export function ClaudePanel({ browser, profile }: { browser: Browser; profile: ProfileId }) {
  const page = browser.panelPage(profile);
  // Première ouverture : la page est créée (elle reste ensuite, cachée, avec la conversation en cours).
  useEffect(() => { browser.openPanelPage(profile, CLAUDE_HOME); }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps
  const slot = useCallback((el: HTMLDivElement | null) => browser.registerPanelSlot(profile, el), [profile, browser.registerPanelSlot]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = browser.tabs.find((t) => t.id === browser.pane(profile).activeTab);
  const summarize = () => active && askClaude(profile, `Résume cette page en français, en quelques points clés :\n${active.title}\n${active.url}`);

  return (
    <section className="claude card glass">
      <header className="claude__head">
        <span className="claude__logo"><ClaudeLogo size={17} color="#fff" /></span>
        <h2>Claude</h2>
        {page?.loading && <span className="spinner" />}
        <span className="claude__actions">
          <button className="claude__btn" disabled={!active} onClick={summarize}
            title={active ? `Résumer « ${active.title} »` : "Aucune page affichée"}>
            <Icon name="text" size={13} /> Résumer la page
          </button>
          <button className="claude__icon" title="Nouvelle conversation" aria-label="Nouvelle conversation"
            onClick={() => browser.openPanelPage(profile, CLAUDE_HOME, true)}><Icon name="plus" size={15} /></button>
          <button className="claude__icon" title="Recharger" aria-label="Recharger" disabled={!page}
            onClick={() => page && browser.tabAction(page.id, "reload")}><Icon name="reload" size={14} /></button>
          <button className="claude__icon" title="Ouvrir dans un onglet" aria-label="Ouvrir dans un onglet" disabled={!page}
            onClick={() => page && browser.go(page.url, profile, true)}><Icon name="popout" size={14} /></button>
        </span>
      </header>
      <div className="claude__page" ref={slot} data-panel-page={page?.id ?? ""}>
        <span className="claude__wait"><ClaudeLogo size={26} />Chargement de Claude…</span>
      </div>
    </section>
  );
}
