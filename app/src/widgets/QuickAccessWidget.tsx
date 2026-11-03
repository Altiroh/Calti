import { useState, type CSSProperties } from "react";
import type { Brave } from "../browser/adapter";
import { useTopSites } from "../browser/library";
import { Card } from "../components/Card";
import { hostname, siteIcon } from "../components/siteIcon";
import { shortcuts, type Shortcut } from "../config/shortcuts";
import "./QuickAccessWidget.css";

/** Teinte stable tirée du nom de domaine, pour la pastille de repli. */
function hueOf(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/**
 * Sites les plus visités du profil (repris de Brave), sinon les raccourcis de config/shortcuts.ts.
 * Clic : nouvel onglet affiché ; clic molette : nouvel onglet en arrière-plan.
 */
export function QuickAccessWidget({ brave, profile }: { brave: Brave; profile: string }) {
  const top = useTopSites(profile);
  const tiles: Shortcut[] = top.length
    ? top.map((t) => {
      const host = hostname(t.url);
      return { url: t.url, label: host.split(".").slice(-2, -1)[0] || host, glyph: host.slice(0, 2).replace(/^./, (c) => c.toUpperCase()), hue: hueOf(host) };
    })
    : shortcuts;
  return (
    <Card title={top.length ? "Les plus visités" : "Accès rapide"}>
      <div className="qa-grid">
        {tiles.map((s) => (
          <button key={s.url} className="qa-tile inset" title={`${s.url}\nClic molette : nouvel onglet en arrière-plan`}
            style={{ "--hue": s.hue } as CSSProperties}
            onClick={() => brave.send({ type: "openUrl", url: s.url })}
            onMouseDown={(e) => e.button === 1 && e.preventDefault()}
            onAuxClick={(e) => e.button === 1 && brave.send({ type: "openUrl", url: s.url, where: "background" })}>
            <SiteBadge url={s.url} glyph={s.glyph} />
            <span className="qa-tile__label">{s.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/** Icône du site, ou pastille colorée avec initiales si elle n'est pas disponible. */
function SiteBadge({ url, glyph }: { url: string; glyph: string }) {
  const [failed, setFailed] = useState(false);
  const icon = siteIcon(url);
  return (
    <span className="qa-badge">
      {icon && !failed
        ? <img src={icon} width={24} height={24} alt="" onError={() => setFailed(true)} />
        : <span className="qa-badge__glyph">{glyph}</span>}
    </span>
  );
}
