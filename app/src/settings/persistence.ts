// Copie de sécurité du stockage local dans un fichier (app/src-tauri/src/state.rs).
// WebView2 écrit le stockage local en différé et peut repartir d'un stockage vide (arrêt brutal, fermeture de
// session). La fenêtre principale recopie donc toutes les clés « calti.* » dans un fichier, et les reprend au
// lancement quand le stockage a perdu les profils ou quand la copie est plus récente (numéro de génération).
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const GEN_KEY = "calti.state.gen";
const SETTINGS_KEY = "calti.settings.v3";
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

/** Nombre de profils dans des réglages enregistrés (0 si absents ou illisibles). */
export function profileCount(settings: string | null | undefined): number {
  try {
    const order = JSON.parse(settings ?? "null")?.profileOrder;
    return Array.isArray(order) ? order.length : 0;
  } catch {
    return 0;
  }
}

const localGen = () => Number(localStorage.getItem(GEN_KEY) ?? 0) || 0;

/** Journal de la copie (etat.log), pour comprendre une perte après coup. */
const log = (line: string) => { invoke("state_log", { line }).catch(() => {}); };

/**
 * Au lancement (fenêtre principale) : reprend la copie si le stockage de WebView2 a perdu ses profils, ou si la
 * copie est plus récente que lui. Un stockage vide ne l'emporte jamais sur une copie qui a des profils, quel que
 * soit son numéro de génération.
 */
export async function restoreIfNewer(): Promise<boolean> {
  if (getCurrentWindow().label !== "main") return false;
  const local = localStorage.getItem(SETTINGS_KEY);
  try {
    const text = await invoke<string | null>("state_load");
    if (!text) {
      log(`lancement : pas de copie ; stockage avec ${profileCount(local)} profil(s)`);
      return false;
    }
    const saved = JSON.parse(text) as Snapshot;
    if (saved?.calti !== 1 || typeof saved.data !== "object") {
      log("lancement : copie illisible, ignorée");
      return false;
    }
    const savedProfiles = profileCount(saved.data[SETTINGS_KEY]);
    const lost = profileCount(local) === 0 && savedProfiles > 0;
    const newer = saved.gen > localGen() && savedProfiles > 0;
    log(`lancement : stockage ${profileCount(local)} profil(s) gén. ${localGen()} ; copie ${savedProfiles} profil(s) gén. ${saved.gen} → ${lost || newer ? "copie reprise" : "stockage gardé"}${lost ? " (profils perdus)" : ""}`);
    if (!lost && !newer) return false;
    for (const key of Object.keys(collect())) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(saved.data)) {
      if (key.startsWith("calti.") && typeof value === "string") localStorage.setItem(key, value);
    }
    localStorage.setItem(GEN_KEY, String(Math.max(saved.gen, localGen())));
    return true;
  } catch (e) {
    log(`lancement : lecture de la copie impossible (${e})`);
    return false;
  }
}

/** Fenêtre principale : recopie le stockage dans le fichier à chaque changement (vérifié toutes les 3 s). */
export function startMirror() {
  if (getCurrentWindow().label !== "main") return;
  let last = "";
  let warned = false;
  const save = () => {
    const data = collect();
    // Stockage sans profil (premier lancement, perte en cours) : la copie précédente est gardée.
    if (profileCount(data[SETTINGS_KEY]) === 0) {
      if (!warned) log("copie suspendue : stockage sans profil");
      warned = true;
      return;
    }
    warned = false;
    const text = JSON.stringify(data);
    if (text === last) return;
    last = text;
    const gen = Math.max(Date.now(), localGen() + 1);
    try { localStorage.setItem(GEN_KEY, String(gen)); } catch { /* non persisté */ }
    const snapshot: Snapshot = { calti: 1, gen, saved: new Date().toISOString(), data };
    invoke("state_save", { data: JSON.stringify(snapshot) }).catch((e) => {
      last = "";
      log(`copie refusée ou impossible : ${e}`);
    });
  };
  save();
  window.setInterval(save, EVERY);
  // Fenêtre cachée ou fermée : copie immédiate.
  document.addEventListener("visibilitychange", save);
  window.addEventListener("pagehide", save);
}
