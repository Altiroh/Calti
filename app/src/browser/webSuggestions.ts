// Suggestions du moteur de recherche (demandées par Rust, voir src-tauri/src/suggest.rs), ajoutées après celles
// du profil (recherches passées, favoris, historique).
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Suggestion } from "./library";

const cache = new Map<string, string[]>();
const LIMIT = 8;

/**
 * Adresse ou chemin plutôt qu'une recherche : jamais envoyé au moteur (adresses d'intranet, jetons dans les
 * paramètres, chemins de fichiers).
 */
export function looksLikeAddress(q: string): boolean {
  if (/\s/.test(q)) return false;
  return /^[a-z][a-z0-9+.-]*:/i.test(q)      // schéma (https:, file:, mailto:…)
    || /^([a-z]:)?[\\/~]/i.test(q)          // chemin (C:\…, \\serveur, /…, ~)
    || /[/?=#@]/.test(q)                       // chemin ou paramètres d'une adresse
    || /^[\w-]+(\.[\w-]+)+(:\d+)?$/.test(q)  // domaine ou adresse IP
    || /^localhost(:\d+)?$/i.test(q);
}

/**
 * `engine` : moteur du profil, ou null si les suggestions en ligne sont désactivées.
 * La requête part après une courte pause de frappe ; une réponse arrivée trop tard est ignorée.
 */
export function useSuggestions(local: Suggestion[], query: string, engine: string | null): Suggestion[] {
  const q = query.trim();
  const key = `${engine}\n${q.toLowerCase()}`;
  const [web, setWeb] = useState<{ key: string; list: string[] } | null>(null);

  useEffect(() => {
    if (!engine || !q || looksLikeAddress(q)) return;
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
