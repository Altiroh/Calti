// Migrations uniques des données des versions précédentes. À supprimer une fois faites sur ce poste.
import { run } from "./backgrounds";

const keys = [
  ["nopro.settings.v2", "calti.settings"],
  ["nopro.selectedProfile", "calti.selectedProfile"],
];

/** Images de fond des anciens environnements par profil, par ordre de préférence. */
const LEGACY_BACKGROUNDS = ["personnel", "pro", "default"];

export async function migrateLegacyData(): Promise<void> {
  try {
    for (const [from, to] of keys) {
      const value = localStorage.getItem(from);
      if (value != null && localStorage.getItem(to) == null) localStorage.setItem(to, value);
      localStorage.removeItem(from);
    }

    const databases = await indexedDB.databases();
    if (databases.some((d) => d.name === "nopro")) {
      const [ids, blobs] = await Promise.all([
        run<IDBValidKey[]>("readonly", (s) => s.getAllKeys(), "nopro"),
        run<Blob[]>("readonly", (s) => s.getAll(), "nopro"),
      ]);
      for (let i = 0; i < ids.length; i++) {
        await run("readwrite", (s) => s.put(blobs[i], ids[i]));
      }
      indexedDB.deleteDatabase("nopro");
    }

    // Style commun à l'application : l'image de fond passe sous la clé « app ».
    if (!(await run<Blob | undefined>("readonly", (s) => s.get("app")))) {
      for (const key of LEGACY_BACKGROUNDS) {
        const blob = await run<Blob | undefined>("readonly", (s) => s.get(key));
        if (blob) {
          await run("readwrite", (s) => s.put(blob, "app"));
          break;
        }
      }
    }
  } catch (e) {
    console.warn("Calti : migration des anciennes données impossible", e);
  }
}
