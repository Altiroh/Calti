import { useState, type MouseEvent } from "react";
import type { Brave } from "../browser/adapter";
import type { LibraryEntry } from "../browser/library";
import { Card } from "../components/Card";
import { Favicon } from "../components/Favicon";
import { Icon } from "../components/Icon";
import { openMenu } from "../components/ContextMenu";
import { hostname, siteIcon } from "../components/siteIcon";
import { useBackground } from "../settings/backgrounds";
import { clipImageKey, copyBack, useClipboardHistory, type Clip } from "./clipboard";
import "./LibraryWidgets.css";

const time = (at: number) => {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

export interface HistoryView {
  entries: LibraryEntry[];
  clear: () => void;
  remove: (at: number) => void;
}

/**
 * Pages visitées par le profil, les plus récentes d'abord, avec un filtre.
 * Clic : dans l'onglet affiché ; clic molette : nouvel onglet en arrière-plan ; clic droit : menu.
 */
export function HistoryWidget({ brave, history }: { brave: Brave; history: HistoryView }) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const q = query.trim().toLowerCase();
  const entries = (q ? history.entries.filter((h) => `${h.title} ${h.url}`.toLowerCase().includes(q)) : history.entries).slice(0, 60);
  const open = (url: string, where: "current" | "new" | "background") => {
    setMenu(null);
    brave.send({ type: "openUrl", url, where });
  };

  const showMenu = (e: MouseEvent, h: LibraryEntry) => {
    e.preventDefault();
    setMenu(h.at);
    openMenu(e, [
      { header: hostname(h.url) },
      { label: "Ouvrir", image: siteIcon(h.url), action: () => open(h.url, "current") },
      { label: "Ouvrir dans un nouvel onglet", icon: "plus", tone: "green", action: () => open(h.url, "new") },
      { label: "Ouvrir en arrière-plan", icon: "tabs", tone: "teal", action: () => open(h.url, "background") },
      { label: "Copier le lien", icon: "link", tone: "violet", action: () => { navigator.clipboard.writeText(h.url).catch(() => {}); } },
      "-",
      { label: "Retirer de l'historique", icon: "trash", danger: true, action: () => history.remove(h.at) },
    ], () => setMenu(null));
  };

  return (
    <Card title="Historique" action={history.entries.length > 0 && (
      <button className="chip-btn" onClick={history.clear}>Effacer</button>
    )}>
      {history.entries.length > 6 && (
        <input className="lib-filter" value={query} placeholder="Filtrer…" spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="lib-list">
        {entries.map((h) => (
          <div key={h.at} className={`lib-row${menu === h.at ? " lib-row--menu" : ""}`}>
            <button className="lib-item" title={`${h.url}\nClic molette : nouvel onglet · clic droit : options`}
              onClick={() => open(h.url, "current")}
              // Sans cela, le clic molette lance le défilement automatique.
              onMouseDown={(e) => e.button === 1 && e.preventDefault()}
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); open(h.url, "background"); } }}
              onContextMenu={(e) => showMenu(e, h)}>
              <Favicon src={siteIcon(h.url)} />
              <span className="lib-item__title">{h.title || hostname(h.url)}</span>
              <span className="lib-item__meta">{time(h.at)}</span>
            </button>
            <button className="lib-remove" aria-label="Retirer de l'historique" onClick={() => history.remove(h.at)}>
              <Icon name="close" size={11} />
            </button>
          </div>
        ))}
        {entries.length === 0 && <p className="muted">{q ? "Aucun résultat." : "Les pages visitées s'afficheront ici."}</p>}
      </div>
    </Card>
  );
}

/** Textes, liens et images copiés récemment : un clic recopie (ou ouvre le lien). */
export function ClipboardWidget({ brave }: { brave: Brave }) {
  const { clips, paused, remove, clear, togglePause } = useClipboardHistory();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (clip: Clip) => copyBack(clip).then(() => {
    setCopied(clip.id);
    setTimeout(() => setCopied((c) => (c === clip.id ? null : c)), 1200);
  }).catch(() => {});

  return (
    <Card title="Copies récentes" action={(
      <span className="lib-actions">
        <button className={`chip-btn${paused ? " chip-btn--on" : ""}`} onClick={togglePause}
          title="Les mots de passe copiés depuis un gestionnaire ne sont jamais enregistrés">
          {paused ? "En pause" : "Pause"}
        </button>
        {clips.length > 0 && <button className="chip-btn" onClick={clear}>Effacer</button>}
      </span>
    )}>
      <div className="lib-list">
        {clips.map((clip) => (
          <div key={clip.id} className={`lib-row lib-clip lib-clip--${clip.kind}`}>
            {clip.kind === "image" ? (
              <button className="lib-item lib-item--image" title="Recopier l'image" onClick={() => copy(clip)}>
                <ClipImage id={clip.id} />
                <span className="lib-item__meta">{copied === clip.id ? "Copiée" : time(clip.at)}</span>
              </button>
            ) : clip.kind === "link" ? (
              <button className="lib-item" title={`Ouvrir ${clip.text}`} onClick={() => brave.send({ type: "openUrl", url: clip.text })}>
                <Favicon src={siteIcon(clip.text)} />
                <span className="lib-item__title">{hostname(clip.text)}<span className="lib-item__sub">{clip.text}</span></span>
                <span className="lib-item__meta">{copied === clip.id ? "Copié" : time(clip.at)}</span>
              </button>
            ) : (
              <button className="lib-item" title="Recopier" onClick={() => copy(clip)}>
                <span className="lib-item__glyph">T</span>
                <span className="lib-item__title lib-item__title--text">{clip.text.trim().slice(0, 240)}</span>
                <span className="lib-item__meta">{copied === clip.id ? "Copié" : time(clip.at)}</span>
              </button>
            )}
            {clip.kind === "link" && (
              <button className="lib-remove lib-remove--visible" aria-label="Recopier le lien" title="Recopier" onClick={() => copy(clip)}>
                <Icon name="popout" size={11} />
              </button>
            )}
            <button className="lib-remove" aria-label="Retirer" onClick={() => remove(clip.id)}><Icon name="close" size={11} /></button>
          </div>
        ))}
        {clips.length === 0 && <p className="muted">{paused ? "Enregistrement en pause." : "Copiez un texte, un lien ou une image : il s'affichera ici."}</p>}
      </div>
    </Card>
  );
}

function ClipImage({ id }: { id: string }) {
  const url = useBackground(clipImageKey(id), 1);
  return url ? <img className="lib-thumb" src={url} alt="" /> : <span className="lib-thumb" />;
}
