// Préréglages d'apparence enregistrés par l'utilisateur : tout le style sauf la disposition et les textes de
// l'accueil. L'image de fond éventuelle est copiée à part dans IndexedDB (clé `preset-<id>`).
import { useCallback, useEffect, useState } from "react";
import { run } from "./backgrounds";
import { BACKGROUND_KEY, type HomeTheme } from "./settings";

export type Look = Omit<HomeTheme, "layout" | "headline" | "tagline">;

export interface AppearancePreset {
  id: string;
  name: string;
  /** Date de l'enregistrement, aussi « version » de l'image copiée. */
  at: number;
  look: Look;
  /** Une image de fond accompagne le préréglage. */
  image: boolean;
}

const KEY = "calti.appearance-presets";
const CHANGED = "calti:appearance-presets";
export const presetImageKey = (id: string) => `preset-${id}`;

function read(): AppearancePreset[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function write(list: AppearancePreset[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* non persisté */ }
  window.dispatchEvent(new Event(CHANGED));
}

async function copyImage(from: string, to: string) {
  const blob = await run<Blob | undefined>("readonly", (s) => s.get(from));
  if (blob) await run("readwrite", (s) => s.put(blob, to));
  return !!blob;
}

export function lookOf(theme: HomeTheme): Look {
  const { layout: _layout, headline: _headline, tagline: _tagline, ...look } = theme;
  return look;
}

export function useAppearancePresets() {
  const [presets, setPresets] = useState(read);
  useEffect(() => {
    const reload = () => setPresets(read());
    const onStorage = (e: StorageEvent) => e.key === KEY && reload();
    window.addEventListener(CHANGED, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGED, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const save = useCallback(async (name: string, theme: HomeTheme) => {
    const id = Date.now().toString(36);
    const image = theme.background != null && await copyImage(BACKGROUND_KEY, presetImageKey(id)).catch(() => false);
    write([...read(), { id, name: name.trim() || "Sans nom", at: Date.now(), look: lookOf(theme), image }]);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((p) => p.id !== id));
    run("readwrite", (s) => s.delete(presetImageKey(id))).catch(() => {});
  }, []);

  /** Style à appliquer ; l'image du préréglage redevient l'image de fond de l'application. */
  const resolve = useCallback(async (preset: AppearancePreset): Promise<Partial<HomeTheme>> => {
    const copied = preset.image && await copyImage(presetImageKey(preset.id), BACKGROUND_KEY).catch(() => false);
    return { ...preset.look, background: copied ? Date.now() : null };
  }, []);

  return { presets, save, remove, resolve };
}
