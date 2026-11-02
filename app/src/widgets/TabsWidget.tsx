import { useState } from "react";
import type { Brave } from "../browser/adapter";
import { Card } from "../components/Card";
import { Favicon } from "../components/Favicon";
import { Icon } from "../components/Icon";
import { hostname } from "../components/siteIcon";
import "./TabsWidget.css";

/** Onglets Brave en temps réel, fenêtre par fenêtre. Un clic active l'onglet dans Brave. */
export function TabsWidget({ brave }: { brave: Brave }) {
  // Fenêtre choisie à la main ; par défaut, celle au premier plan dans Brave.
  const [pickedWindow, setPickedWindow] = useState<number | null>(null);
  const window = brave.windows.find((w) => w.id === pickedWindow)
    ?? brave.windows.find((w) => w.id === brave.focusedWindowId);
  const tabs = window?.tabs ?? [];

  return (
    <Card title="Onglets" className="w-tabs" action={
      <button className="chip-btn" onClick={() => brave.send({ type: "newTab" })}>
        + Nouvel onglet
      </button>
    }>
      {brave.windows.length > 1 && (
        <div className="tabs__windows">
          {brave.windows.map((w, i) => (
            <button key={w.id} className={`chip-btn${w.id === window?.id ? " chip-btn--on" : ""}`}
              onClick={() => setPickedWindow(w.id)}>
              Fenêtre {i + 1} · {w.tabs.length}
            </button>
          ))}
        </div>
      )}

      <div className="tabs__list">
        {tabs.map((tab) => (
          <div key={tab.id} role="button" tabIndex={0} title={tab.url}
            className={`tab-row inset${tab.active ? " tab-row--active" : ""}`}
            onClick={() => brave.send({ type: "activateTab", tabId: tab.id })}
            onKeyDown={(e) => e.key === "Enter" && brave.send({ type: "activateTab", tabId: tab.id })}
            onAuxClick={(e) => e.button === 1 && brave.send({ type: "closeTab", tabId: tab.id })}>
            <span className="tab-row__icon">
              {tab.loading ? <span className="spinner" /> : <Favicon src={tab.favIconUrl} />}
            </span>
            <span className="tab-row__text">
              <span className="tab-row__title">{tab.title || "Sans titre"}</span>
              <span className="tab-row__host">{hostname(tab.url)}</span>
            </span>
            {tab.pinned && <span className="tab-row__badge"><Icon name="pin" size={13} /></span>}
            {tab.audible && <span className="tab-row__badge"><Icon name="volume" size={14} /></span>}
            <button className="tab-row__close" aria-label="Fermer l'onglet"
              onClick={(e) => { e.stopPropagation(); brave.send({ type: "closeTab", tabId: tab.id }); }}>
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
        {!brave.connected && <p className="muted">Les onglets apparaîtront dès que l'extension Brave sera connectée.</p>}
      </div>
    </Card>
  );
}
