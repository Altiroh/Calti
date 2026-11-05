import type { CSSProperties } from "react";
import { RichText } from "../components/RichText";
import type { Block } from "../settings/layout";
import type { HomeTheme } from "../settings/settings";
import { hasSurface } from "./TextWidget";
import "./TitleWidget.css";

/**
 * Bloc d'accueil : nom du profil, ou titre libre,
 * et sous-titre. Sans taille choisie, le texte suit la taille du bloc.
 */
export function TitleWidget({ theme, block, profileName }: { theme: HomeTheme; block: Block; profileName: string }) {
  const style = block.style ?? {};
  const name = style.showProfile === false ? "" : profileName.trim();
  const greeting = name ? `*${name}*` : "Accueil";
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
