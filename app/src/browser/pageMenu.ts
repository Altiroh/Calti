// Clic droit dans une page : les entrées de WebView2 (app/src-tauri/src/pagemenu.rs), dessinées par le menu de Calti.
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "./windowEvents";
import { openMenu, type MenuEntry, type MenuTone } from "../components/ContextMenu";
import type { IconName } from "../components/Icon";
import type { BrowserTab } from "./useBrowser";

interface Item {
  id: number;
  name: string;
  label: string;
  shortcut: string;
  kind: "command" | "check" | "radio" | "sep" | "sub";
  enabled: boolean;
  checked: boolean;
  children: Item[];
}

interface Request {
  request: number;
  tab: number;
  x: number;
  y: number;
  items: Item[];
  link: string;
}

/** Icône et teinte de chaque entrée connue de WebView2 (nom stable, indépendant de la langue). */
const looks: Record<string, [IconName, MenuTone]> = {
  back: ["back", "slate"],
  forward: ["forward", "slate"],
  reload: ["reload", "blue"],
  saveAs: ["save", "green"],
  print: ["print", "slate"],
  createQrCode: ["qr", "violet"],
  share: ["share", "teal"],
  inspectElement: ["inspect", "violet"],
  emoji: ["emoji", "amber"],
  copyLinkToHighlight: ["link", "violet"],
  copy: ["copy", "blue"],
  cut: ["cut", "pink"],
  paste: ["paste", "teal"],
  pasteAndMatchStyle: ["paste", "slate"],
  selectAll: ["select", "slate"],
  undo: ["undo", "amber"],
  redo: ["redo", "amber"],
  openLinkInNewTab: ["plus", "green"],
  openLinkInNewWindow: ["window", "blue"],
  copyLinkLocation: ["link", "violet"],
  saveLinkAs: ["save", "green"],
  copyImage: ["copy", "blue"],
  copyImageLocation: ["link", "violet"],
  saveImageAs: ["image", "green"],
  openImageInNewWindow: ["image", "teal"],
  copyVideoLocation: ["link", "violet"],
  saveMediaAs: ["save", "green"],
  pictureInPicture: ["video", "pink"],
  loop: ["reload", "teal"],
  showAllControls: ["video", "slate"],
  webSelect: ["search", "blue"],
  webCapture: ["image", "pink"],
  writingDirection: ["text", "slate"],
  spellCheck: ["text", "amber"],
  translate: ["globe", "teal"],
  readAloud: ["sound", "pink"],
};

function toEntries(items: Item[], pick: (id: number, dock?: boolean) => void): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const item of items) {
    if (item.kind === "sep") {
      // Pas de séparateur en tête, en fin ni en double.
      if (out.length && out[out.length - 1] !== "-") out.push("-");
      continue;
    }
    const [icon, tone] = looks[item.name] ?? [undefined, undefined];
    out.push({
      label: item.label,
      icon,
      tone,
      shortcut: item.shortcut.replace(/Shift/g, "Maj") || undefined,
      disabled: !item.enabled,
      checked: item.kind === "check" || item.kind === "radio" ? item.checked : undefined,
      items: item.kind === "sub" ? toEntries(item.children, pick) : undefined,
      // « Inspecter » : les outils s’ouvrent dans le panneau de Calti.
      action: () => pick(item.id, item.name === "inspectElement"),
    });
  }
  while (out[out.length - 1] === "-") out.pop();
  return out;
}

/** Affiche le menu des pages de cette fenêtre. */
export function usePageMenu(tabs: BrowserTab[]) {
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  useEffect(() => {
    const unlisten = listen<Request>("browser:page-menu", (e) => {
      const { request, tab, x, y, items } = e.payload;
      const profile = tabsRef.current.find((t) => t.id === tab)?.profile;
      const slot = document.querySelector(`.pane__content[data-profile="${CSS.escape(profile ?? "")}"]`)?.getBoundingClientRect();
      let picked = false;
      const pick = (command: number, dock = false) => {
        picked = true;
        invoke("page_menu_pick", { request, command, dock }).catch(() => {});
      };
      // Menu refermé sans choix : WebView2 est libéré (l'action choisie, elle, part juste après la fermeture).
      const onClose = () => window.setTimeout(() => { if (!picked) invoke("page_menu_pick", { request, command: null }).catch(() => {}); }, 120);
      const scale = window.devicePixelRatio || 1;
      openMenu({ x: (slot?.left ?? 0) + x / scale, y: (slot?.top ?? 0) + y / scale }, toEntries(items, pick), onClose);
    });
    return () => { unlisten.then((u) => u()); };
  }, []);
}
