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
import { Welcome } from "./components/Welcome";
import { restoreIfNewer, startMirror } from "./settings/persistence";
import { installPointerEffects } from "./motion";
import { migrateLegacyData } from "./settings/migrate";
import { SettingsProvider, useSettings } from "./settings/settings";

/** Sans profil (premier lancement), l'accueil de création ; ensuite, le navigateur. */
function Root() {
  const { profileIds } = useSettings();
  return profileIds.length ? <App /> : <Welcome />;
}

installPointerEffects();

// Pas de menu contextuel par défaut sur l'interface (« Actualiser » rechargerait Calti) ; les champs de saisie
// gardent le leur (copier, coller). Les clics droits de Calti ouvrent leurs propres menus.
document.addEventListener("contextmenu", (e) => {
  if (!(e.target as Element).closest?.("input, textarea, [contenteditable=\"true\"]")) e.preventDefault();
});

// Les réglages sont lus au premier rendu : la copie de sécurité (reprise si WebView2 a perdu son stockage) et la
// migration doivent être terminées avant.
restoreIfNewer()
  .then(() => migrateLegacyData())
  .finally(() => {
    startMirror();
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <SettingsProvider>
          <Root />
        </SettingsProvider>
      </StrictMode>,
    );
  });
