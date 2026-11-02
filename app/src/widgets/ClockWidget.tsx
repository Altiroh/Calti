import { textVars } from "../components/RichText";
import type { Block } from "../settings/layout";
import { hasSurface } from "./TextWidget";
import { useNow } from "./useNow";
import "./ClockWidget.css";

export function ClockWidget({ block }: { block: Block }) {
  const style = block.style ?? {};
  const now = useNow(1000);
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const align = style.align ?? "right";
  return (
    <section className={`clock-block clock-block--${align} text-block--v-${style.vAlign ?? "bottom"}${hasSurface(block) ? " glass" : ""}`}
      style={textVars(style)}>
      <div className="clock-block__time">
        {/* Chaque chiffre est une clé : il s'anime seulement quand il change. */}
        {[...time].map((c, i) => <span key={`${i}-${c}`} className="clock-block__digit">{c}</span>)}
      </div>
      {style.showDate !== false && (
        <div className="clock-block__date">
          {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      )}
    </section>
  );
}
