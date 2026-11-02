import { useState, type ReactNode } from "react";
import { withTransition } from "../motion";
import {
  blockLabel, defaultLayout, findFreeSpot, minSize, newTextId, type Block, type Layout,
} from "../settings/layout";
import { presets } from "../settings/presets";
import { useSettings } from "../settings/settings";
import { HomeGrid } from "./HomeGrid";
import { Icon } from "./Icon";
import { Inspector } from "./Inspector";
import "./LayoutEditor.css";

interface Props {
  themeKey: string;
  profileLabel: string;
  render: (block: Block) => ReactNode;
  onClose: () => void;
}

/**
 * Page d'édition de l'accueil : déplacer, agrandir, masquer les blocs sur une grille aimantée,
 * régler le style de chaque bloc dans l'inspecteur, ajouter des blocs de texte, partir d'un modèle.
 */
export function LayoutEditor({ themeKey, profileLabel, render, onClose }: Props) {
  const { themeFor, updateTheme } = useSettings();
  const theme = themeFor(themeKey);
  const [draft, setDraft] = useState<Layout>(theme.layout);
  const [selected, setSelected] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const hidden = Object.entries(draft).filter(([, b]) => b.hidden);
  const changed = JSON.stringify(draft) !== JSON.stringify(theme.layout);
  const selectedBlock = selected ? draft[selected] : null;

  const restore = (id: string) => withTransition(() => setDraft((d) => {
    const b = d[id];
    const size = { w: Math.max(minSize[b.kind].w, defaultLayout[id]?.w ?? b.w), h: Math.max(minSize[b.kind].h, defaultLayout[id]?.h ?? b.h) };
    return { ...d, [id]: { ...b, ...findFreeSpot(d, id, size), hidden: false } };
  }));

  const addText = () => {
    const id = newTextId();
    withTransition(() => {
      setDraft((d) => ({ ...d, [id]: { kind: "text", ...findFreeSpot(d, id, { w: 4, h: 2 }), text: "Nouveau *texte*" } }));
      setSelected(id);
    });
  };

  return (
    <div className="editor">
      <header className="editor__bar glass">
        <div className="editor__title">
          <strong>Disposition</strong>
          <span>{profileLabel} · glisser, coin pour agrandir, clic pour régler</span>
        </div>

        <div className="editor__tools">
          <button className={`chip-btn${showGrid ? " chip-btn--on" : ""}`} onClick={() => setShowGrid((g) => !g)}>Grille</button>
          <button className="chip-btn editor__add" onClick={addText}><Icon name="plus" size={12} /> Texte</button>
          <div className="editor__presets">
            <button className={`chip-btn${presetsOpen ? " chip-btn--on" : ""}`} onClick={() => setPresetsOpen((o) => !o)}>Modèles</button>
            {presetsOpen && (
              <div className="editor__menu glass">
                {presets.map((p) => (
                  <button key={p.name} className="editor__menu-item" onClick={() => {
                    setPresetsOpen(false);
                    setSelected(null);
                    withTransition(() => setDraft(structuredClone(p.layout)));
                  }}>
                    <strong>{p.name}</strong>
                    <span>{p.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {hidden.map(([id, b]) => (
            <button key={id} className="chip-btn editor__restore" onClick={() => restore(id)} title="Réafficher ce bloc">
              <Icon name="plus" size={12} /> {blockLabel(b)}
            </button>
          ))}
        </div>

        <div className="editor__actions">
          <button className="chip-btn" onClick={() => withTransition(() => { setSelected(null); setDraft(defaultLayout); })}>
            Réinitialiser
          </button>
          <button className="chip-btn" onClick={() => withTransition(onClose)}>Annuler</button>
          <button className="chip-btn chip-btn--on" disabled={!changed} onClick={() => withTransition(() => {
            updateTheme(themeKey, { layout: draft });
            onClose();
          })}>
            Enregistrer
          </button>
        </div>
      </header>

      <div className={`editor__stage${selectedBlock ? " editor__stage--inspecting" : ""}`}>
        <HomeGrid layout={draft} editing showGrid={showGrid} render={render} onChange={setDraft}
          selected={selected} onSelect={setSelected} />
        {selected && selectedBlock && (
          <Inspector key={selected} block={selectedBlock}
            titlePlaceholder={theme.headline.trim() || "Salutation selon l'heure"}
            onChange={(block) => setDraft((d) => ({ ...d, [selected]: block }))}
            onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}
