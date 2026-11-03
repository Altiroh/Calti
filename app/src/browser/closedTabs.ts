// Onglets récemment fermés, communs à toutes les fenêtres (Ctrl+Maj+T les rouvre, du plus récent au plus ancien).
import { useEffect, useState } from "react";
import type { ProfileId } from "./useBrowser";

export interface ClosedTab {
  profile: ProfileId;
  url: string;
  title: string;
  at: number;
}

const KEY = "calti.closed";
const EVENT = "calti:closed";
const MAX = 25;

function read(): ClosedTab[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function save(list: ClosedTab[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* non persisté */ }
  window.dispatchEvent(new Event(EVENT));
}

export function rememberClosed(tab: Omit<ClosedTab, "at">) {
  if (!/^(https?|file):/.test(tab.url)) return;
  save([{ ...tab, at: Date.now() }, ...read().filter((t) => t.url !== tab.url || t.profile !== tab.profile)]);
}

/** Retire et renvoie l'onglet fermé le plus récent du profil (ou celui fermé à l'instant `at`). */
export function takeClosed(profile: ProfileId, at?: number): ClosedTab | null {
  const list = read();
  const index = list.findIndex((t) => t.profile === profile && (at == null || t.at === at));
  if (index < 0) return null;
  const [tab] = list.splice(index, 1);
  save(list);
  return tab;
}

export function useClosedTabs(profile: ProfileId): ClosedTab[] {
  const [list, setList] = useState(read);
  useEffect(() => {
    const refresh = () => setList(read());
    const onStorage = (e: StorageEvent) => e.key === KEY && refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return list.filter((t) => t.profile === profile);
}
