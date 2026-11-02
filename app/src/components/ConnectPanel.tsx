import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProfileState } from "../brave/types";
import type { BraveInstall } from "../brave/useBraveInstalls";
import { Icon } from "./Icon";
import "./ConnectPanel.css";

interface Props {
  installs: BraveInstall[];
  profiles: ProfileState[];
  onDismiss?: () => void;
}

type Status = "connected" | "waiting" | "missing";

const statusLabel: Record<Status, string> = {
  connected: "Connecté",
  waiting: "Extension installée · en attente de Brave",
  missing: "Extension à charger",
};

/** Guide de connexion : un chargement unique de l'extension par profil Brave, ensuite tout est automatique. */
export function ConnectPanel({ installs, profiles, onDismiss }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusOf = (install: BraveInstall): Status =>
    profiles.some((p) => install.profileIds.includes(p.id)) ? "connected"
      : install.extensionInstalled ? "waiting" : "missing";

  const revealFolder = async () => {
    try {
      const path = await invoke<string>("reveal_extension_folder");
      await navigator.clipboard.writeText(path).then(() => setCopied(true), () => {});
    } catch (e) {
      setError(String(e));
    }
  };

  const openExtensions = (dir: string) =>
    invoke("open_brave_extensions", { dir }).catch((e) => setError(String(e)));

  return (
    <section className="connect glass">
      <header className="connect__head">
        <div>
          <h2>Connecter Brave</h2>
          <p>Une seule fois par profil : ensuite Calti se connecte tout seul dès que Brave est ouvert.</p>
        </div>
        {onDismiss && (
          <button className="icon-btn" onClick={onDismiss} aria-label="Masquer"><Icon name="close" size={16} /></button>
        )}
      </header>

      <ol className="connect__steps">
        <li>Ouvrir les extensions du profil ci-dessous.</li>
        <li>Activer le <strong>Mode développeur</strong> (en haut à droite).</li>
        <li><strong>Charger l'extension non empaquetée</strong> et coller le chemin du dossier.</li>
      </ol>

      <div className="connect__profiles">
        {installs.map((install) => {
          const status = statusOf(install);
          return (
            <div key={install.dir} className="connect__row inset">
              <span className={`connect__dot connect__dot--${status}`} />
              <span className="connect__name">{install.name}</span>
              <span className="connect__status">{statusLabel[status]}</span>
              {status !== "connected" && (
                <button className="chip-btn" onClick={() => openExtensions(install.dir)}>Ouvrir les extensions</button>
              )}
              {status === "waiting" && install.nativeError && (
                <span className="connect__detail">Brave : « {install.nativeError} »</span>
              )}
            </div>
          );
        })}
        {installs.length === 0 && <p className="muted">Aucun profil Brave trouvé sur ce poste.</p>}
      </div>

      <footer className="connect__foot">
        <button className="chip-btn" onClick={revealFolder}>
          <Icon name="folder" size={13} /> {copied ? "Chemin copié" : "Dossier de l'extension (copie le chemin)"}
        </button>
        {error && <span className="connect__error">{error}</span>}
      </footer>
    </section>
  );
}
