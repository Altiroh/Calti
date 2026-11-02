import { RichText } from "../components/RichText";
import type { Block } from "../settings/layout";
import type { HomeTheme } from "../settings/settings";
import { hasSurface } from "./TextWidget";
import { useNow } from "./useNow";
import "./TitleWidget.css";

function salutation(hour: number) {
  if (hour < 5) return "Bonne nuit.";
  if (hour < 18) return "Bonjour.";
  return "Bonsoir.";
}

/** Grand titre de l'accueil (libre ou salutation selon l'heure) et sous-titre. */
export function TitleWidget({ theme, block }: { theme: HomeTheme; block: Block }) {
  const now = useNow(60_000);
  const style = block.style ?? {};
  return (
    <section className={`title-block text-block--v-${style.vAlign ?? "bottom"}${hasSurface(block) ? " glass" : ""}`}>
      <RichText className="title-block__title" text={block.text?.trim() || theme.headline.trim() || salutation(now.getHours())}
        style={style} dimFollowingLines />
      {theme.tagline.trim() && (
        <p className="title-block__tagline" style={{ textAlign: style.align }}>{theme.tagline}</p>
      )}
    </section>
  );
}
