// Modèles de mise en page prêts à l'emploi, inspirés des références. Ils ne touchent qu'à la disposition.
import { defaultLayout, type Block, type Layout } from "./layout";

const hide = (b: Block): Block => ({ ...b, hidden: true });

export const presets: { name: string; description: string; layout: Layout }[] = [
  {
    name: "Tableau de bord",
    description: "Titre, horloge, onglets, favoris et accès rapide.",
    layout: defaultLayout,
  },
  {
    name: "Centré",
    description: "Grand titre et recherche au centre, rien d'autre.",
    layout: {
      ...Object.fromEntries(Object.entries(defaultLayout).map(([id, b]) => [id, hide(b)])),
      title: { kind: "title", x: 1, y: 4, w: 10, h: 7, style: { align: "center", vAlign: "bottom", size: 104, surface: "none" } },
      search: { kind: "search", x: 3, y: 12, w: 6, h: 2, style: { shape: "pill", button: true, surface: "solid" } },
      clock: { kind: "clock", x: 10, y: 0, w: 2, h: 2, style: { size: 22, weight: 400, showDate: false, align: "right" } },
    },
  },
  {
    name: "Éditorial",
    description: "Marque en haut à gauche, titre serif, onglets en verre sombre.",
    layout: {
      ...defaultLayout,
      brand: { kind: "text", x: 0, y: 0, w: 4, h: 1, text: "Calti", style: { font: "editorial", size: 22, italic: true, vAlign: "center" } },
      clock: { kind: "clock", x: 9, y: 0, w: 3, h: 1, style: { font: "mono", size: 15, weight: 400, uppercase: true, tracking: 0.14, showDate: false } },
      title: { kind: "title", x: 1, y: 2, w: 10, h: 7, style: { font: "editorial", align: "center", vAlign: "center", size: 96, weight: 400, font2: "editorial", italic2: true } },
      search: { kind: "search", x: 3, y: 10, w: 6, h: 2, style: { shape: "pill", button: true } },
      activeTab: { ...defaultLayout.activeTab, hidden: true },
      bookmarks: { kind: "bookmarks", x: 0, y: 13, w: 4, h: 7, style: { surface: "glass-dark" } },
      quickAccess: { kind: "quickAccess", x: 4, y: 13, w: 4, h: 7, style: { surface: "glass-dark" } },
      tabs: { kind: "tabs", x: 8, y: 13, w: 4, h: 10, style: { surface: "glass-dark" } },
      tagline: {
        kind: "text", x: 0, y: 21, w: 5, h: 2,
        text: "*Un onglet à la fois.*\nLe reste peut attendre.",
        style: { size: 14, vAlign: "bottom", font2: "editorial", italic2: true },
      },
    },
  },
  {
    name: "Minimal",
    description: "Recherche seule, sur fond d'image.",
    layout: {
      ...Object.fromEntries(Object.entries(defaultLayout).map(([id, b]) => [id, hide(b)])),
      search: { kind: "search", x: 3, y: 9, w: 6, h: 2, style: { shape: "pill", button: true, surface: "glass", opacity: 0.25, blur: 30 } },
      clock: { kind: "clock", x: 4, y: 3, w: 4, h: 5, style: { align: "center", vAlign: "bottom", size: 120, weight: 200 } },
    },
  },
];
