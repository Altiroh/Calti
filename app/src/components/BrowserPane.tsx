import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Browser, ProfileId } from "../browser/useBrowser";
import { dragWindow } from "./dragWindow";
import { Favicon } from "./Favicon";
import { Icon } from "./Icon";
import { hostname, siteIcon } from "./siteIcon";
import "./BrowserPane.css";

interface Props {
  browser: Browser;
  profile: ProfileId;
  label: string;
  accent: string;
  /** Page d'accueil du volet, affichée quand aucun onglet n'est ouvert. */
  home: ReactNode;
  /** Boutons de fenêtre, au bout de la barre d’onglets du volet de droite. */
  controls?: ReactNode;
}

/** Volet de navigation d'un profil : onglets, barre d'adresse, contenu. */
export function BrowserPane({ browser, profile, label, accent, home, controls }: Props) {
  const tabs = browser.tabsOf(profile);
  const pane = browser.panes[profile];
  const active = tabs.find((t) => t.id === pane.activeTab) ?? null;
  const focused = browser.focused === profile;
  const [draft, setDraft] = useState<string | null>(null);
  const address = useRef<HTMLInputElement>(null);

  // Ctrl+L : barre d'adresse du volet actif.
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        address.current?.focus();
        address.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft?.trim()) browser.go(draft, profile);
    setDraft(null);
    address.current?.blur();
  };

  const secure = active?.url.startsWith("https://");

  return (
    <section className={`pane${focused ? " pane--focused" : ""}`} style={{ "--pane-accent": accent } as CSSProperties}
      onPointerDown={() => browser.focus(profile)}>
      <header className="pane__bar glass" onMouseDown={dragWindow}>
        <span className="pane__profile"><span className="pane__dot" />{label}</span>
        <div className="pane__tabs">
          {tabs.map((t) => (
            <div key={t.id} role="button" tabIndex={0} title={`${t.title}\n${t.url}`}
              className={`ptab${t.id === pane.activeTab ? " ptab--active" : ""}`}
              onClick={() => browser.activate(t.id)}
              onAuxClick={(e) => e.button === 1 && browser.close(t.id)}>
              {t.loading ? <span className="spinner" /> : <Favicon src={siteIcon(t.url)} size={15} />}
              <span className="ptab__title">{t.title || hostname(t.url)}</span>
              <button className="ptab__close" aria-label="Fermer l'onglet"
                onClick={(e) => { e.stopPropagation(); browser.close(t.id); }}>
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
          <button className={`ptab ptab--new${pane.activeTab == null ? " ptab--active" : ""}`}
            aria-label="Nouvel onglet" title="Nouvel onglet (page d'accueil)" onClick={() => browser.home(profile)}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        <button className="icon-btn pane__detach" title="Ouvrir ce profil dans une nouvelle fenêtre (Ctrl+N : fenêtre vide)"
          aria-label="Détacher dans une nouvelle fenêtre" onClick={() => browser.newWindow(profile, true)}>
          <Icon name="popout" size={15} />
        </button>
        {controls}
      </header>

      <div className="pane__toolbar glass" onMouseDown={dragWindow}>
        <button className="icon-btn" disabled={!active} aria-label="Précédent" onClick={() => browser.action("back", profile)}>
          <Icon name="back" size={17} />
        </button>
        <button className="icon-btn" disabled={!active} aria-label="Suivant" onClick={() => browser.action("forward", profile)}>
          <Icon name="forward" size={17} />
        </button>
        <button className="icon-btn" disabled={!active} aria-label={active?.loading ? "Arrêter" : "Recharger"}
          onClick={() => browser.action(active?.loading ? "stop" : "reload", profile)}>
          <Icon name={active?.loading ? "close" : "reload"} size={16} />
        </button>
        <button className="icon-btn" aria-label="Accueil" onClick={() => browser.home(profile)}>
          <Icon name="home" size={16} />
        </button>
        <form className="pane__address" onSubmit={submit}>
          {active && <span className={`pane__lock${secure ? "" : " pane__lock--off"}`}><Icon name={secure ? "lock" : "globe"} size={13} /></span>}
          <input ref={address} value={draft ?? active?.url ?? ""} spellCheck={false}
            placeholder={`Rechercher ou saisir une adresse · ${label}`}
            onFocus={(e) => { setDraft(e.target.value); requestAnimationFrame(() => e.target.select()); }}
            onBlur={() => setDraft(null)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && address.current?.blur()} />
        </form>
      </div>

      <div className="pane__content" ref={(el) => browser.registerSlot(profile, el)}>
        {pane.activeTab == null && <div className="pane__home">{home}</div>}
      </div>
    </section>
  );
}
