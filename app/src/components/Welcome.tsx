import { useState, type CSSProperties, type FormEvent } from "react";
import { profileIcons, useSettings } from "../settings/settings";
import { dragWindow } from "./dragWindow";
import { ProfileBadge } from "./ProfileBadge";
import { WindowControls } from "./WindowControls";
import "./Welcome.css";

const colors = ["#2f5fa8", "#7a62c4", "#1f8c8c", "#3f9b5c", "#c2652f", "#b8457a", "#4a5d78", "#d4a017"];

/** Premier lancement : Calti n'a encore aucun profil, l'utilisateur crée le sien. */
export function Welcome() {
  const { createProfile, updateProfile } = useSettings();
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[0]);
  const [icon, setIcon] = useState("");
  const shown = name.trim() || "Profil";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = createProfile(name.trim());
    updateProfile(id, { color, icon });
  };

  return (
    <div className="welcome" style={{ "--welcome-accent": color } as CSSProperties}>
      <div className="welcome__drag" onMouseDown={dragWindow}><WindowControls /></div>
      <form className="welcome__card glass" onSubmit={submit}>
        <ProfileBadge profile={{ id: "nouveau", name: shown, color, icon, search: "duckduckgo", startPage: "home" }} size={72} />
        <h1>Bienvenue dans Calti</h1>
        <p>Créez votre premier profil. Chaque profil a ses propres onglets, connexions, mots de passe et historique ;
          vous pourrez en ajouter d'autres dans les Réglages.</p>
        <input className="welcome__name" autoFocus value={name} maxLength={40} placeholder="Nom du profil (ex. Personnel)"
          spellCheck={false} onChange={(e) => setName(e.target.value)} />
        <div className="welcome__row" role="radiogroup" aria-label="Couleur">
          {colors.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c}
              className={`welcome__color${c === color ? " welcome__color--on" : ""}`} style={{ background: c }}
              onClick={() => setColor(c)} />
          ))}
        </div>
        <div className="welcome__row" role="radiogroup" aria-label="Icône">
          {profileIcons.map((i) => (
            <button key={i || "initiales"} type="button" role="radio" aria-checked={i === icon}
              className={`welcome__icon${i === icon ? " welcome__icon--on" : ""}`} title={i || "Initiales"}
              onClick={() => setIcon(i)}>
              {i || shown.slice(0, 2)}
            </button>
          ))}
        </div>
        <button type="submit" className="btn welcome__go" disabled={!name.trim()}>Créer mon profil</button>
      </form>
    </div>
  );
}
