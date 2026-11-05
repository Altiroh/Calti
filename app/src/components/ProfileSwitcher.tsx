// Sélecteur de profils façon Alt+Tab : Alt+² l'ouvre sur le profil précédent, chaque nouvel appui avance (Maj :
// recule), relâcher Alt bascule sur le profil choisi. Aussi : flèches, chiffres, clic, Entrée, Échap.
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PROFILE_SWITCH_EVENT, type Cutout } from "../browser/useBrowser";
import type { ProfileSettings } from "../settings/settings";
import { Favicon } from "./Favicon";
import { ProfileBadge } from "./ProfileBadge";
import { hostname, siteIcon } from "./siteIcon";
import "./ProfileSwitcher.css";

export interface SwitcherInfo {
  tabs: number;
  /** Page affichée par le profil (null : accueil). */
  page: { title: string; url: string } | null;
}

interface Props {
  /** Profils du plus récemment utilisé au plus ancien (le profil affiché en premier). */
  profiles: ProfileSettings[];
  info: (id: string) => SwitcherInfo;
  onPick: (id: string) => void;
  onRect: (rect: Cutout | null) => void;
}

interface Open {
  index: number;
  /** Ouvert au clavier, Alt toujours enfoncée : la relâcher choisit. */
  held: boolean;
}

export function ProfileSwitcher({ profiles, info, onPick, onRect }: Props) {
  const [open, setOpen] = useState<Open | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const count = profiles.length;

  const pick = (index: number) => {
    setOpen(null);
    const p = profiles[index];
    if (p && index !== 0) onPick(p.id);
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;

  // Raccourci (page ou interface) : ouvre, ou avance d'un profil si déjà ouvert.
  useEffect(() => {
    const onSwitch = (e: Event) => {
      const { back, held } = (e as CustomEvent<{ back: boolean; held: boolean }>).detail;
      if (count < 2) return;
      setOpen((o) => o
        ? { ...o, index: (o.index + (back ? -1 : 1) + count) % count }
        : { index: back ? count - 1 : 1, held });
    };
    window.addEventListener(PROFILE_SWITCH_EVENT, onSwitch);
    return () => window.removeEventListener(PROFILE_SWITCH_EVENT, onSwitch);
  }, [count]);

  // Clavier pendant l'ouverture.
  useEffect(() => {
    if (!open) return;
    const step = (d: number) => setOpen((o) => (o ? { ...o, index: (o.index + d + count) % count } : o));
    const onKey = (e: KeyboardEvent) => {
      const o = openRef.current;
      if (!o) return;
      if (e.code === "Backquote" && e.altKey) return; // traité par le raccourci
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight" || e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) step(1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) step(-1);
      else if (e.key === "Enter" || e.key === " ") pickRef.current(o.index);
      else if (/^Digit[1-9]$/.test(e.code) && Number(e.code.slice(5)) <= count) pickRef.current(Number(e.code.slice(5)) - 1);
      else if (e.key === "Alt") { /* enfoncée de nouveau : rien */ } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onUp = (e: KeyboardEvent) => {
      const o = openRef.current;
      if (o?.held && e.key === "Alt") {
        e.preventDefault();
        pickRef.current(o.index);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onUp, true);
    };
  }, [!!open, count]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alt relâchée alors que le focus n'était pas encore dans l'interface (appui bref depuis une page) : vérifiée
  // auprès de Windows tant que le sélecteur est ouvert au clavier.
  useEffect(() => {
    if (!open?.held) return;
    const timer = window.setInterval(() => {
      invoke<boolean>("alt_held").then((held) => {
        const o = openRef.current;
        if (!held && o?.held) pickRef.current(o.index);
      }).catch(() => {});
    }, 120);
    return () => clearInterval(timer);
  }, [open?.held]);

  // Fermé si la fenêtre perd le focus (Alt+Tab de Windows…).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener("blur", close);
    return () => window.removeEventListener("blur", close);
  }, [!!open]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const r = open ? box.current?.getBoundingClientRect() : null;
    const radius = r ? parseFloat(getComputedStyle(box.current!).borderTopLeftRadius) || 24 : 0;
    onRect(r ? { x: r.left - 2, y: r.top - 2, width: r.width + 4, height: r.height + 4, radius: radius + 2 } : null);
  }, [open, count]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onRect(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  return (
    <div className="pswitch-scrim" onPointerDown={() => setOpen(null)}>
      <div ref={box} className="pswitch glass" role="listbox" aria-label="Changer de profil" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pswitch__list">
          {profiles.map((p, i) => {
            const { tabs, page } = info(p.id);
            return (
              <button key={p.id} role="option" aria-selected={i === open.index}
                className={`pswitch__item${i === open.index ? " pswitch__item--on" : ""}${i === 0 ? " pswitch__item--current" : ""}`}
                style={{ "--profile": p.color } as React.CSSProperties}
                onPointerEnter={() => setOpen((o) => (o ? { ...o, index: i } : o))}
                onClick={() => pick(i)}>
                <span className="pswitch__badge"><ProfileBadge profile={p} size={60} /></span>
                <span className="pswitch__name">{p.name}</span>
                <span className="pswitch__meta">
                  {i === 0 ? "Affiché · " : ""}{tabs} onglet{tabs > 1 ? "s" : ""}
                </span>
                <span className="pswitch__page">
                  {page ? (
                    <>
                      <Favicon src={siteIcon(page.url)} size={13} />
                      <span>{page.title || hostname(page.url)}</span>
                    </>
                  ) : <span>Accueil</span>}
                </span>
                {i < 9 && <kbd className="pswitch__key">{i + 1}</kbd>}
              </button>
            );
          })}
        </div>
        <div className="pswitch__hint">
          <span><kbd>Alt</kbd>+<kbd>²</kbd></span>
          <span><kbd>Maj</kbd> ←</span>
          <span><kbd>Échap</kbd></span>
        </div>
      </div>
    </div>
  );
}
