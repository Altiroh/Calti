// Favori ajouté ou modifié (étoile, Ctrl+D) : nom, dossier (barre de favoris, dossiers, nouveau dossier), supprimer.
// Sous l'étoile, par-dessus la page : sa place est découpée dans la page (`onRect`). Les changements s'appliquent
// en fermant (Terminé, Entrée, Échap, clic ailleurs).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProfileBookmarks } from "../browser/library";
import type { Cutout } from "../browser/useBrowser";
import { Icon } from "./Icon";
import "./BookmarkEditor.css";

export function BookmarkEditor({ url, marks, added, onClose, onRect }: {
  url: string;
  marks: ProfileBookmarks;
  /** Ajouté à l'instant (sinon : modification d'un favori existant). */
  added: boolean;
  onClose: () => void;
  onRect: (r: Cutout | null) => void;
}) {
  const entry = marks.get(url);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [folder, setFolder] = useState<string | undefined>(entry?.folder);
  const [creating, setCreating] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLInputElement>(null);
  const state = useRef({ title, folder });
  state.current = { title, folder };

  const save = () => {
    const { title: t, folder: f } = state.current;
    if (marks.get(url)) marks.update(url, { title: t, folder: f });
    onClose();
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    name.current?.focus();
    name.current?.select();
    // Clic ailleurs dans l'interface : enregistré et fermé.
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) saveRef.current(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); saveRef.current(); } };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey); };
  }, []);

  // Place transmise seulement quand elle change (sinon chaque rendu en relancerait un autre). Mesurée à chaque
  // rendu, pendant l'apparition (sa place n'est juste qu'une fois posée), à la fin de l'animation et si la taille change.
  const sent = useRef("");
  const measure = useRef(() => {});
  measure.current = () => {
    const r = box.current?.getBoundingClientRect();
    const cut = r ? { x: Math.round(r.left) - 2, y: Math.round(r.top) - 2, width: Math.round(r.width) + 4, height: Math.round(r.height) + 4, radius: 18 } : null;
    const key = JSON.stringify(cut);
    if (key !== sent.current) { sent.current = key; onRect(cut); }
  };
  useLayoutEffect(() => measure.current());
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let frames = 0, raf = 0;
    const tick = () => { measure.current(); if (++frames < 30) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const observer = new ResizeObserver(() => measure.current());
    observer.observe(el);
    const onEnd = () => measure.current();
    el.addEventListener("animationend", onEnd);
    window.addEventListener("resize", onEnd);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); el.removeEventListener("animationend", onEnd); window.removeEventListener("resize", onEnd); };
  }, []);
  useEffect(() => () => onRect(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const createFolder = () => {
    const n = creating?.trim();
    if (!n) return setCreating(null);
    setFolder(marks.addFolder(n));
    setCreating(null);
  };

  if (!entry) return null;
  return (
    <div ref={box} className="bmedit glass" role="dialog" aria-label={added ? "Favori ajouté" : "Modifier le favori"}
      onSubmit={(e) => e.preventDefault()}>
      <div className="bmedit__head">
        <Icon name="star" size={14} />
        <strong>{added ? "Favori ajouté" : "Favori"}</strong>
      </div>
      <input ref={name} className="bmedit__name" value={title} aria-label="Nom" placeholder="Nom"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} />
      <div className="bmedit__folders" role="listbox" aria-label="Dossier">
        <button type="button" role="option" aria-selected={!folder} className={`bmedit__folder${!folder ? " bmedit__folder--on" : ""}`}
          onClick={() => setFolder(undefined)}>
          <Icon name="star" size={13} /><span>Barre de favoris</span>
        </button>
        {marks.folders.map((f) => (
          <button key={f.id} type="button" role="option" aria-selected={folder === f.id}
            className={`bmedit__folder${folder === f.id ? " bmedit__folder--on" : ""}`} onClick={() => setFolder(f.id)}>
            <Icon name="folder" size={13} /><span>{f.name}</span>
          </button>
        ))}
        {creating == null ? (
          <button type="button" className="bmedit__folder bmedit__folder--new" onClick={() => setCreating("")}>
            <Icon name="plus" size={13} /><span>Nouveau dossier</span>
          </button>
        ) : (
          <div className="bmedit__create">
            <Icon name="folder" size={13} />
            <input autoFocus value={creating} placeholder="Nom du dossier" aria-label="Nom du dossier"
              onChange={(e) => setCreating(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); createFolder(); }
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setCreating(null); }
              }} />
            <button type="button" className="icon-btn" aria-label="Créer" onClick={createFolder}><Icon name="check" size={13} /></button>
          </div>
        )}
      </div>
      <div className="bmedit__actions">
        <button type="button" className="chip-btn bmedit__remove" onClick={() => { marks.remove(url); onClose(); }}>Supprimer</button>
        <button type="button" className="chip-btn bmedit__done" onClick={save}>Terminé</button>
      </div>
    </div>
  );
}
