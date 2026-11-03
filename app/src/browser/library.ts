// Favoris et historique de Calti, par profil, gardés dans le stockage local et partagés entre les fenêtres.
import { useCallback, useEffect, useRef, useState } from "react";
import type { BookmarkNode } from "../brave/types";
import type { BrowserTab, ProfileId } from "./useBrowser";

export interface LibraryEntry {
  url: string;
  title: string;
  /** Date (ms) de l'ajout ou de la visite. */
  at: number;
}

const HISTORY_MAX = 1000;
const keyOf = (kind: "bookmarks" | "history", profile: ProfileId) => `calti.${kind}.${profile}`;

function read(key: string): LibraryEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(key: string, list: LibraryEntry[]) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* non persisté */ }
}

/** Liste d'un profil, relue quand une autre fenêtre la modifie. */
function useStoredList(kind: "bookmarks" | "history", profileIds: ProfileId[]) {
  const ids = profileIds.join("|");
  const load = () => Object.fromEntries(profileIds.map((p) => [p, read(keyOf(kind, p))]));
  const [lists, setLists] = useState<Record<ProfileId, LibraryEntry[]>>(load);
  useEffect(() => {
    setLists(load());
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith(`calti.${kind}.`)) setLists(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [ids]);
  const update = useCallback((profile: ProfileId, change: (list: LibraryEntry[]) => LibraryEntry[]) => {
    const next = change(read(keyOf(kind, profile)));
    write(keyOf(kind, profile), next);
    setLists((l) => ({ ...l, [profile]: next }));
  }, [kind]);
  return { lists, update };
}

/** Favoris enregistrés dans Calti (étoile de la barre, Ctrl+D). */
export function useCaltiBookmarks(profileIds: ProfileId[]) {
  const { lists, update } = useStoredList("bookmarks", profileIds);
  const has = useCallback((profile: ProfileId, url: string) => (lists[profile] ?? []).some((b) => b.url === url), [lists]);
  const toggle = useCallback((profile: ProfileId, url: string, title: string) => {
    update(profile, (list) => list.some((b) => b.url === url)
      ? list.filter((b) => b.url !== url)
      : [{ url, title: title || url, at: Date.now() }, ...list]);
  }, [update]);
  return { of: (profile: ProfileId) => lists[profile] ?? [], has, toggle };
}

/** Favoris de Calti en tête de la barre de favoris Brave du profil. */
export function mergeBookmarks(own: LibraryEntry[], brave: BookmarkNode[] | null): BookmarkNode[] | null {
  if (!own.length) return brave;
  const nodes: BookmarkNode[] = own.map((b) => ({ id: `calti-${b.at}`, title: b.title, url: b.url, children: null }));
  const [bar, ...rest] = brave ?? [];
  return [{ id: bar?.id ?? "calti", title: bar?.title ?? "Barre de favoris", url: null, children: [...nodes, ...(bar?.children ?? [])] }, ...rest];
}

/** Historique : chaque page chargée par un onglet de cette fenêtre est ajoutée en tête. */
export function useHistory(profileIds: ProfileId[], tabs: BrowserTab[]) {
  const { lists, update } = useStoredList("history", profileIds);
  const last = useRef<Record<number, string>>({});
  useEffect(() => {
    for (const t of tabs) {
      if (t.loading || t.sleeping || !/^(https?|file):/.test(t.url) || !profileIds.includes(t.profile)) continue;
      const seen = `${t.url}\n${t.title}`;
      if (last.current[t.id] === seen) continue;
      const sameUrl = last.current[t.id]?.startsWith(`${t.url}\n`);
      last.current[t.id] = seen;
      update(t.profile, (list) => {
        // Le titre arrive après le chargement : on complète l'entrée plutôt que d'en ajouter une.
        if (sameUrl && list[0]?.url === t.url) return [{ ...list[0], title: t.title }, ...list.slice(1)];
        return [{ url: t.url, title: t.title, at: Date.now() }, ...list.filter((h, i) => i > 0 || h.url !== t.url)].slice(0, HISTORY_MAX);
      });
    }
  }, [tabs, profileIds.join("|"), update]);
  const clear = useCallback((profile: ProfileId) => update(profile, () => []), [update]);
  const remove = useCallback((profile: ProfileId, at: number) => update(profile, (l) => l.filter((h) => h.at !== at)), [update]);
  return { of: (profile: ProfileId) => lists[profile] ?? [], clear, remove };
}

/** Page lue dans l'historique de Brave (voir src-tauri/src/brave_import.rs). */
export interface VisitedPage {
  url: string;
  title: string;
  visits: number;
  at: number;
}

/** Ajoute l'historique de Brave à celui du profil (sans doublon d'adresse), puis garde les plus récentes. */
export function importHistory(profile: ProfileId, pages: VisitedPage[]): number {
  const key = keyOf("history", profile);
  const current = read(key);
  const known = new Set(current.map((h) => h.url));
  const added = pages.filter((p) => !known.has(p.url)).map((p) => ({ url: p.url, title: p.title || p.url, at: p.at }));
  const merged = [...current, ...added].sort((a, b) => b.at - a.at).slice(0, HISTORY_MAX);
  write(key, merged);
  window.dispatchEvent(new StorageEvent("storage", { key }));
  return added.length;
}

const TOP_KEY = (profile: ProfileId) => `calti.topsites.${profile}`;

/** Sites les plus visités (un par domaine), affichés dans l'accès rapide. */
export function importTopSites(profile: ProfileId, pages: VisitedPage[]): number {
  const seen = new Set<string>();
  const top: LibraryEntry[] = [];
  for (const p of pages) {
    let host = "";
    try { host = new URL(p.url).hostname.replace(/^www\./, ""); } catch { continue; }
    if (!host || seen.has(host)) continue;
    seen.add(host);
    top.push({ url: new URL(p.url).origin, title: p.title || host, at: p.at });
    if (top.length === 12) break;
  }
  write(TOP_KEY(profile), top);
  window.dispatchEvent(new StorageEvent("storage", { key: TOP_KEY(profile) }));
  return top.length;
}

export function useTopSites(profile: ProfileId): LibraryEntry[] {
  const [top, setTop] = useState(() => read(TOP_KEY(profile)));
  useEffect(() => {
    setTop(read(TOP_KEY(profile)));
    const onStorage = (e: StorageEvent) => (!e.key || e.key === TOP_KEY(profile)) && setTop(read(TOP_KEY(profile)));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [profile]);
  return top;
}

const SEARCH_MAX = 200;
const searchKey = (profile: ProfileId) => `calti.searches.${profile}`;

/** Recherche saisie (pas une adresse) : gardée en tête, sans doublon, pour les suggestions. */
export function recordSearch(profile: ProfileId, text: string) {
  const query = text.trim();
  if (!query) return;
  const list = read(searchKey(profile)).filter((s) => s.title.toLowerCase() !== query.toLowerCase());
  write(searchKey(profile), [{ url: "", title: query, at: Date.now() }, ...list].slice(0, SEARCH_MAX));
}

export interface Suggestion {
  kind: "search" | "history" | "bookmark";
  /** Texte affiché (recherche, ou titre de la page). */
  text: string;
  /** Adresse à ouvrir ; absente pour une recherche. */
  url?: string;
}

/**
 * Suggestions pour une saisie : recherches passées, puis favoris et historique dont le titre ou l'adresse
 * contient chaque mot saisi. Les débuts de mot passent devant.
 */
export function suggest(profile: ProfileId, input: string, bookmarks: LibraryEntry[], searchUrl = "", limit = 8): Suggestion[] {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const score = (text: string) => {
    const t = text.toLowerCase();
    if (!words.every((w) => t.includes(w))) return -1;
    const wordStart = [" ", "/", ".", "-", ":"].some((sep) => t.includes(sep + q));
    return (t.startsWith(q) ? 3 : 0) + (wordStart ? 2 : 0);
  };
  const ranked = <T,>(items: T[], text: (x: T) => string) => items
    .map((x, i) => ({ x, s: score(text(x)), i }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.x);

  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (s: Suggestion) => {
    const key = s.url ?? `?${s.text.toLowerCase()}`;
    if (seen.has(key) || s.text.toLowerCase() === q) return;
    seen.add(key);
    out.push(s);
  };
  for (const s of ranked(read(searchKey(profile)), (x) => x.title).slice(0, 4)) push({ kind: "search", text: s.title });
  for (const b of ranked(bookmarks, (x) => `${x.title} ${x.url}`).slice(0, 3)) push({ kind: "bookmark", text: b.title || b.url, url: b.url });
  // Pages de résultats du moteur : elles doublent les recherches déjà proposées.
  const history = read(keyOf("history", profile)).filter((h) => !searchUrl || !h.url.startsWith(searchUrl.split("?")[0]));
  for (const h of ranked(history, (x) => `${x.title} ${x.url}`)) {
    if (out.length >= limit) break;
    push({ kind: "history", text: h.title || h.url, url: h.url });
  }
  return out.slice(0, limit);
}
