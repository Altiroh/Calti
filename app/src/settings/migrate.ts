// Migration unique des données enregistrées sous l'ancien nom du projet (« nopro »).
// À supprimer une fois la migration faite sur ce poste.
import { run } from "./backgrounds";

const keys = [
  ["nopro.settings.v2", "calti.settings"],
  ["nopro.selectedProfile", "calti.selectedProfile"],
];

export async function migrateLegacyData(): Promise<void> {
  try {
    for (const [from, to] of keys) {
      const value = localStorage.getItem(from);
      if (value != null && localStorage.getItem(to) == null) localStorage.setItem(to, value);
      localStorage.removeItem(from);
    }

    const databases = await indexedDB.databases();
    if (!databases.some((d) => d.name === "nopro")) return;
    const [ids, blobs] = await Promise.all([
      run<IDBValidKey[]>("readonly", (s) => s.getAllKeys(), "nopro"),
      run<Blob[]>("readonly", (s) => s.getAll(), "nopro"),
    ]);
    for (let i = 0; i < ids.length; i++) {
      await run("readwrite", (s) => s.put(blobs[i], ids[i]));
    }
    indexedDB.deleteDatabase("nopro");
  } catch (e) {
    console.warn("Calti : migration des anciennes données impossible", e);
  }
}
