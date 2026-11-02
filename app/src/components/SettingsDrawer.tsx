import { useRef, useState } from "react";
import type { BraveInstall } from "../brave/useBraveInstalls";
import { PROFILE_IDS, type ProfileId } from "../browser/useBrowser";
import { deleteBackground, saveBackground } from "../settings/backgrounds";
import {
  accentPresets, BACKGROUND_KEY, fonts, useSettings, type FontName,
} from "../settings/settings";
import { Drawer } from "./Drawer";
import { Check, ColorField, Section, Segmented, Slider } from "./Controls";

interface Props {
  open: boolean;
  /** Profils Brave dont on peut lire les favoris. */
  installs: BraveInstall[];
  /** Profil Brave dont chaque profil affiche les favoris (dossier), ou null. */
  bookmarkSources: Record<ProfileId, string | null>;
  onClose: () => void;
  /** Ouvre la page d’édition de la disposition. */
  onEditLayout: () => void;
}

export function SettingsDrawer({ open, installs, bookmarkSources, onClose, onEditLayout }: Props) {
  const { theme, updateTheme: set, profile, updateProfile } = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const luminance = await saveBackground(BACKGROUND_KEY, file);
      // Image sombre : verre fumé et texte clair ; image claire : l'inverse. Modifiable ensuite.
      set({ background: Date.now(), tone: luminance < 0.55 ? "light" : "dark" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} title="Réglages" onClose={onClose}>
      <p className="settings__scope">Style de Calti, commun à tous les profils et à toutes les fenêtres.</p>

      <Section title="Image de fond">
        <div className="settings__row">
          <button className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? "Import…" : theme.background ? "Changer l'image" : "Choisir une image"}
          </button>
          {theme.background && (
            <button className="btn btn--ghost" onClick={async () => {
              await deleteBackground(BACKGROUND_KEY);
              set({ background: null });
            }}>Retirer</button>
          )}
          <input ref={fileInput} type="file" accept="image/*" hidden
            onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <Slider label="Flou" value={theme.blur} min={0} max={20} step={1} onChange={(blur) => set({ blur })} />
      </Section>

      <Section title="Ambiance">
        <Slider label="Voile" value={theme.dim} min={0} max={0.7} step={0.05} onChange={(dim) => set({ dim })} />
        <ColorField label="Teinte" value={theme.tint === "#080e1a" ? undefined : theme.tint}
          onChange={(tint) => set({ tint: tint ?? "#080e1a" })} />
        <Slider label="Vignette" value={theme.vignette} min={0} max={0.9} step={0.05}
          onChange={(vignette) => set({ vignette })} />
        <Slider label="Grain" value={theme.grain} min={0} max={0.6} step={0.05} onChange={(grain) => set({ grain })} />
        <Check label="Halo de lumière venant du haut" checked={theme.spotlight}
          onChange={(spotlight) => set({ spotlight })} />
      </Section>

      <Section title="Titre">
        <textarea className="field" rows={2} value={theme.headline} placeholder="Salutation selon l'heure"
          onChange={(e) => set({ headline: e.target.value })} />
        <input className="field" value={theme.tagline} placeholder="Sous-titre (facultatif)"
          onChange={(e) => set({ tagline: e.target.value })} />
        <Segmented<FontName> value={theme.font} onChange={(font) => set({ font })}
          options={Object.entries(fonts).map(([k, f]) => [k as FontName, f.label])} />
        <Segmented value={theme.tone} onChange={(tone) => set({ tone })}
          options={[["dark", "Fond clair"], ["light", "Fond sombre"]]} />
      </Section>

      <Section title="Couleur d'accent">
        <div className="swatches">
          {accentPresets.map((p) => (
            <button key={p.value} className={`swatch${theme.accent === p.value ? " swatch--on" : ""}`}
              style={{ background: p.value }} title={p.name} aria-label={p.name}
              onClick={() => set({ accent: p.value })} />
          ))}
          <label className="swatch swatch--custom" title="Couleur libre">
            <input type="color" value={theme.accent} onChange={(e) => set({ accent: e.target.value })} />
          </label>
        </div>
      </Section>

      <Section title="Verre">
        <Slider label="Opacité" value={theme.glassOpacity} min={0.15} max={0.8} step={0.05}
          onChange={(glassOpacity) => set({ glassOpacity })} />
      </Section>

      <Section title="Disposition">
        <p className="settings__hint">Déplacer, agrandir, masquer les blocs de l’accueil sur une grille aimantée.</p>
        <button className="btn" onClick={onEditLayout}>Modifier la disposition</button>
      </Section>

      <Section title="Profils">
        <p className="settings__hint">Nom, couleur de repère et favoris (lus dans un profil Brave, en lecture seule).</p>
        {PROFILE_IDS.map((id) => (
          <div key={id} className="settings__profile">
            <div className="settings__row">
              <input className="field" value={profile(id).name} placeholder={id}
                onChange={(e) => updateProfile(id, { name: e.target.value })} />
              <label className="swatch swatch--profile" style={{ background: profile(id).color }} title="Couleur du profil">
                <input type="color" value={profile(id).color} onChange={(e) => updateProfile(id, { color: e.target.value })} />
              </label>
            </div>
            <select className="field" value={bookmarkSources[id] ?? ""}
              onChange={(e) => updateProfile(id, { bookmarksFrom: e.target.value || null })}>
              <option value="">Favoris : aucun</option>
              {installs.map((i) => <option key={i.dir} value={i.dir}>Favoris : Brave · {i.name}</option>)}
            </select>
          </div>
        ))}
      </Section>
    </Drawer>
  );
}
