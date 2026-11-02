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

## Pont Brave (en sommeil)

L’extension, l’hôte Native Messaging et le pipe restent dans le dépôt mais l’interface ne les utilise plus.

## Chaîne de communication (pont Brave)

```
Brave (profil Personnel) ─ extension MV3 ─ stdio ─ calti-host.exe ─┐
                                                                     ├─ pipe \\.\pipe\calti ─ calti.exe (Tauri) ─ événements ─ React
Brave (profil Pro)       ─ extension MV3 ─ stdio ─ calti-host.exe ─┘
```

| Élément | Dossier | Rôle |
|---|---|---|
| Extension MV3 | `extension/` | Lit onglets et favoris, observe leurs changements, exécute les commandes (activer, fermer, ouvrir, rechercher, naviguer). Un identifiant de profil stable est généré une fois (`chrome.storage.local`). |
| Hôte Native Messaging | `host/` | Lancé par Brave pour chaque profil. Relaie les trames JSON entre stdin/stdout et le pipe nommé, se reconnecte toutes les secondes si l'application est fermée. |
| Crate partagée | `crates/bridge/` | Nom du pipe, ID d'extension, lecture/écriture des trames, vérification des processus. |
| Application | `app/src-tauri/` | Serveur du pipe, un état par profil Brave, commandes `brave_state` / `brave_send`, événements `brave:profiles` / `brave:error`. |
| Interface | `app/src/` | React + CSS. Voir « Interface » ci-dessous. |

## Sécurité de la liaison

- Aucun port réseau : pipe nommé local, `reject_remote_clients`, `first_pipe_instance` (pas d'usurpation du nom).
- L'application n'accepte comme client que `calti-host.exe` situé dans **son propre dossier** ; l'hôte n'accepte comme
  serveur que `calti.exe` situé dans **son propre dossier** (vérification par PID → chemin de l'exécutable).
- Le manifeste de l'hôte limite `allowed_origins` à l'extension ; l'hôte revérifie l'origine passée par Brave.
- Les trames sont limitées (8 Mio, 1 Mio vers l'extension) et doivent être du JSON valide.
- Côté Rust, les messages sont typés (`protocol.rs`) ; les commandes refusent les champs inconnus,
  les URL non http(s) et les recherches vides. L'extension revalide aussi chaque commande.

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

Personnalisation par profil Brave :
- Réglages : image de fond (flou), ambiance (voile teinté, vignette, grain, halo), titre, police, accent, verre.
- Éditeur de disposition : position et taille de chaque bloc, blocs de texte libres, modèles, et pour chaque bloc
  un style complet (fond verre/fumé/plein/aucun, opacité, flou, arrondi, texte clair/sombre, police, taille, graisse,
  espacement, majuscules, alignements, couleurs, police et couleur des passages *mis en valeur*, dégradé ;
  forme et bouton de la recherche ; date de l’horloge).
