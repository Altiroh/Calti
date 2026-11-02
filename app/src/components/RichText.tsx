import type { CSSProperties } from "react";
import type { BlockStyle, TextFont } from "../settings/layout";
import "./RichText.css";

export const textFonts: Record<TextFont, { label: string; family: string }> = {
  moderne: { label: "Moderne", family: '"Segoe UI Variable Display", "Segoe UI", sans-serif' },
  editorial: { label: "Éditorial", family: 'Georgia, "Times New Roman", serif' },
  condense: { label: "Condensé", family: 'Bahnschrift, "Segoe UI", sans-serif' },
  mono: { label: "Mono", family: '"Cascadia Mono", Consolas, monospace' },
};

/** Variables CSS de mise en forme du texte d'un bloc (une valeur absente garde le style par défaut). */
export function textVars(style: BlockStyle = {}): CSSProperties {
  const vars: Record<string, string | number> = {};
  if (style.size) vars["--t-size"] = `${style.size}px`;
  if (style.weight) vars["--t-weight"] = style.weight;
  if (style.font) vars["--t-font"] = textFonts[style.font].family;
  if (style.italic) vars["--t-style"] = "italic";
  if (style.uppercase) vars["--t-transform"] = "uppercase";
  if (style.tracking != null) vars["--t-tracking"] = `${style.tracking}em`;
  if (style.color) vars["--t-color"] = style.color;
  if (style.color2) vars["--t-color2"] = style.color2;
  if (style.font2) vars["--t-font2"] = textFonts[style.font2].family;
  if (style.italic2) vars["--t-style2"] = "italic";
  if (style.align) vars["--t-align"] = style.align;
  return vars as CSSProperties;
}

interface Props {
  text: string;
  style?: BlockStyle;
  className?: string;
  /** Deuxième ligne et suivantes atténuées (titre). */
  dimFollowingLines?: boolean;
}

/** Texte multiligne ; les passages entre *astérisques* prennent la couleur et la police secondaires. */
export function RichText({ text, style = {}, className = "", dimFollowingLines = false }: Props) {
  const classes = ["rt", className, style.gradient ? "rt--gradient" : "", dimFollowingLines ? "rt--dim-lines" : ""];
  return (
    <div className={classes.join(" ")} style={textVars(style)}>
      {text.split("\n").map((line, i) => (
        <span key={`${i}-${line}`} className="rt-line" style={{ animationDelay: `${120 + i * 90}ms` }}>
          {line.split(/(\*[^*]+\*)/).map((part, j) =>
            part.startsWith("*") && part.endsWith("*") && part.length > 2
              ? <span key={j} className="rt-em">{part.slice(1, -1)}</span>
              : part,
          )}
          {line === "" && " "}
        </span>
      ))}
    </div>
  );
}
