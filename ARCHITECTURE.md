# ARCHITECTURE

> Statut : **proposition initiale (Phase A, avant cartographie du code réel)**.
> Les chemins et classes ci-dessous sont issus de la connaissance publique de Chromium/Brave ;
> ils seront **vérifiés dans le code source** en Phase B et ce document sera corrigé en conséquence.

Nom de code provisoire : `nopro` (à remplacer par le nom définitif du navigateur).

## 1. Principes

1. **Le moteur ne change pas.** Blink, V8, réseau, sandbox, isolation de sites, TLS, Safe Browsing : intouchés.
2. **On remplace la présentation, pas la logique métier.** Toute nouvelle UI est un *client* des modèles
   natifs existants : `TabStripModel`, `Browser`/`BrowserCommandController`, `BookmarkModel`,
   `HistoryService`, `DownloadManager`, `ProfileManager`, Shields, etc. Aucun second système d'onglets,
   de favoris ou de téléchargements.
3. **Surface de patch minimale.** Ordre de préférence pour toute modification :
   1. code nouveau dans `src/brave/browser/ui/nopro/` (aucun conflit de rebase) ;
   2. sous-classe / point d'extension déjà exposé par Brave (`BraveBrowserView`, delegates, factories) ;
   3. override `brave/chromium_src/…` (mécanisme Brave de remplacement à la compilation) ;
   4. en dernier recours, un patch `brave/patches/*.patch`, le plus court possible et documenté.
4. **Réversibilité.** L'UI personnalisée est activée par un `base::Feature` (`kNoproShell`).
   Désactivée, on retrouve l'UI Brave d'origine : indispensable pour comparer et tester la non-régression.

## 2. Couches

```
┌──────────────────────────────────────────────────────────────────────┐
│ Fenêtre native (Views)  — cadre, barre de titre Win11, zones de drop │
│ ┌──────────────┐ ┌─────────────────────────────────────────────────┐ │
│ │ Sidebar      │ │ Barre d'outils / omnibox (Views, restylée)      │ │
│ │ (WebUI       │ ├─────────────────────────────────────────────────┤ │
│ │  top-chrome, │ │                                                 │ │
│ │  React/TS)   │ │  Contenu web : ContentsWebView natif            │ │
│ │  onglets,    │ │  (processus renderer sandboxé, inchangé)        │ │
│ │  espaces,    │ │                                                 │ │
│ │  panneaux    │ │                                                 │ │
│ └──────┬───────┘ └─────────────────────────────────────────────────┘ │
└────────┼─────────────────────────────────────────────────────────────┘
         │ Mojo (interfaces typées, chrome:// uniquement)
┌────────▼─────────────────────────────────────────────────────────────┐
│ Adaptateurs C++ « PageHandler » (browser process)                    │
│ → TabStripModel, BrowserCommands, BookmarkModel, DownloadManager…    │
└──────────────────────────────────────────────────────────────────────┘
```

| Couche | Technologie | Rôle |
|---|---|---|
| Shell de fenêtre | Chromium Views (C++) | Layout global, frame, intégration OS, focus, accessibilité, raccourcis |
| Omnibox | Views (restylée) | L'autocomplétion, l'IME, l'indicateur de sécurité et la saisie sont très liés à `OmniboxView` : on la restyle d'abord, et on ne la réécrira qu'avec une raison solide |
| Sidebar / onglets / espaces / panneaux | WebUI « top-chrome » React/TS | Itération rapide sur le design, animations CSS, maquettes faciles à intégrer |
| Pages internes (accueil, paramètres) | WebUI React/TS | Brave en a déjà (NTP, `brave://settings`) ; on remplace leur présentation |
| Logique métier | Services natifs Chromium/Brave | Inchangés |

### Pourquoi une approche hybride

| Critère | Views pur | WebUI pur | Hybride (retenu) |
|---|---|---|---|
| Vitesse d'itération du design | lente (recompilation C++) | rapide | rapide là où le design change le plus |
| Performance et latence d'entrée | excellente | correcte, avec un coût mémoire par surface | excellente sur le chemin critique (frame, omnibox, contenu) |
| Accessibilité, IME, focus | natifs | à reconstruire en partie | natifs là où c'est critique |
| Précédent dans Chromium/Brave | toute l'UI actuelle | WebUI Tab Strip, Side Panel, NTP Brave | Brave combine déjà les deux |
| Risque sécurité | faible | maîtrisable (Mojo, chrome:// seulement) | maîtrisable |

Chromium contient déjà un **WebUI Tab Strip** (`chrome://tab-strip.top-chrome`) adossé à `TabStripModel`
via un `PageHandler` Mojo. C'est le modèle de référence pour notre sidebar d'onglets ; il sera étudié
en Phase B.

## 3. Module de présentation (cible)

```
src/brave/browser/ui/nopro/
  nopro_features.{h,cc}            # base::Feature kNoproShell
  views/nopro_browser_view_layout  # disposition de la fenêtre (sidebar + toolbar + contenu)
  views/nopro_sidebar_host_view    # héberge la WebUI de sidebar
  webui/sidebar/                   # WebUIController + PageHandler (Mojo) → TabStripModel, commandes
  webui/sidebar/resources/         # React/TS (composants, thèmes, animations)
  theme/                           # tokens de design → ThemeProvider / ColorProvider (color mixers)
```

Les composants d'UI ne parlent **qu'aux interfaces Mojo** ; les adaptateurs C++ ne parlent qu'aux
services natifs. Remplacer un composant visuel ne touche donc ni les services ni la sécurité.

## 4. Thèmes

Thèmes fondés sur le pipeline couleur de Chromium (`ColorProvider` / color mixers) : une seule source de
tokens alimente les Views (C++) et la WebUI (variables CSS générées). On ne crée pas de second système de thèmes.

## 5. Sécurité (non négociable)

- Sandbox, isolation de sites, vérification TLS, Safe Browsing, CSP des WebUI : **jamais désactivés**.
- Interfaces Mojo exposées **uniquement** aux origines `chrome://` / `brave://` de nos WebUI, jamais au contenu web distant.
- Les PageHandlers valident toutes les entrées (IDs d'onglets, URLs) comme si elles étaient hostiles.
- Toute modification de code sensible est justifiée dans `DEVELOPMENT_LOG.md`.

## 6. Mises à jour Brave/Chromium

- Notre fork de `brave-core` suit l'amont ; notre travail vit sur une branche (`nopro/main`) rebasée
  régulièrement sur les tags de release Brave.
- `pnpm run sync` met à jour Chromium à la version épinglée par `brave-core/package.json`.
- Nos modifications restent concentrées dans `browser/ui/nopro/` pour limiter les conflits ; chaque
  patch/override est inventorié dans `CODEBASE_MAP.md`.
- Cadence cible : suivre chaque release stable Brave (correctifs de sécurité Chromium inclus) sous 1 à 2 semaines.

## 7. Licences et marques

- `brave-core` est sous **MPL-2.0** : nos fichiers modifiés restent MPL-2.0 et leur source doit être publiée
  si le navigateur est distribué. Chromium : licence BSD et dépendances tierces (voir `about:credits`).
- Les **marques Brave** (nom, logo, lion, icônes) ne sont pas couvertes par la licence de code : elles
  doivent être remplacées avant toute distribution (`brave/app/theme/`, chaînes `IDS_PRODUCT_NAME`, etc.).
- Les **services serveur Brave** (Sync, Rewards, VPN, Leo, Wallet, News, mises à jour, statistiques) dépendent
  d'infrastructures et de clés Brave : statut à auditer service par service (voir `FEATURE_COMPATIBILITY.md`).
