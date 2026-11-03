import { blockLabel, type Block, type BlockStyle, type Surface, type TextFont } from "../settings/layout";
import { Check, ColorField, Section, Segmented, Slider } from "./Controls";
import { Icon } from "./Icon";
import { textFonts } from "./RichText";
import { clockStyles } from "../widgets/clockStyles";
import "./Inspector.css";

interface Props {
  block: Block;
  onChange: (block: Block) => void;
  onClose: () => void;
  /** Texte affiché par défaut dans le titre (titre des Réglages ou salutation). */
  titlePlaceholder: string;
}

const textKinds = new Set(["title", "text", "clock", "search"]);
/** Blocs de texte : sans fond par défaut, contrairement aux cartes. */
const bareKinds = new Set(["title", "text", "clock"]);

/** Inspecteur du bloc sélectionné : chaque changement s'applique immédiatement à l'aperçu. */
export function Inspector({ block, onChange, onClose, titlePlaceholder }: Props) {
  const s = block.style ?? {};
  const set = (patch: Partial<BlockStyle>) => {
    const style = { ...s, ...patch };
    // Une valeur « undefined » revient au rendu par défaut : on la retire.
    for (const k of Object.keys(style) as (keyof BlockStyle)[]) if (style[k] === undefined) delete style[k];
    onChange({ ...block, style });
  };
  const isText = textKinds.has(block.kind);
  const defaultSurface = bareKinds.has(block.kind) ? "none" : "glass";
  const fontOptions: [TextFont | "auto", string][] = [["auto", "Auto"], ...Object.entries(textFonts).map(([k, f]) => [k as TextFont, f.label] as [TextFont, string])];

  return (
    <aside className="inspector glass">
      <header className="inspector__head">
        <div>
          <strong>{blockLabel(block)}</strong>
          <span>{block.w}×{block.h} cases · position {block.x + 1}, {block.y + 1}</span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fermer l'inspecteur"><Icon name="close" size={15} /></button>
      </header>

      <div className="inspector__body">
        {(block.kind === "text" || block.kind === "title") && (
          <Section title="Contenu">
            <textarea className="field" rows={3} value={block.text ?? ""}
              placeholder={block.kind === "title" ? titlePlaceholder : "Votre texte"}
              onChange={(e) => onChange({ ...block, text: e.target.value })} />
            <p className="settings__hint">Entre *astérisques* : mise en valeur (couleur 2, police 2). Entrée : nouvelle ligne.</p>
          </Section>
        )}

        <Section title="Fond">
          <Segmented<Surface | "default"> value={s.surface ?? "default"}
            onChange={(v) => set({ surface: v === "default" ? undefined : v })}
            options={[["default", "Auto"], ["glass", "Verre"], ["glass-dark", "Fumé"], ["solid", "Plein"], ["none", "Aucun"]]} />
          {(s.surface ?? defaultSurface) !== "none" && (
            <>
              <Slider label="Opacité" value={s.opacity ?? 0.42} min={0.05} max={1} step={0.05}
                format={(v) => `${Math.round(v * 100)} %`} onChange={(opacity) => set({ opacity })} />
              <Slider label="Flou" value={s.blur ?? 24} min={0} max={60} step={2} format={(v) => `${v} px`}
                onChange={(blur) => set({ blur })} />
              <Slider label="Arrondi" value={s.radius ?? 28} min={0} max={60} step={2} format={(v) => `${v} px`}
                onChange={(radius) => set({ radius })} />
            </>
          )}
          <Segmented value={s.tone ?? "auto"} onChange={(v) => set({ tone: v === "auto" ? undefined : v })}
            options={[["auto", "Texte auto"], ["light", "Texte clair"], ["dark", "Texte sombre"]]} />
        </Section>

        {isText && (
          <Section title="Typographie">
            <Segmented value={s.font ?? "auto"} onChange={(v) => set({ font: v === "auto" ? undefined : v })} options={fontOptions} />
            <Slider label="Taille" value={s.size ?? defaultSize(block)} min={10} max={180} step={1}
              format={(v) => `${v} px`} onChange={(size) => set({ size })} />
            <Slider label="Graisse" value={s.weight ?? 500} min={100} max={900} step={100}
              format={(v) => `${v}`} onChange={(weight) => set({ weight })} />
            <Slider label="Lettres" value={s.tracking ?? 0} min={-0.06} max={0.4} step={0.01}
              format={(v) => `${v.toFixed(2)} em`} onChange={(tracking) => set({ tracking })} />
            <div className="inspector__row">
              <Check label="Italique" checked={!!s.italic} onChange={(italic) => set({ italic: italic || undefined })} />
              <Check label="Majuscules" checked={!!s.uppercase} onChange={(uppercase) => set({ uppercase: uppercase || undefined })} />
            </div>
            {block.kind !== "search" && (
              <>
                <Segmented value={s.align ?? "auto"} onChange={(v) => set({ align: v === "auto" ? undefined : v })}
                  options={[["auto", "Auto"], ["left", "Gauche"], ["center", "Centre"], ["right", "Droite"]]} />
                <Segmented value={s.vAlign ?? "auto"} onChange={(v) => set({ vAlign: v === "auto" ? undefined : v })}
                  options={[["auto", "Auto"], ["top", "Haut"], ["center", "Milieu"], ["bottom", "Bas"]]} />
              </>
            )}
            <ColorField label="Couleur" value={s.color} onChange={(color) => set({ color })} />
            {block.kind !== "search" && (
              <>
                <ColorField label="Couleur 2" value={s.color2} onChange={(color2) => set({ color2 })} />
                <Segmented value={s.font2 ?? "auto"} onChange={(v) => set({ font2: v === "auto" ? undefined : v })} options={fontOptions} />
                <div className="inspector__row">
                  <Check label="Italique 2" checked={!!s.italic2} onChange={(italic2) => set({ italic2: italic2 || undefined })} />
                  <Check label="Dégradé 1 → 2" checked={!!s.gradient} onChange={(gradient) => set({ gradient: gradient || undefined })} />
                </div>
              </>
            )}
          </Section>
        )}

        {block.kind === "search" && (
          <Section title="Recherche">
            <Segmented value={s.shape ?? "pill"} onChange={(shape) => set({ shape })}
              options={[["pill", "Pilule"], ["rounded", "Arrondie"]]} />
            <Check label="Bouton d'envoi coloré" checked={!!s.button} onChange={(button) => set({ button: button || undefined })} />
            <input className="field" value={s.placeholder ?? ""} placeholder="Texte d'invite"
              onChange={(e) => set({ placeholder: e.target.value || undefined })} />
          </Section>
        )}

        {block.kind === "title" && (
          <Section title="Accueil">
            <Check label="Nom du profil après la salutation" checked={s.showProfile !== false}
              onChange={(show) => set({ showProfile: show ? undefined : false })} />
            <p className="settings__hint">Sans taille choisie (Typographie), le texte s'adapte à la taille du bloc.</p>
          </Section>
        )}

        {block.kind === "clock" && (
          <Section title="Horloge">
            <div className="clock-styles">
              {clockStyles.map(([value, label]) => (
                <button key={value} className={`chip-btn${(s.clockStyle ?? "classic") === value ? " chip-btn--on" : ""}`}
                  onClick={() => set({ clockStyle: value === "classic" ? undefined : value })}>
                  {label}
                </button>
              ))}
            </div>
            <Check label="Afficher la date" checked={s.showDate !== false}
              onChange={(show) => set({ showDate: show ? undefined : false })} />
            <Check label="Afficher les secondes" checked={s.showSeconds ?? s.clockStyle === "labels"}
              onChange={(showSeconds) => set({ showSeconds })} />
          </Section>
        )}

        <button className="btn btn--ghost inspector__reset" onClick={() => onChange({ ...block, style: {} })}>
          Style par défaut
        </button>
      </div>
    </aside>
  );
}

function defaultSize(block: Block): number {
  switch (block.kind) {
    case "title": return 80;
    case "clock": return 64;
    case "search": return 15;
    default: return 15;
  }
}
