// Miroir de app/src-tauri/src/protocol.rs.

export interface Tab {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  favIconUrl: string | null;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  muted: boolean;
  incognito: boolean;
  loading: boolean;
}

export interface Snapshot {
  focusedWindowId: number | null;
  tabs: Tab[];
}

export interface BookmarkNode {
  id: string;
  title: string;
  url: string | null;
  children: BookmarkNode[] | null;
}

/** Un profil Brave connecté (une instance de l'extension). */
export interface ProfileState {
  id: string;
  snapshot: Snapshot | null;
  bookmarks: BookmarkNode[] | null;
}

export type NavAction = "back" | "forward" | "reload";

export type Command =
  | { type: "activateTab"; tabId: number }
  | { type: "closeTab"; tabId: number }
  | { type: "newTab" }
  /** `where` : onglet affiché, nouvel onglet (par défaut) ou nouvel onglet en arrière-plan. */
  | { type: "openUrl"; url: string; where?: "current" | "new" | "background" }
  | { type: "search"; text: string }
  | { type: "navigate"; action: NavAction };
