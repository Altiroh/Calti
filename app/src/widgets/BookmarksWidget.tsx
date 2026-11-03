import type { Brave } from "../browser/adapter";
import type { BookmarkNode } from "../brave/types";
import { Card } from "../components/Card";
import { Favicon } from "../components/Favicon";
import { Icon } from "../components/Icon";
import { hostname, siteIcon } from "../components/siteIcon";
import "./BookmarksWidget.css";

const MAX_ITEMS = 12;

/** Premiers liens de la barre de favoris Brave. */
function barLinks(tree: BookmarkNode[] | null): BookmarkNode[] {
  const bar = tree?.[0]?.children ?? [];
  return bar.filter((n) => n.url).slice(0, MAX_ITEMS);
}

export function BookmarksWidget({ brave, onShowAll }: { brave: Brave; onShowAll: () => void }) {
  const links = barLinks(brave.bookmarks);
  return (
    <Card title="Favoris" action={<button className="chip-btn" onClick={onShowAll}>Tout voir</button>}>
      <div className="bm-list">
        {links.map((b) => (
          <button key={b.id} className="bm-item inset" title={b.url!}
            onClick={() => brave.send({ type: "openUrl", url: b.url! })}>
            <Favicon src={siteIcon(b.url!)} />
            <span className="bm-item__title">{b.title || hostname(b.url!)}</span>
            <span className="bm-item__host">{hostname(b.url!)}</span>
            <Icon name="chevron" size={13} />
          </button>
        ))}
        {links.length === 0 && <p className="muted">Aucun lien dans la barre de favoris.</p>}
      </div>
    </Card>
  );
}
