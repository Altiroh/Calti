import { useEffect, useState, type CSSProperties } from "react";
import { presetImageKey, useAppearancePresets, type AppearancePreset } from "../settings/appearancePresets";
import { useBackground } from "../settings/backgrounds";
import { useSettings } from "../settings/settings";
import { Icon } from "./Icon";

/** Miniature d'un préréglage : fond, barre latérale, barre du haut et accent, dessinés en petit. */
function Thumb({ preset }: { preset: AppearancePreset }) {
  const image = useBackground(presetImageKey(preset.id), preset.image ? preset.at : null);
  const l = preset.look;
  const c = l.chrome;
  const dark = l.tone === "light";
  const rail = c.railStyle === "edge"
    ? c.edgeSurface === "color" ? c.edgeColor : c.edgeSurface === "glass" ? "rgba(255,255,255,.55)" : "transparent"
    : c.railSurface === "none" ? "transparent" : dark ? "rgba(20,26,36,.7)" : "rgba(255,255,255,.7)";
  const style = {
    "--thumb-bg": image ? `center / cover url("${image}")` : dark ? `linear-gradient(160deg, #1d2a3d, ${l.tint})` : "linear-gradient(160deg, #eef3fb, #c9d6e8)",
    "--thumb-glass": dark ? `rgba(20,26,36,${l.glassOpacity})` : `rgba(255,255,255,${l.glassOpacity + 0.2})`,
    "--thumb-rail": rail,
    "--thumb-accent": l.accent,
    "--thumb-dim": l.dim,
  } as CSSProperties;
  return (
    <span className={`preset-thumb${c.railStyle === "edge" ? " preset-thumb--edge" : ""}`} style={style} aria-hidden="true">
      <span className="preset-thumb__rail" />
      <span className="preset-thumb__bar"><span className="preset-thumb__dot" /></span>
      <span className="preset-thumb__card" />
      <span className="preset-thumb__card preset-thumb__card--small" />
    </span>
  );
}

/**
 * Préréglages d'apparence : enregistrer le style actuel, le voir en grand au survol (aperçu non enregistré),
 * l'appliquer d'un clic.
 */
export function AppearancePresets() {
  const { theme, updateTheme, setPreview } = useSettings();
  const { presets, save, remove, resolve } = useAppearancePresets();
  const [name, setName] = useState("");
  const [naming, setNaming] = useState(false);

  // Fermeture des réglages pendant un survol : l'aperçu ne doit pas rester.
  useEffect(() => () => setPreview(null), [setPreview]);

  const previewOf = (p: AppearancePreset) => setPreview({
    ...p.look,
    background: p.image ? p.at : null,
    backgroundKey: p.image ? presetImageKey(p.id) : undefined,
  });

  return (
    <div className="presets">
      <div className="presets__grid">
        {presets.map((p) => (
          <div key={p.id} className="preset" onMouseEnter={() => previewOf(p)} onMouseLeave={() => setPreview(null)}>
            <button className="preset__apply" title={`Appliquer « ${p.name} » (survol : aperçu)`}
              onClick={async () => { setPreview(null); updateTheme(await resolve(p)); }}>
              <Thumb preset={p} />
              <span className="preset__name">{p.name}</span>
            </button>
            <button className="preset__remove" aria-label={`Supprimer « ${p.name} »`} onClick={() => { setPreview(null); remove(p.id); }}>
              <Icon name="close" size={11} />
            </button>
          </div>
        ))}
        {naming ? (
          <form className="preset preset--new" onSubmit={async (e) => {
            e.preventDefault();
            await save(name, theme);
            setName("");
            setNaming(false);
          }}>
            <input className="field" autoFocus value={name} placeholder="Nom du préréglage" onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setNaming(false)} />
            <div className="settings__row">
              <button className="btn" type="submit">Enregistrer</button>
              <button className="btn btn--ghost" type="button" onClick={() => setNaming(false)}>Annuler</button>
            </div>
          </form>
        ) : (
          <button className="preset preset--add" onClick={() => setNaming(true)}>
            <span className="preset__plus"><Icon name="plus" size={18} /></span>
            <span className="preset__name">Enregistrer l'apparence actuelle</span>
          </button>
        )}
      </div>
      {presets.length > 0 && <p className="settings__hint">Survol : aperçu sur toute l'application. Clic : appliquer.</p>}
    </div>
  );
}
