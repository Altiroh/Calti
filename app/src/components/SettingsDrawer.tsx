import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ClaudeLogo, SpotifyPlus } from "./BrandIcons";
import type { BraveInstall } from "../brave/useBraveInstalls";
import type { ProfileId } from "../browser/useBrowser";
import { deleteBackground, saveAvatar, saveBackground } from "../settings/backgrounds";
import {
  BACKGROUND_KEY, barWidgetLabels, defaultChrome, fonts, meshes, profileIcons, profileImageKey, searchEngines, useSettings,
  type AvatarKind, type BarSurface, type BarWidget, type ChromeSettings, type FontName, type MeshName, type ProfileSettings,
  type SearchEngine,
} from "../settings/settings";
import { AppearancePresets } from "./AppearancePresets";
import { retentionChoices, useClipboardHistory } from "../widgets/clipboard";
import { BraveImport } from "./BraveImport";
import { Check, ColorField, Section, Segmented, Slider } from "./Controls";
import { openMenu } from "./ContextMenu";
import { Drawer } from "./Drawer";
import { Icon, type IconName } from "./Icon";
import { ProfileBadge } from "./ProfileBadge";
import { ProfileData, SystemSettings, ZoomSettings } from "./PrivacySettings";

/** Général (extensions, raccourcis), Profils, Apparence (cohérence graphique de toute l'application). */
export type SettingsTab = "general" | "profiles" | "appearance";

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

const tabs: [SettingsTab, string, IconName][] = [["general", "Général", "puzzle"], ["profiles", "Profils", "user"], ["appearance", "Apparence", "palette"]];

export function SettingsDrawer({ open, tab, onTab, installs, bookmarkSources, onClose, onEditLayout }: Props) {
  return (
    <Drawer open={open} title="Réglages" onClose={onClose}>
      <nav className="settings-tabs" role="tablist">
        {tabs.map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`settings-tabs__tab${tab === id ? " settings-tabs__tab--on" : ""}`}
            onClick={() => onTab(id)}>
            <Icon name={icon} size={15} /> {label}
          </button>
        ))}
      </nav>
      <div className="settings-page" key={tab}>
        {tab === "general" && <General />}
        {tab === "profiles" && <Profiles installs={installs} bookmarkSources={bookmarkSources} />}
        {tab === "appearance" && <Appearance onEditLayout={onEditLayout} />}
      </div>
    </Drawer>
  );
}

/* --- Général ------------------------------------------------------------------ */

/** Extensions de Calti : icône, couleur et description ; activées, elles ont leur raccourci dans la barre latérale. */
const extensions: { id: BarWidget; icon: IconName; colors: [string, string]; description: string }[] = [
  { id: "clipboard", icon: "clipboard", colors: ["#ff9a44", "#ff5f6d"], description: "Textes, liens et images copiés récemment." },
  { id: "history", icon: "history", colors: ["#4facfe", "#2f5fa8"], description: "Pages visitées par le profil, avec un filtre." },
  { id: "notes", icon: "notes", colors: ["#ffd166", "#f4a261"], description: "Notes en couleurs, rangées en groupes, partageables entre profils." },
  { id: "ruler", icon: "ruler", colors: ["#ff3d7f", "#a259ff"], description: "Règles, repères et grille de colonnes sur la page." },
  { id: "bookmarks", icon: "star", colors: ["#f9d423", "#f7971e"], description: "Favoris de Calti et de Brave." },
  { id: "tabs", icon: "tabs", colors: ["#43e97b", "#1f8c8c"], description: "Onglets ouverts du profil." },
  { id: "claude", icon: "spark", colors: ["#e8916b", "#c15f3c"], description: "claude.ai à côté de la page, avec votre compte. Clic droit sur un texte : « Demander à Claude »." },
  { id: "media", icon: "sound", colors: ["#2a2f36", "#121212"], description: "Spotify ou toute lecture de Windows : pochette, titre, lecture/pause, suivant." },
];

const shortcuts: [string, string][] = [
  ["Ctrl+T", "Nouvel onglet"], ["Ctrl+W", "Fermer l'onglet"], ["Ctrl+Tab", "Onglet suivant"], ["Ctrl+L · F6", "Barre d'adresse"],
  ["F5 · Ctrl+R", "Recharger"], ["Ctrl+F5", "Recharger sans le cache"], ["Ctrl+D", "Favori"], ["Ctrl+N", "Nouvelle fenêtre"],
  ["F11", "Plein écran"], ["Clic molette", "Lien en arrière-plan"], ["Ctrl+Maj+T", "Rouvrir l'onglet fermé"],
  ["Ctrl+K · Ctrl+Maj+K", "Palette de commandes (depuis une page : Ctrl+Maj+K)"], ["Ctrl+J", "Téléchargements"], ["Ctrl+H", "Historique"], ["Ctrl+1…9", "Aller à l'onglet n°"], ["F12 · Ctrl+Maj+I", "Outils de développement de la page"], ["Alt+² · Alt+Maj+²", "Changer de profil (relâcher Alt pour ouvrir)"],
  ["Ctrl+molette · Ctrl+0", "Zoom (mémorisé par site)"],
];

function General() {
  const { theme, updateTheme } = useSettings();
  const c = theme.chrome;
  const active = new Set(c.railWidgets);
  const toggle = (id: BarWidget) =>
    updateTheme({ chrome: { ...c, railWidgets: active.has(id) ? c.railWidgets.filter((w) => w !== id) : [...c.railWidgets, id] } });

  return (
    <>
      <Section title={`Extensions · ${active.size} active${active.size > 1 ? "s" : ""}`}>
        <div className="ext-grid">
          {extensions.map((e) => {
            const on = active.has(e.id);
            return (
              <button key={e.id} className={`ext${on ? " ext--on" : ""}`} role="switch" aria-checked={on} onClick={() => toggle(e.id)}
                style={{ "--ext-a": e.colors[0], "--ext-b": e.colors[1] } as CSSProperties}>
                <span className={`ext__icon${e.id === "media" ? " ext__icon--spotify" : ""}`}>
                  {e.id === "claude" ? <ClaudeLogo size={22} color="#fff" /> : e.id === "media" ? <SpotifyPlus size={26} /> : <Icon name={e.icon} size={18} />}
                </span>
                <span className="ext__text">
                  <strong>{barWidgetLabels[e.id]}</strong>
                  <span>{e.description}</span>
                </span>
                <span className="ext__switch" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="ext-grid">
          <button className={`ext${c.mediaFloat ? " ext--on" : ""}`} role="switch" aria-checked={c.mediaFloat}
            onClick={() => updateTheme({ chrome: { ...c, mediaFloat: !c.mediaFloat } })}
            style={{ "--ext-a": "#2a2f36", "--ext-b": "#121212" } as CSSProperties}>
            <span className="ext__icon ext__icon--spotify"><SpotifyPlus size={26} /></span>
            <span className="ext__text">
              <strong>Mini-lecteur</strong>
              <span>Lecture en cours toujours visible : libre (à glisser, coin pour la taille), dans la barre latérale ou en bordure de la fenêtre.</span>
            </span>
            <span className="ext__switch" aria-hidden="true" />
          </button>
        </div>
        {c.mediaFloat && (
          <label className="pblock__field">
            <span>Place du mini-lecteur</span>
            <select className="field" value={c.mediaDock}
              onChange={(e) => updateTheme({ chrome: { ...c, mediaDock: e.target.value as ChromeSettings["mediaDock"] } })}>
              <option value="free">Libre, où je veux (flottant)</option>
              <option value="rail">Dans la barre latérale</option>
              <option value="top">En haut de la fenêtre</option>
              <option value="bottom">En bas de la fenêtre</option>
              <option value="right">À droite de la fenêtre</option>
            </select>
          </label>
        )}
        <p className="settings__hint">Une extension activée a son raccourci dans la barre latérale ; elle s'ouvre à côté de la page. Le bloc « Lecture en cours » s'ajoute aussi à l'accueil (Modifier la disposition).</p>
      </Section>

      <Section title="Recherche">
        <Check label="Suggestions du moteur pendant la saisie" checked={c.webSuggestions}
          onChange={(webSuggestions) => updateTheme({ chrome: { ...c, webSuggestions } })} />
        {c.webSuggestions && (
          <label className="pblock__field">
            <span>Fournies par</span>
            <select className="field" value={c.suggestFrom}
              onChange={(e) => updateTheme({ chrome: { ...c, suggestFrom: e.target.value as ChromeSettings["suggestFrom"] } })}>
              <option value="profile">Le moteur de chaque profil (sauf Brave et Qwant)</option>
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="google">Google</option>
              <option value="bing">Bing</option>
              <option value="ecosia">Ecosia</option>
            </select>
          </label>
        )}
        <p className="settings__hint">
          Comme dans un navigateur, la saisie est envoyée au moteur de recherche du profil pour proposer des suites.
          Désactivé, seules vos recherches passées, vos favoris et votre historique sont proposés.
        </p>
      </Section>

      <ZoomSettings />

      <ClipboardRetention />

      <SystemSettings />

      <Section title="Raccourcis clavier">
        <dl className="keys">
          {shortcuts.map(([keys, label]) => (
            <div key={keys} className="keys__row"><dt><kbd>{keys}</kbd></dt><dd>{label}</dd></div>
          ))}
        </dl>
        <p className="settings__hint">Clic droit sur la barre du haut, un onglet ou le bouton Recharger : menus d'actions.</p>
      </Section>

      <Section title="À propos">
        <p className="settings__hint">
          Calti · navigateur personnel sur WebView2. Chaque profil garde ses onglets, connexions et mots de passe dans son
          propre dossier ; rien ne quitte cet ordinateur.
        </p>
      </Section>
    </>
  );
}

/** Durée de conservation des copies récentes ; au-delà, elles sont supprimées automatiquement. */
function ClipboardRetention() {
  const { retention, setRetention } = useClipboardHistory();
  return (
    <Section title="Copies récentes">
      <label className="pblock__field">
        <span>Conservation</span>
        <select className="field" value={retention} onChange={(e) => setRetention(Number(e.target.value))}>
          {retentionChoices.map(([hours, label]) => <option key={hours} value={hours}>{label}</option>)}
        </select>
      </label>
      <p className="settings__hint">
        Au-delà, les copies (textes, liens, images) sont supprimées automatiquement. Les 40 dernières au plus sont gardées.
      </p>
    </Section>
  );
}

/* --- Apparence ----------------------------------------------------------------- */

/** Groupe repliable : un seul ouvert à la fois, pour garder le panneau lisible. */
function Group({ icon, title, color, open, onToggle, children }: {
  icon: IconName; title: string; color: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <section className={`sgroup${open ? " sgroup--open" : ""}`} style={{ "--group-color": color } as CSSProperties}>
      <button className="sgroup__head" aria-expanded={open} onClick={onToggle}>
        <span className="sgroup__icon"><Icon name={icon} size={15} /></span>
        <span className="sgroup__title">{title}</span>
        <span className="sgroup__chevron"><Icon name="chevron" size={13} /></span>
      </button>
      <div className="sgroup__drawer">
        <div className="sgroup__body">{children}</div>
      </div>
    </section>
  );
}

/** Style de Calti, commun à tous les profils et à toutes les fenêtres : fond, couleurs, accueil, barres, onglets. */
function Appearance({ onEditLayout }: { onEditLayout: () => void }) {
  const { theme, updateTheme } = useSettings();
  const set = updateTheme;
  const c = theme.chrome;
  const setChrome = (patch: Partial<ChromeSettings>) => updateTheme({ chrome: { ...c, ...patch } });
  const [openGroup, setOpenGroup] = useState<string | null>("presets");
  const group = (id: string) => ({ open: openGroup === id, onToggle: () => setOpenGroup((g) => (g === id ? null : id)) });
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const px = (v: number) => `${v} px`;
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const surfaces: [BarSurface, string][] = [["glass", "Verre"], ["solid", "Plein"], ["none", "Aucun fond"]];

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
    <div className="sgroups">
      <Group icon="spark" title="Préréglages" color="#ff3d7f" {...group("presets")}>
        <AppearancePresets />
      </Group>

      <Group icon="layers" title="Style global" color="#ff7a59" {...group("global")}>
        <p className="settings__hint">
          Réglé ici une fois pour toute l'interface : barres, onglets, pages, panneaux, menus et dialogues. Chaque élément
          reste ajustable plus bas.
        </p>
        <Segmented value={c.surface} onChange={(surface) => setChrome({
          surface,
          barSurface: c.barSurface === "none" ? "none" : surface,
          railSurface: c.railSurface === "none" ? "none" : surface,
        })} options={[["glass", "Verre"], ["solid", "Plein"]]} />
        <Slider label="Arrondi général" value={c.radius} min={0} max={28} step={1} format={px} onChange={(radius) => setChrome({
          radius,
          barRadius: radius,
          railRadius: Math.min(36, Math.round(radius * 1.75)),
          tabRadius: Math.min(18, Math.round(radius * 0.625)),
          pageRadius: radius,
        })} />
        <Slider label="Densité" value={c.density} min={0.8} max={1.3} step={0.05} format={pct} onChange={(density) => setChrome({
          density,
          windowPadding: Math.round(16 * density),
          gap: Math.round(14 * density),
          barHeight: Math.round((48 * density) / 2) * 2,
        })} />
        {c.surface === "glass" && (
          <>
            <Slider label="Opacité du verre" value={theme.glassOpacity} min={0.15} max={0.8} step={0.05} format={pct}
              onChange={(glassOpacity) => set({ glassOpacity })} />
            <Slider label="Flou du verre" value={c.glassBlur} min={0} max={48} step={2} format={px} onChange={(glassBlur) => setChrome({ glassBlur })} />
          </>
        )}
        <div className="settings__row">
          <button className="btn" onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openMenu({ x: r.left, y: r.bottom + 6 }, [
              { header: "Aperçu du menu" },
              { label: "Nouvel onglet", icon: "plus", tone: "green", shortcut: "Ctrl+T" },
              { label: "Ajouter aux favoris", icon: "star", tone: "amber", shortcut: "Ctrl+D" },
              { label: "Zoom de la page", icon: "zoomIn", tone: "teal", value: "110 %", items: [
                { label: "Agrandir", icon: "zoomIn", tone: "teal", shortcut: "Ctrl+Plus" },
                { label: "Réduire", icon: "zoomOut", tone: "teal", shortcut: "Ctrl+Moins" },
              ] },
              { label: "Deux profils côte à côte", icon: "split", tone: "violet", checked: true },
              "-",
              { label: "Fermer l'onglet", icon: "close", danger: true, shortcut: "Ctrl+W" },
            ]);
          }}>Aperçu d'un menu</button>
        </div>
      </Group>

      <Group icon="image" title="Fond et ambiance" color="#4facfe" {...group("background")}>
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
        <Segmented value={theme.tone} onChange={(tone) => set({ tone })} options={[["dark", "Fond clair"], ["light", "Fond sombre"]]} />
        <Slider label="Flou" value={theme.blur} min={0} max={20} step={1} format={px} onChange={(blur) => set({ blur })} />
        <Slider label="Voile" value={theme.dim} min={0} max={0.7} step={0.05} format={pct} onChange={(dim) => set({ dim })} />
        <ColorField label="Teinte" value={theme.tint === "#080e1a" ? undefined : theme.tint}
          onChange={(tint) => set({ tint: tint ?? "#080e1a" })} />
        <Slider label="Vignette" value={theme.vignette} min={0} max={0.9} step={0.05} format={pct} onChange={(vignette) => set({ vignette })} />
        <Slider label="Grain" value={theme.grain} min={0} max={0.6} step={0.05} format={pct} onChange={(grain) => set({ grain })} />
        <Check label="Halo de lumière venant du haut" checked={theme.spotlight} onChange={(spotlight) => set({ spotlight })} />
      </Group>

      <Group icon="palette" title="Couleurs et verre" color="#a259ff" {...group("colors")}>
        <ColorField label="Accent" value={theme.accent} optional={false} onChange={(accent) => accent && set({ accent })} />
        <Slider label="Opacité du verre" value={theme.glassOpacity} min={0.15} max={0.8} step={0.05} format={pct}
          onChange={(glassOpacity) => set({ glassOpacity })} />
        <Segmented<FontName> value={theme.font} onChange={(font) => set({ font })}
          options={Object.entries(fonts).map(([k, f]) => [k as FontName, f.label])} />
      </Group>

      <Group icon="home" title="Accueil" color="#43e97b" {...group("home")}>
        <textarea className="field" rows={2} value={theme.headline} placeholder="Titre (vide : « Bonjour, profil. »)"
          onChange={(e) => set({ headline: e.target.value })} />
        <input className="field" value={theme.tagline} placeholder="Sous-titre (facultatif)"
          onChange={(e) => set({ tagline: e.target.value })} />
        <button className="btn" onClick={onEditLayout}>Modifier la disposition et les widgets</button>
      </Group>

      <Group icon="window" title="Barre du haut" color="#ff9a44" {...group("bar")}>
        <Segmented value={c.barStyle} onChange={(barStyle) => setChrome({ barStyle })}
          options={[["floating", "Flottante"], ["attached", "Collée au bord"]]} />
        <Segmented value={c.barSurface} onChange={(barSurface) => setChrome({ barSurface })} options={surfaces} />
        <Segmented value={c.addressWidth} onChange={(addressWidth) => setChrome({ addressWidth })}
          options={[["s", "Adresse courte"], ["m", "Moyenne"], ["l", "Large"]]} />
        <Slider label="Arrondi" value={c.barRadius} min={0} max={28} step={1} format={px} onChange={(barRadius) => setChrome({ barRadius })} />
        <Slider label="Hauteur" value={c.barHeight} min={36} max={64} step={2} format={px} onChange={(barHeight) => setChrome({ barHeight })} />
        <div className="settings__checks">
          <Check label="Précédent / suivant" checked={c.barButtons.nav} onChange={(nav) => setChrome({ barButtons: { ...c.barButtons, nav } })} />
          <Check label="Recharger" checked={c.barButtons.reload} onChange={(reload) => setChrome({ barButtons: { ...c.barButtons, reload } })} />
          <Check label="Favori ★" checked={c.barButtons.star} onChange={(star) => setChrome({ barButtons: { ...c.barButtons, star } })} />
        </div>
      </Group>

      <Group icon="sidebar" title="Barre latérale" color="#0b0d10" {...group("rail")}>
        <Segmented value={c.railStyle} onChange={(railStyle) => setChrome({ railStyle })}
          options={[["edge", "Bord renflé"], ["floating", "Flottante"], ["attached", "Collée au bord"]]} />
        {c.railStyle === "edge" ? (
          <>
            <Segmented value={c.edgeSurface} onChange={(edgeSurface) => setChrome({ edgeSurface })}
              options={[["color", "Couleur"], ["glass", "Verre"], ["none", "Sans fond"]]} />
            {c.edgeSurface === "color" && (
              <ColorField label="Couleur du bord" value={c.edgeColor} optional={false} onChange={(edgeColor) => edgeColor && setChrome({ edgeColor })} />
            )}
            {c.edgeSurface !== "none" && (
              <Slider label="Opacité" value={c.edgeOpacity ?? (c.edgeSurface === "color" ? 1 : theme.glassOpacity)}
                min={0.05} max={1} step={0.05} format={pct} onChange={(edgeOpacity) => setChrome({ edgeOpacity })} />
            )}
          </>
        ) : (
          <Segmented value={c.railSurface} onChange={(railSurface) => setChrome({ railSurface })} options={surfaces} />
        )}
        <Slider label="Arrondi" value={c.railRadius} min={0} max={36} step={1} format={px} onChange={(railRadius) => setChrome({ railRadius })} />
        <p className="settings__hint">Les raccourcis de la barre se choisissent dans Général → Extensions.</p>
      </Group>

      <Group icon="tabs" title="Onglets" color="#1f8c8c" {...group("tabs")}>
        <Segmented value={c.tabActive} onChange={(tabActive) => setChrome({ tabActive })}
          options={[["filled", "Actif plein"], ["outline", "Contour"], ["underline", "Souligné"]]} />
        <Segmented value={c.tabClose} onChange={(tabClose) => setChrome({ tabClose })}
          options={[["hover", "Fermer au survol"], ["always", "Toujours"], ["never", "Jamais"]]} />
        <Check label="Icônes seules (sans titre)" checked={c.tabIconsOnly} onChange={(tabIconsOnly) => setChrome({ tabIconsOnly })} />
        <Slider label="Arrondi" value={c.tabRadius} min={0} max={18} step={1} format={px} onChange={(tabRadius) => setChrome({ tabRadius })} />
        <Slider label="Largeur" value={c.tabMaxWidth} min={100} max={320} step={10} format={px} onChange={(tabMaxWidth) => setChrome({ tabMaxWidth })} />
      </Group>

      <Group icon="layout" title="Fenêtre et pages" color="#2f5fa8" {...group("window")}>
        <Slider label="Marges" value={c.windowPadding} min={0} max={32} step={1} format={px} onChange={(windowPadding) => setChrome({ windowPadding })} />
        <Slider label="Espacement" value={c.gap} min={0} max={28} step={1} format={px} onChange={(gap) => setChrome({ gap })} />
        <Slider label="Arrondi des pages" value={c.pageRadius} min={0} max={32} step={1} format={px} onChange={(pageRadius) => setChrome({ pageRadius })} />
        <Check label="Animations" checked={c.motion} onChange={(motion) => setChrome({ motion })} />
      </Group>

      <Group icon="code" title="Avancé" color="#5f6368" {...group("advanced")}>
        <p className="settings__hint">CSS libre, appliqué en direct après tous les styles de Calti.</p>
        <textarea className="field field--code" rows={7} spellCheck={false} value={c.customCss}
          placeholder={".ptab { font-size: 14px; }\n.rail { opacity: .9; }"}
          onChange={(e) => setChrome({ customCss: e.target.value })} />
        <button className="btn btn--ghost" onClick={() => updateTheme({ chrome: defaultChrome })}>Interface par défaut</button>
      </Group>
    </div>
  );
}

/* --- Profils ------------------------------------------------------------------- */

/** Pastille du profil : couleur, dégradé classique, dégradé multicolore ou image. */
function AvatarSettings({ profile: p, onChange }: { profile: ProfileSettings; onChange: (patch: Partial<ProfileSettings>) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = p.avatar ?? "color";
  const choose = async (f: File | undefined) => {
    if (!f) return;
    try {
      await saveAvatar(profileImageKey(p.id), f);
      setError(null);
      onChange({ avatar: "image", image: Date.now() });
    } catch {
      setError("Image illisible.");
    }
  };
  return (
    <>
      <Segmented<AvatarKind> value={kind} onChange={(avatar) => (avatar === "image" && !p.image ? file.current?.click() : onChange({ avatar }))}
        options={[["color", "Couleur"], ["gradient", "Dégradé"], ["mesh", "Multicolore"], ["image", "Image"]]} />
      {kind === "gradient" && (
        <ColorField label="Seconde couleur" value={p.color2 ?? "#a259ff"} optional={false} onChange={(color2) => color2 && onChange({ color2 })} />
      )}
      {kind === "mesh" && (
        <div className="icon-grid">
          {(Object.keys(meshes) as MeshName[]).map((mesh) => (
            <button key={mesh} className={`icon-grid__item${(p.mesh ?? "aurore") === mesh ? " icon-grid__item--on" : ""}`}
              title={mesh} onClick={() => onChange({ mesh })}>
              <ProfileBadge profile={{ ...p, avatar: "mesh", mesh, icon: " " }} size={26} />
            </button>
          ))}
        </div>
      )}
      {kind === "image" && (
        <div className="settings__row">
          <button className="btn" onClick={() => file.current?.click()}>Changer l'image</button>
          <button className="btn btn--ghost" onClick={async () => {
            await deleteBackground(profileImageKey(p.id)).catch(() => {});
            onChange({ avatar: "color", image: null });
          }}>Retirer</button>
        </div>
      )}
      {error && <p className="settings__hint">{error}</p>}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}

/** Bloc d'une fiche de profil, avec son titre. */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pblock">
      <div className="pblock__title">{title}</div>
      {children}
    </div>
  );
}

function Profiles({ installs, bookmarkSources }: { installs: BraveInstall[]; bookmarkSources: Record<ProfileId, string | null> }) {
  const { profileIds, profile, updateProfile, createProfile, deleteProfile } = useSettings();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

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
          const update = (patch: Partial<ProfileSettings>) => updateProfile(id, patch);
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
                  <Block title="Identité">
                    <input className="field" value={p.name} placeholder="Nom du profil" onChange={(e) => update({ name: e.target.value })} />
                    <div className="icon-grid">
                      {profileIcons.map((icon) => (
                        <button key={icon || "initiales"} className={`icon-grid__item${p.icon === icon ? " icon-grid__item--on" : ""}`}
                          title={icon ? icon : "Initiales"} onClick={() => update({ icon })}>
                          {icon || p.name.slice(0, 2)}
                        </button>
                      ))}
                    </div>
                    <ColorField label="Couleur" value={p.color} optional={false} onChange={(color) => color && update({ color })} />
                    <AvatarSettings profile={p} onChange={update} />
                  </Block>

                  <Block title="Navigation">
                    <label className="pblock__field">
                      <span>Moteur de recherche</span>
                      <select className="field" value={p.search} onChange={(e) => update({ search: e.target.value as SearchEngine })}>
                        {Object.entries(searchEngines).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
                      </select>
                    </label>
                    <Segmented value={p.startPage === "home" ? "home" : "url"}
                      onChange={(v) => update({ startPage: v === "home" ? "home" : "https://" })}
                      options={[["home", "Nouvel onglet : accueil"], ["url", "Une adresse"]]} />
                    {p.startPage !== "home" && (
                      <input className="field" value={p.startPage} placeholder="https://…" spellCheck={false}
                        onChange={(e) => update({ startPage: e.target.value })} />
                    )}
                  </Block>

                  <Block title="Confidentialité">
                    <Check label="Bloquer les publicités et les traqueurs" checked={p.blockAds !== false}
                      onChange={(blockAds) => update({ blockAds })} />
                    <p className="settings__hint">Le bouclier de la barre d'adresse compte les éléments bloqués et suspend le blocage sur un site.</p>
                    <ProfileData profile={id} />
                  </Block>

                  <Block title="Brave">
                    <label className="pblock__field">
                      <span>Profil Brave associé</span>
                      <select className="field" value={bookmarkSources[id] ?? ""} onChange={(e) => update({ bookmarksFrom: e.target.value || null })}>
                        <option value="">Aucun</option>
                        {installs.map((i) => <option key={i.dir} value={i.dir}>{i.name}</option>)}
                      </select>
                    </label>
                    <BraveImport profile={id} braveDir={bookmarkSources[id] ?? null} />
                  </Block>

                  {/* Confirmation sur place : une boîte de dialogue du navigateur passerait sous les pages. */}
                  {profileIds.length > 1 && (confirmRemove === id ? (
                    <div className="pblock pblock--danger">
                      <p className="settings__hint">
                        Retirer « {p.name} » ? Ses onglets restent ouverts jusqu'à leur fermeture ; ses données de navigation restent sur le disque.
                      </p>
                      <div className="settings__row">
                        <button className="btn btn--danger" onClick={() => { deleteProfile(id); setOpenId(null); setConfirmRemove(null); }}>
                          Confirmer le retrait
                        </button>
                        <button className="btn btn--ghost" onClick={() => setConfirmRemove(null)}>Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn--ghost pcard__remove" onClick={() => setConfirmRemove(id)}>Retirer ce profil…</button>
                  ))}
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
