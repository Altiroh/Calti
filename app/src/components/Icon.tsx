// Icônes SVG au trait, sans dépendance.

const paths = {
  home: "M4 11l8-7 8 7M6 9.5V19h4v-5h4v5h4V9.5",
  split: "M4 5h16v14H4zM12 5v14",
  popout: "M14 4h6v6M20 4l-8 8M18 14v5H5V6h5",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  back: "M15 5l-7 7 7 7",
  forward: "M9 5l7 7-7 7",
  reload: "M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  star: "M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 16.2 7 19l1.2-5.6L4 9.6 9.6 9z",
  folder: "M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
  globe: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16",
  minimize: "M6 12h12",
  maximize: "M7 7h10v10H7z",
  chevron: "M9 6l6 6-6 6",
  clipboard: "M9 4h6v3H9zM9 5.5H6.5V20h11V5.5H15M9 11h6M9 15h4",
  history: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 4v4h4M12 8v4l3 2",
  tabs: "M3.5 8h17v11h-17zM3.5 8l1.5-3h5l1.5 3",
  notes: "M6 4h9l3 3v13H6zM15 4v3h3M9 11h6M9 15h6",
  ruler: "M3 15.5L15.5 3 21 8.5 8.5 21zM7 12l2 2M10 9l2 2M13 6l2 2",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9a1 1 0 1 0 0 .01",
  palette: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.4 1-2.4 2.4-2.4H18a3 3 0 0 0 3-3c0-6-4-11-9-11zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01",
  layout: "M4 4h16v16H4zM4 9h16M10 9v11",
  window: "M3 5h18v14H3zM3 9h18",
  sidebar: "M4 4h16v16H4zM9 4v16",
  code: "M9 7l-5 5 5 5M15 7l5 5-5 5",
  keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M7 14h10",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-4 5-5 8-5s6.5 1 8 5",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  puzzle: "M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4h2a2 2 0 1 0 0-4H6V6h4z",
  volume: "M5 10v4h3l4 3V7L8 10zM16 9a4 4 0 0 1 0 6",
  mute: "M5 10v4h3l4 3V7L8 10zM16 10l4 4M20 10l-4 4",
  download: "M12 4v11M7 10l5 5 5-5M5 19h14",
  shield: "M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z",
  command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z",
  pin: "M9 4h6l-1 6 3 3H7l3-3zM12 13v7",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2.2.2-1.4-1.4L16.6 4.6 13.5 3.5 12 5 10.5 3.5 7.4 4.6l.2 2.2-1.4 1.4L4 8 3 11l2 1-2 1 1 3 2.2-.2 1.4 1.4-.2 2.2 3.1 1.1L12 19l1.5 1.5 3.1-1.1-.2-2.2 1.4-1.4L20 16l1-3z",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
