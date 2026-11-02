# ROADMAP

## Phase A — Installation et compilation  *(en cours, bloquée : espace disque)*
- [x] Diagnostic de l'environnement (2026-11-02)
- [ ] Libérer / ajouter au moins **250 Go** sur un volume NTFS avec sa propre lettre de lecteur
- [ ] Installer Visual Studio 2026 Community, le SDK Windows 10.0.28000 et les Debugging Tools
- [ ] Node 24.16+ (nvm), pnpm 11.11+, Python 3 (python.org), `core.longpaths` / `core.autocrlf false`
- [ ] Forker `brave/brave-core`, cloner dans `<lecteur>:\nopro\src\brave`
- [ ] `pnpm install` puis `pnpm run init`
- [ ] `pnpm run build` (Component)
- [ ] `pnpm start` : validation selon `TEST_PLAN.md` § A

## Phase B — Cartographie technique
- [ ] Vérifier l'existence et le rôle réel de : `brave/browser/ui/`, `…/views/`, `…/webui/`, `brave/components/`,
      `brave/chromium_src/`, `brave/patches/`, `chrome/browser/ui/`, `ui/views/`
- [ ] Identifier : BrowserView et son layout, frame, TabStrip/TabStripModel, omnibox, BrowserCommandController,
      Side Panel, sidebar Brave, NTP, settings
- [ ] Étudier le WebUI Tab Strip de Chromium comme modèle
- [ ] Remplir `CODEBASE_MAP.md` et réviser `ARCHITECTURE.md`

## Phase C — Premier prototype
- [ ] Feature `kNoproShell` + layout personnalisé
- [ ] Sidebar WebUI : liste d'onglets, ouvrir/fermer/activer
- [ ] Navigation : URL, précédent/suivant, recharger (commandes natives)
- [ ] Contenu web natif inchangé

## Phase D — Refonte avancée
Menus, espaces de travail, panneaux modulaires, thèmes, animations, page d'accueil, intégration des maquettes.

## Phase E — Compatibilité
Mise en place et exécution systématique de `TEST_PLAN.md`, avec mesures de performance, de permissions et de sécurité.
