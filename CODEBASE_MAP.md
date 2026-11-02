# CODEBASE_MAP

> **Rien n'est encore vérifié** : le code source n'est pas cloné. Cette carte sera remplie en Phase B
> à partir du code réel. Version cible actuelle : brave-core `master`, Chromium **157.0.8103.30**
> (lu dans `brave-core/package.json` le 2026-11-02).

## Points de recherche (à vérifier)

| Chemin | Hypothèse | Vérifié |
|---|---|---|
| `brave/browser/ui/views/frame/` | `BraveBrowserView` et le layout de fenêtre Brave | ☐ |
| `brave/browser/ui/views/tabs/` | Personnalisations du tab strip (onglets verticaux Brave) | ☐ |
| `brave/browser/ui/views/sidebar/` | Sidebar Brave | ☐ |
| `brave/browser/ui/views/location_bar/`, `omnibox/` | Barre d'adresse Brave | ☐ |
| `brave/browser/ui/webui/` | WebUI Brave (NTP, settings, panneaux) | ☐ |
| `brave/components/` | Shields, Rewards, Wallet, VPN, Leo, Sync… | ☐ |
| `brave/chromium_src/` | Overrides de fichiers Chromium à la compilation | ☐ |
| `brave/patches/` | Patches appliqués à Chromium | ☐ |
| `chrome/browser/ui/views/frame/browser_view.*` | `BrowserView`, `BrowserViewLayout` | ☐ |
| `chrome/browser/ui/tabs/tab_strip_model.*` | Modèle d'onglets | ☐ |
| `chrome/browser/ui/browser_commands.*`, `browser_command_controller.*` | Commandes (retour, recharger…) | ☐ |
| `chrome/browser/ui/webui/tab_strip/` | WebUI Tab Strip (modèle de référence) | ☐ |
| `ui/views/` | Framework Views | ☐ |

## Inventaire de nos modifications

| Fichier | Type (nouveau / chromium_src / patch) | Raison |
|---|---|---|
| — | — | — |
