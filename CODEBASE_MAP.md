# CODEBASE_MAP

| Fichier | Rôle |
|---|---|
| `app/src-tauri/src/main.rs` | Point d’entrée, commandes, instance unique, imports en ligne de commande |
| `app/src-tauri/src/browser.rs` | Onglets (vues WebView2), fenêtres, placement, veille |
| `app/src-tauri/src/native.rs` | Raccourcis captés dans les pages, liens en arrière-plan, plein écran, barre des tâches |
| `app/src-tauri/src/features.rs` | Téléchargements, blocage, zoom par site, son, autorisations, effacement des données |
| `app/src-tauri/src/launch.rs` | Liens reçus au lancement, navigateur par défaut |
| `app/src-tauri/src/clipboard.rs` | Copies récentes (surveillance du presse-papiers) |
| `app/src-tauri/src/suggest.rs` | Suggestions des moteurs de recherche |
| `app/src-tauri/src/brave_import.rs`, `setup.rs` | Reprise des données de Brave (lecture seule) |
| `app/src/` | Interface React (voir ARCHITECTURE) |
| `scripts/install.ps1` | Installation pour l’utilisateur courant |
| `scripts/tests/` | Scénarios de test sur une instance isolée (`run.ps1 <scénario>`) |
