import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Browser, Cutout, ProfileId } from "../browser/useBrowser";
import { useClosedTabs } from "../browser/closedTabs";
import type { Suggestion } from "../browser/library";
import { Favicon } from "./Favicon";
import { Icon, type IconName } from "./Icon";
import { siteIcon } from "./siteIcon";
import "./Palette.css";

/** Commande proposée par la palette (nom, raccourci affiché, action). */
export interface PaletteCommand {
  label: string;
  keys?: string;
  icon: IconName;
  /** Image (logo) à la place de l'icône. */
  image?: string;
  run: () => void;
}

interface Entry {
  key: string;
  title: string;
  detail?: string;
  icon?: IconName;
  image?: string;
  url?: string;
  group: string;
  run: () => void;
}

const WIDTH = 620;

/** Tous les mots de la saisie figurent dans le texte. */
const matches = (query: string, ...texts: (string | undefined)[]) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = texts.join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
};

/**
 * Palette (Ctrl+K) : aller à un onglet ouvert, rouvrir un onglet fermé, lancer une commande, ouvrir une page de
 * l'historique ou des favoris, ou rechercher. Comme le dialogue de groupe, sa place est découpée dans les pages.
 */
export function Palette({ browser, profile, commands, suggest, onClose, onRect }: {
  browser: Browser;
  profile: ProfileId;
  commands: PaletteCommand[];
  suggest: (input: string) => Suggestion[];
  onClose: () => void;
  onRect: (rect: Cutout | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const closed = useClosedTabs(profile);
  const tabs = browser.tabsOf(profile);

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim();
    const done = (run: () => void) => () => { onClose(); run(); };
    const out: Entry[] = [];
    for (const t of tabs.filter((t) => !q || matches(q, t.title, t.url)).slice(0, q ? 6 : 5)) {
      out.push({ key: `tab-${t.id}`, group: "Onglets ouverts", title: t.title || t.url, detail: t.url, url: t.url, run: done(() => browser.activate(t.id)) });
    }
    for (const c of commands.filter((c) => !q || matches(q, c.label)).slice(0, q ? 5 : 8)) {
      out.push({ key: `cmd-${c.label}`, group: "Commandes", title: c.label, detail: c.keys, icon: c.image ? undefined : c.icon, image: c.image, url: c.image, run: done(c.run) });
    }
    for (const t of closed.filter((t) => !q || matches(q, t.title, t.url)).slice(0, q ? 4 : 3)) {
      out.push({ key: `closed-${t.at}`, group: "Fermés récemment", title: t.title || t.url, detail: t.url, url: t.url, run: done(() => browser.reopen(profile, t.at)) });
    }
    if (q) {
      for (const s of suggest(q)) {
        out.push({
          key: `s-${s.kind}-${s.url ?? s.text}`,
          group: s.kind === "search" ? "Recherche" : s.kind === "bookmark" ? "Favoris" : "Historique",
          title: s.text, detail: s.url, url: s.url, icon: s.kind === "search" ? "search" : undefined,
          run: done(() => browser.go(s.url ?? s.text, profile, true)),
        });
      }
      if (!out.some((e) => e.group === "Recherche")) {
        out.push({ key: "go", group: "Recherche", title: q, detail: "Ouvrir ou rechercher", icon: "search", run: done(() => browser.go(q, profile, true)) });
      }
    }
    return out;
  }, [query, tabs, closed, commands, suggest, browser, profile, onClose]);

  useEffect(() => setPicked(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${picked}"]`)?.scrollIntoView({ block: "nearest" });
  }, [picked]);

  // Place découpée dans les pages : recalculée quand la liste change de hauteur.
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    onRect(r ? { x: r.left - 2, y: r.top - 2, width: r.width + 4, height: r.height + 4, radius: 22 } : null);
  }, [entries.length]);
  useEffect(() => () => onRect(null), []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = entries.length;
      if (n) setPicked((p) => (p + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      entries[picked]?.run();
    }
  };

  let lastGroup = "";
  return (
    <>
      <div className="palette-scrim" onMouseDown={onClose} />
      <div ref={box} className="palette glass" style={{ width: WIDTH, left: `calc(50% - ${WIDTH / 2}px)` }}
        role="dialog" aria-label="Palette de commandes" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette__input">
          <Icon name="search" size={16} />
          <input autoFocus value={query} spellCheck={false} placeholder="Onglet, commande, page ou recherche…"
            onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} />
          <kbd>Échap</kbd>
        </div>
        <ul ref={list} className="palette__list" role="listbox">
          {entries.map((entry, i) => {
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return (
              <li key={entry.key} role="presentation">
                {header && <div className="palette__group">{header}</div>}
                <button role="option" aria-selected={i === picked} data-index={i}
                  className={`palette__item${i === picked ? " palette__item--on" : ""}`}
                  onMouseMove={() => setPicked(i)} onClick={entry.run}>
                  <span className="palette__icon">
                    {entry.icon ? <Icon name={entry.icon} size={15} /> : <Favicon src={entry.image ?? siteIcon(entry.url ?? "")} size={15} />}
                  </span>
                  <span className="palette__title">{entry.title}</span>
                  {entry.detail && <span className="palette__detail">{entry.detail}</span>}
                </button>
              </li>
            );
          })}
          {!entries.length && <li className="palette__empty">Aucun résultat</li>}
        </ul>
      </div>
    </>
  );
}
