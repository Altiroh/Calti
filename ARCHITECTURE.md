# ARCHITECTURE

Calti : navigateur Windows personnel (Tauri 2 + React). Les pages s’affichent dans Calti : chaque onglet est
une vue WebView2 (moteur Chromium de Windows) posée dans la fenêtre, à l’emplacement de la zone de contenu de
son volet. Deux profils, **Personnel** et **Pro**, ont chacun leur dossier de données (cookies, connexions,
historique) dans `%LOCALAPPDATA%\fr.calti.app\profiles\`. Ils s’affichent seuls ou côte à côte.

## Navigateur intégré

| Élément | Fichier | Rôle |
|---|---|---|
| Gestionnaire d’onglets | `app/src-tauri/src/browser.rs` | Crée/ferme les vues, les place et les masque, navigation, titres, liens « nouvelle fenêtre » → nouvel onglet |
| État du navigateur | `app/src/browser/useBrowser.ts` | Onglets, volets, vue partagée, placement (ResizeObserver), restauration de session |
| Volet | `app/src/components/BrowserPane.tsx` | Barre d’onglets, ← → ⟳ ⌂, barre d’adresse (Ctrl+L), accueil quand aucun onglet |
| Adaptateur | `app/src/browser/adapter.ts` | Présente les onglets d’un profil aux widgets de l’accueil |
| Favoris | `setup.rs` (`brave_bookmarks`) | Lecture seule du fichier « Bookmarks » d’un profil Brave choisi dans les Réglages |

Les pages sont des vues natives au-dessus de l’interface : les tiroirs repoussent les volets, et l’éditeur de
disposition masque les pages. Recherche : Brave Search.

## Fonctions de navigateur (`app/src-tauri/src/features.rs`)

Installées sur chaque onglet (événements WebView2) :
- **Téléchargements** : le petit panneau de WebView2 est masqué, Calti suit chaque fichier (progression, fin,
  annulation) et l’affiche dans son panneau (Ctrl+J).
- **Blocage des publicités et traqueurs** : requêtes vers une liste de domaines publicitaires et de mesure
  d’audience refusées (sauf la page elle-même) ; activé par profil, suspendu site par site (bouclier de la barre).
- **Zoom** mémorisé par site et par profil (`zoom.json`), réappliqué à chaque changement de page.
- **Son** : onglet qui joue du son, son coupé.
- **Données du profil** : effacement (historique, cookies, cache…) et autorisations des sites (caméra, micro…).

## Lancement (`app/src-tauri/src/launch.rs`)

Une seule instance : relancé avec un lien (navigateur par défaut), Calti l’ouvre dans un onglet de la fenêtre
principale. « Faire de Calti le navigateur par défaut » (Réglages → Général) le déclare à Windows (HKCU), puis
ouvre les paramètres de Windows, seuls à pouvoir fixer ce choix.

## Brave

Brave n’est plus relié en direct (l’ancien pont extension + hôte Native Messaging a été retiré le 2026-11-03).
Calti lit seulement ses fichiers pour reprendre favoris, historique, sites fréquents et mots de passe
(`brave_import.rs`, `setup.rs`).

## Interface (`app/src/`)

| Fichier | Contenu |
|---|---|
| `styles/tokens.css` | Couleurs, verre, rayons, durées : le point d'entrée pour retoucher l'apparence |
| `styles/glass.css` | Matériau Liquid Glass (`.glass`, `.inset`) |
| `styles/layout.css` | Grille de la fenêtre et décor (brume, reliefs, image de fond) |
| `components/` | Barre supérieure, rail, recherche, en-tête, tiroirs Favoris et Réglages |
| `widgets/` | Cartes de l'accueil : onglet actif, onglets, favoris, accès rapide |
| `settings/layout.ts` | Grille de l’accueil (12 colonnes), disposition par défaut, tailles minimales |
| `components/HomeGrid.tsx` | Rendu de la grille et édition (déplacer, agrandir, masquer, aimantation) |
| `components/LayoutEditor.tsx` | Page d’édition de la disposition (ouverte depuis Réglages) |
| `components/HomeBlocks.tsx` | Contenu de chaque bloc |
| `components/Inspector.tsx` | Inspecteur : fond, typographie, recherche, horloge du bloc sélectionné |
| `components/RichText.tsx` | Texte enrichi (*mise en valeur*, dégradé, polices) |
| `settings/presets.ts` | Modèles de mise en page (Tableau de bord, Centré, Éditorial, Minimal) |
| `motion.ts`, `styles/motion.css` | Transitions de vue, reflet sous le pointeur, parallaxe |
| `config/shortcuts.ts` | Raccourcis de l'accès rapide |
| `settings/` | Réglages d'environnement par profil (localStorage) et images de fond (IndexedDB) |

Personnalisation (commune à l’application ; par profil : nom, couleur, source des favoris) :
- Réglages : image de fond (flou), ambiance (voile teinté, vignette, grain, halo), titre, police, accent, verre.
- Éditeur de disposition : position et taille de chaque bloc, blocs de texte libres, modèles, et pour chaque bloc
  un style complet (fond verre/fumé/plein/aucun, opacité, flou, arrondi, texte clair/sombre, police, taille, graisse,
  espacement, majuscules, alignements, couleurs, police et couleur des passages *mis en valeur*, dégradé ;
  forme et bouton de la recherche ; date de l’horloge).
