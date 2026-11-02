import { RichText } from "../components/RichText";
import type { Block } from "../settings/layout";
import "./TextWidget.css";

/** Vrai si le bloc a demandé un fond (les blocs de texte n'en ont pas par défaut). */
export const hasSurface = (block: Block) => !!block.style?.surface && block.style.surface !== "none";

/** Bloc de texte libre : marque, slogan, paragraphe, étiquette… */
export function TextWidget({ block }: { block: Block }) {
  const style = block.style ?? {};
  return (
    <section className={`text-free text-block--v-${style.vAlign ?? "center"}${hasSurface(block) ? " glass" : ""}`}>
      <RichText text={block.text?.trim() ? block.text : "Texte libre"} style={style} />
    </section>
  );
}
