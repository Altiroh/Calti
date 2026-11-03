import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "./windowEvents";
import { availableMonitors, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { recordSearch } from "./library";
import { rememberClosed, takeClosed } from "./closedTabs";

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
  /** En veille (caché depuis longtemps) ou pas encore chargé (session restaurée). */
  sleeping: boolean;
  /** Zoom de la page (1 = 100 %), mémorisé par site. */
  zoom: number;
  /** La page joue du son ; son coupé. */
  audible: boolean;
  muted: boolean;
  /** Publicités et traqueurs bloqués sur la page. */
  blocked: number;
}

export type NavAction = "back" | "forward" | "reload" | "hard-reload" | "empty-cache-reload" | "stop"
  | "mute" | "unmute" | "zoom-in" | "zoom-out" | "zoom-reset";

/** Raccourcis du navigateur, captés dans l'interface ou dans une page (événement `browser:shortcut`). */
export type Shortcut =
  | "reload" | "hard-reload" | "new-tab" | "close-tab" | "address" | "new-window" | "bookmark" | "next-tab" | "previous-tab" | "fullscreen"
  | "reopen-tab" | "palette" | "downloads" | "history" | "zoom-in" | "zoom-out" | "zoom-reset"
  | "tab-1" | "tab-2" | "tab-3" | "tab-4" | "tab-5" | "tab-6" | "tab-7" | "tab-8" | "tab-last";

/** Demandes adressées à l'application (événement DOM, détail = profil) : palette, téléchargements, historique. */
export const APP_EVENT = { palette: "calti:palette", downloads: "calti:downloads", history: "calti:history" } as const;

/** Demandes adressées à un volet (événement DOM, détail = profil) : saisie d'adresse, favori. */
export const PANE_EVENT = { address: "calti:address", bookmark: "calti:bookmark", search: "calti:search" } as const;
/** Bascule du plein écran (F11), pour la fenêtre. */
export const FULLSCREEN_EVENT = "calti:fullscreen";

/** Zone de la fenêtre que les pages laissent voir (badge du plein écran, dialogue), en pixels CSS. */
export interface Cutout {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Arrondi des coins ; absent = pilule. */
  radius?: number;
}

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
  go: (input: string, profile?: ProfileId, newTab?: boolean, background?: boolean) => void;
  activate: (id: number) => void;
  close: (id: number) => void;
  /** Rouvre le dernier onglet fermé du profil (Ctrl+Maj+T), ou celui fermé à l'instant `at`. */
  reopen: (profile?: ProfileId, at?: number) => void;
  /** Action sur un onglet donné : son, zoom… */
  tabAction: (id: number, action: NavAction) => void;
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
  newWindow: (profile: ProfileId, detach?: boolean, tab?: number) => void;
  /** Déplace un onglet juste avant un autre (null : à la fin). */
  move: (id: number, before: number | null) => void;
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

/** Fenêtre courante : « main » au démarrage, « calti-n » pour les suivantes. */
const WINDOW_LABEL = getCurrentWindow().label;
const IS_MAIN = WINDOW_LABEL === "main";
/** Session de chaque fenêtre : « calti.browser » pour la principale, « calti.browser.calti-n » pour les autres. */
const SESSION_PREFIX = "calti.browser.";
const STORAGE_KEY = IS_MAIN ? "calti.browser" : SESSION_PREFIX + WINDOW_LABEL;
const PARAMS = new URLSearchParams(location.search);
/** Profil demandé à l'ouverture d'une fenêtre secondaire (?profile=pro). */
const INITIAL_PROFILE = PARAMS.get("profile");
/** Session d'une fenêtre secondaire à rouvrir au lancement (?session=calti.browser.calti-n). */
const RESTORE_KEY = PARAMS.get("session");
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

/** Place de la fenêtre à l'écran, en pixels physiques. */
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

interface Saved {
  split: boolean;
  focused: ProfileId;
  secondary?: ProfileId;
  tabs: { profile: ProfileId; url: string; title?: string; active: boolean; group?: string }[];
  groups?: TabGroup[];
  bounds?: Bounds;
  /** Fermeture de la fenêtre (ms) : absente si elle était ouverte quand l'application s'est arrêtée. */
  closedAt?: number;
}

/** Fenêtres fermées au plus dix minutes avant la principale : fermées en quittant Calti, donc rouvertes. */
const QUIT_WINDOW = 10 * 60_000;

/** Remet la fenêtre à sa place, si cette place est encore sur un écran branché. */
async function applyBounds(b: Bounds) {
  const win = getCurrentWindow();
  const monitors = await availableMonitors().catch(() => []);
  const visible = monitors.some(({ position: p, size: z }) =>
    b.x + 80 < p.x + z.width && b.x + b.width - 80 > p.x && b.y >= p.y - 20 && b.y + 40 < p.y + z.height);
  if (!visible) return;
  await win.setPosition(new PhysicalPosition(b.x, b.y)).catch(() => {});
  if (b.maximized) await win.maximize().catch(() => {});
  else await win.setSize(new PhysicalSize(b.width, b.height)).catch(() => {});
}

function loadSaved(fallback: ProfileId): Saved {
  // Fenêtre secondaire : sa session n'est relue que si la principale la rouvre au lancement.
  const key = IS_MAIN ? STORAGE_KEY : RESTORE_KEY;
  if (!key) return { split: false, focused: INITIAL_PROFILE ?? fallback, tabs: [] };
  try {
    return { split: false, focused: INITIAL_PROFILE ?? fallback, tabs: [], ...JSON.parse(localStorage.getItem(key) ?? "{}") };
  } catch {
    return { split: false, focused: fallback, tabs: [] };
  }
}

export function useBrowser(
  profileIds: ProfileId[], prefsOf: (profile: ProfileId) => ProfilePrefs, pageRadius = 16, cutouts: Cutout[] = [],
): Browser {
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
  const pendingSession = useRef<string | null>(null);
  const sessionTimer = useRef(0);
  const flushSession = useCallback(() => {
    clearTimeout(sessionTimer.current);
    if (pendingSession.current == null) return;
    try { localStorage.setItem(STORAGE_KEY, pendingSession.current); } catch { /* non persisté */ }
    pendingSession.current = null;
  }, []);
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
      // Troisième valeur : ouvert en arrière-plan (clic molette, Ctrl+clic) — le volet reste sur sa page.
      listen<[number, number, boolean]>("browser:opened", (e) => {
        const [id, opener, background] = e.payload;
        // Comme dans Brave : un onglet ouvert depuis un groupe rejoint ce groupe.
        const group = membershipRef.current[opener];
        if (group) setMembership((m) => ({ ...m, [id]: group }));
        if (background) return;
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

  const openUrl = useCallback(async (url: string, profile: ProfileId, background = false) => {
    try {
      const id = await invoke<number>("browser_open", { profile, url });
      if (!background) show(profile, id);
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
      if (!IS_MAIN && !RESTORE_KEY) {
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
        // Seuls les onglets affichés se chargent ; les autres attendent qu'on les ouvre.
        const lazyTitle = t.active ? null : t.title ?? "";
        const id = await invoke<number>("browser_open", { profile: t.profile, url: t.url, lazyTitle }).catch(() => null);
        if (id == null) continue;
        if (t.active) show(t.profile, id);
        if (t.group) setMembership((m) => ({ ...m, [id]: t.group! }));
      }
      // Session reprise sous un autre nom de fenêtre : l'ancienne est oubliée (celle-ci s'enregistre sous le sien).
      if (RESTORE_KEY && RESTORE_KEY !== STORAGE_KEY) localStorage.removeItem(RESTORE_KEY);
      if (!IS_MAIN) return;
      // Fenêtres secondaires ouvertes quand Calti s'est arrêté, ou fermées en le quittant : rouvertes à leur place,
      // avec leur état et leurs onglets. Une fenêtre fermée bien avant de quitter reste fermée.
      const quitAt = saved.closedAt;
      for (const key of Object.keys(localStorage).filter((k) => k.startsWith(SESSION_PREFIX))) {
        try {
          const other: Saved = JSON.parse(localStorage.getItem(key) ?? "{}");
          const profile = [other.focused, ...(other.tabs ?? []).map((t) => t.profile)].find((p) => p && profileIds.includes(p));
          const closedWithApp = other.closedAt == null || quitAt == null || other.closedAt >= quitAt - QUIT_WINDOW;
          if (!profile || !closedWithApp) { localStorage.removeItem(key); continue; }
          await invoke("browser_new_window", { profile, detach: false, session: key });
        } catch { /* session illisible : ignorée */ }
      }
    })();
  }, [saved, show]);

  // Place de la fenêtre : remise au lancement, suivie ensuite (déplacement, taille, agrandissement).
  const [bounds, setBounds] = useState<Bounds | undefined>(saved.bounds);
  useEffect(() => {
    if (saved.bounds) applyBounds(saved.bounds);
    const win = getCurrentWindow();
    let timer = 0;
    const track = () => {
      clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const [position, size, maximized, minimized] = await Promise.all([
          win.outerPosition(), win.innerSize(), win.isMaximized(), win.isMinimized(),
        ]).catch(() => [null, null, false, true] as const);
        // Réduite ou agrandie : on garde la dernière taille normale, seul l'état « agrandie » change.
        if (!position || !size || minimized) return;
        setBounds((b) => (maximized && b ? { ...b, maximized: true }
          : { x: position.x, y: position.y, width: size.width, height: size.height, maximized }));
      }, 400);
    };
    const listeners = Promise.all([win.onMoved(track), win.onResized(track)]);
    track();
    return () => { clearTimeout(timer); listeners.then((u) => u.forEach((f) => f())); };
  }, []);

  // Fermeture : la session part tout de suite, datée. Au lancement suivant, les fenêtres fermées en même temps que
  // l'application sont rouvertes ; une fenêtre fermée bien avant ne l'est pas.
  const closing = useRef<() => void>(() => {});
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(() => closing.current());
    return () => { unlisten.then((u) => u()); };
  }, []);

  // Sauvegarde de la session (chaque fenêtre sous sa propre clé).
  useEffect(() => {
    if (!restored.current) return;
    const data: Saved = {
      split,
      focused,
      secondary,
      tabs: tabs.filter((t) => /^(https?|file):/.test(t.url)).map((t) => ({
        profile: t.profile, url: t.url, title: t.title, active: panes[t.profile]?.activeTab === t.id, group: membership[t.id],
      })),
      groups: Object.values(groupMap).filter((g) => tabs.some((t) => membership[t.id] === g.id)),
      bounds,
    };
    closing.current = () => {
      clearTimeout(sessionTimer.current);
      pendingSession.current = null;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, closedAt: Date.now() })); } catch { /* non persisté */ }
    };
    // Écriture regroupée : pendant un chargement, titres et adresses changent plusieurs fois par seconde.
    pendingSession.current = JSON.stringify(data);
    clearTimeout(sessionTimer.current);
    sessionTimer.current = window.setTimeout(flushSession, 400);
  }, [tabs, panes, split, focused, secondary, membership, groupMap, bounds]);
  // Fermeture de la fenêtre : la dernière session part tout de suite.
  useEffect(() => {
    window.addEventListener("pagehide", flushSession);
    return () => window.removeEventListener("pagehide", flushSession);
  }, []);

  // Placement des pages : chaque volet visible affiche son onglet dans sa zone de contenu.
  const layout = useCallback(() => {
    // Fenêtre réduite : ses pages sont cachées, donc mises en mémoire réduite puis en veille comme un onglet caché.
    const visible = suspended || document.hidden ? [] : visibleProfiles.flatMap((profile) => {
      const id = panes[profile]?.activeTab;
      const el = slots.current[profile];
      if (id == null || !el) return [];
      const r = el.getBoundingClientRect();
      // Une découpe ne concerne que la page qu'elle chevauche, en coordonnées de cette page.
      const holes = cutouts
        .filter((c) => c.x < r.right && c.x + c.width > r.left && c.y < r.bottom && c.y + c.height > r.top)
        .map((c) => ({ ...c, x: c.x - r.left, y: c.y - r.top }));
      return [{ id, x: r.left, y: r.top, width: r.width, height: r.height, radius: pageRadius, cutouts: holes }];
    });
    invoke("browser_layout", { visible }).catch(fail);
  }, [suspended, visibleProfiles.join("|"), panes, pageRadius, JSON.stringify(cutouts), fail]);

  const frame = useRef(0);
  const scheduleLayout = useCallback(() => {
    // Fenêtre cachée : pas d'images d'animation, la mise en place se fait tout de suite.
    if (document.hidden) {
      layout();
      return;
    }
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
    document.addEventListener("visibilitychange", scheduleLayout);
    return () => {
      observer.current?.disconnect();
      window.removeEventListener("resize", scheduleLayout);
      document.removeEventListener("visibilitychange", scheduleLayout);
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

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
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

  const go = useCallback((input: string, profile: ProfileId = focused, newTab = false, background = false) => {
    const { searchUrl } = prefsOf(profile);
    const url = toUrl(input, searchUrl);
    if (!url) return;
    // Recherche (et non adresse) : mémorisée pour les suggestions.
    if (url.startsWith(searchUrl)) recordSearch(profile, input);
    const id = panes[profile]?.activeTab;
    if (id != null && !newTab) {
      invoke("browser_navigate", { id, url }).catch(fail);
    } else {
      openUrl(url, profile, background);
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
    if (tab) rememberClosed({ profile: tab.profile, url: tab.url, title: tab.title });
    removeFromGroup(id);
    invoke("browser_close", { id }).catch(fail);
  }, [tabs, panes, show, fail, removeFromGroup]);

  /** Rouvre le dernier onglet fermé du profil (ou celui fermé à l'instant `at`). */
  const reopen = useCallback((profile: ProfileId = focused, at?: number) => {
    const tab = takeClosed(profile, at);
    if (tab) openUrl(tab.url, profile);
  }, [focused, openUrl]);

  /** Action sur un onglet précis (son, zoom…), pas forcément celui affiché. */
  const tabAction = useCallback((id: number, act: NavAction) => {
    invoke("browser_action", { id, action: act }).catch(fail);
  }, [fail]);

  const closeGroup = useCallback((groupId: string) => {
    for (const t of tabs.filter((t) => membership[t.id] === groupId)) close(t.id);
    ungroup(groupId);
  }, [tabs, membership, close, ungroup]);

  const home = useCallback((profile: ProfileId = focused) => show(profile, null), [focused, show]);

  const newTab = useCallback((profile: ProfileId = focused) => {
    const start = prefsOf(profile).startPage;
    if (start && start !== "home") openUrl(start, profile);
    else show(profile, null);
    // Comme dans un navigateur : on peut taper tout de suite (recherche de l'accueil, sinon barre d'adresse).
    window.dispatchEvent(new CustomEvent(PANE_EVENT.search, { detail: profile }));
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

  const newWindow = useCallback((profile: ProfileId, detach = false, tab?: number) => {
    invoke("browser_new_window", { profile, detach, session: null, tab: tab ?? null })
      .then(() => {
        if (tab != null) {
          // Onglet sorti seul : son volet passe à l'onglet voisin.
          const own = tabs.filter((t) => t.profile === profile && t.id !== tab);
          if (panes[profile]?.activeTab === tab) show(profile, own[own.length - 1]?.id ?? null);
          removeFromGroup(tab);
          return;
        }
        if (!detach) return;
        // Le profil détaché quitte cette fenêtre : on garde un autre profil, seul.
        setSplitState(false);
        if (profile === focused) setFocused(profileIds.find((p) => p !== profile) ?? profile);
      })
      .catch(fail);
  }, [fail, focused, profileIds, tabs, panes, show, removeFromGroup]);

  const move = useCallback((id: number, before: number | null) => {
    invoke("browser_move", { id, before }).catch(fail);
  }, [fail]);

  const runShortcut = useCallback((key: Shortcut, profile: ProfileId = focused) => {
    const active = panes[profile]?.activeTab ?? null;
    switch (key) {
      case "reload":
      case "hard-reload":
      case "zoom-in":
      case "zoom-out":
      case "zoom-reset":
        if (active != null) invoke("browser_action", { id: active, action: key }).catch(fail);
        return;
      case "new-tab": return newTab(profile);
      case "reopen-tab": return reopen(profile);
      case "palette":
      case "downloads":
      case "history":
        window.dispatchEvent(new CustomEvent(APP_EVENT[key], { detail: profile }));
        return;
      case "tab-1": case "tab-2": case "tab-3": case "tab-4": case "tab-5": case "tab-6": case "tab-7": case "tab-8":
      case "tab-last": {
        const own = tabs.filter((t) => t.profile === profile);
        const target = key === "tab-last" ? own[own.length - 1] : own[Number(key.slice(4)) - 1];
        if (target) activate(target.id);
        return;
      }
      case "close-tab": if (active != null) close(active); return;
      case "new-window": return newWindow(profile);
      case "fullscreen":
        window.dispatchEvent(new Event(FULLSCREEN_EVENT));
        return;
      case "address":
      case "bookmark":
        window.dispatchEvent(new CustomEvent(PANE_EVENT[key], { detail: profile }));
        return;
      case "next-tab":
      case "previous-tab": {
        const own = tabs.filter((t) => t.profile === profile);
        if (!own.length) return;
        const index = own.findIndex((t) => t.id === active);
        const step = key === "next-tab" ? 1 : -1;
        activate(own[(index + step + own.length) % own.length].id);
      }
    }
  }, [focused, panes, tabs, newTab, close, newWindow, activate, fail, reopen]);
  const runShortcutRef = useRef(runShortcut);
  runShortcutRef.current = runShortcut;

  // Raccourcis captés dans une page : seulement ceux des onglets de cette fenêtre.
  useEffect(() => {
    const unlisten = listen<[number, Shortcut]>("browser:shortcut", (e) => {
      const [id, key] = e.payload;
      const tab = tabsRef.current.find((t) => t.id === id);
      if (tab) runShortcutRef.current(key, tab.profile);
    });
    return () => { unlisten.then((u) => u()); };
  }, []);

  // Les mêmes raccourcis quand l'interface a le focus (profil du volet principal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      let shortcut: Shortcut | null = null;
      if (key === "f5") shortcut = e.ctrlKey || e.shiftKey ? "hard-reload" : "reload";
      else if (key === "f6") shortcut = "address";
      else if (key === "f11") shortcut = "fullscreen";
      else if (e.ctrlKey && !e.altKey) {
        if (key === "tab") shortcut = e.shiftKey ? "previous-tab" : "next-tab";
        else if (key === "r") shortcut = e.shiftKey ? "hard-reload" : "reload";
        else if (key === "t" && e.shiftKey) shortcut = "reopen-tab";
        else if (key === "k" && e.shiftKey) shortcut = "palette";
        else if (key === "=" || key === "+") shortcut = "zoom-in";
        else if (key === "-" || e.code === "NumpadSubtract") shortcut = "zoom-out";
        else if (e.code === "Digit0" || e.code === "Numpad0") shortcut = "zoom-reset";
        // Touche physique (e.code) : sur un clavier AZERTY, Ctrl+1 donne « & ».
        else if (!e.shiftKey && /^Digit[1-9]$/.test(e.code)) shortcut = e.code === "Digit9" ? "tab-last" : (`tab-${e.code.slice(5)}` as Shortcut);
        else if (!e.shiftKey) {
          const keys: Record<string, Shortcut> = {
            n: "new-window", t: "new-tab", w: "close-tab", l: "address", d: "bookmark", k: "palette", j: "downloads", h: "history",
          };
          shortcut = keys[key] ?? null;
        }
      }
      if (!shortcut) return;
      e.preventDefault();
      runShortcut(shortcut);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runShortcut]);

  return {
    tabs, tabsOf, pane, focused, focus, split: showSplit, setSplit: setSplitState, secondary, setSecondary,
    go, activate, close, home, newTab, action, registerSlot, setSuspended, newWindow, move, reopen, tabAction,
    strip, groups: Object.values(groupMap), groupOf, createGroup, addToGroup, removeFromGroup, updateGroup, ungroup, closeGroup,
    error,
  };
}
