import { useState, type FormEvent } from "react";
import type { Command } from "../brave/types";
import type { Suggestion } from "../browser/library";
import { useSuggestions } from "../browser/webSuggestions";
import type { BlockStyle } from "../settings/layout";
import { SuggestionList } from "./BrowserPane";
import { textVars } from "./RichText";
import { Icon } from "./Icon";
import "./SearchBar.css";

/** Interprète la saisie : une adresse ouvre la page, le reste part au moteur de recherche du profil. */
function toCommand(input: string): Command | null {
  const text = input.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return { type: "openUrl", url: text };
  if (!/\s/.test(text) && /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/i.test(text)) {
    return { type: "openUrl", url: `https://${text}` };
  }
  return { type: "search", text };
}

interface Props {
  send: (c: Command) => void;
  style?: BlockStyle;
  /** Suggestions pour la saisie (recherches passées, favoris, historique du profil). */
  suggest?: (input: string) => Suggestion[];
  /** Moteur du profil pour les suggestions en ligne ; absent : suggestions du profil seulement. */
  engine?: string | null;
}

/** Recherche de l'accueil, avec les mêmes suggestions que la barre d'adresse (flèches, Entrée, clic). */
export function SearchBar({ send, style = {}, suggest, engine }: Props) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState(-1);
  const query = focused ? value : "";
  const suggestions = useSuggestions(suggest && query.trim() ? suggest(query) : [], query, engine ?? null);

  const run = (command: Command | null) => {
    if (!command) return;
    send(command);
    setValue("");
    setPicked(-1);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = suggestions[picked];
    run(s ? (s.url ? { type: "openUrl", url: s.url } : { type: "search", text: s.text }) : toCommand(value));
  };

  return (
    <form className={`search glass search--${style.shape ?? "pill"}`} onSubmit={submit} style={textVars(style)}>
      <Icon name="search" size={19} />
      <input className="search__input" value={value} spellCheck={false}
        placeholder={style.placeholder || "Rechercher ou saisir une adresse"}
        onChange={(e) => { setValue(e.target.value); setFocused(true); setPicked(-1); }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setPicked(-1); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setValue("");
          else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && suggestions.length) {
            e.preventDefault();
            // De -1 (la saisie elle-même) à la dernière suggestion, en boucle.
            const n = suggestions.length;
            setPicked((p) => (e.key === "ArrowDown" ? (p + 1 >= n ? -1 : p + 1) : (p - 1 < -1 ? n - 1 : p - 1)));
          }
        }} />
      {style.button ? (
        <button className="search__go" type="submit" disabled={!value.trim()} aria-label="Lancer">
          <Icon name="forward" size={17} />
        </button>
      ) : (
        <kbd className="search__hint">Entrée</kbd>
      )}
      {/* Sur l'accueil, aucune page n'est posée dessous : pas de découpe à faire. */}
      {suggestions.length > 0 && (
        <SuggestionList items={suggestions} picked={picked} query={value}
          onPick={(s) => run(s.url ? { type: "openUrl", url: s.url } : { type: "search", text: s.text })} onRect={() => {}} />
      )}
    </form>
  );
}
