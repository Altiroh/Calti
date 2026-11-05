// Notes : groupes repliables, couleurs, épinglage, tri, glisser-déposer et partage entre profils.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { openMenu, type MenuEntry } from "../components/ContextMenu";
import { useSettings } from "../settings/settings";
import {
  isShared, noteColors, notePreview, noteTitle, sharedWith, useNotebook, useNotesView,
  type Note, type NoteGroup, type Share,
} from "./notes";
import "./NotesWidget.css";

const time = (at: number) => {
  const d = new Date(at);
  return new Date().toDateString() === d.toDateString()
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

const tint = (color: string | null) => (color ? ({ "--note": color } as CSSProperties) : undefined);

/** Lâché hors des notes : rien ne bouge. */
const NOWHERE = "<hors des notes>";

interface Drag {
  kind: "note" | "group";
  id: string;
  el: HTMLElement;
  x0: number;
  y0: number;
  moved: boolean;
  /** Cible : avant tel élément, ou à la fin d'un groupe (`before` null). */
  group: string | null;
  before: string | null;
  mark: HTMLElement | null;
}

export function NotesWidget({ profile }: { profile: string }) {
  const nb = useNotebook();
  const [view, setView] = useNotesView(profile);
  const settings = useSettings();
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const profiles = settings.profileIds.map((id) => settings.profile(id));
  const profileOf = (id: string) => profiles.find((p) => p.id === id);

  const notes = nb.book.notes.filter((n) => sharedWith(n, profile));
  const groupIds = new Set(nb.book.groups.map((g) => g.id));
  const groupOf = (n: Note) => (n.group && groupIds.has(n.group) ? n.group : null);
  const groups = nb.book.groups.filter((g) => sharedWith(g, profile) || notes.some((n) => n.group === g.id));
  const q = query.trim().toLowerCase();
  const matches = (n: Note) => !q || `${n.title}\n${n.text}`.toLowerCase().includes(q);

  const ordered = (list: Note[]) => {
    const sorted = view.sort === "updated" ? [...list].sort((a, b) => b.updated - a.updated)
      : view.sort === "title" ? [...list].sort((a, b) => noteTitle(a).localeCompare(noteTitle(b), "fr", { sensitivity: "base" }))
        : list;
    return [...sorted.filter((n) => n.pinned), ...sorted.filter((n) => !n.pinned)];
  };
  const inSection = (group: string | null) => ordered(notes.filter((n) => groupOf(n) === group && matches(n)));

  const note = editing ? nb.book.notes.find((n) => n.id === editing) : undefined;
  // Note supprimée ailleurs (autre fenêtre) pendant sa modification : retour à la liste.
  useEffect(() => { if (editing && !note) setEditing(null); }, [editing, note]);

  const newNote = (group: string | null = null) => {
    const share = group ? nb.book.groups.find((g) => g.id === group)?.share ?? [] : [];
    setQuery("");
    setEditing(nb.addNote(profile, { group, share }));
  };
  const newGroup = () => {
    const color = noteColors[nb.book.groups.length % noteColors.length].value;
    const id = nb.addGroup(profile, "Nouveau groupe", color);
    setRenaming(id);
    return id;
  };
  const toggleCollapsed = (id: string) => setView({
    collapsed: view.collapsed.includes(id) ? view.collapsed.filter((c) => c !== id) : [...view.collapsed, id],
  });

  // Partage : coche « ce profil seul », « tous » ou chaque autre profil.
  const shareItems = (item: { owner: string; share: Share }, apply: (share: Share) => void): MenuEntry[] => {
    const others = profiles.filter((p) => p.id !== item.owner);
    const list = item.share === "all" ? others.map((p) => p.id) : item.share;
    const owner = profileOf(item.owner);
    return [
      { header: `Créée dans ${owner?.name ?? item.owner}` },
      { label: "Ce profil seulement", icon: "lock", tone: "slate", checked: !isShared(item), action: () => apply([]) },
      { label: "Tous les profils", icon: "users", tone: "teal", checked: item.share === "all", action: () => apply("all") },
      ...(others.length ? ["-" as const] : []),
      ...others.map((p): MenuEntry => ({
        label: p.name, color: p.color, checked: item.share !== "all" && list.includes(p.id),
        action: () => {
          const next = list.includes(p.id) ? list.filter((id) => id !== p.id) : [...list, p.id];
          apply(next.length === others.length && others.length > 1 ? "all" : next);
        },
      })),
    ];
  };

  const colorItems = (current: string | null, apply: (color: string | null) => void, allowNone = true): MenuEntry[] => [
    ...(allowNone ? [{ label: "Aucune", icon: "close" as const, tone: "slate" as const, checked: !current, action: () => apply(null) }, "-" as const] : []),
    ...noteColors.map((c): MenuEntry => ({ label: c.label, color: c.value, checked: current === c.value, action: () => apply(c.value) })),
  ];

  const groupItems = (n: Note): MenuEntry[] => [
    { label: "Sans groupe", icon: "notes", tone: "slate", checked: !groupOf(n), action: () => nb.moveNote(n.id, null, null) },
    ...(groups.length ? ["-" as const] : []),
    ...groups.map((g): MenuEntry => ({ label: g.name, color: g.color, checked: groupOf(n) === g.id, action: () => nb.moveNote(n.id, g.id, null) })),
    "-",
    { label: "Nouveau groupe…", icon: "folderPlus", tone: "violet", action: () => nb.moveNote(n.id, newGroup(), null) },
  ];

  const noteMenu = (e: { clientX: number; clientY: number }, n: Note) => openMenu(e, [
    { header: noteTitle(n) },
    { label: "Modifier", icon: "edit", tone: "blue", action: () => setEditing(n.id) },
    { label: n.pinned ? "Désépingler" : "Épingler en haut", icon: "pin", tone: "amber", action: () => nb.updateNote(n.id, { pinned: !n.pinned }, false) },
    { label: "Couleur", icon: "palette", tone: "pink", items: colorItems(n.color, (color) => nb.updateNote(n.id, { color }, false)) },
    { label: "Groupe", icon: "folder", tone: "violet", items: groupItems(n) },
    { label: "Partager", icon: "share", tone: "teal", value: !isShared(n) ? undefined : n.share === "all" ? "Tous" : String(n.share.length), items: shareItems(n, (share) => nb.updateNote(n.id, { share }, false)) },
    "-",
    { label: "Dupliquer", icon: "duplicate", tone: "green", action: () => nb.duplicateNote(n.id, profile) },
    { label: "Copier le texte", icon: "copy", tone: "blue", action: () => { navigator.clipboard.writeText(n.title ? `${n.title}\n${n.text}` : n.text).catch(() => {}); } },
    "-",
    { label: "Supprimer la note", icon: "trash", danger: true, action: () => nb.removeNote(n.id) },
  ]);

  const groupMenu = (e: { clientX: number; clientY: number }, g: NoteGroup) => {
    const count = nb.book.notes.filter((n) => n.group === g.id).length;
    openMenu(e, [
      { header: g.name },
      { label: "Nouvelle note ici", icon: "plus", tone: "green", action: () => newNote(g.id) },
      { label: "Renommer", icon: "edit", tone: "blue", action: () => setRenaming(g.id) },
      { label: "Couleur", icon: "palette", tone: "pink", items: colorItems(g.color, (color) => nb.updateGroup(g.id, { color: color ?? g.color }), false) },
      { label: "Partager le groupe", icon: "share", tone: "teal", items: shareItems(g, (share) => nb.shareGroup(g.id, share)) },
      { label: view.collapsed.includes(g.id) ? "Déplier" : "Replier", icon: "collapse", tone: "slate", action: () => toggleCollapsed(g.id) },
      "-",
      { label: "Supprimer le groupe (garder les notes)", icon: "folder", disabled: false, action: () => nb.removeGroup(g.id, false) },
      { label: `Supprimer le groupe et ses notes (${count})`, icon: "trash", danger: true, disabled: count === 0, action: () => nb.removeGroup(g.id, true) },
    ]);
  };

  const optionsMenu = (e: { clientX: number; clientY: number }) => openMenu(e, [
    { header: "Affichage" },
    { label: "Liste", icon: "list", tone: "blue", checked: view.layout === "list", action: () => setView({ layout: "list" }) },
    { label: "Grille de cartes", icon: "grid", tone: "violet", checked: view.layout === "grid", action: () => setView({ layout: "grid" }) },
    { header: "Tri" },
    { label: "Ordre libre (glisser-déposer)", icon: "sort", tone: "amber", checked: view.sort === "manual", action: () => setView({ sort: "manual" }) },
    { label: "Modifiées récemment", icon: "history", tone: "teal", checked: view.sort === "updated", action: () => setView({ sort: "updated" }) },
    { label: "Par titre", icon: "text", tone: "slate", checked: view.sort === "title", action: () => setView({ sort: "title" }) },
    "-",
    { label: "Tout replier", icon: "collapse", tone: "slate", disabled: groups.length === 0, action: () => setView({ collapsed: groups.map((g) => g.id) }) },
    { label: "Tout déplier", icon: "layers", tone: "slate", disabled: view.collapsed.length === 0, action: () => setView({ collapsed: [] }) },
  ]);

  // Glisser-déposer au pointeur (le glisser HTML est réservé aux fichiers dans la fenêtre).
  const startDrag = (e: ReactPointerEvent<HTMLElement>, kind: Drag["kind"], id: string) => {
    if (e.button !== 0 || (e.target as Element).closest("input, .notes__icon")) return;
    const el = kind === "group" ? e.currentTarget.closest<HTMLElement>("[data-section]") ?? e.currentTarget : e.currentTarget;
    drag.current = { kind, id, el, x0: e.clientX, y0: e.clientY, moved: false, group: null, before: null, mark: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const clearMark = (d: Drag) => {
    d.mark?.classList.remove("drop-before", "drop-after", "drop-into");
    d.mark = null;
  };

  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      d.el.classList.add("notes--dragging");
    }
    d.el.style.transform = `translate(${dx}px, ${dy}px)`;
    clearMark(d);
    const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => !d.el.contains(el)) as HTMLElement | undefined;
    if (!under) { d.group = NOWHERE; return; }
    const mark = (el: HTMLElement, cls: string) => { el.classList.add(cls); d.mark = el; };
    const half = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return view.layout === "grid" && d.kind === "note" ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    };

    // Élément suivant dans la même liste (hors élément tiré) : la place visée est « avant lui ».
    const following = (list: HTMLElement[], el: HTMLElement) => {
      const rest = list.filter((x) => x !== d.el);
      return rest[rest.indexOf(el) + 1];
    };
    const section = under.closest<HTMLElement>("[data-section]");
    if (!section) { d.group = NOWHERE; return; }

    if (d.kind === "note") {
      const target = under.closest<HTMLElement>("[data-note]");
      d.group = section.dataset.section || null;
      if (target && view.sort === "manual") {
        const after = half(target);
        d.before = (after ? following([...section.querySelectorAll<HTMLElement>("[data-note]")], target) : target)?.dataset.note ?? null;
        mark(target, after ? "drop-after" : "drop-before");
      } else {
        d.before = null;
        mark(section, "drop-into");
      }
    } else {
      const id = section.dataset.section;
      if (!id) { d.group = NOWHERE; return; }
      const after = half(section);
      const all = [...section.parentElement!.querySelectorAll<HTMLElement>(":scope > [data-section]")].filter((x) => x.dataset.section);
      d.before = (after ? following(all, section) : section)?.dataset.section ?? null;
      d.group = id;
      mark(section, after ? "drop-after" : "drop-before");
    }
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    clearMark(d);
    d.el.classList.remove("notes--dragging");
    d.el.style.transform = "";
    if (!d.moved) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    if (d.group === "\u0000") return;
    if (d.kind === "note") {
      nb.moveNote(d.id, d.group, d.before);
      // Déposée dans un groupe partagé : elle en prend le partage.
      const g = d.group ? nb.book.groups.find((x) => x.id === d.group) : null;
      if (g && isShared(g)) nb.updateNote(d.id, { share: g.share }, false);
    } else {
      nb.moveGroup(d.id, d.before);
    }
  };

  const dragProps = (kind: Drag["kind"], id: string) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => startDrag(e, kind, id),
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  });

  const renderNote = (n: Note) => {
    const owner = n.owner !== profile ? profileOf(n.owner) : null;
    const preview = notePreview(n);
    return (
      <div key={n.id} data-note={n.id} role="button" tabIndex={0}
        className={`note${n.color ? " note--tinted" : ""}${n.pinned ? " note--pinned" : ""}`} style={tint(n.color)}
        title="Clic : modifier · clic droit : options · glisser : déplacer"
        onClick={() => !suppressClick.current && setEditing(n.id)}
        onKeyDown={(e) => { if (e.key === "Enter") setEditing(n.id); if (e.key === "Delete") nb.removeNote(n.id); }}
        onContextMenu={(e) => { e.preventDefault(); noteMenu(e, n); }}
        {...dragProps("note", n.id)}>
        <span className="note__title">
          {n.pinned && <Icon name="pin" size={11} />}
          <span>{noteTitle(n)}</span>
        </span>
        {preview && <span className="note__preview">{preview}</span>}
        <span className="note__meta">
          {owner && <span className="note__owner" style={{ "--owner": owner.color } as CSSProperties}>{owner.name}</span>}
          {!owner && isShared(n) && (
            <span className="note__shared" title={n.share === "all" ? "Partagée avec tous les profils" : `Partagée avec ${n.share.map((id) => profileOf(id)?.name ?? id).join(", ")}`}>
              <Icon name="users" size={11} />
            </span>
          )}
          <span className="note__time">{time(n.updated)}</span>
        </span>
      </div>
    );
  };

  const renderList = (list: Note[]) => (
    <div className={`notes__list notes__list--${view.layout}`}>{list.map(renderNote)}</div>
  );

  if (note) {
    return (
      <Card title="Notes" className="notes-card">
        <NoteEditor key={note.id} note={note} groups={groups}
          onChange={(patch, touch) => nb.updateNote(note.id, patch, touch)}
          onBack={(empty) => { if (empty) nb.removeNote(note.id); setEditing(null); }}
          onMenu={(e) => noteMenu(e, note)}
          onGroupMenu={(e) => openMenu(e, groupItems(note))}
          onShareMenu={(e) => openMenu(e, shareItems(note, (share) => nb.updateNote(note.id, { share }, false)))}
          ownerName={note.owner !== profile ? profileOf(note.owner)?.name : undefined}
          shareLabel={!isShared(note) ? "Ce profil" : note.share === "all" ? "Tous les profils" : note.share.map((id) => profileOf(id)?.name ?? id).join(", ")} />
      </Card>
    );
  }

  const loose = inSection(null);
  const total = notes.length;
  return (
    <Card title="Notes" className="notes-card" action={(
      <span className="notes__actions">
        <button className="notes__icon" title="Nouvelle note" aria-label="Nouvelle note" onClick={() => newNote()}><Icon name="plus" size={15} /></button>
        <button className="notes__icon" title="Nouveau groupe" aria-label="Nouveau groupe" onClick={newGroup}><Icon name="folderPlus" size={15} /></button>
        <button className="notes__icon" title="Affichage et tri" aria-label="Affichage et tri" onClick={(e) => optionsMenu(e)}><Icon name="more" size={15} /></button>
      </span>
    )}>
      {total > 5 && (
        <input className="lib-filter" value={query} placeholder="Rechercher dans les notes…" spellCheck={false}
          onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")} />
      )}
      <div className="notes" onPointerDown={(e) => e.stopPropagation()}>
        <section data-section="" className="notes__section notes__section--loose">
          {renderList(loose)}
          {total === 0 && (
            <button className="notes__empty" onClick={() => newNote()}>
              <Icon name="notes" size={20} />
              <span>Une idée, une liste, un numéro…<small>Cliquez pour écrire une note</small></span>
            </button>
          )}
        </section>
        {groups.map((g) => {
          const list = inSection(g.id);
          if (q && list.length === 0) return null;
          const collapsed = !q && view.collapsed.includes(g.id);
          const owner = g.owner !== profile ? profileOf(g.owner) : null;
          return (
            <section key={g.id} data-section={g.id} className={`notes__section notes__group${collapsed ? " notes__group--collapsed" : ""}`}
              style={{ "--group": g.color } as CSSProperties}>
              <header className="notes__group-head" {...dragProps("group", g.id)}
                onClick={() => !suppressClick.current && renaming !== g.id && toggleCollapsed(g.id)}
                onContextMenu={(e) => { e.preventDefault(); groupMenu(e, g); }}>
                <span className="notes__chevron"><Icon name="chevron" size={12} /></span>
                <span className="notes__dot" />
                {renaming === g.id ? (
                  <GroupName value={g.name} onDone={(name) => { if (name.trim()) nb.updateGroup(g.id, { name: name.trim() }); setRenaming(null); }} />
                ) : (
                  <span className="notes__group-name" onDoubleClick={(e) => { e.stopPropagation(); setRenaming(g.id); }}>{g.name}</span>
                )}
                {owner && <span className="note__owner" style={{ "--owner": owner.color } as CSSProperties}>{owner.name}</span>}
                {!owner && isShared(g) && <span className="note__shared" title="Groupe partagé"><Icon name="users" size={11} /></span>}
                <span className="notes__count">{list.length}</span>
                <button className="notes__icon notes__icon--hover" title="Nouvelle note dans ce groupe" aria-label="Nouvelle note dans ce groupe"
                  onClick={(e) => { e.stopPropagation(); newNote(g.id); }}><Icon name="plus" size={13} /></button>
                <button className="notes__icon notes__icon--hover" title="Options du groupe" aria-label="Options du groupe"
                  onClick={(e) => { e.stopPropagation(); groupMenu(e, g); }}><Icon name="more" size={13} /></button>
              </header>
              {!collapsed && (list.length ? renderList(list) : <p className="notes__hint">Glissez une note ici.</p>)}
            </section>
          );
        })}
        {q && total > 0 && loose.length === 0 && groups.every((g) => inSection(g.id).length === 0) && <p className="muted">Aucune note trouvée.</p>}
      </div>
    </Card>
  );
}

function GroupName({ value, onDone }: { value: string; onDone: (name: string) => void }) {
  const [name, setName] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input ref={ref} className="notes__rename" value={name} spellCheck={false} maxLength={60}
      onClick={(e) => e.stopPropagation()} onChange={(e) => setName(e.target.value)} onBlur={() => onDone(name)}
      onKeyDown={(e) => { if (e.key === "Enter") onDone(name); if (e.key === "Escape") onDone(value); }} />
  );
}

interface EditorProps {
  note: Note;
  groups: NoteGroup[];
  onChange: (patch: Partial<Note>, touch?: boolean) => void;
  onBack: (empty: boolean) => void;
  onMenu: (e: { clientX: number; clientY: number }) => void;
  onGroupMenu: (e: { clientX: number; clientY: number }) => void;
  onShareMenu: (e: { clientX: number; clientY: number }) => void;
  ownerName?: string;
  shareLabel: string;
}

/** Modification d'une note : titre, texte (enregistrés au fil de la frappe), couleur, groupe, partage. */
function NoteEditor({ note, groups, onChange, onBack, onMenu, onGroupMenu, onShareMenu, ownerName, shareLabel }: EditorProps) {
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const pending = useRef<Partial<Note> | null>(null);
  const timer = useRef(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current) onChange(pending.current);
    pending.current = null;
  };
  const edit = (patch: Partial<Note>) => {
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 300);
  };
  // Changement venu d'une autre fenêtre : repris si le champ n'est pas en cours de frappe.
  useEffect(() => {
    if (!pending.current && document.activeElement !== area.current) setText(note.text);
    if (!pending.current && document.activeElement !== titleRef.current) setTitle(note.title);
  }, [note.text, note.title]);
  useEffect(() => {
    (note.text || note.title ? area.current : titleRef.current)?.focus();
    return flush;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    flush();
    onBack(!title.trim() && !text.trim());
  };
  const group = groups.find((g) => g.id === note.group);
  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);

  return (
    <div className={`note-editor${note.color ? " note--tinted" : ""}`} style={tint(note.color)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); back(); } }}>
      <div className="note-editor__bar">
        <button className="notes__icon" title="Retour aux notes (Échap)" aria-label="Retour aux notes" onClick={back}><Icon name="back" size={15} /></button>
        <input ref={titleRef} className="note-editor__title" value={title} placeholder="Titre" spellCheck maxLength={120}
          onChange={(e) => { setTitle(e.target.value); edit({ title: e.target.value }); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); area.current?.focus(); } }} />
        <button className={`notes__icon${note.pinned ? " notes__icon--on" : ""}`} title={note.pinned ? "Désépingler" : "Épingler en haut"}
          aria-label="Épingler" onClick={() => onChange({ pinned: !note.pinned }, false)}><Icon name="pin" size={14} /></button>
        <button className="notes__icon" title="Options" aria-label="Options de la note" onClick={(e) => onMenu(e)}><Icon name="more" size={15} /></button>
      </div>
      <div className="note-editor__colors" role="radiogroup" aria-label="Couleur">
        <button className={`note-editor__color note-editor__color--none${note.color ? "" : " is-on"}`} title="Aucune couleur"
          aria-label="Aucune couleur" onClick={() => onChange({ color: null }, false)} />
        {noteColors.map((c) => (
          <button key={c.value} className={`note-editor__color${note.color === c.value ? " is-on" : ""}`} title={c.label} aria-label={c.label}
            style={{ "--swatch": c.value } as CSSProperties} onClick={() => onChange({ color: c.value }, false)} />
        ))}
      </div>
      <textarea ref={area} className="note-editor__text" value={text} placeholder="Écrivez ici…" spellCheck
        onChange={(e) => { setText(e.target.value); edit({ text: e.target.value }); }} onBlur={flush} />
      <div className="note-editor__foot">
        <button className="note-editor__chip" onClick={(e) => onGroupMenu(e)} title="Changer de groupe">
          {group ? <span className="notes__dot" style={{ "--group": group.color } as CSSProperties} /> : <Icon name="folder" size={12} />}
          {group?.name ?? "Sans groupe"}
        </button>
        <button className="note-editor__chip" onClick={(e) => onShareMenu(e)} title="Profils qui voient cette note">
          <Icon name={shareLabel === "Ce profil" ? "lock" : "users"} size={12} />
          {shareLabel}
        </button>
        <span className="note-editor__info">
          {ownerName ? `De ${ownerName} · ` : ""}{words} mot{words > 1 ? "s" : ""} · {time(note.updated)}
        </span>
      </div>
    </div>
  );
}
