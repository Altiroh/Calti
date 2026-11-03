import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Browser } from "../browser/useBrowser";
import type { ProfileSettings } from "../settings/settings";
import { dragWindow } from "./dragWindow";
import { Icon } from "./Icon";
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
}

/** Volet de navigation d'un profil : une seule barre (navigation, adresse, onglets), puis le contenu. */
export function BrowserPane({ browser, profile, split, choices, onChooseProfile, home, controls }: Props) {
  const id = profile.id;
  const tabs = browser.tabsOf(id);
  const pane = browser.pane(id);
  const active = tabs.find((t) => t.id === pane.activeTab) ?? null;
  const focused = browser.focused === id;
  const [draft, setDraft] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const address = useRef<HTMLInputElement>(null);

  // Ctrl+L : barre d'adresse du volet principal.
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
    if (draft?.trim()) browser.go(draft, id);
    setDraft(null);
    address.current?.blur();
  };

  const secure = active?.url.startsWith("https://");
  const others = choices.filter((p) => p.id !== id);

  return (
    <section className={`pane${focused ? " pane--focused" : ""}`} style={{ "--pane-accent": profile.color } as CSSProperties}>
      <header className="pane__bar glass" onMouseDown={dragWindow}>
        {split && (
          <button className="pane__who" title={`${profile.name} · changer le profil de ce volet`}
            aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}>
            <ProfileBadge profile={profile} size={26} />
          </button>
        )}

        <div className="pane__nav">
          <button className="icon-btn" disabled={!active} aria-label="Précédent" title="Précédent"
            onClick={() => browser.action("back", id)}>
            <Icon name="back" size={16} />
          </button>
          <button className="icon-btn" disabled={!active} aria-label="Suivant" title="Suivant"
            onClick={() => browser.action("forward", id)}>
            <Icon name="forward" size={16} />
          </button>
          <button className="icon-btn" disabled={!active} aria-label={active?.loading ? "Arrêter" : "Recharger"}
            title={active?.loading ? "Arrêter" : "Recharger"}
            onClick={() => browser.action(active?.loading ? "stop" : "reload", id)}>
            <Icon name={active?.loading ? "close" : "reload"} size={15} />
          </button>
        </div>

        <form className="pane__address" onSubmit={submit}>
          {active && <span className={`pane__lock${secure ? "" : " pane__lock--off"}`}><Icon name={secure ? "lock" : "globe"} size={13} /></span>}
          <input ref={address} value={draft ?? active?.url ?? ""} spellCheck={false}
            placeholder={`Rechercher ou saisir une adresse · ${profile.name}`}
            onFocus={(e) => { browser.focus(id); setDraft(e.target.value); requestAnimationFrame(() => e.target.select()); }}
            onBlur={() => setDraft(null)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && address.current?.blur()} />
        </form>

        {choosing ? (
          // Choix du profil de ce volet, sur place (un menu flottant passerait sous la page).
          <div className="pane__choices">
            {others.map((p) => (
              <button key={p.id} className="pane__choice" onClick={() => { onChooseProfile(p.id); setChoosing(false); }}>
                <ProfileBadge profile={p} size={22} />
                <span>{p.name}</span>
              </button>
            ))}
            <button className="icon-btn" aria-label="Annuler" onClick={() => setChoosing(false)}><Icon name="close" size={13} /></button>
          </div>
        ) : (
          <TabStrip browser={browser} profile={id} />
        )}

        <button className="icon-btn pane__detach" title="Ouvrir ce profil dans sa propre fenêtre"
          aria-label="Détacher dans une nouvelle fenêtre" onClick={() => browser.newWindow(id, true)}>
          <Icon name="popout" size={15} />
        </button>
        {controls}
      </header>

      <div className="pane__content" ref={(el) => browser.registerSlot(id, el)}>
        {pane.activeTab == null && <div className="pane__home">{home}</div>}
      </div>
    </section>
  );
}
