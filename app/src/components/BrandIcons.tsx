// Logos des intégrations : Claude (étoile orange) et Spotify (avec un « + » : toute lecture de Windows).

const CLAUDE = "#d97757";

/** Rayons de l'étoile de Claude : angle (degrés), longueur relative. */
const rays: [number, number][] = [
  [0, 1], [32, 0.82], [62, 0.95], [95, 0.78], [125, 1], [158, 0.86],
  [190, 0.97], [220, 0.8], [252, 0.93], [285, 0.84], [318, 0.98],
];

function claudeRays(size: number) {
  const c = size / 2;
  const outer = size * 0.47;
  const inner = size * 0.1;
  return rays.map(([deg, len]) => {
    const a = (deg - 90) * (Math.PI / 180);
    const r = inner + (outer - inner) * len;
    return { x1: c + Math.cos(a) * inner, y1: c + Math.sin(a) * inner, x2: c + Math.cos(a) * r, y2: c + Math.sin(a) * r };
  });
}

/** Étoile de Claude ; `color` blanc sur un fond orange, sinon sa couleur. */
export function ClaudeLogo({ size = 18, color = CLAUDE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="brand brand--claude">
      <g stroke={color} strokeWidth={2.3} strokeLinecap="round">
        {claudeRays(24).map((l, i) => <line key={i} {...l} />)}
      </g>
    </svg>
  );
}

/** Image « data: » de l'étoile (menus, qui affichent des images). */
export const claudeLogoUrl = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g stroke="${CLAUDE}" stroke-width="2.3" stroke-linecap="round">${
    claudeRays(24).map((l) => `<line x1="${l.x1.toFixed(2)}" y1="${l.y1.toFixed(2)}" x2="${l.x2.toFixed(2)}" y2="${l.y2.toFixed(2)}"/>`).join("")
  }</g></svg>`,
)}`;

/** Logo Spotify (rond vert, trois ondes) avec un « + » dans une pastille grise. */
export function SpotifyPlus({ size = 18, plus = true }: { size?: number; plus?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="brand brand--spotify">
      {/* Logo centré ; la pastille « + » se pose sur son coin. */}
      <g transform="translate(1 1)">
        <circle cx="11" cy="11" r="10" fill="#1ed760" />
        <g fill="none" stroke="#121212" strokeLinecap="round">
          <path d="M5.6 8.2c3.7-1.1 7.9-.8 11.1 1" strokeWidth={1.9} />
          <path d="M6.3 11.4c3-.8 6.4-.5 9 .9" strokeWidth={1.6} />
          <path d="M7 14.3c2.4-.6 4.9-.4 6.9.7" strokeWidth={1.35} />
        </g>
      </g>
      {plus && (
        <g>
          <circle cx="19.3" cy="19.3" r="4.4" fill="#8b929c" stroke="var(--brand-ring, #fff)" strokeWidth={1.3} />
          <path d="M19.3 17.4v3.8M17.4 19.3h3.8" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
