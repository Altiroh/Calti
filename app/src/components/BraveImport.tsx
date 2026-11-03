import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { importHistory, importTopSites, type VisitedPage } from "../browser/library";

/**
 * Reprise d'un profil Brave dans un profil Calti : historique et sites les plus visités tout de suite,
 * mots de passe depuis l'export CSV de Brave (enregistrés au redémarrage, la base étant verrouillée tant que Calti tourne).
 * Les connexions (cookies) ne sont pas reprises : Brave les chiffre avec une protection qui lui est propre.
 */
export function BraveImport({ profile, braveDir }: { profile: string; braveDir: string | null }) {
  const [status, setStatus] = useState<string | null>(null);
  const [waitingRestart, setWaitingRestart] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const importBrowsing = async () => {
    if (!braveDir) return;
    setStatus("Lecture de l'historique de Brave…");
    try {
      const { recent, top } = await invoke<{ recent: VisitedPage[]; top: VisitedPage[] }>("brave_history", { dir: braveDir });
      const added = importHistory(profile, recent);
      const sites = importTopSites(profile, top);
      setStatus(`${added} page${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""} à l'historique, ${sites} site${sites > 1 ? "s" : ""} les plus visités dans l'accès rapide.`);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const queuePasswords = async (f: File | undefined) => {
    if (!f) return;
    try {
      await invoke("queue_password_import", { profile, csv: await f.text() });
      setWaitingRestart(true);
      setStatus("Fichier prêt : les mots de passe seront enregistrés au redémarrage de Calti. Supprimez ensuite le fichier exporté, il contient vos mots de passe en clair.");
    } catch (e) {
      setStatus(String(e));
    }
  };

  return (
    <>
      <button className="btn" disabled={!braveDir} onClick={importBrowsing}>Importer l'historique et les sites les plus visités</button>
      <button className="btn btn--ghost" onClick={() => file.current?.click()}>Importer les mots de passe (fichier CSV)…</button>
      <p className="settings__hint">
        Dans Brave : Paramètres → Gestionnaire de mots de passe → Paramètres → Exporter les mots de passe. Les connexions en cours
        ne peuvent pas être reprises (Brave les protège) : il faudra se reconnecter une fois, les mots de passe seront proposés.
      </p>
      {status && <p className="settings__hint" role="status">{status}</p>}
      {waitingRestart && <button className="btn" onClick={() => invoke("restart_app")}>Redémarrer Calti maintenant</button>}
      <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { queuePasswords(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}
