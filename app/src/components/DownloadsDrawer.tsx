import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";
import "./DownloadsDrawer.css";

/** Miroir de `Download` dans app/src-tauri/src/features.rs. */
export interface Download {
  id: number;
  profile: string;
  url: string;
  path: string;
  received: number;
  total: number;
  state: "progress" | "done" | "failed" | "cancelled";
  started: number;
}

/** Téléchargements de toutes les fenêtres, tenus à jour. */
export function useDownloads(): Download[] {
  const [list, setList] = useState<Download[]>([]);
  useEffect(() => {
    invoke<Download[]>("downloads_list").then(setList).catch(() => {});
    const unlisten = listen<Download[]>("browser:downloads", (e) => setList(e.payload));
    return () => { unlisten.then((u) => u()); };
  }, []);
  return list;
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0).replace(".", ",")} ${units[unit]}`;
}

const fileName = (d: Download) => d.path.split(/[\\/]/).pop() || d.url.split("/").pop() || "fichier";

const status = (d: Download) => {
  switch (d.state) {
    case "done": return size(d.received);
    case "failed": return "Échec";
    case "cancelled": return "Annulé";
    default: return d.total > 0 ? `${size(d.received)} sur ${size(d.total)}` : size(d.received);
  }
};

/** Panneau des téléchargements (Ctrl+J) : progression, ouverture du fichier ou de son dossier, annulation. */
export function DownloadsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const list = useDownloads();
  const [error, setError] = useState<string | null>(null);
  const run = (command: string, args: Record<string, unknown>) =>
    invoke(command, args).then(() => setError(null)).catch((e) => setError(String(e)));

  return (
    <Drawer open={open} title="Téléchargements" onClose={onClose}>
      {error && <p className="downloads__error">{error}</p>}
      {list.length === 0 ? (
        <p className="settings__hint">Aucun téléchargement pour l'instant. Les fichiers vont dans le dossier Téléchargements de Windows.</p>
      ) : (
        <ul className="downloads">
          {list.map((d) => (
            <li key={d.id} className={`download download--${d.state}`}>
              <button className="download__main" disabled={d.state !== "done"} title={d.path}
                onClick={() => run("download_open", { id: d.id, reveal: false })}>
                <span className="download__icon"><Icon name="download" size={16} /></span>
                <span className="download__text">
                  <span className="download__name">{fileName(d)}</span>
                  <span className="download__status">{status(d)}</span>
                </span>
              </button>
              {d.state === "progress" && (
                <>
                  <progress className="download__bar" value={d.total > 0 ? d.received : undefined} max={d.total > 0 ? d.total : undefined} />
                  <button className="icon-btn" title="Annuler" aria-label="Annuler" onClick={() => run("download_cancel", { id: d.id })}>
                    <Icon name="close" size={14} />
                  </button>
                </>
              )}
              {d.state === "done" && (
                <button className="icon-btn" title="Afficher dans le dossier" aria-label="Afficher dans le dossier"
                  onClick={() => run("download_open", { id: d.id, reveal: true })}>
                  <Icon name="folder" size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.some((d) => d.state !== "progress") && (
        <button className="chip-btn downloads__clear" onClick={() => run("downloads_clear", {})}>Effacer la liste</button>
      )}
    </Drawer>
  );
}
