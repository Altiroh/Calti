# CODEBASE_MAP

| Chemin | Rôle |
|---|---|
| `Cargo.toml` | Workspace Rust (sans infos de débogage en dev : disque C: presque plein) |
| `crates/bridge/src/lib.rs` | Pipe, ID d'extension, trames, vérification des exécutables |
| `host/src/main.rs` | Hôte Native Messaging (relais stdio ↔ pipe) |
| `app/src-tauri/src/brave.rs` | Serveur du pipe, état par profil, commandes Tauri |
| `app/src-tauri/src/protocol.rs` | Messages typés et validation |
| `app/src-tauri/tauri.conf.json` | Fenêtre (sans cadre, transparente, acrylique), CSP |
| `app/src/brave/` | Types du protocole et hook `useBrave` |
| `app/src/settings/` | Réglages d'environnement par profil, images de fond |
| `app/src/components/`, `app/src/widgets/` | Interface |
| `app/src/styles/` | Jetons de design, matériau verre, disposition |
| `extension/` | Extension MV3 (`manifest.json`, `background.js`) |
| `scripts/register-host.ps1` | Enregistrement de l'hôte pour Brave (HKCU) |
