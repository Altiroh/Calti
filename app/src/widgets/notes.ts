// Carnet de notes commun à tous les profils : chaque note (et chaque groupe) appartient à un profil et peut être
// partagée avec d'autres profils ou avec tous. Un seul enregistrement (« calti.notebook ») dans le stockage local de
// l'interface, repris dans la copie de sécurité (etat.json) comme les autres clés « calti.* ».
import { useCallback, useEffect, useState } from "react";

/** Partage : profils qui voient la note en plus de son profil, ou tous. */
export type Share = "all" | string[];

export interface Note {
  id: string;
  title: string;
  text: string;
  /** Couleur de la note (une des teintes de `noteColors`), ou null. */
  color: string | null;
  /** Groupe, ou null (notes sans groupe, en tête). */
  group: string | null;
  pinned: boolean;
  owner: string;
  share: Share;
  created: number;
  updated: number;
}

export interface NoteGroup {
  id: string;
  name: string;
  color: string;
  owner: string;
  share: Share;
}

export interface Notebook {
  v: 1;
  /** Ordre d'affichage des groupes. */
  groups: NoteGroup[];
  /** Ordre manuel des notes (dans chaque groupe, l'ordre du tableau). */
  notes: Note[];
}

/** Préférences d'affichage, par profil. */
export interface NotesView {
  layout: "list" | "grid";
  sort: "manual" | "updated" | "title";
  /** Groupes repliés. */
  collapsed: string[];
}

export const noteColors: { value: string; label: string }[] = [
  { value: "#f5c542", label: "Jaune" },
  { value: "#f08c3c", label: "Orange" },
  { value: "#e5534b", label: "Rouge" },
  { value: "#e468a8", label: "Rose" },
  { value: "#9b6bdf", label: "Violet" },
  { value: "#4a8fe7", label: "Bleu" },
  { value: "#2fb3a3", label: "Turquoise" },
  { value: "#5fb35a", label: "Vert" },
  { value: "#8b94a3", label: "Gris" },
];

const KEY = "calti.notebook";
const LEGACY = "calti.notes.";
const VIEW = "calti.notes.view.";
const CHANGED = "calti:notebook";

const empty = (): Notebook => ({ v: 1, groups: [], notes: [] });
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function read(): Notebook {
  try {
    const book = JSON.parse(localStorage.getItem(KEY) ?? "null") as Notebook | null;
    if (book?.v === 1 && Array.isArray(book.notes) && Array.isArray(book.groups)) return book;
  } catch { /* illisible : repris des anciens blocs-notes */ }
  return migrate();
}

/** Anciens blocs-notes (un texte par profil, « calti.notes.<profil> ») : une note chacun. */
function migrate(): Notebook {
  const book = empty();
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(LEGACY) && !key.startsWith(VIEW)) keys.push(key);
  }
  for (const key of keys) {
    const text = localStorage.getItem(key) ?? "";
    if (!text.trim()) continue;
    const now = Date.now();
    book.notes.push({ id: newId(), title: "", text, color: null, group: null, pinned: false, owner: key.slice(LEGACY.length), share: [], created: now, updated: now });
  }
  if (keys.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(book));
      for (const key of keys) localStorage.removeItem(key);
    } catch { /* gardés tels quels */ }
  }
  return book;
}

function write(book: Notebook) {
  try { localStorage.setItem(KEY, JSON.stringify(book)); } catch { /* non persisté */ }
  window.dispatchEvent(new Event(CHANGED));
}

/** La note (ou le groupe) est-elle visible dans ce profil ? */
export const sharedWith = (item: { owner: string; share: Share }, profile: string) =>
  item.owner === profile || item.share === "all" || item.share.includes(profile);

export const isShared = (item: { share: Share }) => item.share === "all" || item.share.length > 0;

/** Titre affiché : le titre, sinon la première ligne du texte. */
export const noteTitle = (n: Note) => n.title.trim() || n.text.trim().split("\n")[0].slice(0, 80) || "Note vide";

/** Aperçu : le texte sans la ligne reprise comme titre. */
export const notePreview = (n: Note) => {
  const text = n.text.trim();
  return (n.title.trim() ? text : text.split("\n").slice(1).join("\n")).trim().slice(0, 300);
};

/** Carnet partagé, suivi entre fenêtres (événement « storage ») et entre widgets (événement interne). */
export function useNotebook() {
  const [book, setBook] = useState<Notebook>(read);
  useEffect(() => {
    const reload = () => setBook(read());
    const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && reload();
    window.addEventListener(CHANGED, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGED, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  /** Applique un changement sur la dernière version enregistrée (une autre fenêtre a pu écrire entre-temps). */
  const change = useCallback((fn: (b: Notebook) => Notebook) => write(fn(read())), []);

  const actions = {
    addNote: (owner: string, patch: Partial<Note> = {}) => {
      const now = Date.now();
      const note: Note = { id: newId(), title: "", text: "", color: null, group: null, pinned: false, owner, share: [], created: now, updated: now, ...patch };
      // En tête de son groupe (après les notes épinglées).
      change((b) => {
        const notes = [...b.notes];
        const at = notes.findIndex((n) => n.group === note.group && !n.pinned);
        notes.splice(at < 0 ? notes.length : at, 0, note);
        return { ...b, notes };
      });
      return note.id;
    },
    updateNote: (id: string, patch: Partial<Note>, touch = true) => change((b) => ({
      ...b, notes: b.notes.map((n) => (n.id === id ? { ...n, ...patch, ...(touch ? { updated: Date.now() } : {}) } : n)),
    })),
    removeNote: (id: string) => change((b) => ({ ...b, notes: b.notes.filter((n) => n.id !== id) })),
    duplicateNote: (id: string, owner: string) => change((b) => {
      const i = b.notes.findIndex((n) => n.id === id);
      if (i < 0) return b;
      const now = Date.now();
      const copy: Note = { ...b.notes[i], id: newId(), title: b.notes[i].title ? `${b.notes[i].title} (copie)` : "", owner, pinned: false, created: now, updated: now };
      const notes = [...b.notes];
      notes.splice(i + 1, 0, copy);
      return { ...b, notes };
    }),
    /** Déplace une note avant `before` (ou en fin de `group` si null), dans le groupe donné. */
    moveNote: (id: string, group: string | null, before: string | null) => change((b) => {
      const note = b.notes.find((n) => n.id === id);
      if (!note || id === before) return b;
      const rest = b.notes.filter((n) => n.id !== id);
      const moved = { ...note, group };
      let at = before ? rest.findIndex((n) => n.id === before) : -1;
      if (at < 0) {
        // Après la dernière note du groupe.
        const last = rest.map((n) => n.group).lastIndexOf(group);
        at = last < 0 ? rest.length : last + 1;
      }
      rest.splice(at, 0, moved);
      return { ...b, notes: rest };
    }),
    addGroup: (owner: string, name: string, color: string) => {
      const group: NoteGroup = { id: newId(), name, color, owner, share: [] };
      change((b) => ({ ...b, groups: [...b.groups, group] }));
      return group.id;
    },
    updateGroup: (id: string, patch: Partial<NoteGroup>) => change((b) => ({
      ...b, groups: b.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })),
    /** Partage d'un groupe : appliqué aussi à toutes ses notes. */
    shareGroup: (id: string, share: Share) => change((b) => ({
      ...b,
      groups: b.groups.map((g) => (g.id === id ? { ...g, share } : g)),
      notes: b.notes.map((n) => (n.group === id ? { ...n, share } : n)),
    })),
    /** Supprime un groupe ; ses notes restent (sans groupe) sauf si `withNotes`. */
    removeGroup: (id: string, withNotes: boolean) => change((b) => ({
      ...b,
      groups: b.groups.filter((g) => g.id !== id),
      notes: withNotes ? b.notes.filter((n) => n.group !== id) : b.notes.map((n) => (n.group === id ? { ...n, group: null } : n)),
    })),
    moveGroup: (id: string, before: string | null) => change((b) => {
      const group = b.groups.find((g) => g.id === id);
      if (!group || id === before) return b;
      const rest = b.groups.filter((g) => g.id !== id);
      const at = before ? rest.findIndex((g) => g.id === before) : -1;
      rest.splice(at < 0 ? rest.length : at, 0, group);
      return { ...b, groups: rest };
    }),
  };
  return { book, ...actions };
}

const defaultView: NotesView = { layout: "list", sort: "manual", collapsed: [] };

/** Affichage du widget pour un profil (liste ou grille, tri, groupes repliés). */
export function useNotesView(profile: string) {
  const key = VIEW + profile;
  const load = () => {
    try { return { ...defaultView, ...JSON.parse(localStorage.getItem(key) ?? "{}") } as NotesView; } catch { return defaultView; }
  };
  const [view, setView] = useState<NotesView>(load);
  useEffect(() => setView(load()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (patch: Partial<NotesView>) => setView((v) => {
    const next = { ...v, ...patch };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* non persisté */ }
    return next;
  });
  return [view, update] as const;
}
