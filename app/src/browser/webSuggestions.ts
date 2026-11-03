// Suggestions du moteur de recherche (demandées par Rust, voir src-tauri/src/suggest.rs), ajoutées après celles
// du profil (recherches passées, favoris, historique).
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Suggestion } from "./library";

const cache = new Map<string, string[]>();
const LIMIT = 8;

/**
 * `engine` : moteur du profil, ou null si les suggestions en ligne sont désactivées.
 * La requête part après une courte pause de frappe ; une réponse arrivée trop tard est ignorée.
 */
export function useSuggestions(local: Suggestion[], query: string, engine: string | null): Suggestion[] {
  const q = query.trim();
  const key = `${engine}\n${q.toLowerCase()}`;
  const [web, setWeb] = useState<{ key: string; list: string[] } | null>(null);

  useEffect(() => {
    if (!engine || !q) return;
    const known = cache.get(key);
    if (known) {
      setWeb({ key, list: known });
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      invoke<string[]>("search_suggestions", { engine, query: q })
        .then((list) => {
          cache.set(key, list);
          if (!stale) setWeb({ key, list });
        })
        .catch(() => {});
    }, 120);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [key]);

  if (!q) return [];
  const own = local.slice(0, 5);
  const taken = new Set(own.map((s) => s.text.toLowerCase()));
  taken.add(q.toLowerCase());
  const online = (web?.key === key ? web.list : [])
    .filter((text) => !taken.has(text.toLowerCase()))
    .map((text): Suggestion => ({ kind: "search", text }));
  return [...own, ...online].slice(0, LIMIT);
}
