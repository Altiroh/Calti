// Claude dans un panneau latéral : la page claude.ai, avec le compte de l'utilisateur (aucune clé API).
// « Demander à Claude » (clic droit sur une sélection, palette) ouvre le panneau avec la question déjà saisie.
import type { ProfileId } from "./useBrowser";

export const CLAUDE_EVENT = "calti:claude";
export const CLAUDE_HOME = "https://claude.ai/new";

/** Nouvelle conversation, avec la question pré-remplie si elle est donnée. */
export const claudeUrl = (prompt?: string) =>
  prompt ? `${CLAUDE_HOME}?q=${encodeURIComponent(prompt.slice(0, 8000))}` : CLAUDE_HOME;

export interface ClaudeRequest {
  profile: ProfileId;
  prompt?: string;
}

/** Ouvre le panneau Claude du profil sur une nouvelle conversation avec cette question. */
export function askClaude(profile: ProfileId, prompt?: string) {
  window.dispatchEvent(new CustomEvent<ClaudeRequest>(CLAUDE_EVENT, { detail: { profile, prompt } }));
}
