import type { Brave } from "../browser/adapter";
import type { NavAction } from "../brave/types";
import { Favicon } from "../components/Favicon";
import { Icon, type IconName } from "../components/Icon";
import { hostname } from "../components/siteIcon";
import "./ActiveTabWidget.css";

const navButtons: { action: NavAction; icon: IconName; label: string }[] = [
  { action: "back", icon: "back", label: "Précédent" },
  { action: "forward", icon: "forward", label: "Suivant" },
  { action: "reload", icon: "reload", label: "Recharger" },
];

/** Carte vedette : onglet actif de la fenêtre Brave au premier plan, avec la navigation. */
export function ActiveTabWidget({ brave }: { brave: Brave }) {
  const tab = brave.activeTab;
  return (
    <section className="hero glass w-active">
      <div className="hero__label">Onglet actif</div>
      {tab ? (
        <div className="hero__body" key={tab.id}>
          <span className="hero__icon"><Favicon src={tab.favIconUrl} size={30} /></span>
          <div className="hero__text">
            <div className="hero__title">{tab.title || "Sans titre"}</div>
            <div className="hero__url">{hostname(tab.url)}</div>
          </div>
        </div>
      ) : (
        <p className="muted hero__empty">{brave.connected ? "Aucun onglet." : "Brave n'est pas connecté."}</p>
      )}
      <div className="hero__nav">
        {navButtons.map((b) => (
          <button key={b.action} className="hero__btn" disabled={!tab} aria-label={b.label} title={b.label}
            onClick={() => brave.send({ type: "navigate", action: b.action })}>
            <Icon name={b.icon} size={18} />
          </button>
        ))}
      </div>
    </section>
  );
}
