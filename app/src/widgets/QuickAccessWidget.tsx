import { useState, type CSSProperties } from "react";
import type { Brave } from "../brave/useBrave";
import { Card } from "../components/Card";
import { siteIcon } from "../components/siteIcon";
import { shortcuts } from "../config/shortcuts";
import "./QuickAccessWidget.css";

/** Raccourcis définis dans config/shortcuts.ts. */
export function QuickAccessWidget({ brave }: { brave: Brave }) {
  return (
    <Card title="Accès rapide">
      <div className="qa-grid">
        {shortcuts.map((s) => (
          <button key={s.url} className="qa-tile inset" title={s.url}
            style={{ "--hue": s.hue } as CSSProperties}
            onClick={() => brave.send({ type: "openUrl", url: s.url })}>
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
