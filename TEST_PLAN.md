# TEST_PLAN

## Exécuté le 2026-11-02 (sans Brave)

Un faux client Node lance le vrai `calti-host.exe` comme le ferait Brave et parle le protocole Native Messaging.
L'interface est pilotée par CDP (WebView2 `--remote-debugging-port`).

| Test | Résultat |
|---|---|
| `cargo build --workspace` sans avertissement | ✅ |
| `npm run build` (tsc + Vite) | ✅ |
| Hôte lancé avec une origine inconnue → refus, code 1 | ✅ |
| Instantané initial affiché (onglets, onglet actif, favoris) | ✅ |
| Nouvel onglet poussé par l'extension → affiché en temps réel | ✅ |
| Clic sur un onglet → `activateTab` reçu par l'extension | ✅ |
| Bouton fermer → `closeTab` reçu, liste mise à jour | ✅ |
| Fermeture du port (Brave fermé) → interface « En attente de Brave » | ✅ |
| `node.exe` se connecte au pipe → refusé et déconnecté | ✅ |
| `openUrl` avec `javascript:` → refusé côté Rust | ✅ |
| Champ inconnu dans une commande → refusé | ✅ |
| Deux profils connectés en même temps, sélecteur de profil | ✅ |
| Commande envoyée au seul profil affiché | ✅ |
| Nom, accent, titre, police, ton, image de fond, voile par profil, conservés dans le stockage | ✅ |
| Fond sombre : texte des cartes clair sur verre fumé (#f1f5fa sur rgba(14,22,32)) | ✅ |
| Migration nopro → calti (réglages, image) | ✅ |
| Guide de connexion : profils Brave lus, extension absente détectée | ✅ |

## À faire avec le vrai Brave

1. Bouton « Ouvrir les extensions » : `brave://extensions` s’ouvre dans le bon profil (non testé, pour ne pas ouvrir d’onglet dans ton Brave).
2. Charger `extension/` dans les deux profils : ils apparaissent sous leur nom Brave.
3. Ouvrir, fermer, déplacer des onglets dans Brave : mise à jour immédiate.
4. Cliquer un onglet dans le cockpit : Brave l'active et passe au premier plan.
5. Recherche (moteur par défaut de Brave), adresse, raccourcis, favoris : nouvel onglet dans le bon profil.
6. Précédent / suivant / recharger sur l'onglet actif.
7. Fermer puis rouvrir Brave, puis le cockpit : reconnexion automatique dans les deux sens.
8. Effet acrylique de la fenêtre et rendu réel (les captures CDP ne montrent pas l'arrière-plan Windows).
