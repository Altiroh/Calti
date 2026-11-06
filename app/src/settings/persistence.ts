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

/** Journal de la copie (etat.log), pour comprendre une perte après coup. Une ligne qui n'a pas pu partir (Calti pas
 * encore joignable au démarrage) est réessayée quelques fois. */
function log(line: string, tries = 6) {
  invoke("state_log", { line }).catch(() => {
    if (tries > 1) window.setTimeout(() => log(line, tries - 1), 1500);
  });
}

/** Copie posée par Calti dans la page avant son chargement (app/src-tauri/src/state.rs, init_script). */
const injected = () => (window as { __CALTI_COPY__?: string | null }).__CALTI_COPY__;

/** Lit la copie : celle posée dans la page, sinon par un appel à Calti (réessayé : il peut échouer au démarrage). */
async function readCopy(): Promise<{ text: string | null; source: string }> {
  const ready = injected();
  if (typeof ready === "string") return { text: ready, source: "posée dans la page" };
  let last: unknown = null;
  for (let i = 0; i < 5; i++) {
    try {
      return { text: await invoke<string | null>("state_load"), source: "lue" };
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw last;
}

const parse = (text: string | null): Snapshot | null => {
  try {
    const saved = JSON.parse(text ?? "null") as Snapshot | null;
    return saved?.calti === 1 && typeof saved.data === "object" ? saved : null;
  } catch {
    return null;
  }
};

/** Écrit la copie dans le stockage local (toutes les clés « calti.* » remplacées). */
function apply(saved: Snapshot) {
  for (const key of Object.keys(collect())) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(saved.data)) {
    if (key.startsWith("calti.") && typeof value === "string") localStorage.setItem(key, value);
  }
  localStorage.setItem(GEN_KEY, String(Math.max(saved.gen, localGen())));
}

/** Profils de la copie (écran de bienvenue : les reprendre plutôt que d'en créer un). */
export async function copyProfiles(): Promise<string[]> {
  try {
    const saved = parse((await readCopy()).text);
    const settings = JSON.parse(saved?.data[SETTINGS_KEY] ?? "null");
    const order: string[] = Array.isArray(settings?.profileOrder) ? settings.profileOrder : [];
    return order.map((id) => settings.profiles?.[id]?.name?.trim() || id);
  } catch {
    return [];
  }
}

/** Reprend la copie à la demande (écran de bienvenue), puis recharge l'interface. */
export async function restoreFromCopy(): Promise<boolean> {
  const saved = parse((await readCopy()).text);
  if (!saved || profileCount(saved.data[SETTINGS_KEY]) === 0) return false;
  apply(saved);
  log("copie reprise depuis l'écran de bienvenue");
  location.reload();
  return true;
}

/**
 * Au lancement (fenêtre principale) : reprend la copie si le stockage de WebView2 a perdu ses profils, ou si la
 * copie est plus récente que lui. Un stockage vide ne l'emporte jamais sur une copie qui a des profils, quel que
 * soit son numéro de génération.
 */
export async function restoreIfNewer(): Promise<boolean> {
  // Fenêtre principale seulement ; la copie posée dans la page n'existe que là, ce qui suffit si l'appel échoue.
  let label = typeof injected() === "undefined" ? "" : "main";
  try { label = getCurrentWindow().label; } catch { /* Calti pas encore joignable */ }
  if (label !== "main") return false;
  const local = localStorage.getItem(SETTINGS_KEY);
  try {
    const { text, source } = await readCopy();
    if (!text) {
      log(`lancement : pas de copie ; stockage avec ${profileCount(local)} profil(s)`);
      return false;
    }
    const saved = parse(text);
    if (!saved) {
      log("lancement : copie illisible, ignorée");
      return false;
    }
    const savedProfiles = profileCount(saved.data[SETTINGS_KEY]);
    const lost = profileCount(local) === 0 && savedProfiles > 0;
    const newer = saved.gen > localGen() && savedProfiles > 0;
    log(`lancement : stockage ${profileCount(local)} profil(s) gén. ${localGen()} ; copie ${savedProfiles} profil(s) gén. ${saved.gen} (${source}) → ${lost || newer ? "copie reprise" : "stockage gardé"}${lost ? " (profils perdus)" : ""}`);
    if (!lost && !newer) return false;
    apply(saved);
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
