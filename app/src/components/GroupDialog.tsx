import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { groupColors, type Browser, type Cutout } from "../browser/useBrowser";
import { FaIcon, faIcons } from "./FaIcon";
import "./GroupDialog.css";

/** Création d'un groupe autour d'un onglet, ou modification d'un groupe ; x, y : coin haut gauche voulu. */
export type GroupDialogRequest =
  | { kind: "create"; tabId: number; x: number; y: number }
  | { kind: "edit"; groupId: string; x: number; y: number };

const EVENT = "calti:group-dialog";

/** Ouvre le dialogue (rendu par App, qui découpe les pages à sa place). */
export function openGroupDialog(request: GroupDialogRequest) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: request }));
}

/** Dialogue demandé, et sa fermeture. */
export function useGroupDialogRequest() {
  const [request, setRequest] = useState<GroupDialogRequest | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => setRequest((e as CustomEvent<GroupDialogRequest>).detail);
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);
  return { request, close: () => setRequest(null) };
}

const WIDTH = 340;
const randomColor = () => groupColors[Math.floor(Math.random() * groupColors.length)];

/**
 * Nom et couleur (soulignement) du groupe. Les pages sont des vues natives au-dessus de l'interface :
 * `onRect` donne la place du dialogue, que App retire des pages pour le laisser voir.
 */
export function GroupDialog({ request, browser, onClose, onRect }: {
  request: GroupDialogRequest;
  browser: Browser;
  onClose: () => void;
  onRect: (rect: Cutout | null) => void;
}) {
  const group = request.kind === "edit" ? browser.groups.find((g) => g.id === request.groupId) : undefined;
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState(() => group?.color ?? randomColor());
  const [icon, setIcon] = useState(group?.icon ?? "");
  const box = useRef<HTMLFormElement>(null);
  const left = Math.max(8, Math.min(request.x, window.innerWidth - WIDTH - 8));

  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    onRect(r ? { x: r.left - 2, y: r.top - 2, width: r.width + 4, height: r.height + 4, radius: 20 } : null);
    return () => onRect(null);
  }, [left, request.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (request.kind === "create") {
      const id = browser.createGroup(request.tabId);
      browser.updateGroup(id, { name: name.trim(), color, icon: icon || undefined });
    } else if (group) {
      browser.updateGroup(group.id, { name: name.trim(), color, icon: icon || undefined });
    }
    onClose();
  };

  return (
    <form ref={box} className="group-dialog glass" style={{ left, top: request.y, width: WIDTH, "--group": color } as CSSProperties}
      onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
      <strong>{request.kind === "create" ? "Nouveau groupe" : "Modifier le groupe"}</strong>
      <input className="group-dialog__name" autoFocus value={name} placeholder="Nom du groupe" spellCheck={false}
        onChange={(e) => setName(e.target.value)} />
      <div className="group-dialog__colors" role="radiogroup" aria-label="Couleur">
        {groupColors.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c}
            className={`group-dialog__color${c === color ? " group-dialog__color--on" : ""}`} style={{ background: c }}
            onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="group-dialog__icons" role="radiogroup" aria-label="Icône">
        <button type="button" role="radio" aria-checked={!icon} title="Sans icône"
          className={`group-dialog__icon group-dialog__icon--none${!icon ? " group-dialog__icon--on" : ""}`} onClick={() => setIcon("")} />
        {Object.keys(faIcons).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={n === icon} title={n}
            className={`group-dialog__icon${n === icon ? " group-dialog__icon--on" : ""}`} onClick={() => setIcon(n)}>
            <FaIcon name={n} size={13} />
          </button>
        ))}
      </div>
      <div className="group-dialog__actions">
        <button type="button" className="chip-btn" onClick={onClose}>Annuler</button>
        <button type="submit" className="chip-btn chip-btn--on">{request.kind === "create" ? "Créer" : "Enregistrer"}</button>
      </div>
    </form>
  );
}
