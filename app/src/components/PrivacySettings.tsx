import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { ProfileId } from "../browser/useBrowser";
import { Check, Section } from "./Controls";

/* --- Données d'un profil : effacement, autorisations des sites ------------------ */

const dataKinds: [string, string][] = [
  ["history", "Historique de navigation"], ["cookies", "Cookies et connexions"], ["cache", "Images et fichiers en cache"],
  ["storage", "Données des sites (stockage local)"], ["autofill", "Saisie automatique des formulaires"],
  ["passwords", "Mots de passe enregistrés"], ["downloads", "Historique des téléchargements"],
];

const permissionLabels: Record<string, string> = {
  camera: "Caméra", microphone: "Micro", geolocation: "Position", notifications: "Notifications", clipboard: "Presse-papiers",
  autoplay: "Lecture automatique", downloads: "Téléchargements multiples", files: "Fichiers", fonts: "Polices", sensors: "Capteurs",
  midi: "MIDI",
};

interface SitePermission {
  origin: string;
  kind: string;
  allowed: boolean;
}

/** Efface des données du profil (confirmation sur place) et gère les autorisations accordées aux sites. */
export function ProfileData({ profile }: { profile: ProfileId }) {
  const [kinds, setKinds] = useState<string[]>(["cache"]);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<SitePermission[] | null>(null);

  const clear = () => {
    setConfirm(false);
    invoke("clear_browsing_data", { profile, kinds })
      .then(() => setMessage("Données effacées."))
      .catch((e) => setMessage(String(e)));
  };
  const loadPermissions = () =>
    invoke<SitePermission[]>("site_permissions", { profile }).then((list) => { setPermissions(list); setMessage(null); }).catch((e) => setMessage(String(e)));
  const setPermission = (p: SitePermission, state: "allow" | "deny" | "default") =>
    invoke("site_permission_set", { profile, origin: p.origin, kind: p.kind, state }).then(loadPermissions).catch((e) => setMessage(String(e)));

  return (
    <>
      <div className="privacy__kinds">
        {dataKinds.map(([kind, label]) => (
          <Check key={kind} label={label} checked={kinds.includes(kind)}
            onChange={(on) => setKinds((k) => (on ? [...k, kind] : k.filter((x) => x !== kind)))} />
        ))}
      </div>
      {confirm ? (
        <div className="settings__row">
          <button className="btn btn--danger" onClick={clear}>Confirmer l'effacement</button>
          <button className="btn btn--ghost" onClick={() => setConfirm(false)}>Annuler</button>
        </div>
      ) : (
        <button className="btn btn--ghost" disabled={!kinds.length} onClick={() => setConfirm(true)}>Effacer les données choisies…</button>
      )}

      <div className="settings__row">
        <button className="btn btn--ghost" onClick={loadPermissions}>Autorisations des sites</button>
      </div>
      {permissions && (permissions.length === 0
        ? <p className="settings__hint">Aucun site n'a reçu ni essuyé d'autorisation particulière.</p>
        : (
          <ul className="privacy__perms">
            {permissions.map((p) => (
              <li key={`${p.origin}-${p.kind}`}>
                <span className="privacy__origin" title={p.origin}>{p.origin.replace(/^https?:\/\//, "")}</span>
                <span>{permissionLabels[p.kind] ?? p.kind}</span>
                <select className="field" value={p.allowed ? "allow" : "deny"}
                  onChange={(e) => setPermission(p, e.target.value as "allow" | "deny" | "default")}>
                  <option value="allow">Autorisé</option>
                  <option value="deny">Bloqué</option>
                  <option value="default">Redemander</option>
                </select>
              </li>
            ))}
          </ul>
        ))}
      {message && <p className="settings__hint">{message}</p>}
    </>
  );
}

/* --- Zoom des pages ------------------------------------------------------------- */

const zoomLevels = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const percent = (f: number) => `${Math.round(f * 100)} %`;

interface ZoomState {
  default: number;
  sites: [string, string, number][];
}

/** Zoom par défaut des pages et sites qui ont leur propre zoom (retenu à chaque Ctrl+molette). */
export function ZoomSettings() {
  const [state, setState] = useState<ZoomState | null>(null);
  const refresh = () => invoke<ZoomState>("zoom_settings").then(setState).catch(() => {});
  useEffect(() => {
    refresh();
    // Un zoom changé dans une page met la liste à jour.
    const unlisten = listen("browser:tabs", () => refresh());
    return () => { unlisten.then((u) => u()); };
  }, []);
  const set = (site: string | null, factor: number | null) => invoke("zoom_set", { site, factor }).then(refresh).catch(() => {});
  if (!state) return null;
  return (
    <Section title="Zoom des pages">
      <label className="pblock__field">
        <span>Zoom par défaut</span>
        <select className="field" value={state.default} onChange={(e) => set(null, Number(e.target.value))}>
          {zoomLevels.map((f) => <option key={f} value={f}>{percent(f)}{f === 1 ? " (taille réelle)" : ""}</option>)}
        </select>
      </label>
      {state.sites.length > 0 ? (
        <ul className="privacy__perms">
          {state.sites.map(([profile, site, factor]) => (
            <li key={`${profile}|${site}`} className="zoom-site">
              <span className="privacy__origin" title={`${site} · profil ${profile}`}>{site}</span>
              <span>{percent(factor)}</span>
              <button className="btn btn--ghost" onClick={() => set(`${profile}|${site}`, null)}>Oublier</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings__hint">Aucun site n'a son propre zoom.</p>
      )}
      <p className="settings__hint">
        Ctrl+molette, Ctrl+Plus et Ctrl+Moins zooment la page ; le zoom est retenu pour le site (par profil). Ctrl+0 revient
        au zoom par défaut. Aussi dans le clic droit de la barre du haut.
      </p>
    </Section>
  );
}

/* --- Navigateur par défaut, sauvegarde des réglages ----------------------------- */

/** Réglages de Calti (localStorage) : tout ce qui commence par « calti. », sauf les sessions d'onglets. */
const exportable = (key: string) => key.startsWith("calti.") && !key.startsWith("calti.browser");

export function SystemSettings() {
  const [message, setMessage] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const register = () =>
    invoke("register_default_browser")
      .then(() => setMessage("Calti est déclaré à Windows : choisissez-le dans la fenêtre « Applications par défaut » qui vient de s'ouvrir."))
      .catch((e) => setMessage(String(e)));

  const exportSettings = () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (exportable(key)) data[key] = localStorage.getItem(key)!;
    }
    const blob = new Blob([JSON.stringify({ calti: 1, saved: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `calti-reglages-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setMessage("Réglages exportés (profils, apparence, favoris, historique, notes). Les images de fond ne sont pas incluses.");
  };

  const importSettings = (input: HTMLInputElement) => {
    const chosen = input.files?.[0];
    input.value = "";
    if (!chosen) return;
    chosen.text().then((text) => {
      const parsed = JSON.parse(text);
      if (parsed?.calti !== 1 || typeof parsed.data !== "object") throw new Error("ce fichier n'est pas une sauvegarde de Calti");
      const entries = Object.entries(parsed.data as Record<string, unknown>).filter(([k, v]) => exportable(k) && typeof v === "string");
      for (const [key, value] of entries) localStorage.setItem(key, value as string);
      setMessage(`${entries.length} réglage(s) repris : rechargement…`);
      setTimeout(() => location.reload(), 900);
    }).catch((e) => setMessage(`Import impossible : ${e instanceof Error ? e.message : e}`));
  };

  return (
    <>
      <Section title="Navigateur par défaut">
        <p className="settings__hint">
          Les liens ouverts depuis vos autres applications (mails, documents…) s'ouvriront dans Calti, dans un nouvel onglet
          de la fenêtre principale. Windows demande de confirmer ce choix dans ses paramètres.
        </p>
        <button className="btn btn--ghost" onClick={register}>Faire de Calti le navigateur par défaut…</button>
      </Section>

      <Section title="Sauvegarde des réglages">
        <div className="settings__row">
          <button className="btn btn--ghost" onClick={exportSettings}>Exporter…</button>
          <button className="btn btn--ghost" onClick={() => file.current?.click()}>Importer…</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => importSettings(e.target)} />
        </div>
        <p className="settings__hint">Un fichier pour retrouver vos profils, votre apparence et vos pages sur un autre ordinateur.</p>
      </Section>
      {message && <p className="settings__hint">{message}</p>}
    </>
  );
}
