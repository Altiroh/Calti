// Images de fond : réduites puis stockées dans IndexedDB (quota bien supérieur à localStorage).
import { useEffect, useState } from "react";

const DB = "calti";
const STORE = "backgrounds";
const MAX_WIDTH = 2560;

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

/** Réduit l'image à 2560 px de large au plus, en JPEG, l'enregistre et renvoie sa luminance. */
export async function saveBackground(key: string, file: File): Promise<number> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("conversion impossible"))), "image/jpeg", 0.88));
  await run("readwrite", (s) => s.put(blob, key));
  return luminance(canvas, canvas.width, canvas.height);
}

export async function deleteBackground(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
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
    run<Blob | undefined>("readonly", (s) => s.get(key)).then((blob) => {
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
