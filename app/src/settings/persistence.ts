// Copie de sécurité du stockage local dans un fichier (app/src-tauri/src/state.rs).
// WebView2 écrit le stockage local en différé : un arrêt brutal de l'ordinateur peut le perdre. La fenêtre
// principale en recopie donc toutes les clés « calti.* » dans un fichier, et les reprend au lancement si la copie
// est plus récente (numéro de génération) que ce que WebView2 a gardé.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const GEN_KEY = "calti.state.gen";
const EVERY = 3000;

interface Snapshot {
  calti: 1;
  gen: number;
  saved: string;
  data: Record<string, string>;
}

function collect(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith("calti.") && key !== GEN_KEY) data[key] = localStorage.getItem(key)!;
  }
  return data;
}

const localGen = () => Number(localStorage.getItem(GEN_KEY) ?? 0) || 0;

/** Au lancement (fenêtre principale) : reprend la copie si elle est plus récente que le stockage de WebView2. */
export async function restoreIfNewer(): Promise<boolean> {
  if (getCurrentWindow().label !== "main") return false;
  try {
    const text = await invoke<string | null>("state_load");
    if (!text) return false;
    const saved = JSON.parse(text) as Snapshot;
    if (saved?.calti !== 1 || typeof saved.data !== "object" || !(saved.gen > localGen())) return false;
    for (const key of Object.keys(collect())) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(saved.data)) {
      if (key.startsWith("calti.") && typeof value === "string") localStorage.setItem(key, value);
    }
    localStorage.setItem(GEN_KEY, String(saved.gen));
    return true;
  } catch {
    return false;
  }
}

/** Fenêtre principale : recopie le stockage dans le fichier à chaque changement (vérifié toutes les 3 s). */
export function startMirror() {
  if (getCurrentWindow().label !== "main") return;
  let last = "";
  const save = () => {
    const data = collect();
    // Stockage vidé (réinitialisation, perte en cours) : la copie précédente est gardée.
    if (!data["calti.settings.v3"]) return;
    const text = JSON.stringify(data);
    if (text === last) return;
    last = text;
    const gen = Math.max(Date.now(), localGen() + 1);
    try { localStorage.setItem(GEN_KEY, String(gen)); } catch { /* non persisté */ }
    const snapshot: Snapshot = { calti: 1, gen, saved: new Date().toISOString(), data };
    invoke("state_save", { data: JSON.stringify(snapshot) }).catch(() => { last = ""; });
  };
  save();
  window.setInterval(save, EVERY);
  // Fenêtre cachée ou fermée : copie immédiate.
  document.addEventListener("visibilitychange", save);
  window.addEventListener("pagehide", save);
}
