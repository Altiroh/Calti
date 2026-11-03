import { Card } from "../components/Card";
import { Check, Slider } from "../components/Controls";
import { clearGuides, useRulerSettings } from "./gridRuler";
import "./LibraryWidgets.css";

/** Réglages de l'outil règle et grille, ouvert à côté de la page. */
export function RulerWidget({ visibleTabs }: { visibleTabs: number[] }) {
  const [s, set] = useRulerSettings();
  const px = (v: number) => `${v} px`;
  return (
    <Card title="Règle et grille" action={(
      <button className={`chip-btn${s.enabled ? " chip-btn--on" : ""}`} aria-pressed={s.enabled} onClick={() => set({ enabled: !s.enabled })}>
        {s.enabled ? "Activée" : "Désactivée"}
      </button>
    )}>
      <div className="ruler-widget">
        <p className="settings__hint">
          Tirer depuis une règle pour poser un repère ; double-clic ou retour sur la règle pour le retirer.
          Les repères restent pour le site jusqu'à la fermeture de l'onglet.
        </p>
        <div className="settings__checks">
          <Check label="Règles et coordonnées" checked={s.rulers} onChange={(rulers) => set({ rulers })} />
          <Check label="Grille de colonnes" checked={s.grid} onChange={(grid) => set({ grid })} />
        </div>
        {s.grid && (
          <>
            <Slider label="Colonnes" value={s.columns} min={1} max={24} step={1} format={(v) => `${v}`} onChange={(columns) => set({ columns })} />
            <Slider label="Gouttière" value={s.gutter} min={0} max={80} step={2} format={px} onChange={(gutter) => set({ gutter })} />
            <Slider label="Largeur max" value={s.maxWidth} min={0} max={1920} step={20}
              format={(v) => (v ? `${v} px` : "pleine")} onChange={(maxWidth) => set({ maxWidth })} />
            <Slider label="Marges" value={s.margin} min={0} max={160} step={4} format={px} onChange={(margin) => set({ margin })} />
            <Slider label="Opacité" value={s.opacity} min={0.04} max={0.5} step={0.02}
              format={(v) => `${Math.round(v * 100)} %`} onChange={(opacity) => set({ opacity })} />
            <label className="ruler-widget__color">
              <span>Couleur</span>
              <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} />
            </label>
          </>
        )}
        <button className="chip-btn" disabled={!s.enabled} onClick={() => clearGuides(visibleTabs)}>Effacer les repères</button>
      </div>
    </Card>
  );
}
