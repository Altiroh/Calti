import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { builtinIds, defaultLayout, normalizeLayout, type Layout } from "./layout";

/** Style de l'application : fond, ambiance, typographie, couleurs, verre et disposition de l'accueil. */
export interface HomeTheme {
  accent: string;
  /** Opacité du verre, de 0.15 (très transparent) à 0.8 (laiteux). */
  glassOpacity: number;
  /** Horodatage de l'image de fond enregistrée (IndexedDB), ou null pour le décor par défaut. */
  background: number | null;
  /** Voile coloré posé sur l'image (0 à 0.7). */
  dim: number;
  /** Couleur du voile : noir bleuté par défaut, ou une teinte chaude, verte… */
  tint: string;
  /** Assombrissement des bords (0 à 1). */
  vignette: number;
  /** Grain photographique (0 à 1). */
  grain: number;
  /** Halo de lumière venant du haut. */
  spotlight: boolean;
  /** Flou de l'image en pixels. */
  blur: number;
  /** Couleur du texte posé sur le fond. */
  tone: "dark" | "light";
  font: FontName;
  /** Titre libre ; vide = salutation selon l'heure. */
  headline: string;
  tagline: string;
  /** Position, taille et visibilité de chaque bloc de l’accueil. */
  layout: Layout;
  /** Apparence des barres, des onglets et de la fenêtre. */
  chrome: ChromeSettings;
}

export type BarSurface = "glass" | "solid" | "none";

/** Réglages d'interface : tout l'habillage autour des pages. */
export interface ChromeSettings {
  /** Barre du haut flottante (détachée des bords) ou collée au bord de la fenêtre. */
  barStyle: "floating" | "attached";
  barSurface: BarSurface;
  barRadius: number;
  barHeight: number;
  /** Barre latérale : mêmes choix. */
  railStyle: "floating" | "attached";
  railSurface: BarSurface;
  railRadius: number;
  /** Onglets. */
  tabRadius: number;
  tabMaxWidth: number;
  tabIconsOnly: boolean;
  tabClose: "hover" | "always" | "never";
  /** Mise en avant de l'onglet affiché. */
  tabActive: "filled" | "outline" | "underline";
  /** Pages : arrondi de leurs coins (appliqué aussi aux vues natives). */
  pageRadius: number;
  /** Marge autour du contenu et espacement entre les éléments. */
  windowPadding: number;
  gap: number;
  motion: boolean;
  /** CSS libre, appliqué en dernier : pour ajuster le moindre détail. */
  customCss: string;
}

export const defaultChrome: ChromeSettings = {
  barStyle: "floating",
  barSurface: "glass",
  barRadius: 16,
  barHeight: 48,
  railStyle: "floating",
  railSurface: "glass",
  railRadius: 28,
  tabRadius: 10,
  tabMaxWidth: 190,
  tabIconsOnly: false,
  tabClose: "hover",
  tabActive: "filled",
  pageRadius: 16,
  windowPadding: 16,
  gap: 14,
  motion: true,
  customCss: "",
};

export type FontName = "moderne" | "editorial" | "condense";

export const fonts: Record<FontName, { label: string; family: string; weight: number }> = {
  moderne: { label: "Moderne", family: '"Segoe UI Variable Display", "Segoe UI", sans-serif', weight: 600 },
  editorial: { label: "Éditorial", family: 'Georgia, "Times New Roman", serif', weight: 400 },
  condense: { label: "Condensé", family: 'Bahnschrift, "Segoe UI", sans-serif', weight: 500 },
};

export const accentPresets = [
  { name: "Bleu nuit", value: "#2f5fa8" },
  { name: "Azur", value: "#2b86c9" },
  { name: "Glacier", value: "#1f8c8c" },
  { name: "Indigo", value: "#4b56c8" },
  { name: "Lavande", value: "#7a62c4" },
  { name: "Ardoise", value: "#4a5d78" },
];

export const defaultTheme: HomeTheme = {
  accent: accentPresets[0].value,
  glassOpacity: 0.42,
  background: null,
  dim: 0.15,
  tint: "#080e1a",
  vignette: 0,
  grain: 0,
  spotlight: false,
  blur: 0,
  tone: "dark",
  font: "moderne",
  headline: "",
  tagline: "",
  layout: defaultLayout,
  chrome: defaultChrome,
};

export type SearchEngine = "brave" | "google" | "duckduckgo" | "bing" | "qwant" | "ecosia";

export const searchEngines: Record<SearchEngine, { label: string; url: string }> = {
  brave: { label: "Brave Search", url: "https://search.brave.com/search?q=" },
  google: { label: "Google", url: "https://www.google.com/search?q=" },
  duckduckgo: { label: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
  bing: { label: "Bing", url: "https://www.bing.com/search?q=" },
  qwant: { label: "Qwant", url: "https://www.qwant.com/?q=" },
  ecosia: { label: "Ecosia", url: "https://www.ecosia.org/search?q=" },
};

/** Icônes proposées pour un profil (vide = deux premières lettres du nom). */
export const profileIcons = ["", "🏠", "💼", "🧑‍💻", "🎮", "🎨", "📚", "🧪", "🎵", "🛒", "✈️", "🌙", "☀️", "🚀", "❤️", "⭐"];

/** Ce qui est propre à chaque profil : identité et préférences de navigation. Pas de style. */
export interface ProfileSettings {
  id: string;
  name: string;
  /** Emoji affiché dans le sélecteur ; vide = initiales. */
  icon: string;
  /** Couleur de repère (sélecteur, liseré du volet). */
  color: string;
  search: SearchEngine;
  /** Page d'un nouvel onglet : « home » = accueil de Calti, sinon une adresse. */
  startPage: string;
  /** Profil Brave (dossier) dont on lit les favoris ; null = aucun, absent = choix automatique. */
  bookmarksFrom?: string | null;
}

const profileDefaults: Record<string, Partial<ProfileSettings>> = {
  personnel: { name: "Personnel", color: "#2f5fa8", icon: "🏠" },
  pro: { name: "Pro", color: "#1f8c8c", icon: "💼" },
};

/** Couleurs proposées aux nouveaux profils, dans l'ordre. */
const newProfileColors = ["#7a62c4", "#c2652f", "#2b86c9", "#3f9b5c", "#b8457a", "#4a5d78"];

/** Clé de l'image de fond de l'application (IndexedDB). */
export const BACKGROUND_KEY = "app";

interface Settings {
  /** Style de l'application, commun à tous les profils et à toutes les fenêtres. */
  theme: Partial<HomeTheme> & { blocks?: Record<string, boolean> };
  profiles: Record<string, Partial<ProfileSettings>>;
  /** Ordre des profils (l'identifiant sert aussi de dossier de données). */
  profileOrder: string[];
}

const STORAGE_KEY = "calti.settings.v3";
const LEGACY_KEY = "calti.settings";

function load(): Settings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const s = JSON.parse(saved);
      return { theme: s.theme ?? {}, profiles: s.profiles ?? {}, profileOrder: s.profileOrder?.length ? s.profileOrder : ["personnel", "pro"] };
    }
    // Ancien format (un environnement par profil) : le style de Personnel devient celui de l'application.
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "{}");
    const themes = old.themes ?? {};
    const { bookmarksFrom: _ignored, ...theme } = themes.personnel ?? themes.pro ?? themes.default ?? {};
    const profiles: Settings["profiles"] = {};
    for (const id of Object.keys(profileDefaults)) {
      const p: Partial<ProfileSettings> = {};
      if (old.names?.[id]?.trim()) p.name = old.names[id];
      if (themes[id] && "bookmarksFrom" in themes[id]) p.bookmarksFrom = themes[id].bookmarksFrom;
      profiles[id] = p;
    }
    return { theme, profiles, profileOrder: ["personnel", "pro"] };
  } catch {
    return { theme: {}, profiles: {}, profileOrder: ["personnel", "pro"] };
  }
}

interface SettingsContext {
  /** Style de l'application, complété par les valeurs par défaut. */
  theme: HomeTheme;
  updateTheme: (patch: Partial<HomeTheme>) => void;
  /** Profils dans l'ordre choisi. */
  profileIds: string[];
  profile: (id: string) => ProfileSettings;
  updateProfile: (id: string, patch: Partial<ProfileSettings>) => void;
  /** Crée un profil et renvoie son identifiant. */
  createProfile: (name: string) => string;
  /** Retire un profil de la liste (ses données de navigation restent sur le disque). */
  deleteProfile: (id: string) => void;
}

const Context = createContext<SettingsContext | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(load);

  // Plusieurs fenêtres : un réglage changé dans l'une s'applique aussitôt aux autres.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && setSettings(load());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* non persisté */ }
  }, [settings]);

  const value = useMemo<SettingsContext>(() => {
    const t = settings.theme;
    const layout = normalizeLayout(t.layout);
    // Anciennes cases « Blocs affichés » : reprises comme blocs masqués.
    for (const id of builtinIds) if (!t.layout && t.blocks?.[id] === false) layout[id] = { ...layout[id], hidden: true };
    const { blocks: _legacy, ...rest } = t;
    const theme: HomeTheme = { ...defaultTheme, ...rest, layout, chrome: { ...defaultChrome, ...rest.chrome } };
    return {
      theme,
      updateTheme: (patch) => setSettings((s) => ({ ...s, theme: { ...theme, ...patch } })),
      profileIds: settings.profileOrder,
      profile: (id) => {
        const p: ProfileSettings = {
          id, name: id, icon: "", color: defaultTheme.accent, search: "brave", startPage: "home",
          ...profileDefaults[id], ...settings.profiles[id],
        };
        return { ...p, name: p.name.trim() || profileDefaults[id]?.name || id };
      },
      updateProfile: (id, patch) => setSettings((s) => ({
        ...s,
        profiles: { ...s.profiles, [id]: { ...s.profiles[id], ...patch } },
      })),
      createProfile: (name) => {
        // Identifiant stable dérivé du nom (dossier de données), rendu unique.
        const base = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "profil";
        let id = base;
        for (let n = 2; settings.profileOrder.includes(id) || settings.profiles[id]; n++) id = `${base}-${n}`;
        const color = newProfileColors[settings.profileOrder.length % newProfileColors.length];
        setSettings((s) => ({
          ...s,
          profileOrder: [...s.profileOrder, id],
          profiles: { ...s.profiles, [id]: { name, color, icon: "" } },
        }));
        return id;
      },
      deleteProfile: (id) => setSettings((s) => {
        if (s.profileOrder.length <= 1) return s;
        const { [id]: _removed, ...profiles } = s.profiles;
        return { ...s, profileOrder: s.profileOrder.filter((p) => p !== id), profiles };
      }),
    };
  }, [settings]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSettings() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSettings hors de SettingsProvider");
  return ctx;
}

/** Applique le thème aux variables CSS globales. */
export function applyTheme(theme: HomeTheme) {
  const n = parseInt(theme.accent.slice(1), 16);
  const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  const font = fonts[theme.font];
  const root = document.documentElement.style;
  root.setProperty("--accent", theme.accent);
  root.setProperty("--accent-soft", `rgba(${rgb}, 0.13)`);
  root.setProperty("--accent-border", `rgba(${rgb}, 0.38)`);
  root.setProperty("--glass-alpha", String(theme.glassOpacity));
  root.setProperty("--font-headline", font.family);
  root.setProperty("--headline-weight", String(font.weight));
}
