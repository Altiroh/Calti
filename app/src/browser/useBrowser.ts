import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Identifiant d'un profil (aussi nom de son dossier de données). */
export type ProfileId = string;

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

export interface PaneState {
  /** Onglet affiché ; null = page d'accueil du volet. */
  activeTab: number | null;
  /** Dernier onglet affiché, pour le reprendre depuis l'accueil. */
  lastTab: number | null;
}

/** Groupe d'onglets, comme dans Brave : un nom, une couleur, replié ou non. */
export interface TabGroup {
  id: string;
  profile: ProfileId;
  name: string;
  color: string;
  collapsed: boolean;
}

/** Couleurs de groupe (celles de Brave et Chrome). */
export const groupColors = ["#5f6368", "#1a73e8", "#d93025", "#f9ab00", "#188038", "#d01884", "#9334e6", "#007b83", "#fa903e"];

/** Élément de la barre d'onglets : un onglet seul, ou un groupe et ses onglets. */
export type TabStripItem =
  | { kind: "tab"; tab: BrowserTab }
  | { kind: "group"; group: TabGroup; tabs: BrowserTab[] };

/** Préférences de navigation d'un profil utiles au navigateur. */
export interface ProfilePrefs {
  /** Début d'adresse de recherche (le texte saisi est ajouté à la fin). */
  searchUrl: string;
  /** « home » = accueil de Calti, sinon adresse ouverte par un nouvel onglet. */
  startPage: string;
}

export interface Browser {
  tabs: BrowserTab[];
  tabsOf: (profile: ProfileId) => BrowserTab[];
  pane: (profile: ProfileId) => PaneState;
  /** Profil du volet principal : il reçoit la saisie et les raccourcis. */
  focused: ProfileId;
  focus: (profile: ProfileId) => void;
  split: boolean;
  setSplit: (split: boolean) => void;
  /** Profil du second volet en vue partagée. */
  secondary: ProfileId;
  setSecondary: (profile: ProfileId) => void;
  /** Saisie de la barre d'adresse : adresse ou recherche, dans l'onglet affiché ou un nouvel onglet. */
  go: (input: string, profile?: ProfileId, newTab?: boolean) => void;
  activate: (id: number) => void;
  close: (id: number) => void;
  /** Accueil de Calti dans le volet du profil. */
  home: (profile?: ProfileId) => void;
  /** Nouvel onglet : accueil ou page de démarrage du profil. */
  newTab: (profile?: ProfileId) => void;
  action: (action: NavAction, profile?: ProfileId) => void;
  /** Zone de contenu d'un volet : les pages y sont posées. */
  registerSlot: (profile: ProfileId, el: HTMLElement | null) => void;
  /** Masque les pages (éditeur de disposition…). */
  setSuspended: (suspended: boolean) => void;
  /** Nouvelle fenêtre sur un profil ; avec `detach`, les onglets de ce profil y partent. */
  newWindow: (profile: ProfileId, detach?: boolean) => void;
  /** Onglets d'un profil dans l'ordre d'affichage, regroupés. */
  strip: (profile: ProfileId) => TabStripItem[];
  groups: TabGroup[];
  groupOf: (tabId: number) => TabGroup | null;
  /** Crée un groupe autour d'un onglet et renvoie son identifiant. */
  createGroup: (tabId: number) => string;
  addToGroup: (tabId: number, groupId: string) => void;
  removeFromGroup: (tabId: number) => void;
  updateGroup: (groupId: string, patch: Partial<Pick<TabGroup, "name" | "color" | "collapsed">>) => void;
  /** Dissout le groupe (les onglets restent ouverts). */
  ungroup: (groupId: string) => void;
  /** Ferme tous les onglets du groupe. */
  closeGroup: (groupId: string) => void;
  error: string | null;
}

const STORAGE_KEY = "calti.browser";
/** Fenêtre courante : « main » au démarrage, « calti-n » pour les suivantes. */
const WINDOW_LABEL = getCurrentWindow().label;
const IS_MAIN = WINDOW_LABEL === "main";
/** Profil demandé à l'ouverture d'une fenêtre secondaire (?profile=pro). */
const INITIAL_PROFILE = new URLSearchParams(location.search).get("profile");
const EMPTY_PANE: PaneState = { activeTab: null, lastTab: null };

/** Adresse si la saisie en a l'air (web, file:///, chemin Windows), sinon recherche. */
export function toUrl(input: string, searchUrl: string): string | null {
  const text = input.trim().replace(/^"(.*)"$/, "$1");
  if (!text) return null;
  if (/^(https?|file):\/\//i.test(text)) return text;
  // Chemin local (C:\… ou \\serveur\…) : converti en adresse file:///, espaces et accents encodés.
  if (/^[a-z]:[\\/]/i.test(text) || text.startsWith("\\\\")) {
    return new URL(`file:///${text.replace(/\\/g, "/").replace(/^\/+/, "")}`).href;
  }
  if (!/\s/.test(text) && /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/i.test(text)) return `https://${text}`;
  return searchUrl + encodeURIComponent(text);
}

interface Saved {
  split: boolean;
  focused: ProfileId;
  secondary?: ProfileId;
  tabs: { profile: ProfileId; url: string; active: boolean; group?: string }[];
  groups?: TabGroup[];
}

function loadSaved(fallback: ProfileId): Saved {
  // Seule la fenêtre principale garde sa session d'une ouverture à l'autre.
  if (!IS_MAIN) return { split: false, focused: INITIAL_PROFILE ?? fallback, tabs: [] };
  try {
    return { split: false, focused: fallback, tabs: [], ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { split: false, focused: fallback, tabs: [] };
  }
}

export function useBrowser(profileIds: ProfileId[], prefsOf: (profile: ProfileId) => ProfilePrefs, pageRadius = 16): Browser {
  const saved = useMemo(() => loadSaved(profileIds[0]), []);
  const [allTabs, setAllTabs] = useState<BrowserTab[]>([]);
  // Chaque fenêtre ne voit que ses onglets.
  const tabs = useMemo(() => allTabs.filter((t) => t.window === WINDOW_LABEL), [allTabs]);
  const [panes, setPanes] = useState<Record<ProfileId, PaneState>>({});
  const [focusedState, setFocused] = useState<ProfileId>(saved.focused);
  const [secondaryState, setSecondaryState] = useState<ProfileId | undefined>(saved.secondary);
  const [split, setSplitState] = useState(saved.split);
  const [suspended, setSuspended] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slots = useRef<Record<ProfileId, HTMLElement>>({});
  const restored = useRef(false);
  const [groupMap, setGroupMap] = useState<Record<string, TabGroup>>(
    () => Object.fromEntries((saved.groups ?? []).map((g) => [g.id, g])),
  );
  // Appartenance des onglets aux groupes (identifiant d'onglet → groupe).
  const [membership, setMembership] = useState<Record<number, string>>({});
  const membershipRef = useRef(membership);
  membershipRef.current = membership;

  // Un profil supprimé ne peut plus être affiché : on retombe sur un profil existant.
  const focused = profileIds.includes(focusedState) ? focusedState : profileIds[0];
  const secondary = secondaryState && secondaryState !== focused && profileIds.includes(secondaryState)
    ? secondaryState
    : profileIds.find((p) => p !== focused) ?? focused;
  const showSplit = split && secondary !== focused;
  const visibleProfiles = showSplit ? [focused, secondary] : [focused];

  const pane = useCallback((profile: ProfileId) => panes[profile] ?? EMPTY_PANE, [panes]);
  const fail = useCallback((e: unknown) => setError(String(e)), []);

  const show = useCallback((profile: ProfileId, id: number | null) => {
    setPanes((p) => ({ ...p, [profile]: { activeTab: id, lastTab: id ?? p[profile]?.lastTab ?? null } }));
  }, []);

  useEffect(() => {
    const subscriptions = Promise.all([
      listen<BrowserTab[]>("browser:tabs", (e) => setAllTabs(e.payload)),
      // Lien « nouvelle fenêtre » : le nouvel onglet s'affiche dans le volet de l'onglet d'origine.
      listen<[number, number]>("browser:opened", (e) => {
        const [id, opener] = e.payload;
        // Comme dans Brave : un onglet ouvert depuis un groupe rejoint ce groupe.
        const group = membershipRef.current[opener];
        if (group) setMembership((m) => ({ ...m, [id]: group }));
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
    for (const profile of new Set(tabs.map((t) => t.profile))) {
      const p = panes[profile] ?? EMPTY_PANE;
      const last = tabs.filter((t) => t.profile === profile).pop();
      if (last && p.activeTab == null && p.lastTab == null) show(profile, last.id);
    }
  }, [tabs, panes, show]);

  // Un onglet fermé ailleurs (ou disparu) ne doit pas rester affiché.
  useEffect(() => {
    setPanes((p) => {
      let changed = false;
      const next = { ...p };
      const exists = (id: number | null) => id == null || tabs.some((t) => t.id === id);
      for (const [profile, state] of Object.entries(p)) {
        if (!exists(state.activeTab) || !exists(state.lastTab)) {
          changed = true;
          next[profile] = {
            activeTab: exists(state.activeTab) ? state.activeTab : null,
            lastTab: exists(state.lastTab) ? state.lastTab : null,
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
      const existing = (await invoke<BrowserTab[]>("browser_tabs").catch(() => [] as BrowserTab[]))
        .filter((t) => t.window === WINDOW_LABEL);
      if (!IS_MAIN) {
        // Fenêtre détachée : on affiche d'emblée le dernier onglet reçu de chaque profil.
        for (const t of existing) show(t.profile, t.id);
        return;
      }
      // Interface rechargée alors que l'application tourne : les onglets existent encore, on les réaffiche.
      if (existing.length) {
        for (const t of saved.tabs) {
          const match = existing.find((e) => e.profile === t.profile && e.url === t.url);
          if (match && t.active) show(t.profile, match.id);
          if (match && t.group) setMembership((m) => ({ ...m, [match.id]: t.group! }));
        }
        return;
      }
      for (const t of saved.tabs.filter((s) => profileIds.includes(s.profile))) {
        const id = await invoke<number>("browser_open", { profile: t.profile, url: t.url }).catch(() => null);
        if (id == null) continue;
        if (t.active) show(t.profile, id);
        if (t.group) setMembership((m) => ({ ...m, [id]: t.group! }));
      }
    })();
  }, [saved, show]);

  // Sauvegarde de la session.
  useEffect(() => {
    if (!restored.current || !IS_MAIN) return;
    const data: Saved = {
      split,
      focused,
      secondary,
      tabs: tabs.filter((t) => /^(https?|file):/.test(t.url)).map((t) => ({
        profile: t.profile, url: t.url, active: panes[t.profile]?.activeTab === t.id, group: membership[t.id],
      })),
      groups: Object.values(groupMap).filter((g) => tabs.some((t) => membership[t.id] === g.id)),
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* non persisté */ }
  }, [tabs, panes, split, focused, secondary, membership, groupMap]);

  // Placement des pages : chaque volet visible affiche son onglet dans sa zone de contenu.
  const layout = useCallback(() => {
    const visible = suspended ? [] : visibleProfiles.flatMap((profile) => {
      const id = panes[profile]?.activeTab;
      const el = slots.current[profile];
      if (id == null || !el) return [];
      const r = el.getBoundingClientRect();
      return [{ id, x: r.left, y: r.top, width: r.width, height: r.height, radius: pageRadius }];
    });
    invoke("browser_layout", { visible }).catch(fail);
  }, [suspended, visibleProfiles.join("|"), panes, pageRadius, fail]);

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
    for (const el of Object.values(slots.current)) observer.current.observe(el);
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

  // --- Groupes d'onglets ---------------------------------------------------------

  const groupOf = useCallback((tabId: number) => {
    const id = membership[tabId];
    return id ? groupMap[id] ?? null : null;
  }, [membership, groupMap]);

  /** Un groupe apparaît à la place de son premier onglet ; ses onglets le suivent. */
  const strip = useCallback((profile: ProfileId): TabStripItem[] => {
    const items: TabStripItem[] = [];
    const placed = new Set<string>();
    const own = tabs.filter((t) => t.profile === profile);
    for (const tab of own) {
      const group = groupOf(tab.id);
      if (!group) {
        items.push({ kind: "tab", tab });
      } else if (!placed.has(group.id)) {
        placed.add(group.id);
        items.push({ kind: "group", group, tabs: own.filter((t) => membership[t.id] === group.id) });
      }
    }
    return items;
  }, [tabs, membership, groupOf]);

  const createGroup = useCallback((tabId: number) => {
    const tab = tabs.find((t) => t.id === tabId);
    const id = `g${Date.now().toString(36)}`;
    const used = new Set(Object.values(groupMap).map((g) => g.color));
    const color = groupColors.find((c) => !used.has(c)) ?? groupColors[Object.keys(groupMap).length % groupColors.length];
    setGroupMap((g) => ({ ...g, [id]: { id, profile: tab?.profile ?? focused, name: "", color, collapsed: false } }));
    setMembership((m) => ({ ...m, [tabId]: id }));
    return id;
  }, [tabs, groupMap, focused]);

  const addToGroup = useCallback((tabId: number, groupId: string) => {
    setMembership((m) => ({ ...m, [tabId]: groupId }));
  }, []);

  const removeFromGroup = useCallback((tabId: number) => {
    setMembership(({ [tabId]: _removed, ...m }) => m);
  }, []);

  const updateGroup = useCallback((groupId: string, patch: Partial<Pick<TabGroup, "name" | "color" | "collapsed">>) => {
    setGroupMap((g) => (g[groupId] ? { ...g, [groupId]: { ...g[groupId], ...patch } } : g));
  }, []);

  const ungroup = useCallback((groupId: string) => {
    setMembership((m) => Object.fromEntries(Object.entries(m).filter(([, g]) => g !== groupId)));
    setGroupMap(({ [groupId]: _removed, ...g }) => g);
  }, []);

  const go = useCallback((input: string, profile: ProfileId = focused, newTab = false) => {
    const url = toUrl(input, prefsOf(profile).searchUrl);
    if (!url) return;
    const id = panes[profile]?.activeTab;
    if (id != null && !newTab) {
      invoke("browser_navigate", { id, url }).catch(fail);
    } else {
      openUrl(url, profile);
    }
  }, [focused, panes, prefsOf, openUrl, fail]);

  const activate = useCallback((id: number) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    show(tab.profile, id);
    // Un onglet d'un groupe replié se montre : le groupe se déplie.
    const group = membership[id];
    if (group && groupMap[group]?.collapsed) updateGroup(group, { collapsed: false });
    // Le profil reste dans son volet en vue partagée ; sinon il devient le profil affiché.
    if (!(showSplit && tab.profile === secondary)) setFocused(tab.profile);
  }, [tabs, show, showSplit, secondary, membership, groupMap, updateGroup]);

  const close = useCallback((id: number) => {
    const tab = tabs.find((t) => t.id === id);
    if (tab && panes[tab.profile]?.activeTab === id) {
      // Comme un navigateur : on passe à l'onglet voisin, sinon à l'accueil.
      const siblings = tabs.filter((t) => t.profile === tab.profile);
      const index = siblings.findIndex((t) => t.id === id);
      const next = siblings[index + 1] ?? siblings[index - 1];
      show(tab.profile, next?.id ?? null);
    }
    removeFromGroup(id);
    invoke("browser_close", { id }).catch(fail);
  }, [tabs, panes, show, fail, removeFromGroup]);

  const closeGroup = useCallback((groupId: string) => {
    for (const t of tabs.filter((t) => membership[t.id] === groupId)) close(t.id);
    ungroup(groupId);
  }, [tabs, membership, close, ungroup]);

  const home = useCallback((profile: ProfileId = focused) => show(profile, null), [focused, show]);

  const newTab = useCallback((profile: ProfileId = focused) => {
    const start = prefsOf(profile).startPage;
    if (start && start !== "home") openUrl(start, profile);
    else show(profile, null);
  }, [focused, prefsOf, openUrl, show]);

  const action = useCallback((act: NavAction, profile: ProfileId = focused) => {
    const id = panes[profile]?.activeTab;
    if (id != null) invoke("browser_action", { id, action: act }).catch(fail);
  }, [focused, panes, fail]);

  const focus = useCallback((profile: ProfileId) => {
    // Choisir en principal le profil du second volet : les deux volets échangent leur place.
    if (profile === secondary) setSecondaryState(focused);
    setFocused(profile);
  }, [focused, secondary]);

  const setSecondary = useCallback((profile: ProfileId) => {
    if (profile === focused) setFocused(secondary);
    setSecondaryState(profile);
  }, [focused, secondary]);

  const newWindow = useCallback((profile: ProfileId, detach = false) => {
    invoke("browser_new_window", { profile, detach })
      .then(() => {
        if (!detach) return;
        // Le profil détaché quitte cette fenêtre : on garde un autre profil, seul.
        setSplitState(false);
        if (profile === focused) setFocused(profileIds.find((p) => p !== profile) ?? profile);
      })
      .catch(fail);
  }, [fail, focused, profileIds]);

  // Raccourcis : Ctrl+T nouvel onglet, Ctrl+W fermer, Ctrl+N nouvelle fenêtre (profil principal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "n") newWindow(focused);
      else if (key === "t") newTab(focused);
      else if (key === "w" && panes[focused]?.activeTab != null) close(panes[focused].activeTab!);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, panes, newWindow, newTab, close]);

  return {
    tabs, tabsOf, pane, focused, focus, split: showSplit, setSplit: setSplitState, secondary, setSecondary,
    go, activate, close, home, newTab, action, registerSlot, setSuspended, newWindow,
    strip, groups: Object.values(groupMap), groupOf, createGroup, addToGroup, removeFromGroup, updateGroup, ungroup, closeGroup,
    error,
  };
}
