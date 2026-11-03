// Blocage des publicités et traqueurs : réglé par profil, suspendu au besoin site par site.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProfileId } from "./useBrowser";

const KEY = "calti.blocker.allowed";
const EVENT = "calti:blocker";

function readAllowed(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function siteKey(profile: ProfileId, url: string): string | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? `${profile}|${u.hostname.replace(/^www\./, "")}` : null;
  } catch { return null; }
}

/** Liste des sites exemptés, tenue à jour (autres fenêtres comprises). */
function useAllowed(): string[] {
  const [allowed, setAllowed] = useState(readAllowed);
  useEffect(() => {
    const refresh = () => setAllowed(readAllowed());
    const onStorage = (e: StorageEvent) => e.key === KEY && refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return allowed;
}

/** Blocage suspendu sur ce site (pour ce profil) ? null : page sans site (accueil, fichier). */
export function useSiteAllowed(profile: ProfileId, url: string | undefined): [boolean | null, () => void] {
  const allowed = useAllowed();
  const key = url ? siteKey(profile, url) : null;
  const toggle = () => {
    if (!key) return;
    const list = readAllowed();
    const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* non persisté */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return [key ? allowed.includes(key) : null, toggle];
}

/** Envoie les réglages au cœur de Calti (profils protégés, sites exemptés), à chaque changement. */
export function useBlockerSync(profiles: ProfileId[]) {
  const allowed = useAllowed();
  const key = JSON.stringify([profiles, allowed]);
  useEffect(() => {
    invoke("blocker_configure", { profiles, allowed }).catch(() => {});
  }, [key]);
}
