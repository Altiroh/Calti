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
}

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
};

/** Ce qui reste propre à chaque profil : nom, couleur de repère, source des favoris. Pas de style. */
export interface ProfileSettings {
  name: string;
  /** Couleur de la pastille et du liseré du volet. */
  color: string;
  /** Profil Brave (dossier) dont on lit les favoris ; null = aucun, absent = choix automatique. */
  bookmarksFrom?: string | null;
}

const profileDefaults: Record<string, ProfileSettings> = {
  personnel: { name: "Personnel", color: "#2f5fa8" },
  pro: { name: "Pro", color: "#1f8c8c" },
};

/** Clé de l'image de fond de l'application (IndexedDB). */
export const BACKGROUND_KEY = "app";

interface Settings {
  /** Style de l'application, commun à tous les profils et à toutes les fenêtres. */
  theme: Partial<HomeTheme> & { blocks?: Record<string, boolean> };
  profiles: Record<string, Partial<ProfileSettings>>;
}

const STORAGE_KEY = "calti.settings.v3";
const LEGACY_KEY = "calti.settings";

function load(): Settings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const s = JSON.parse(saved);
      return { theme: s.theme ?? {}, profiles: s.profiles ?? {} };
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
    return { theme, profiles };
  } catch {
    return { theme: {}, profiles: {} };
  }
}

interface SettingsContext {
  /** Style de l'application, complété par les valeurs par défaut. */
  theme: HomeTheme;
  updateTheme: (patch: Partial<HomeTheme>) => void;
  profile: (id: string) => ProfileSettings;
  updateProfile: (id: string, patch: Partial<ProfileSettings>) => void;
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
    const theme: HomeTheme = { ...defaultTheme, ...rest, layout };
    return {
      theme,
      updateTheme: (patch) => setSettings((s) => ({ ...s, theme: { ...theme, ...patch } })),
      profile: (id) => {
        const p = { ...(profileDefaults[id] ?? { name: id, color: defaultTheme.accent }), ...settings.profiles[id] };
        return { ...p, name: p.name.trim() || profileDefaults[id]?.name || id };
      },
      updateProfile: (id, patch) => setSettings((s) => ({
        ...s,
        profiles: { ...s.profiles, [id]: { ...s.profiles[id], ...patch } },
      })),
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
