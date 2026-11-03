import type { CSSProperties } from "react";
import { RichText } from "../components/RichText";
import type { Block } from "../settings/layout";
import type { HomeTheme } from "../settings/settings";
import { hasSurface } from "./TextWidget";
import { useNow } from "./useNow";
import "./TitleWidget.css";

function salutation(hour: number) {
  if (hour < 5) return "Bonne nuit";
  if (hour < 18) return "Bonjour";
  return "Bonsoir";
}

/**
 * Bloc d'accueil : salutation selon l'heure suivie du nom du profil (« Bonjour, *Pro*. »), ou titre libre,
 * et sous-titre. Sans taille choisie, le texte suit la taille du bloc.
 */
export function TitleWidget({ theme, block, profileName }: { theme: HomeTheme; block: Block; profileName: string }) {
  const now = useNow(60_000);
  const style = block.style ?? {};
  const name = style.showProfile === false ? "" : profileName.trim();
  const greeting = name ? `${salutation(now.getHours())}, *${name}*.` : `${salutation(now.getHours())}.`;
  const text = block.text?.trim() || theme.headline.trim() || greeting;
  // Plus le texte est long, plus il doit être petit pour tenir dans la largeur du bloc.
  const longest = Math.max(8, ...text.replace(/\*/g, "").split("\n").map((l) => l.length));
  return (
    <section className={`title-block text-block--v-${style.vAlign ?? "bottom"}${hasSurface(block) ? " glass" : ""}`}
      style={{ "--title-chars": longest } as CSSProperties}>
      <RichText className="title-block__title" text={text} style={style} dimFollowingLines />
      {theme.tagline.trim() && (
        <p className="title-block__tagline" style={{ textAlign: style.align }}>{theme.tagline}</p>
      )}
    </section>
  );
}
