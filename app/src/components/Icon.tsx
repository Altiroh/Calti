// Icônes SVG au trait, sans dépendance.

const paths = {
  home: "M4 11l8-7 8 7M6 9.5V19h4v-5h4v5h4V9.5",
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
  volume: "M5 10v4h3l4 3V7L8 10zM16 9a4 4 0 0 1 0 6",
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
