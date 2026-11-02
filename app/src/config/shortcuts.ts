// Raccourcis affichés dans la barre latérale. À modifier directement ici.

export interface Shortcut {
  label: string;
  url: string;
  /** Une ou deux lettres affichées dans la pastille. */
  glyph: string;
  /** Teinte de la pastille (0-360). */
  hue: number;
}

export const shortcuts: Shortcut[] = [
  { label: "GitHub", url: "https://github.com", glyph: "Gh", hue: 220 },
  { label: "YouTube", url: "https://www.youtube.com", glyph: "Yt", hue: 355 },
  { label: "Wikipédia", url: "https://fr.wikipedia.org", glyph: "W", hue: 200 },
  { label: "Brave Search", url: "https://search.brave.com", glyph: "Bs", hue: 18 },
];
