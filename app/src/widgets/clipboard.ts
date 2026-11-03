// Copies récentes : textes, liens et images copiés dans Windows (voir src-tauri/src/clipboard.rs).
// La liste est dans le stockage local, les images réduites dans IndexedDB ; seule la fenêtre principale enregistre.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "../browser/windowEvents";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { run } from "../settings/backgrounds";

export interface Clip {
  id: string;
  kind: "text" | "link" | "image";
  /** Texte copié (ou adresse) ; vide pour une image. */
  text: string;
  at: number;
}

const LIST_KEY = "calti.clipboard";
const PAUSE_KEY = "calti.clipboard.paused";
const CHANGED = "calti:clipboard";
const MAX = 40;
const RETENTION_KEY = "calti.clipboard.retention";
const HOUR = 3_600_000;

/** Durées de conservation proposées, en heures (0 : sans limite de durée, les 40 dernières seulement). */
export const retentionChoices: [number, string][] = [[1, "1 heure"], [24, "1 jour"], [168, "7 jours"], [720, "30 jours"], [0, "Sans limite"]];

function readRetention(): number {
  const saved = Number(localStorage.getItem(RETENTION_KEY));
  return retentionChoices.some(([h]) => h === saved) && localStorage.getItem(RETENTION_KEY) != null ? saved : 168;
}

/** Retire les copies plus anciennes que la durée de conservation (et leurs images). */
function prune() {
  const hours = readRetention();
  if (!hours) return;
  const limit = Date.now() - hours * HOUR;
  const list = read();
  const kept = list.filter((c) => c.at >= limit);
  if (kept.length === list.length) return;
  for (const old of list) if (old.at < limit && old.kind === "image") run("readwrite", (s) => s.delete(clipImageKey(old.id))).catch(() => {});
  save(kept);
}
const THUMB = 640;

export const clipImageKey = (id: string) => `clip-${id}`;

function read(): Clip[] {
  try { return JSON.parse(localStorage.getItem(LIST_KEY) ?? "[]"); } catch { return []; }
}

function save(list: Clip[]) {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch { /* non persisté */ }
  window.dispatchEvent(new Event(CHANGED));
}

/** Ajoute une copie en tête ; un texte déjà présent remonte au lieu d'être doublé. */
function add(clip: Clip) {
  const list = read();
  const kept = clip.kind === "image" ? list : list.filter((c) => c.text !== clip.text);
  const next = [clip, ...kept];
  for (const old of next.slice(MAX)) if (old.kind === "image") run("readwrite", (s) => s.delete(clipImageKey(old.id))).catch(() => {});
  save(next.slice(0, MAX));
  prune();
}

/** Image copiée (BMP envoyé par Rust) réduite en JPEG. */
async function storeImage(id: string) {
  const bytes = await invoke<ArrayBuffer>("clipboard_image");
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/bmp" }));
  const scale = Math.min(1, THUMB / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("conversion impossible"))), "image/jpeg", 0.85));
  await run("readwrite", (s) => s.put(blob, clipImageKey(id)));
}

const isLink = (text: string) => /^(https?:\/\/|file:\/\/\/)\S+$/i.test(text.trim());

/** Enregistrement des copies : à appeler une fois, dans la fenêtre principale. */
export function useClipboardRecorder() {
  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    try { invoke("clipboard_pause", { paused: localStorage.getItem(PAUSE_KEY) === "1" }); } catch { /* sans effet */ }
    // Copies trop anciennes supprimées au lancement, puis toutes les dix minutes.
    prune();
    const pruning = window.setInterval(prune, 10 * 60_000);
    const subscriptions = Promise.all([
      listen<string>("clipboard:text", (e) => {
        const text = e.payload;
        add({ id: Date.now().toString(36), kind: isLink(text) ? "link" : "text", text: isLink(text) ? text.trim() : text, at: Date.now() });
      }),
      listen<number>("clipboard:image", async () => {
        const id = Date.now().toString(36);
        try {
          await storeImage(id);
          add({ id, kind: "image", text: "", at: Date.now() });
        } catch { /* image illisible : ignorée */ }
      }),
    ]);
    return () => {
      clearInterval(pruning);
      subscriptions.then((u) => u.forEach((f) => f()));
    };
  }, []);
}

/** Liste des copies, à jour dans toutes les fenêtres. */
export function useClipboardHistory() {
  const [clips, setClips] = useState<Clip[]>(read);
  const [paused, setPaused] = useState(() => localStorage.getItem(PAUSE_KEY) === "1");
  const [retention, setRetentionState] = useState(readRetention);
  useEffect(() => {
    const reload = () => setClips(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === LIST_KEY) reload();
      if (e.key === PAUSE_KEY) setPaused(e.newValue === "1");
      if (e.key === RETENTION_KEY) setRetentionState(readRetention());
    };
    window.addEventListener(CHANGED, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGED, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const remove = useCallback((id: string) => {
    save(read().filter((c) => c.id !== id));
    run("readwrite", (s) => s.delete(clipImageKey(id))).catch(() => {});
  }, []);
  const clear = useCallback(() => {
    for (const c of read()) if (c.kind === "image") run("readwrite", (s) => s.delete(clipImageKey(c.id))).catch(() => {});
    save([]);
  }, []);
  const togglePause = useCallback(() => {
    const next = !paused;
    try { localStorage.setItem(PAUSE_KEY, next ? "1" : "0"); } catch { /* non persisté */ }
    invoke("clipboard_pause", { paused: next }).catch(() => {});
    setPaused(next);
  }, [paused]);

  /** Nouvelle durée : les copies déjà trop anciennes partent tout de suite. */
  const setRetention = useCallback((hours: number) => {
    try { localStorage.setItem(RETENTION_KEY, String(hours)); } catch { /* non persisté */ }
    setRetentionState(hours);
    prune();
  }, []);

  return { clips, paused, remove, clear, togglePause, retention, setRetention };
}

/** Recopie une entrée dans le presse-papiers. */
export async function copyBack(clip: Clip) {
  if (clip.kind !== "image") return navigator.clipboard.writeText(clip.text);
  const jpeg = await run<Blob | undefined>("readonly", (s) => s.get(clipImageKey(clip.id)));
  if (!jpeg) return;
  // Le presse-papiers web n'accepte que le PNG.
  const bitmap = await createImageBitmap(jpeg);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject()), "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
