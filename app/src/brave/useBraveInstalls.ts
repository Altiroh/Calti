import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Profil déclaré dans Brave (miroir de app/src-tauri/src/setup.rs). */
export interface BraveInstall {
  dir: string;
  name: string;
  extensionInstalled: boolean;
  profileIds: string[];
  /** Dernière erreur Native Messaging signalée par l'extension. */
  nativeError: string | null;
}

const REFRESH_MS = 4000;

/** Profils Brave et présence de l'extension, rafraîchis pour suivre l'installation en direct. */
export function useBraveInstalls(): BraveInstall[] {
  const [installs, setInstalls] = useState<BraveInstall[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => invoke<BraveInstall[]>("brave_profiles").then((list) => alive && setInstalls(list)).catch(() => {});
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return installs;
}

/** Nom du profil Brave correspondant à une connexion Calti. */
export function braveNameOf(installs: BraveInstall[], profileId: string): string | undefined {
  return installs.find((i) => i.profileIds.includes(profileId))?.name;
}
