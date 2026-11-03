import type { CSSProperties } from "react";
import type { ProfileSettings } from "../settings/settings";
import "./ProfileBadge.css";

/** Texte sombre sur une couleur claire, blanc sinon. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luminance > 0.6 ? "#14213a" : "#fff";
}

/** Pastille d'un profil : son icône (ou ses initiales) sur sa couleur. */
export function ProfileBadge({ profile, size = 32, count }: { profile: ProfileSettings; size?: number; count?: number }) {
  const style = {
    "--badge": profile.color,
    "--badge-text": readableOn(profile.color),
    width: size,
    height: size,
    fontSize: profile.icon ? size * 0.5 : size * 0.36,
  } as CSSProperties;
  return (
    <span className="badge" style={style} aria-hidden="true">
      {profile.icon || profile.name.trim().slice(0, 2).replace(/^./, (c) => c.toUpperCase())}
      {count ? <span className="badge__count">{count}</span> : null}
    </span>
  );
}
