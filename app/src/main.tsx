// Styles globaux d'abord : les CSS des composants, importés ensuite, peuvent les surcharger.
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/glass.css";
import "./styles/layout.css";
import "./styles/motion.css";
import "./styles/chrome.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installPointerEffects } from "./motion";
import { migrateLegacyData } from "./settings/migrate";
import { SettingsProvider } from "./settings/settings";

installPointerEffects();

// Pas de menu contextuel par défaut sur l'interface (« Actualiser » rechargerait Calti) ; les champs de saisie
// gardent le leur (copier, coller). Les clics droits de Calti ouvrent leurs propres menus.
document.addEventListener("contextmenu", (e) => {
  if (!(e.target as Element).closest?.("input, textarea, [contenteditable=\"true\"]")) e.preventDefault();
});

// Les réglages sont lus au premier rendu : la migration doit être terminée avant.
migrateLegacyData().finally(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </StrictMode>,
  ),
);
