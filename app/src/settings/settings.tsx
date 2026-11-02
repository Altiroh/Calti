import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { builtinIds, defaultLayout, normalizeLayout, type Layout } from "./layout";

/** Environnement de la page d'accueil. Chaque profil Brave a le sien ; « default » sert sans profil. */
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
  /** Profil Brave (dossier) dont on lit les favoris ; null = aucun, absent = choix automatique. */
  bookmarksFrom?: string | null;
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

interface Settings {
  /** Nom donné à chaque profil Brave, par identifiant. */
  names: Record<string, string>;
  themes: Record<string, HomeTheme>;
}

const STORAGE_KEY = "calti.settings";

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { names: raw.names ?? {}, themes: raw.themes ?? {} };
  } catch {
    return { names: {}, themes: {} };
  }
}

interface SettingsContext {
  names: Record<string, string>;
  /** Nom choisi dans Calti, sinon nom du profil dans Brave, sinon « Profil n ». */
  profileName: (id: string, index: number, braveName?: string) => string;
  setName: (id: string, name: string) => void;
  /** Thème d'un profil (ou « default »), complété par les valeurs par défaut. */
  themeFor: (key: string) => HomeTheme;
  updateTheme: (key: string, patch: Partial<HomeTheme>) => void;
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
    const themeFor = (key: string): HomeTheme => {
      const t: Partial<HomeTheme> & { blocks?: Record<string, boolean> } = settings.themes[key] ?? settings.themes.default ?? {};
      const layout = normalizeLayout(t.layout);
      // Anciennes cases « Blocs affichés » : reprises comme blocs masqués.
      for (const id of builtinIds) if (!t.layout && t.blocks?.[id] === false) layout[id] = { ...layout[id], hidden: true };
      const { blocks: _legacy, ...rest } = t;
      return { ...defaultTheme, ...rest, layout };
    };
    return {
      names: settings.names,
      profileName: (id, index, braveName) => settings.names[id]?.trim() || braveName || `Profil ${index + 1}`,
      setName: (id, name) => setSettings((s) => ({ ...s, names: { ...s.names, [id]: name } })),
      themeFor,
      // Un profil sans thème part d'une copie du thème général.
      updateTheme: (key, patch) => setSettings((s) => ({
        ...s,
        themes: { ...s.themes, [key]: { ...themeFor(key), ...patch } },
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
