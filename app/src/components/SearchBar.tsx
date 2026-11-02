import { useState, type FormEvent } from "react";
import type { Command } from "../brave/types";
import type { BlockStyle } from "../settings/layout";
import { textVars } from "./RichText";
import { Icon } from "./Icon";
import "./SearchBar.css";

/** Interprète la saisie : une adresse ouvre la page, le reste part au moteur de recherche de Brave. */
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
}

export function SearchBar({ send, style = {} }: Props) {
  const [value, setValue] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const command = toCommand(value);
    if (command) {
      send(command);
      setValue("");
    }
  };

  return (
    <form className={`search glass search--${style.shape ?? "pill"}`} onSubmit={submit} style={textVars(style)}>
      <Icon name="search" size={19} />
      <input className="search__input" value={value} onChange={(e) => setValue(e.target.value)}
        placeholder={style.placeholder || "Rechercher avec Brave ou saisir une adresse"} spellCheck={false} />
      {style.button ? (
        <button className="search__go" type="submit" disabled={!value.trim()} aria-label="Lancer">
          <Icon name="forward" size={17} />
        </button>
      ) : (
        <kbd className="search__hint">Entrée</kbd>
      )}
    </form>
  );
}
