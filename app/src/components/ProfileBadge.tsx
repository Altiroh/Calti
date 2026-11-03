import type { CSSProperties } from "react";
import { useBackground } from "../settings/backgrounds";
import { meshes, profileImageKey, type ProfileSettings } from "../settings/settings";
import "./ProfileBadge.css";

/** Texte sombre sur une couleur claire, blanc sinon. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luminance > 0.6 ? "#14213a" : "#fff";
}

/** Fond de la pastille selon son type ; null = dégradé léger de la couleur (CSS par défaut). */
export function avatarBackground(profile: ProfileSettings): string | null {
  switch (profile.avatar) {
    case "gradient":
      return `linear-gradient(135deg, ${profile.color}, ${profile.color2 ?? "#a259ff"})`;
    case "mesh": {
      const [a, b, c, d = a, e = b] = meshes[profile.mesh ?? "aurore"];
      // Taches de couleur fondues les unes dans les autres, sur un fond conique.
      return `radial-gradient(circle at 20% 25%, ${a} 0, transparent 55%), radial-gradient(circle at 80% 20%, ${b} 0, transparent 55%),
        radial-gradient(circle at 75% 80%, ${c} 0, transparent 60%), radial-gradient(circle at 20% 85%, ${d} 0, transparent 55%),
        conic-gradient(from 200deg, ${a}, ${b}, ${c}, ${d}, ${e}, ${a})`;
    }
    default:
      return null;
  }
}

/** Pastille d'un profil : image, ou icône (initiales) sur sa couleur ou son dégradé. */
export function ProfileBadge({ profile, size = 32, count }: { profile: ProfileSettings; size?: number; count?: number }) {
  const image = useBackground(profileImageKey(profile.id), profile.avatar === "image" ? profile.image ?? null : null);
  const background = image ? `center / cover no-repeat url("${image}")` : avatarBackground(profile);
  const text = profile.avatar === "mesh" || profile.avatar === "gradient" ? "#fff" : readableOn(profile.color);
  const style = {
    "--badge": profile.color,
    "--badge-text": text,
    width: size,
    height: size,
    fontSize: profile.icon ? size * 0.5 : size * 0.36,
    ...(background ? { background } : {}),
  } as CSSProperties;
  return (
    <span className={`badge${profile.avatar && profile.avatar !== "color" ? ` badge--${profile.avatar}` : ""}`} style={style} aria-hidden="true">
      {!image && (profile.icon || profile.name.trim().slice(0, 2).replace(/^./, (c) => c.toUpperCase()))}
      {count ? <span className="badge__count">{count}</span> : null}
    </span>
  );
}
