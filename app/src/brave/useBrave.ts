import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { BookmarkNode, Command, ProfileState, Tab } from "./types";
import type { BraveInstall } from "./useBraveInstalls";

export interface BraveWindow {
  id: number;
  tabs: Tab[];
}

export interface Brave {
  profiles: ProfileState[];
  /** Profil affiché ; c'est aussi lui qui reçoit les commandes. */
  profile: ProfileState | null;
  selectProfile: (id: string) => void;
  connected: boolean;
  windows: BraveWindow[];
  focusedWindowId: number | null;
  activeTab: Tab | null;
  bookmarks: BookmarkNode[] | null;
  error: string | null;
  /** Brave est en train de démarrer à la demande de Calti. */
  launching: boolean;
  /** Envoie une commande au profil affiché ; si Brave est fermé, le démarre d'abord. */
  send: (command: Command) => void;
}

const SELECTED_KEY = "calti.selectedProfile";
/** Délai laissé à Brave pour démarrer et à l'extension pour se connecter. */
const LAUNCH_TIMEOUT_MS = 25_000;

export function useBrave(installs: BraveInstall[]): Brave {
  const [profiles, setProfiles] = useState<ProfileState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try { return localStorage.getItem(SELECTED_KEY); } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  // Commandes en attente pendant le démarrage de Brave.
  const pending = useRef<Command[]>([]);

  useEffect(() => {
    let disposed = false;
    // On s'abonne avant de lire l'état initial pour ne manquer aucun événement.
    const subscriptions = Promise.all([
      listen<ProfileState[]>("brave:profiles", (e) => setProfiles(e.payload)),
      listen<string>("brave:error", (e) => setError(e.payload)),
    ]);
    subscriptions
      .then(() => invoke<ProfileState[]>("brave_state"))
      .then((initial) => !disposed && setProfiles(initial));
    return () => {
      disposed = true;
      subscriptions.then((unlisteners) => unlisteners.forEach((u) => u()));
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const profile = profiles.find((p) => p.id === selectedId) ?? profiles[0] ?? null;

  const selectProfile = useCallback((id: string) => {
    setSelectedId(id);
    try { localStorage.setItem(SELECTED_KEY, id); } catch { /* préférence non persistée */ }
  }, []);

  // Brave connecté (ou reconnecté) : les commandes en attente partent vers le profil affiché.
  useEffect(() => {
    if (!profile) return;
    setLaunching(false);
    for (const command of pending.current.splice(0)) {
      invoke("brave_send", { profile: profile.id, command }).catch((e) => setError(String(e)));
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!launching) return;
    const timer = setTimeout(() => {
      pending.current = [];
      setLaunching(false);
      setError("Brave n'a pas répondu : l'extension Calti est-elle chargée dans ce profil ?");
    }, LAUNCH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [launching]);

  const send = useCallback((command: Command) => {
    if (profile) {
      invoke("brave_send", { profile: profile.id, command }).catch((e) => setError(String(e)));
      return;
    }
    // Brave fermé : on le démarre dans le dernier profil utilisé, sinon le premier équipé de l'extension.
    const dir = installs.find((i) => selectedId && i.profileIds.includes(selectedId))?.dir
      ?? installs.find((i) => i.extensionInstalled)?.dir ?? null;
    const launch = (url: string | null) =>
      invoke("launch_brave", { dir, url }).catch((e) => {
        pending.current = [];
        setLaunching(false);
        setError(String(e));
      });
    switch (command.type) {
      case "openUrl":
        // L'adresse s'ouvre directement au démarrage.
        launch(command.url);
        setLaunching(true);
        break;
      case "newTab":
        launch(null);
        setLaunching(true);
        break;
      case "search":
        pending.current.push(command);
        if (!launching) launch(null);
        setLaunching(true);
        break;
      default:
        // Activer, fermer, naviguer : n'ont de sens qu'avec un Brave déjà ouvert.
        break;
    }
  }, [profile?.id, installs, selectedId, launching]);

  const derived = useMemo(() => {
    const tabs = profile?.snapshot?.tabs ?? [];
    const byWindow = new Map<number, Tab[]>();
    for (const t of [...tabs].sort((a, b) => a.index - b.index)) {
      byWindow.set(t.windowId, [...(byWindow.get(t.windowId) ?? []), t]);
    }
    const windows = [...byWindow].map(([id, tabs]) => ({ id, tabs }));
    const focused = profile?.snapshot?.focusedWindowId ?? null;
    const focusedWindow = windows.find((w) => w.id === focused) ?? windows[0];
    return {
      windows,
      focusedWindowId: focusedWindow?.id ?? null,
      activeTab: focusedWindow?.tabs.find((t) => t.active) ?? null,
    };
  }, [profile?.snapshot]);

  return {
    profiles,
    profile,
    selectProfile,
    connected: profile != null,
    bookmarks: profile?.bookmarks ?? null,
    ...derived,
    error,
    launching,
    send,
  };
}
