import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Profil déclaré dans Brave (miroir de app/src-tauri/src/setup.rs). */
export interface BraveInstall {
  dir: string;
  name: string;
}

/** Profils Brave installés, relus quand la fenêtre reprend le focus (un profil a pu être créé entre-temps). */
export function useBraveInstalls(): BraveInstall[] {
  const [installs, setInstalls] = useState<BraveInstall[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => invoke<BraveInstall[]>("brave_profiles").then((list) => alive && setInstalls(list)).catch(() => {});
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return installs;
}
