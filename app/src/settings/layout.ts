// Disposition de l'accueil : grille de 12 colonnes, rangées de hauteur fixe.
// Chaque bloc a une place, une taille et un style ; les blocs « texte » peuvent être ajoutés à volonté.

export type BlockKind =
  | "title" | "clock" | "search" | "activeTab" | "tabs" | "bookmarks" | "quickAccess" | "history" | "clipboard" | "notes" | "media" | "text";
export type BuiltinId = Exclude<BlockKind, "text">;

export type ClockStyle = "classic" | "labels" | "flip" | "capsule" | "orbit" | "hologram" | "neon" | "matrix";

export type Surface = "glass" | "glass-dark" | "solid" | "none";
export type TextFont = "moderne" | "editorial" | "condense" | "mono";

/** Apparence d'un bloc. Tout est facultatif : une valeur absente garde le rendu par défaut. */
export interface BlockStyle {
  /** Fond du bloc. */
  surface?: Surface;
  /** Opacité du fond (0 à 1). */
  opacity?: number;
  /** Flou derrière le bloc, en pixels. */
  blur?: number;
  /** Arrondi des coins, en pixels. */
  radius?: number;
  /** Texte clair (sur fond sombre) ou sombre ; par défaut, celui de l'environnement. */
  tone?: "light" | "dark";

  // Texte (titre, horloge, blocs texte)
  align?: "left" | "center" | "right";
  vAlign?: "top" | "center" | "bottom";
  /** Taille du texte principal, en pixels. */
  size?: number;
  weight?: number;
  font?: TextFont;
  italic?: boolean;
  uppercase?: boolean;
  /** Espacement des lettres, en em. */
  tracking?: number;
  color?: string;
  /** Couleur des passages entre *astérisques* (et de la 2e ligne du titre). */
  color2?: string;
  /** Police des passages entre *astérisques*. */
  font2?: TextFont;
  italic2?: boolean;
  /** Dégradé de `color` vers `color2` sur tout le texte. */
  gradient?: boolean;

  // Recherche
  shape?: "pill" | "rounded";
  button?: boolean;
  placeholder?: string;

  // Accueil (salutation)
  /** Nom du profil après la salutation (« Bonjour, Pro. »). */
  showProfile?: boolean;

  // Horloge
  showDate?: boolean;
  /** Style de l’horloge (voir widgets/clockStyles). */
  clockStyle?: ClockStyle;
  showSeconds?: boolean;
}

export interface Block {
  kind: BlockKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
  style?: BlockStyle;
  /** Contenu d'un bloc texte (ou titre libre). *Passage* = mise en valeur. */
  text?: string;
}

export type Placement = Pick<Block, "x" | "y" | "w" | "h">;
export type Layout = Record<string, Block>;

export const GRID = { cols: 12, row: 28, gap: 16 };

export const builtinIds: BuiltinId[] = ["title", "clock", "search", "activeTab", "tabs", "bookmarks", "quickAccess", "history", "clipboard", "notes", "media"];

export const kindLabels: Record<BlockKind, string> = {
  title: "Accueil",
  clock: "Horloge",
  search: "Recherche",
  activeTab: "Onglet actif",
  tabs: "Onglets",
  bookmarks: "Favoris",
  quickAccess: "Accès rapide",
  history: "Historique",
  clipboard: "Copies récentes",
  notes: "Notes",
  media: "Lecture en cours",
  text: "Texte",
};

/** Taille minimale de chaque type de bloc, en cellules. */
export const minSize: Record<BlockKind, { w: number; h: number }> = {
  title: { w: 2, h: 2 },
  clock: { w: 2, h: 2 },
  search: { w: 3, h: 2 },
  activeTab: { w: 4, h: 4 },
  tabs: { w: 3, h: 5 },
  bookmarks: { w: 3, h: 4 },
  quickAccess: { w: 3, h: 5 },
  history: { w: 3, h: 4 },
  clipboard: { w: 3, h: 4 },
  notes: { w: 2, h: 3 },
  media: { w: 3, h: 2 },
  text: { w: 1, h: 1 },
};

export const defaultLayout: Layout = {
  title: { kind: "title", x: 0, y: 0, w: 8, h: 6 },
  clock: { kind: "clock", x: 8, y: 0, w: 4, h: 6 },
  search: { kind: "search", x: 2, y: 6, w: 8, h: 2 },
  activeTab: { kind: "activeTab", x: 0, y: 9, w: 8, h: 5 },
  tabs: { kind: "tabs", x: 8, y: 9, w: 4, h: 12 },
  bookmarks: { kind: "bookmarks", x: 0, y: 14, w: 4, h: 7 },
  quickAccess: { kind: "quickAccess", x: 4, y: 14, w: 4, h: 7 },
  history: { kind: "history", x: 0, y: 21, w: 4, h: 8 },
  clipboard: { kind: "clipboard", x: 4, y: 21, w: 4, h: 8 },
  notes: { kind: "notes", x: 8, y: 21, w: 4, h: 8 },
  // Masqué tant qu'on ne l'ajoute pas (éditeur de disposition).
  media: { kind: "media", x: 0, y: 29, w: 4, h: 3, hidden: true },
};

export function blockLabel(block: Block): string {
  if (block.kind !== "text") return kindLabels[block.kind];
  const words = (block.text ?? "").replace(/\*/g, "").trim().split(/\s+/).slice(0, 3).join(" ");
  return words ? `Texte « ${words} »` : "Texte";
}

export function overlaps(a: Placement, b: Placement): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Vrai si `p` chevauche un autre bloc visible. */
export function collides(layout: Layout, id: string, p: Placement): boolean {
  return Object.entries(layout).some(([other, b]) => other !== id && !b.hidden && overlaps(p, b));
}

/** Garde un bloc dans la grille et au-dessus de sa taille minimale. */
export function clampBlock(block: Block, p: Placement): Block {
  const min = minSize[block.kind];
  const w = Math.max(min.w, Math.min(GRID.cols, p.w));
  const h = Math.max(min.h, p.h);
  return { ...block, w, h, x: Math.max(0, Math.min(GRID.cols - w, p.x)), y: Math.max(0, p.y) };
}

/** Première place libre (de haut en bas, de gauche à droite) pour un bloc. */
export function findFreeSpot(layout: Layout, id: string, size: { w: number; h: number }): Placement {
  for (let y = 0; ; y++) {
    for (let x = 0; x <= GRID.cols - size.w; x++) {
      const p = { x, y, ...size };
      if (!collides(layout, id, p)) return p;
    }
  }
}

/** Nombre de rangées occupées par les blocs visibles. */
export function usedRows(layout: Layout): number {
  return Math.max(0, ...Object.values(layout).filter((b) => !b.hidden).map((b) => b.y + b.h));
}

export function newTextId(): string {
  return `text-${Date.now().toString(36)}`;
}

/** Complète une disposition enregistrée (blocs ajoutés depuis, anciennes versions sans `kind`). */
export function normalizeLayout(saved: Record<string, Partial<Block>> | undefined): Layout {
  const layout: Layout = {};
  for (const id of builtinIds) {
    if (!saved?.[id]) continue;
    const b = { ...defaultLayout[id], ...saved[id], kind: id };
    layout[id] = clampBlock(b, b);
  }
  for (const [id, b] of Object.entries(saved ?? {})) {
    if (b.kind === "text") layout[id] = clampBlock(b as Block, b as Block);
  }
  // Blocs apparus depuis l'enregistrement : à leur place par défaut si elle est libre, sinon à la première place libre.
  for (const id of builtinIds) {
    if (layout[id]) continue;
    const b = defaultLayout[id];
    layout[id] = saved && collides(layout, id, b) ? { ...b, ...findFreeSpot(layout, id, b) } : { ...b };
  }
  return layout;
}
