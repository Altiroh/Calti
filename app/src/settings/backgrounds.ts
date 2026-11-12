// Images (fond d'écran, photos de profil, préréglages) : réduites, compressées en WebP, enregistrées en fichiers sur
// l'ordinateur (dossier images/ de Calti) et gardées dans IndexedDB comme cache. WebView2 peut perdre IndexedDB ;
// une image absente du cache est alors relue depuis son fichier.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

const DB = "calti";
const STORE = "backgrounds";
const MAX_WIDTH = 2560;
const AVATAR = 256;
const WEBP = "image/webp";

export function openDb(name = DB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>, name = DB): Promise<T> {
  const db = await openDb(name);
  return new Promise((resolve, reject) => {
    const req = op(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Images gardées en fichiers ; celles du presse-papiers restent éphémères (IndexedDB seul). */
const onDisk = (key: string) => !key.startsWith("clip-");

/** Enregistre une image dans le cache et, sauf image éphémère, dans son fichier. */
export async function putImage(key: string, blob: Blob): Promise<void> {
  await run("readwrite", (s) => s.put(blob, key));
  if (onDisk(key)) await invoke("image_save", new Uint8Array(await blob.arrayBuffer()), { headers: { key } });
}

/** L'image, depuis le cache ou, s'il l'a perdue, depuis son fichier (remise alors en cache). */
export async function getImage(key: string): Promise<Blob | undefined> {
  const cached = await run<Blob | undefined>("readonly", (s) => s.get(key)).catch(() => undefined);
  if (cached || !onDisk(key)) return cached;
  const bytes = await invoke<ArrayBuffer>("image_load", { key }).catch(() => null);
  if (!bytes || !bytes.byteLength) return undefined;
  const blob = new Blob([bytes], { type: WEBP });
  await run("readwrite", (s) => s.put(blob, key)).catch(() => {});
  return blob;
}

export async function deleteImage(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key)).catch(() => {});
  if (onDisk(key)) await invoke("image_delete", { key }).catch(() => {});
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("conversion impossible"))), WEBP, quality));
}

/** Image redessinée (réduite à `maxWidth` au plus) puis compressée en WebP. */
async function toWebp(source: Blob, maxWidth = MAX_WIDTH, quality = 0.82): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { blob: await encode(canvas, quality), canvas };
}

/** Luminance moyenne (0 à 1) de la moitié haute de l'image, là où se trouve le titre. */
function luminance(source: CanvasImageSource, width: number, height: number): number {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 24;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0, width, height / 2, 0, 0, 48, 24);
  const data = ctx.getImageData(0, 0, 48, 24).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  }
  return sum / (data.length / 4);
}

/** Réduit l'image à 2560 px de large au plus, en WebP, l'enregistre et renvoie sa luminance. */
export async function saveBackground(key: string, file: File): Promise<number> {
  const { blob, canvas } = await toWebp(file);
  await putImage(key, blob);
  return luminance(canvas, canvas.width, canvas.height);
}

/** Image de profil : recadrée au carré, 256 px, comme une photo de compte. */
export async function saveAvatar(key: string, file: File): Promise<void> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR, AVATAR);
  bitmap.close();
  await putImage(key, await encode(canvas, 0.86));
}

export const deleteBackground = deleteImage;

/**
 * Au lancement : chaque image du cache sans fichier (enregistrée par une version précédente) est recompressée en
 * WebP et écrite sur le disque. Les images manquantes du cache sont relues à la demande par `getImage`.
 */
export async function syncImagesToDisk(): Promise<void> {
  if (getCurrentWindow().label !== "main") return;
  const [keys, saved] = await Promise.all([
    run<IDBValidKey[]>("readonly", (s) => s.getAllKeys()),
    invoke<string[]>("image_list"),
  ]);
  const have = new Set(saved);
  for (const key of keys) {
    if (typeof key !== "string" || !onDisk(key) || have.has(key)) continue;
    const old = await run<Blob | undefined>("readonly", (s) => s.get(key));
    if (!old) continue;
    try {
      const blob = old.type === WEBP ? old : (await toWebp(old, key.startsWith("profile-") ? AVATAR : MAX_WIDTH)).blob;
      await putImage(key, blob);
    } catch (e) {
      console.warn(`Calti : image ${key} non enregistrée sur le disque`, e);
    }
  }
}

/** URL affichable de l'image de fond ; `version` change à chaque nouvelle image. */
export function useBackground(key: string, version: number | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (version == null) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    getImage(key).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, version]);
  return url;
}
