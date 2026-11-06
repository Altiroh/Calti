// Sélecteur d'onglets façon Alt+Tab : Ctrl+Tab (depuis une page ou l'interface) ouvre la liste des onglets du profil,
// du plus récemment affiché au plus ancien, sur le précédent ; chaque Tab avance (Maj : recule), relâcher Ctrl
// l'affiche. Un appui bref revient donc à l'onglet précédent. Aussi : flèches, clic, Entrée, Échap.
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { TAB_SWITCH_EVENT, type Browser, type BrowserTab, type Cutout, type ProfileId } from "../browser/useBrowser";
import { Favicon } from "./Favicon";
import { FaIcon } from "./FaIcon";
import { hostname, siteIcon } from "./siteIcon";
import "./TabSwitcher.css";

interface Open {
  profile: ProfileId;
  index: number;
  held: boolean;
}

export function TabSwitcher({ browser, onRect }: { browser: Browser; onRect: (r: Cutout | null) => void }) {
  const [open, setOpen] = useState<Open | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Onglets du plus récemment affiché au plus ancien, par profil.
  const recent = useRef<Record<ProfileId, number[]>>({});
  for (const profile of new Set(browser.tabs.map((t) => t.profile))) {
    const active = browser.pane(profile).activeTab;
    const r = recent.current[profile] ?? [];
    if (active != null && r[0] !== active) recent.current[profile] = [active, ...r.filter((id) => id !== active)];
  }
  const ordered = (profile: ProfileId): BrowserTab[] => {
    const tabs = browser.tabsOf(profile);
    const r = recent.current[profile] ?? [];
    return [...r.map((id) => tabs.find((t) => t.id === id)).filter((t): t is BrowserTab => !!t), ...tabs.filter((t) => !r.includes(t.id))];
  };
  const tabs = open ? ordered(open.profile) : [];
  const openRef = useRef(open);
  openRef.current = open;

  const pick = (o: Open | null, index?: number) => {
    setOpen(null);
    if (!o) return;
    const t = ordered(o.profile)[index ?? o.index];
    if (t) browser.activate(t.id);
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;

  useEffect(() => {
    const onSwitch = (e: Event) => {
      const { profile, back, held } = (e as CustomEvent<{ profile: ProfileId; back: boolean; held: boolean }>).detail;
      setOpen((o) => {
        const count = ordered(o?.profile ?? profile).length;
        if (count < 2) return o;
        if (o) return { ...o, index: (o.index + (back ? -1 : 1) + count) % count };
        return { profile, index: back ? count - 1 : 1, held };
      });
    };
    window.addEventListener(TAB_SWITCH_EVENT, onSwitch);
    return () => window.removeEventListener(TAB_SWITCH_EVENT, onSwitch);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const count = () => (openRef.current ? ordered(openRef.current.profile).length : 0);
    const step = (d: number) => setOpen((o) => (o ? { ...o, index: (o.index + d + count()) % count() } : o));
    const onKey = (e: KeyboardEvent) => {
      const o = openRef.current;
      if (!o) return;
      if (e.key === "Tab" && e.ctrlKey) return; // traité par le raccourci
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowDown" || e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") step(-1);
      else if (e.key === "Enter") pickRef.current(o);
      else if (e.key === "Control") { /* enfoncée de nouveau */ } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onUp = (e: KeyboardEvent) => {
      const o = openRef.current;
      if (o?.held && e.key === "Control") pickRef.current(o);
    };
    const close = () => setOpen(null);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", close);
    };
  }, [!!open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl relâchée avant que l'interface ait le focus (appui bref depuis une page) : vérifiée auprès de Windows.
  useEffect(() => {
    if (!open?.held) return;
    const timer = window.setInterval(() => {
      invoke<boolean>("ctrl_held").then((held) => {
        const o = openRef.current;
        if (!held && o?.held) pickRef.current(o);
      }).catch(() => {});
    }, 120);
    return () => clearInterval(timer);
  }, [open?.held]);

  // L'onglet choisi reste visible dans la liste.
  useEffect(() => {
    list.current?.querySelector(".tswitch__item--on")?.scrollIntoView({ block: "nearest" });
  }, [open?.index]);

  useLayoutEffect(() => {
    const r = open ? box.current?.getBoundingClientRect() : null;
    const radius = r ? parseFloat(getComputedStyle(box.current!).borderTopLeftRadius) || 20 : 0;
    onRect(r ? { x: r.left - 2, y: r.top - 2, width: r.width + 4, height: r.height + 4, radius: radius + 2 } : null);
  }, [open, tabs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onRect(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  return (
    <div className="tswitch-scrim" onPointerDown={() => setOpen(null)}>
      <div ref={box} className="tswitch glass" role="listbox" aria-label="Changer d'onglet" onPointerDown={(e) => e.stopPropagation()}>
        <div ref={list} className="tswitch__list">
          {tabs.map((t, i) => {
            const group = browser.groupOf(t.id);
            return (
              <button key={t.id} role="option" aria-selected={i === open.index}
                className={`tswitch__item${i === open.index ? " tswitch__item--on" : ""}`}
                style={group ? ({ "--group": group.color } as CSSProperties) : undefined}
                onPointerEnter={() => setOpen((o) => (o ? { ...o, index: i } : o))} onClick={() => pick(open, i)}>
                <Favicon src={siteIcon(t.url)} size={16} />
                <span className="tswitch__title">{t.title || hostname(t.url)}</span>
                <span className="tswitch__host">{hostname(t.url)}</span>
                {group && <span className="tswitch__group">{group.icon ? <FaIcon name={group.icon} size={11} /> : <i />}{group.name}</span>}
              </button>
            );
          })}
        </div>
        <div className="tswitch__hint"><span><kbd>Ctrl</kbd>+<kbd>Tab</kbd></span><span><kbd>Maj</kbd> ←</span><span><kbd>Échap</kbd></span></div>
      </div>
    </div>
  );
}
