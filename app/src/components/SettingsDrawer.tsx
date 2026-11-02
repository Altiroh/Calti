import { useRef, useState } from "react";
import type { BraveInstall } from "../brave/useBraveInstalls";
import { defaultProfileNames, type ProfileId } from "../browser/useBrowser";
import { deleteBackground, saveBackground } from "../settings/backgrounds";
import {
  accentPresets, fonts, useSettings, type FontName,
} from "../settings/settings";
import { Drawer } from "./Drawer";
import { Check, ColorField, Section, Segmented, Slider } from "./Controls";

interface Props {
  open: boolean;
  /** Profil dont on règle l'environnement (celui du volet actif). */
  themeKey: ProfileId;
  profileIndex: number;
  /** Profils Brave dont on peut lire les favoris. */
  installs: BraveInstall[];
  /** Profil Brave dont les favoris sont affichés (dossier), ou null. */
  bookmarksSource: string | null;
  onClose: () => void;
  /** Ouvre la page d’édition de la disposition. */
  onEditLayout: () => void;
}

export function SettingsDrawer({ open, themeKey, profileIndex, installs, bookmarksSource, onClose, onEditLayout }: Props) {
  const { themeFor, updateTheme, names, setName, profileName } = useSettings();
  const theme = themeFor(themeKey);
  const set = (patch: Parameters<typeof updateTheme>[1]) => updateTheme(themeKey, patch);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const index = profileIndex;
  const braveName = defaultProfileNames[themeKey];

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const luminance = await saveBackground(themeKey, file);
      // Image sombre : verre fumé et texte clair ; image claire : l'inverse. Modifiable ensuite.
      set({ background: Date.now(), tone: luminance < 0.55 ? "light" : "dark" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} title="Réglages" onClose={onClose}>
      <p className="settings__scope">
        {index >= 0
          ? <>Environnement du profil <strong>{profileName(themeKey, index, braveName)}</strong></>
          : "Environnement par défaut"}
      </p>

      {index >= 0 && (
        <Section title="Nom du profil">
          <input className="field" value={names[themeKey] ?? ""} placeholder={braveName ?? `Profil ${index + 1}`}
            onChange={(e) => setName(themeKey, e.target.value)} />
        </Section>
      )}

      <Section title="Image de fond">
        <div className="settings__row">
          <button className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? "Import…" : theme.background ? "Changer l'image" : "Choisir une image"}
          </button>
          {theme.background && (
            <button className="btn btn--ghost" onClick={async () => {
              await deleteBackground(themeKey);
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

      <Section title="Favoris">
        <p className="settings__hint">Favoris lus dans un profil Brave (lecture seule, Brave peut rester fermé).</p>
        <select className="field" value={bookmarksSource ?? ""}
          onChange={(e) => set({ bookmarksFrom: e.target.value || null })}>
          <option value="">Aucun</option>
          {installs.map((i) => <option key={i.dir} value={i.dir}>Brave · {i.name}</option>)}
        </select>
      </Section>
    </Drawer>
  );
}
