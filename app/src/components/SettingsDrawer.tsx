import { useRef, useState } from "react";
import type { BraveInstall } from "../brave/useBraveInstalls";
import type { ProfileId } from "../browser/useBrowser";
import { deleteBackground, saveBackground } from "../settings/backgrounds";
import {
  BACKGROUND_KEY, defaultChrome, fonts, profileIcons, searchEngines, useSettings,
  type BarSurface, type ChromeSettings, type FontName, type SearchEngine,
} from "../settings/settings";
import { Check, ColorField, Section, Segmented, Slider } from "./Controls";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";
import { ProfileBadge } from "./ProfileBadge";

export type SettingsTab = "appearance" | "interface" | "profiles";

interface Props {
  open: boolean;
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  /** Profils Brave dont on peut lire les favoris. */
  installs: BraveInstall[];
  /** Profil Brave dont chaque profil affiche les favoris (dossier), ou null. */
  bookmarkSources: Record<ProfileId, string | null>;
  onClose: () => void;
  /** Ouvre la page d’édition de la disposition. */
  onEditLayout: () => void;
}

export function SettingsDrawer({ open, tab, onTab, installs, bookmarkSources, onClose, onEditLayout }: Props) {
  return (
    <Drawer open={open} title="Réglages" onClose={onClose}>
      <div className="settings__tabs">
        <Segmented value={tab} onChange={onTab} options={[["appearance", "Apparence"], ["interface", "Interface"], ["profiles", "Profils"]]} />
      </div>
      {tab === "appearance" && <Appearance onEditLayout={onEditLayout} />}
      {tab === "interface" && <InterfaceSettings />}
      {tab === "profiles" && <Profiles installs={installs} bookmarkSources={bookmarkSources} />}
    </Drawer>
  );
}

/** Style de Calti, commun à tous les profils et à toutes les fenêtres. */
function Appearance({ onEditLayout }: { onEditLayout: () => void }) {
  const { theme, updateTheme: set } = useSettings();
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
    <>
      <Section title="Fond">
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
        <Segmented value={theme.tone} onChange={(tone) => set({ tone })}
          options={[["dark", "Fond clair"], ["light", "Fond sombre"]]} />
        <Slider label="Flou" value={theme.blur} min={0} max={20} step={1} format={(v) => `${v} px`}
          onChange={(blur) => set({ blur })} />
        <Slider label="Voile" value={theme.dim} min={0} max={0.7} step={0.05} format={(v) => `${Math.round(v * 100)} %`}
          onChange={(dim) => set({ dim })} />
        <ColorField label="Teinte" value={theme.tint === "#080e1a" ? undefined : theme.tint}
          onChange={(tint) => set({ tint: tint ?? "#080e1a" })} />
        <Slider label="Vignette" value={theme.vignette} min={0} max={0.9} step={0.05}
          format={(v) => `${Math.round(v * 100)} %`} onChange={(vignette) => set({ vignette })} />
        <Slider label="Grain" value={theme.grain} min={0} max={0.6} step={0.05}
          format={(v) => `${Math.round(v * 100)} %`} onChange={(grain) => set({ grain })} />
        <Check label="Halo de lumière venant du haut" checked={theme.spotlight} onChange={(spotlight) => set({ spotlight })} />
      </Section>

      <Section title="Couleurs et verre">
        <ColorField label="Accent" value={theme.accent} optional={false} onChange={(accent) => accent && set({ accent })} />
        <Slider label="Opacité" value={theme.glassOpacity} min={0.15} max={0.8} step={0.05}
          format={(v) => `${Math.round(v * 100)} %`} onChange={(glassOpacity) => set({ glassOpacity })} />
      </Section>

      <Section title="Accueil">
        <textarea className="field" rows={2} value={theme.headline} placeholder="Titre (vide : salutation selon l'heure)"
          onChange={(e) => set({ headline: e.target.value })} />
        <input className="field" value={theme.tagline} placeholder="Sous-titre (facultatif)"
          onChange={(e) => set({ tagline: e.target.value })} />
        <Segmented<FontName> value={theme.font} onChange={(font) => set({ font })}
          options={Object.entries(fonts).map(([k, f]) => [k as FontName, f.label])} />
        <button className="btn" onClick={onEditLayout}>Modifier la disposition</button>
      </Section>
    </>
  );
}

/** Habillage autour des pages : barres, onglets, fenêtre, et CSS libre pour le reste. */
function InterfaceSettings() {
  const { theme, updateTheme } = useSettings();
  const c = theme.chrome;
  const set = (patch: Partial<ChromeSettings>) => updateTheme({ chrome: { ...c, ...patch } });
  const px = (v: number) => `${v} px`;
  const surfaces: [BarSurface, string][] = [["glass", "Verre"], ["solid", "Plein"], ["none", "Aucun fond"]];

  return (
    <>
      <Section title="Barre du haut">
        <Segmented value={c.barStyle} onChange={(barStyle) => set({ barStyle })}
          options={[["floating", "Flottante"], ["attached", "Collée au bord"]]} />
        <Segmented value={c.barSurface} onChange={(barSurface) => set({ barSurface })} options={surfaces} />
        <Slider label="Arrondi" value={c.barRadius} min={0} max={28} step={1} format={px} onChange={(barRadius) => set({ barRadius })} />
        <Slider label="Hauteur" value={c.barHeight} min={36} max={64} step={2} format={px} onChange={(barHeight) => set({ barHeight })} />
      </Section>

      <Section title="Barre latérale">
        <Segmented value={c.railStyle} onChange={(railStyle) => set({ railStyle })}
          options={[["floating", "Flottante"], ["attached", "Collée au bord"]]} />
        <Segmented value={c.railSurface} onChange={(railSurface) => set({ railSurface })} options={surfaces} />
        <Slider label="Arrondi" value={c.railRadius} min={0} max={36} step={1} format={px} onChange={(railRadius) => set({ railRadius })} />
        <p className="settings__hint">Largeur : tirer le bord droit de la barre (double-clic : icônes seules ou large).</p>
      </Section>

      <Section title="Onglets">
        <Segmented value={c.tabActive} onChange={(tabActive) => set({ tabActive })}
          options={[["filled", "Onglet actif plein"], ["outline", "Contour"], ["underline", "Souligné"]]} />
        <Segmented value={c.tabClose} onChange={(tabClose) => set({ tabClose })}
          options={[["hover", "Fermer au survol"], ["always", "Toujours"], ["never", "Jamais"]]} />
        <Check label="Icônes seules (sans titre)" checked={c.tabIconsOnly} onChange={(tabIconsOnly) => set({ tabIconsOnly })} />
        <Slider label="Arrondi" value={c.tabRadius} min={0} max={18} step={1} format={px} onChange={(tabRadius) => set({ tabRadius })} />
        <Slider label="Largeur" value={c.tabMaxWidth} min={100} max={320} step={10} format={px} onChange={(tabMaxWidth) => set({ tabMaxWidth })} />
        <p className="settings__hint">Groupes : clic droit sur un onglet → « Nouveau groupe » ; clic sur la pastille du groupe pour le replier.</p>
      </Section>

      <Section title="Fenêtre et pages">
        <Slider label="Marges" value={c.windowPadding} min={0} max={32} step={1} format={px} onChange={(windowPadding) => set({ windowPadding })} />
        <Slider label="Espacement" value={c.gap} min={0} max={28} step={1} format={px} onChange={(gap) => set({ gap })} />
        <Slider label="Pages" value={c.pageRadius} min={0} max={32} step={1} format={px} onChange={(pageRadius) => set({ pageRadius })} />
        <Check label="Animations" checked={c.motion} onChange={(motion) => set({ motion })} />
      </Section>

      <Section title="CSS personnalisé">
        <p className="settings__hint">Pour ajuster le moindre détail : appliqué en direct, après tous les styles de Calti.</p>
        <textarea className="field field--code" rows={7} spellCheck={false} value={c.customCss}
          placeholder={".ptab { font-size: 14px; }\n.rail { opacity: .9; }"}
          onChange={(e) => set({ customCss: e.target.value })} />
        <button className="btn btn--ghost" onClick={() => updateTheme({ chrome: defaultChrome })}>Interface par défaut</button>
      </Section>
    </>
  );
}

/** Profils : création, préférences, suppression. */
function Profiles({ installs, bookmarkSources }: { installs: BraveInstall[]; bookmarkSources: Record<ProfileId, string | null> }) {
  const { profileIds, profile, updateProfile, createProfile, deleteProfile } = useSettings();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    setOpenId(createProfile(name));
    setNewName("");
  };

  return (
    <>
      <Section title="Vos profils">
        <p className="settings__hint">Chaque profil a ses propres onglets, connexions, mots de passe et préférences.</p>
        {profileIds.map((id) => {
          const p = profile(id);
          const expanded = openId === id;
          return (
            <div key={id} className={`pcard${expanded ? " pcard--open" : ""}`}>
              <button className="pcard__head" onClick={() => setOpenId(expanded ? null : id)} aria-expanded={expanded}>
                <ProfileBadge profile={p} size={34} />
                <span className="pcard__name">{p.name}</span>
                <span className="pcard__meta">{searchEngines[p.search].label}</span>
                <span className={`pcard__chevron${expanded ? " pcard__chevron--open" : ""}`}><Icon name="chevron" size={14} /></span>
              </button>

              {expanded && (
                <div className="pcard__body">
                  <input className="field" value={p.name} placeholder="Nom du profil"
                    onChange={(e) => updateProfile(id, { name: e.target.value })} />

                  <div className="pcard__label">Icône</div>
                  <div className="icon-grid">
                    {profileIcons.map((icon) => (
                      <button key={icon || "initiales"} className={`icon-grid__item${p.icon === icon ? " icon-grid__item--on" : ""}`}
                        title={icon ? icon : "Initiales"} onClick={() => updateProfile(id, { icon })}>
                        {icon || p.name.slice(0, 2)}
                      </button>
                    ))}
                  </div>

                  <ColorField label="Couleur" value={p.color} optional={false} onChange={(color) => color && updateProfile(id, { color })} />

                  <div className="pcard__label">Moteur de recherche</div>
                  <select className="field" value={p.search} onChange={(e) => updateProfile(id, { search: e.target.value as SearchEngine })}>
                    {Object.entries(searchEngines).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
                  </select>

                  <div className="pcard__label">Nouvel onglet</div>
                  <Segmented value={p.startPage === "home" ? "home" : "url"}
                    onChange={(v) => updateProfile(id, { startPage: v === "home" ? "home" : "https://" })}
                    options={[["home", "Accueil de Calti"], ["url", "Une adresse"]]} />
                  {p.startPage !== "home" && (
                    <input className="field" value={p.startPage} placeholder="https://…" spellCheck={false}
                      onChange={(e) => updateProfile(id, { startPage: e.target.value })} />
                  )}

                  <div className="pcard__label">Favoris (lus dans Brave, lecture seule)</div>
                  <select className="field" value={bookmarkSources[id] ?? ""}
                    onChange={(e) => updateProfile(id, { bookmarksFrom: e.target.value || null })}>
                    <option value="">Aucun</option>
                    {installs.map((i) => <option key={i.dir} value={i.dir}>Brave · {i.name}</option>)}
                  </select>

                  {profileIds.length > 1 && (
                    <button className="btn btn--danger" onClick={() => {
                      if (window.confirm(`Retirer le profil « ${p.name} » ? Ses onglets ouverts restent ouverts jusqu'à leur fermeture ; ses données de navigation restent sur le disque.`)) {
                        deleteProfile(id);
                        setOpenId(null);
                      }
                    }}>Retirer ce profil</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Section>

      <Section title="Nouveau profil">
        <div className="settings__row">
          <input className="field" value={newName} placeholder="Nom (ex. Projets, Famille…)"
            onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <button className="btn" disabled={!newName.trim()} onClick={create}>Créer</button>
        </div>
      </Section>
    </>
  );
}
