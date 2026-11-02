// Présente les onglets d'un profil de Calti aux widgets de l'accueil (onglets, onglet actif, favoris…).
import type { BookmarkNode, Command, Tab } from "../brave/types";
import type { Browser, ProfileId } from "./useBrowser";

export interface BraveWindow {
  id: number;
  tabs: Tab[];
}

/** Vue d'un profil pour les widgets. */
export interface Brave {
  connected: boolean;
  windows: BraveWindow[];
  focusedWindowId: number | null;
  activeTab: Tab | null;
  bookmarks: BookmarkNode[] | null;
  send: (command: Command) => void;
}

function favicon(url: string): string | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? `${u.origin}/favicon.ico` : null;
  } catch {
    return null;
  }
}

export function profileView(browser: Browser, profile: ProfileId, bookmarks: BookmarkNode[] | null): Brave {
  const pane = browser.panes[profile];
  const shown = pane.activeTab ?? pane.lastTab;
  const tabs: Tab[] = browser.tabsOf(profile).map((t, index) => ({
    id: t.id,
    windowId: 1,
    index,
    title: t.title,
    url: t.url,
    favIconUrl: favicon(t.url),
    active: t.id === shown,
    pinned: false,
    audible: false,
    muted: false,
    incognito: false,
    loading: t.loading,
  }));

  const send = (command: Command) => {
    switch (command.type) {
      case "activateTab": return browser.activate(command.tabId);
      case "closeTab": return browser.close(command.tabId);
      case "newTab": return browser.home(profile);
      case "openUrl": return browser.go(command.url, profile, true);
      case "search": return browser.go(command.text, profile, true);
      case "navigate":
        // Depuis l'accueil, la navigation porte sur le dernier onglet affiché, qu'on réaffiche.
        if (shown != null) {
          browser.activate(shown);
          browser.action(command.action, profile);
        }
        return;
      default:
        return;
    }
  };

  return {
    connected: true,
    windows: tabs.length ? [{ id: 1, tabs }] : [],
    focusedWindowId: tabs.length ? 1 : null,
    activeTab: tabs.find((t) => t.active) ?? null,
    bookmarks,
    send,
  };
}
