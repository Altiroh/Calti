import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type ProfileId = "personnel" | "pro";
export const PROFILE_IDS: ProfileId[] = ["personnel", "pro"];
export const defaultProfileNames: Record<ProfileId, string> = { personnel: "Personnel", pro: "Pro" };

/** Miroir de `Tab` dans app/src-tauri/src/browser.rs. */
export interface BrowserTab {
  id: number;
  /** Fenêtre de Calti qui affiche l'onglet. */
  window: string;
  profile: ProfileId;
  url: string;
  title: string;
  loading: boolean;
}

export type NavAction = "back" | "forward" | "reload" | "stop";

interface PaneState {
  /** Onglet affiché ; null = page d'accueil du volet. */
  activeTab: number | null;
  /** Dernier onglet affiché, pour le reprendre depuis l'accueil. */
  lastTab: number | null;
}

export interface Browser {
  tabs: BrowserTab[];
  tabsOf: (profile: ProfileId) => BrowserTab[];
  panes: Record<ProfileId, PaneState>;
  /** Volet qui reçoit la saisie et les raccourcis. */
  focused: ProfileId;
  focus: (profile: ProfileId) => void;
  split: boolean;
  setSplit: (split: boolean) => void;
  /** Saisie de la barre d'adresse : adresse ou recherche, dans l'onglet affiché ou un nouvel onglet. */
  go: (input: string, profile?: ProfileId, newTab?: boolean) => void;
  open: (url: string, profile?: ProfileId) => void;
  activate: (id: number) => void;
  close: (id: number) => void;
  home: (profile?: ProfileId) => void;
  action: (action: NavAction, profile?: ProfileId) => void;
  /** Zone de contenu d'un volet : les pages y sont posées. */
  registerSlot: (profile: ProfileId, el: HTMLElement | null) => void;
  /** Masque les pages (éditeur de disposition, tiroirs plein écran…). */
  setSuspended: (suspended: boolean) => void;
  /** Nouvelle fenêtre sur un profil ; avec `detach`, les onglets de ce profil y partent. */
  newWindow: (profile: ProfileId, detach?: boolean) => void;
  error: string | null;
}

const SEARCH_URL = "https://search.brave.com/search?q=";
const STORAGE_KEY = "calti.browser";
/** Fenêtre courante : « main » au démarrage, « calti-n » pour les suivantes. */
const WINDOW_LABEL = getCurrentWindow().label;
const IS_MAIN = WINDOW_LABEL === "main";
/** Profil demandé à l'ouverture d'une fenêtre secondaire (?profile=pro). */
const INITIAL_PROFILE = new URLSearchParams(location.search).get("profile") as ProfileId | null;

/** Adresse si la saisie en a l'air (web, file:///, chemin Windows), sinon recherche. */
export function toUrl(input: string): string | null {
  const text = input.trim().replace(/^"(.*)"$/, "$1");
  if (!text) return null;
  if (/^(https?|file):\/\//i.test(text)) return text;
  // Chemin local (C:\… ou \\serveur\…) : converti en adresse file:///, espaces et accents encodés.
  if (/^[a-z]:[\\/]/i.test(text) || text.startsWith("\\\\")) {
    return new URL(`file:///${text.replace(/\\/g, "/").replace(/^\/+/, "")}`).href;
  }
  if (!/\s/.test(text) && /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/i.test(text)) return `https://${text}`;
  return SEARCH_URL + encodeURIComponent(text);
}

interface Saved {
  split: boolean;
  focused: ProfileId;
  tabs: { profile: ProfileId; url: string; active: boolean }[];
}

function loadSaved(): Saved {
  // Seule la fenêtre principale garde sa session d'une ouverture à l'autre.
  if (!IS_MAIN) return { split: false, focused: INITIAL_PROFILE ?? "personnel", tabs: [] };
  try {
    return { split: false, focused: "personnel", tabs: [], ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { split: false, focused: "personnel", tabs: [] };
  }
}

const emptyPanes = (): Record<ProfileId, PaneState> => ({
  personnel: { activeTab: null, lastTab: null },
  pro: { activeTab: null, lastTab: null },
});

export function useBrowser(): Browser {
  const saved = useMemo(loadSaved, []);
  const [allTabs, setAllTabs] = useState<BrowserTab[]>([]);
  // Chaque fenêtre ne voit que ses onglets.
  const tabs = useMemo(() => allTabs.filter((t) => t.window === WINDOW_LABEL), [allTabs]);
  const [panes, setPanes] = useState(emptyPanes);
  const [focused, setFocused] = useState<ProfileId>(saved.focused);
  const [split, setSplitState] = useState(saved.split);
  const [suspended, setSuspended] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slots = useRef<Partial<Record<ProfileId, HTMLElement>>>({});
  const restored = useRef(false);

  const fail = useCallback((e: unknown) => setError(String(e)), []);

  const show = useCallback((profile: ProfileId, id: number | null) => {
    setPanes((p) => ({ ...p, [profile]: { activeTab: id, lastTab: id ?? p[profile].lastTab } }));
  }, []);

  useEffect(() => {
    const subscriptions = Promise.all([
      listen<BrowserTab[]>("browser:tabs", (e) => setAllTabs(e.payload)),
      // Lien « nouvelle fenêtre » : le nouvel onglet s'affiche dans le volet de l'onglet d'origine.
      listen<[number, number]>("browser:opened", (e) => {
        const [id] = e.payload;
        setAllTabs((current) => {
          const tab = current.find((t) => t.id === id && t.window === WINDOW_LABEL);
          if (tab) show(tab.profile, id);
          return current;
        });
      }),
    ]);
    invoke<BrowserTab[]>("browser_tabs").then(setAllTabs).catch(fail);
    return () => { subscriptions.then((u) => u.forEach((f) => f())); };
  }, [fail, show]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  // Fenêtre détachée : les onglets reçus après son ouverture s'affichent aussitôt.
  useEffect(() => {
    if (IS_MAIN) return;
    for (const profile of PROFILE_IDS) {
      const pane = panes[profile];
      const last = tabs.filter((t) => t.profile === profile).pop();
      if (last && pane.activeTab == null && pane.lastTab == null) show(profile, last.id);
    }
  }, [tabs, panes, show]);

  // Un onglet fermé ailleurs (ou disparu) ne doit pas rester affiché.
  useEffect(() => {
    setPanes((p) => {
      let changed = false;
      const next = { ...p };
      for (const profile of PROFILE_IDS) {
        const pane = p[profile];
        const exists = (id: number | null) => id == null || tabs.some((t) => t.id === id);
        if (!exists(pane.activeTab) || !exists(pane.lastTab)) {
          changed = true;
          next[profile] = {
            activeTab: exists(pane.activeTab) ? pane.activeTab : null,
            lastTab: exists(pane.lastTab) ? pane.lastTab : null,
          };
        }
      }
      return changed ? next : p;
    });
  }, [tabs]);

  const openUrl = useCallback(async (url: string, profile: ProfileId) => {
    try {
      const id = await invoke<number>("browser_open", { profile, url });
      show(profile, id);
      return id;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [show, fail]);

  // Restauration de la session précédente (une seule fois).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    (async () => {
      // Interface rechargée alors que l'application tourne : les onglets existent encore, on les réaffiche.
      if (!IS_MAIN) {
        // Fenêtre détachée : on affiche d'emblée le dernier onglet reçu de chaque profil.
        const received = (await invoke<BrowserTab[]>("browser_tabs").catch(() => [] as BrowserTab[]))
          .filter((t) => t.window === WINDOW_LABEL);
        for (const profile of PROFILE_IDS) {
          const last = received.filter((t) => t.profile === profile).pop();
          if (last) show(profile, last.id);
        }
        return;
      }
      const existing = (await invoke<BrowserTab[]>("browser_tabs").catch(() => [] as BrowserTab[]))
        .filter((t) => t.window === WINDOW_LABEL);
      if (existing.length) {
        for (const t of saved.tabs.filter((s) => s.active)) {
          const match = existing.find((e) => e.profile === t.profile && e.url === t.url);
          if (match) show(t.profile, match.id);
        }
        return;
      }
      for (const t of saved.tabs) {
        const id = await invoke<number>("browser_open", { profile: t.profile, url: t.url }).catch(() => null);
        if (id != null && t.active) show(t.profile, id);
      }
    })();
  }, [saved, show]);

  // Sauvegarde de la session.
  useEffect(() => {
    if (!restored.current || !IS_MAIN) return;
    const data: Saved = {
      split,
      focused,
      tabs: tabs.filter((t) => /^(https?|file):/.test(t.url)).map((t) => ({
        profile: t.profile, url: t.url, active: panes[t.profile].activeTab === t.id,
      })),
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* non persisté */ }
  }, [tabs, panes, split, focused]);

  // Placement des pages : chaque volet visible affiche son onglet dans sa zone de contenu.
  const layout = useCallback(() => {
    const visible = suspended ? [] : (split ? PROFILE_IDS : [focused]).flatMap((profile) => {
      const id = panes[profile].activeTab;
      const el = slots.current[profile];
      if (id == null || !el) return [];
      const r = el.getBoundingClientRect();
      return [{ id, x: r.left, y: r.top, width: r.width, height: r.height }];
    });
    invoke("browser_layout", { visible }).catch(fail);
  }, [suspended, split, focused, panes, fail]);

  const frame = useRef(0);
  const scheduleLayout = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(layout);
  }, [layout]);

  useEffect(() => { scheduleLayout(); }, [scheduleLayout, tabs.length]);

  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    observer.current?.disconnect();
    observer.current = new ResizeObserver(scheduleLayout);
    for (const el of Object.values(slots.current)) if (el) observer.current.observe(el);
    window.addEventListener("resize", scheduleLayout);
    return () => {
      observer.current?.disconnect();
      window.removeEventListener("resize", scheduleLayout);
    };
  }, [scheduleLayout]);

  const registerSlot = useCallback((profile: ProfileId, el: HTMLElement | null) => {
    const previous = slots.current[profile];
    if (previous === el) return;
    if (previous) observer.current?.unobserve(previous);
    if (el) {
      slots.current[profile] = el;
      observer.current?.observe(el);
    } else {
      delete slots.current[profile];
    }
    scheduleLayout();
  }, [scheduleLayout]);

  const tabsOf = useCallback((profile: ProfileId) => tabs.filter((t) => t.profile === profile), [tabs]);

  const go = useCallback((input: string, profile: ProfileId = focused, newTab = false) => {
    const url = toUrl(input);
    if (!url) return;
    const id = panes[profile].activeTab;
    if (id != null && !newTab) {
      invoke("browser_navigate", { id, url }).catch(fail);
    } else {
      openUrl(url, profile);
    }
  }, [focused, panes, openUrl, fail]);

  const activate = useCallback((id: number) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    show(tab.profile, id);
    setFocused(tab.profile);
  }, [tabs, show]);

  const close = useCallback((id: number) => {
    const tab = tabs.find((t) => t.id === id);
    if (tab && panes[tab.profile].activeTab === id) {
      // Comme un navigateur : on passe à l'onglet voisin, sinon à l'accueil.
      const siblings = tabs.filter((t) => t.profile === tab.profile);
      const index = siblings.findIndex((t) => t.id === id);
      const next = siblings[index + 1] ?? siblings[index - 1];
      show(tab.profile, next?.id ?? null);
    }
    invoke("browser_close", { id }).catch(fail);
  }, [tabs, panes, show, fail]);

  const home = useCallback((profile: ProfileId = focused) => show(profile, null), [focused, show]);

  const action = useCallback((act: NavAction, profile: ProfileId = focused) => {
    const id = panes[profile].activeTab;
    if (id != null) invoke("browser_action", { id, action: act }).catch(fail);
  }, [focused, panes, fail]);

  const setSplit = useCallback((value: boolean) => setSplitState(value), []);

  const newWindow = useCallback((profile: ProfileId, detach = false) => {
    invoke("browser_new_window", { profile, detach })
      .then(() => {
        if (!detach) return;
        // Le profil détaché quitte cette fenêtre : on garde l'autre, seul.
        setSplitState(false);
        setFocused(PROFILE_IDS.find((p) => p !== profile) ?? profile);
      })
      .catch(fail);
  }, [fail]);

  // Ctrl+N : nouvelle fenêtre sur le profil actif.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newWindow(focused);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, newWindow]);

  return {
    tabs, tabsOf, panes, focused, focus: setFocused, split, setSplit,
    go, open: (url, profile = focused) => { openUrl(url, profile); },
    activate, close, home, action, registerSlot, setSuspended, newWindow, error,
  };
}
