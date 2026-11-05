# DEVELOPMENT_LOG

## 2026-11-02 — Diagnostic initial de l'environnement

Machine : Windows 11 Business 10.0.26200, Intel i7-9850H (6 cœurs/12 threads), 31,7 Go de RAM,
un seul volume C: (NTFS, 476 Go, **3 Go libres**).

| Outil | Constaté | Requis (sources officielles, 2026-11-02) | État |
|---|---|---|---|
| Espace disque | 3 Go libres | ≥ 100 Go selon Chromium ; ~250 Go conseillés pour Brave + build | ❌ **bloquant** |
| Git | 2.56.0 | ≥ 2.41 (pas celui de depot_tools) | ✅ |
| Git `core.autocrlf` | true | false | ⚠️ |
| Git `core.longpaths` | non défini | true (recommandé) | ⚠️ |
| Visual Studio | absent | VS 2026 (18.x) privilégié, VS 2022 accepté ; Desktop C++ + ATL/MFC | ❌ |
| Windows SDK | 10.0.18362 seul | 10.0.28000 (`vs_toolchain.py` de Chromium 157.0.8103.30) | ❌ |
| Debugging Tools | absents | ≥ 10.0.26100.3323 | ❌ |
| Python | alias Microsoft Store seulement | Python 3 (python.org) | ❌ |
| Node.js | 20.19.1 (nvm) | ≥ 24.16.0 < 25 (`brave-core/package.json` devEngines) | ❌ |
| pnpm | 10.28.2 | ≥ 11.11.0 | ❌ |
| Mode développeur Windows | activé | requis | ✅ |
| Long paths Windows (registre) | désactivé | non exigé si chemin court (`X:\nopro`) | ℹ️ |

Constats annexes :
- Le dossier projet actuel contient un caractère non-ASCII (`Développement`) : il ne doit **pas**
  accueillir les sources. Les sources iront dans un chemin court, sans espaces, à la racine d'un lecteur.
- Espace récupérable repéré : `AppData\Local\Docker` 53,4 Go, `npm-cache` 5,1 Go, `Downloads` 3,4 Go, `pnpm` 1,5 Go.
  Même tout libéré, cela ne suffit pas pour un build confortable : un **second disque** est recommandé.

### Libération d'espace (2026-11-02, à la demande de l'utilisateur)
- `npm cache clean --force` : 4,7 Go libérés.
- `pnpm store prune` : rien n'a été supprimé, car le store (1,5 Go) est encore référencé par des projets existants.
- Docker : le fichier `docker_data.vhdx` (53 Go) contient des **données de travail**
  (volumes `sigimage_db_data`, `local_pg`, `local-dev_pg`, Keycloak) : il **n'est pas supprimé**.
  Ont été supprimés : tout le cache de build (`docker builder prune -a`, 25,75 Go) et les images orphelines,
  puis un `fstrim` a été lancé. Les images, conteneurs et volumes sont conservés.
- Docker et WSL ont été arrêtés. L'espace ne revient à Windows qu'après compactage du disque
  virtuel (`Optimize-VHD`), ce qui demande les droits **administrateur** : à faire par l'utilisateur.

Sources : wiki brave-browser « Windows Development Environment », README de brave-core,
`docs/windows_build_instructions.md` de Chromium, `build/vs_toolchain.py` au tag 157.0.8103.30.

## 2026-11-02 — Changement d'approche : application compagnon

Le projet ne compile plus Brave : une application Tauri 2 pilote Brave via une extension MV3 et Native Messaging.
`FEATURE_COMPATIBILITY.md` (audit du fork) est retiré ; il reste dans l'historique git.

- Rust 1.99.1 installé (rustup, profil minimal, toolchain MSVC). MSVC 14.27 (VS 2019) et le SDK 10.0.18362 suffisent.
- Disque C: : 3,1 Go libres après compilation (`target/` ≈ 1,3 Go, sans infos de débogage). Toujours critique.
- Hôte enregistré sous `HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.nopro.cockpit`,
  manifeste dans `%LOCALAPPDATA%\NoproCockpit\`.
- Extension : ID fixe `djgdkiajnehmpnnnanbojdmgndcmendg` grâce à la clé publique du manifeste
  (la clé privée n'a pas été conservée : inutile tant que l'extension n'est pas empaquetée).
- Demandes ajoutées en cours de route : références graphiques (verre givré clair), deux profils Brave
  (Personnel / Pro) connectés simultanément, environnement d'accueil personnalisable par profil.
- Corrigé pendant les tests : nom du pipe mal échappé ; ordre d'import CSS (`.glass` écrasait la position des tiroirs).
- Non vérifié : fonctionnement avec le vrai Brave, rendu de l'effet acrylique (voir TEST_PLAN).

## 2026-11-02 — Calti, lisibilité sur fond sombre, guide de connexion

- Projet renommé **Calti** : `calti.exe`, `calti-host.exe`, pipe `\.\pipe\calti`, hôte `com.calti.host`
  (manifeste dans `%LOCALAPPDATA%\Calti\`), identifiant Tauri `fr.calti.app`. L'ancien hôte `com.nopro.cockpit`
  a été désenregistré ; les données WebView ont été déplacées de `%LOCALAPPDATA%\fr.nopro.cockpit` et
  `settings/migrate.ts` reprend les anciennes clés (à supprimer plus tard).
- Fond sombre : tout le matériau bascule (verre fumé, texte clair) via des jetons dans `tokens.css`.
  La luminance de l'image importée choisit le mode automatiquement.
- « Brave n'est pas connecté » : l'extension n'était chargée dans aucun profil. Brave n'autorise pas
  l'installation automatique d'une extension non publiée (seulement Web Store ou stratégies administrateur),
  d'où un chargement manuel unique par profil, guidé par la carte « Connecter Brave ».
- Les profils connectés prennent le nom du profil Brave, retrouvé dans le stockage local de l'extension.
- Extension chargée par l'utilisateur dans « Ewen Private » et « Développeur », mais aucun relais lancé :
  Brave sous Windows ne lit pas `HKCU\Software\BraveSoftware\…\NativeMessagingHosts` mais
  `HKCU\Software\Google\Chrome\NativeMessagingHosts` (chaînes trouvées dans `chrome.dll` de Brave 156,
  avec `SOFTWARE\Chromium\NativeMessagingHosts`). `register-host.ps1` utilise désormais la clé Chrome.
- Diagnostic : le relais lancé comme Chromium le fait (`cmd.exe /c "chemin"`) démarre et se connecte : le chemin
  accentué n'est pas en cause. L'hôte est enregistré sous les clés Chrome et Chromium ; l'extension (0.1.1)
  enregistre désormais sa dernière erreur Native Messaging, affichée par Calti dans « Connecter Brave »,
  et le relais écrit `%LOCALAPPDATA%\Calti\host.log`. Connexion réelle toujours non vérifiée.
- Demande de l'utilisateur : personnalisation complète de la disposition. Éditeur en grille (12 colonnes,
  rangées de 28 px) : déplacer, agrandir, masquer/réafficher, grille visible, aimantation, pas de chevauchement,
  disposition par profil. Testé par vrais événements souris (CDP) : déplacement, agrandissement, masquage,
  enregistrement. Transitions de vue (changement de profil, édition), reflet sous le pointeur, parallaxe.
- Erreur remontée par l'extension 0.1.1 : « Specified native messaging host not found », malgré un manifeste
  valide enregistré sous les clés Chrome, Chromium et BraveSoftware. Une instance Brave neuve (profil temporaire,
  `--load-extension`) lance pourtant le relais et se connecte à Calti (onglets et favoris reçus) : registre,
  manifeste et chemin accentué sont corrects. L'instance de l'utilisateur, démarrée à 08h32 avant tout
  enregistrement, ne voit pas l'hôte : redémarrage complet de Brave demandé.
- Demande : pouvoir recréer des pages d'accueil type « landing » (références BridgeAI, Anything, Synecdoche…).
  Ajouts : blocs de texte libres, inspecteur de style par bloc, texte enrichi (*mise en valeur*, dégradé, polices
  mixtes), recherche stylable (pilule, bouton coloré, invite), ambiance du fond (teinte, vignette, grain, halo),
  modèles de mise en page. Correctif : la couleur du verre était calculée sur la racine, si bien qu'une opacité
  locale (bloc, tiroir) restait sans effet ; elle est désormais calculée sur chaque élément `.glass`.
  Vérifié en recréant « Bridge the gap » via l'éditeur (CDP), réglages de l'utilisateur sauvegardés puis restaurés.
- Démarrage automatique de Brave : si aucun profil n'est connecté, une adresse (accès rapide, favori, saisie)
  lance `brave.exe --profile-directory=<dernier profil> <adresse>` ; une recherche est mise en attente jusqu'à la
  connexion (25 s max). Non vérifié de bout en bout : Brave était déjà ouvert au moment du test.
- Brave redémarré par l'utilisateur à 16h31 : « Ewen Private » échoue toujours (« host not found »), alors qu'un
  profil neuf trouve l'hôte. Cause liée au profil, non identifiée : journal de Brave (`--enable-logging --v=1`) demandé.
- Brave relancé par Calti (`--profile-directory="Profile 1" --enable-logging --v=1`) : relais lancé, connexion
  établie. « Ewen Private » (17 onglets, favoris) et « Développeur » connectés simultanément, nommés
  automatiquement d'après Brave. Cause de l'échec de l'instance de 16h31 non identifiée (le journal ne contient
  aucune ligne Native Messaging en v=1) ; si cela se reproduit, l'erreur s'affiche dans « Connecter Brave ».

## 2026-11-02 — Navigateur intégré

Demande : naviguer dans Calti, onglets dans Calti, deux navigateurs simultanés, Brave invisible.
- Essai d'incrustation de fenêtres Brave (`--app`) : en fenêtre enfant, elles ne s'affichent pas dans la fenêtre
  transparente de Calti ; en fenêtre attachée, faisable mais fragile (décalage, focus, tiroirs impossibles
  par-dessus). Choix de l'utilisateur : moteur intégré (WebView2).
- Chaque onglet est une vue WebView2 enfant (`tauri` feature `unstable`, `Window::add_child`), deux profils à
  dossiers de données séparés, vue côte à côte, session restaurée, favoris lus dans le fichier de Brave.
- Vérifié à l'écran (capture de la vraie fenêtre) : page affichée dans le volet, vue partagée Personnel/Pro,
  tiroir qui repousse les pages, dossiers de profils distincts. Réglages migrés : Personnel ← « default »,
  Pro existant (image recopiée). Corrigé : restauration en double après rechargement de l'interface.
- Limites connues : coins des pages carrés, pas d'extensions (bloqueur de pubs), pas d'état « précédent
  possible », fenêtres pop-up (connexion OAuth) ouvertes en onglet.
- Finitions : pages aux coins arrondis (région Win32 sur la fenêtre native de chaque vue, appliquée seulement
  à une fenêtre enfant), fond transparent (pas de flash blanc), nouvelle page affichée avant de masquer
  l'ancienne. Ligne du haut supprimée : profils en pastilles rondes dans le rail (texte lisible selon
  l'accent), boutons de fenêtre au bout de la barre d'onglets, haut de fenêtre déplaçable (double-clic :
  agrandir). Fichiers locaux : `file:///…` et chemins Windows `C:\…` (vérifié avec un HTML local).
- Plusieurs fenêtres : chaque onglet appartient à une fenêtre ; bouton « détacher » d'un volet (les onglets
  du profil partent dans une nouvelle fenêtre sans rechargement, `Webview::reparent`), Ctrl+N pour une
  fenêtre vide. Réglages synchronisés entre fenêtres ; seule la fenêtre principale restaure sa session.
  Vérifié : détachement de Pro, onglet déplacé côté Rust et affiché dans la nouvelle fenêtre.
- Non vérifié : déplacement de la fenêtre à la souris (événement système, non simulable par CDP).
- Le style devient propre à l'application (demande de l'utilisateur) : fond, ambiance, typographie, accent,
  verre et disposition de l'accueil sont communs à tous les profils et à toutes les fenêtres. Chaque profil ne
  garde que son nom, sa couleur de repère (pastille, liseré du volet) et la source de ses favoris.
  Réglages au format `calti.settings.v3` ; l'ancien `calti.settings` est conservé. Migration : le style de
  Personnel devient celui de l'application, l'image de fond passe sous la clé `app`.

## 2026-11-03 — Version installée

- L'icône épinglée « Nopro Cockpit » pointait vers `target\debug\deps\nopro_cockpit.exe` (ancien nom, version
  de développement qui charge l'interface depuis Vite) : rien ne pouvait démarrer.
- Version autonome compilée (`npx tauri build --no-bundle`, profil release avec `strip`), installée par
  `scripts/install.ps1` dans `%LOCALAPPDATA%\Programs\Calti`, raccourci du menu Démarrer, icône épinglée redirigée.
- Réglages, image de fond et session repris de l'origine de développement (`localhost:1420`) vers celle de la
  version installée (`tauri.localhost`) par export/import CDP. Vérifié : lancement depuis l'icône épinglée,
  interface et données affichées.
- Mots de passe et formulaires : enregistrement et remplissage automatiques WebView2 activés sur chaque onglet
  (`ICoreWebView2Settings4`), séparés par profil. Non vérifié sur un vrai site (pas de connexion faite pendant les tests).
- Profils en nombre libre (`calti.settings.v3` : `profileOrder`, préférences par profil : nom, icône, couleur,
  moteur de recherche, page de nouvel onglet, favoris). Côté Rust, tout identifiant [a-z0-9-] est accepté.
  Vérifié : création d'un profil, bascule par le sélecteur, recherche DuckDuckGo dans son propre dossier de données.
- Interface : une seule barre par volet (navigation, adresse, onglets, fenêtre), barre latérale redimensionnable
  (64 px → 360 px ; large = libellés et onglets verticaux), sélecteur de profil dépliant, Réglages en deux onglets
  (Apparence, Profils), sélecteur de couleur intégré (palette, teinte/saturation/luminosité, hexadécimal).
- Les menus se déplient sur place : un menu flottant passerait sous les pages, qui sont des vues natives.
- Groupes d'onglets façon Brave : nom, couleur (9 couleurs Brave), repli ; clic droit sur un onglet ou un groupe
  pour les actions (affichées sur place dans la barre) ; un onglet ouvert depuis un groupe y entre ; groupes
  gardés dans la session ; groupes aussi dans la liste verticale de la barre latérale large.
- Réglages → Interface : barre du haut et barre latérale flottantes ou collées, fond verre/plein/aucun, arrondis,
  hauteur ; onglets (actif plein/contour/souligné, fermeture, icônes seules, arrondi, largeur) ; marges,
  espacements, arrondi des pages (aussi appliqué aux vues natives), animations ; CSS personnalisé appliqué en direct.
- Vérifié dans une instance isolée (WEBVIEW2_USER_DATA_FOLDER, profil jetable) : création, nommage, couleur,
  ajout, repli du groupe, session ; barre collée sans fond. Corrigé : bouton « + » étiré et onglets écrasés.

## 2026-11-03 — Raccourcis, veille des onglets, widgets, barre personnalisable

- Raccourcis captés aussi quand la page a le focus (`AcceleratorKeyPressed` de WebView2, `src-tauri/src/native.rs`) :
  F5 / Ctrl+R rechargent, Ctrl+F5, Maj+F5 et Ctrl+Maj+R rechargent sans le cache (`Page.reload` ignoreCache) ;
  Ctrl+T, W, N, L, D, F6, Ctrl+Tab et Ctrl+Maj+Tab sont transmis à l'interface (`browser:shortcut`).
  **Non vérifié** : les touches simulées par CDP ne passent pas par ce chemin, et l'envoi de vraies touches a
  échoué (fenêtre de test pas au premier plan, touches parties vers une autre fenêtre). À essayer à la main.
- Optimisation : un onglet caché passe en mémoire réduite (`SetMemoryUsageTargetLevel`), puis est suspendu après
  5 minutes (`TrySuspend`), réveillé à l'affichage ; les onglets restaurés au démarrage ne se chargent qu'une fois
  affichés (titre et adresse de la session gardés). Décor (brume, grain, parallaxe) en pause quand les pages
  couvrent tout, et toute animation en pause fenêtre réduite. Vérifié : onglet restauré `sleeping` puis chargé au clic.
  La suspension après 5 minutes n'a pas été observée.
- Favoris de Calti par profil (étoile dans l'adresse, Ctrl+D), en tête des favoris Brave. Historique par profil
  (400 entrées). Vérifié : ajout du favori, historique de deux pages.
- Barre du haut : adresse plus étroite (S/M/L), clic droit sur un espace libre → réglages sur place (boutons,
  widgets, largeur d'adresse, fond, flottante/collée). Sans fond, chaque élément garde une pastille de verre.
- Pastille de profil : couleur, dégradé classique (2 couleurs), dégradé multicolore (7 palettes) ou image
  (recadrée 256 px, IndexedDB `profile-<id>`).
- Accueil : « Bonjour, <profil>. » avec texte qui suit la taille du bloc ; nouveaux widgets Historique,
  Copies récentes, Notes ; horloge en 8 styles (classique, compte à rebours, volets, tambour, orbite, hologramme,
  néon, matrice). Orbite corrigée et vérifiée ; hologramme corrigé (lignes de balayage), rendu final non revu.
- Copies récentes (`src-tauri/src/clipboard.rs`) : textes, liens et images copiés dans Windows, 40 au plus ;
  les contenus marqués privés par les gestionnaires de mots de passe sont ignorés ; bouton pause. Vérifié avec un
  texte, un lien et une image.
- Widgets en raccourci dans la barre du haut et dans la barre latérale : le widget s'ouvre à côté de la page,
  qui se resserre. Vérifié : volet « Copies récentes » (barre du haut) et « Notes » (barre latérale).
- Mots de passe : vérifié dans l'instance de test, l'identifiant et le mot de passe d'un formulaire local sont
  enregistrés automatiquement (sans demande) dans `Login Data` du profil. Le préremplissage n'a pas été observé :
  avec deux comptes pour le même site, Chromium propose la liste au clic sur le champ.
- Retour utilisateur : les raccourcis de widgets ne restent que dans la barre latérale. Le clic droit sur la
  barre du haut ouvre un panneau flottant sous la barre (boutons, largeur d'adresse, fond, position) ; les pages
  sont masquées tant qu'il est ouvert, sinon elles passeraient par-dessus. Vérifié dans l'instance de test.
- Les boîtes de dialogue du navigateur (`window.confirm`) passent sous les pages natives : « Effacer » (historique,
  copies récentes) agit directement, et le retrait d'un profil se confirme sur place (deux clics).
- Historique : clic = onglet affiché, clic molette = nouvel onglet en arrière-plan, clic droit = menu déplié sous
  la ligne (ouvrir, nouvel onglet, arrière-plan, copier le lien, retirer). `openUrl` accepte `where`.
  Vérifié dans l'instance de test (événements simulés).
- Clic droit sur la barre du haut : menu natif de Windows (API menu de Tauri), affiché par-dessus les pages sans
  les masquer : précédent, suivant, recharger (avec ou sans cache), favori, copier l'adresse, nouvel onglet,
  nouvelle fenêtre, détacher, « Afficher dans la barre » (cases à cocher), « Personnaliser l'interface… ».
  Le panneau flottant de réglages est retiré. Vérifié dans l'instance de test (menu affiché sur la page).
- Barre latérale : boutons « Côte à côte » et « Favoris » retirés. La vue côte à côte passe dans le menu du clic
  droit de la barre du haut (« Deux profils côte à côte ») ; les favoris restent dans le widget Favoris.
- Plein écran (F11, y compris depuis une page) : fenêtre en plein écran, barre latérale et barre du haut masquées,
  pages sans marge ni arrondi. Seul reste le badge du profil, estompé (35 %), en haut à gauche ; au survol il
  s'élargit en « Quitter le plein écran ». Les pages sont découpées à cet endroit (région Win32 `RGN_DIFF`) pour
  qu'il reste visible au-dessus d'elles. Vérifié dans l'instance de test : bascule 1320×840 ↔ 1920×1080, badge
  estompé et état survolé (rendu de l'interface). Non vérifié à l'écran : la découpe dans la page, la fenêtre de
  test ne pouvant pas passer au premier plan.
- Onglets : clic droit = menu natif (nouveau groupe…, ajouter au groupe, retirer du groupe, recharger, dupliquer,
  copier l'adresse, fermer, fermer les autres) ; sur la pastille d'un groupe : nom et couleur…, replier, dissocier,
  fermer. « Nouveau groupe… » ouvre un dialogue sous l'onglet (nom, couleur de soulignement tirée au hasard),
  découpé dans les pages (plusieurs découpes par page désormais, avec arrondi). Les actions sur place dans la
  barre d'onglets sont retirées. Vérifié : dialogue, création du groupe nommé et coloré. Non vérifié à l'écran :
  la découpe au-dessus d'une page.
- Barre d'adresse réduite de 60 % au repos (moyenne : ~120 px au lieu de ~310 px), élargie pendant la saisie.
- Connexion Google depuis Pinterest restait blanche : chaque `window.open` devenait un onglet séparé, sans lien avec
  la page d'origine (`window.opener`). Les fenêtres surgissantes demandées avec une taille s'ouvrent désormais dans
  leur propre fenêtre WebView2 (même profil) ; les liens `target=_blank` restent des onglets. Vérifié avec une page
  locale : la fenêtre surgissante écrit à sa page d'origine puis se ferme ; un lien `_blank` ajoute un onglet.
  Non vérifié sur Pinterest même.
- Outil « Règle et grille » (façon Grid Ruler), raccourci de la barre latérale masqué par défaut (Réglages →
  Interface → widgets en raccourci). Injecté dans les pages affichées (`browser_eval`, shadow DOM, sans innerHTML
  pour les sites à Trusted Types) : règles haut et gauche, repères tirés des règles (déplaçables, double-clic ou
  retour sur la règle pour les retirer, gardés par site le temps de la session), coordonnées du pointeur, grille
  de colonnes (nombre, gouttière, largeur max, marges, couleur, opacité). Vérifié : grille de 12 colonnes,
  2 règles, repère créé par glisser, repère retrouvé après rechargement, outil retiré à la désactivation.
  Non confirmé : la mise à jour des coordonnées du pointeur.
- Plein écran corrigé : la barre latérale masquée laissait le contenu dans sa colonne de 0 px (page invisible).
  Grille à une seule colonne en plein écran. Vérifié : zone de page 1920×1078 en plein écran.
- Reprise de Brave (Réglages → Profils → « Reprendre depuis Brave », profil Brave associé au profil Calti) :
  historique (1000 pages au plus, sans doublon) et sites les plus visités (12, un par domaine, affichés dans
  l'accès rapide « Les plus visités »), lus dans une copie de la base `History`. Mots de passe : 84 des 85 du profil
  « Développeur » sont chiffrés en v20 (protection liée à Brave) et ne sont pas contournés ; on passe par l'export
  CSV de Brave, mis de côté puis importé au lancement suivant, avant WebView2 (base verrouillée sinon), et effacé
  aussitôt. Réécrits avec la clé du profil Calti, sans doublon (même site, même identifiant). Les connexions
  (cookies) ne sont pas reprises. Vérifié sur une copie de profil : import CSV, import direct v10, pas de doublon
  au second passage. Non vérifié : le bouton d'import dans la version installée.
- Liens : clic molette et Ctrl+clic ouvrent un nouvel onglet en arrière-plan (script de page + message WebView2),
  le volet reste sur sa page. Clic droit sur un lien : « Ouvrir dans un nouvel onglet » remplace « Ouvrir dans une
  nouvelle fenêtre ». Vérifié : onglets ajoutés sans changer l'affichage ni naviguer. Non vérifié : le menu du clic
  droit (natif, non pilotable par les outils de test).
- Barre latérale « bord renflé » (par défaut, appliquée une fois aux réglages existants) : liseré noir sur le bord
  gauche, bosse arrondie à hauteur des boutons, raccordée par des congés concaves. Vérifié en capture.
- Clic droit sur le bouton Recharger : menu natif (recharger, sans le cache, « Vider le cache et recharger » :
  `Network.clearBrowserCache` puis rechargement sans cache). Le menu contextuel par défaut de WebView2 est coupé
  sur l'interface (son « Actualiser » rechargeait Calti), sauf dans les champs de saisie. Vérifié : les deux
  rechargements rechargent la page ; menu par défaut bloqué.
- Bord renflé : surface au choix (couleur — noir par défaut, contenu clair ou sombre selon la couleur —, verre
  flouté, sans fond) ; les congés passent en masques radiaux pour que le verre s'y applique ; l'arrondi suit le
  réglage « Arrondi ». Vérifié en capture : noir, rose clair (icônes sombres), verre, sans fond.
- Barre des tâches : icône de la fenêtre = badge du profil affiché (image, dégradés, couleur, icône ou
  initiales, dessiné en PNG), titre « Calti — titre de la page » (ou nom du profil sur l'accueil). Vérifié :
  titre suivi, badge-image du profil dans la barre des tâches.
- Bord renflé, arrondi maximal : congé et coin de la bosse se chevauchaient (36 + 36 px > 52 px de bosse), d'où une
  encoche. Chacun est limité à 26 px (moitié de la bosse hors liseré). Vérifié en capture à 0 et 36.
- Liste des profils (barre latérale) : ouverture et fermeture fluides (hauteur animée 0 → contenu, profils en
  cascade) ; la bosse du bord renflé grandit avec. Mesuré : 6 → 46 px en ~400 ms, retour symétrique.
- Barre d'adresse : suggestions à la frappe — recherches passées du profil (mémorisées à chaque recherche,
  200 au plus), favoris, historique (sans les pages de résultats du moteur) ; flèches haut/bas, Entrée, clic.
  La liste est découpée dans la page pour rester visible. Vérifié : mémorisation, classement, sélection au
  clavier, rendu. Non vérifié à l'écran : la découpe au-dessus d'une page.
- Bord renflé : réglage d'opacité (couleur comme verre) ; sans réglage, couleur opaque et verre à l'opacité de
  l'interface. Vérifié en capture : verre 20 % / 90 %, noir 40 %.
- Barre des tâches, Calti épinglé : Windows affiche l'icône du raccourci et ignore celle de la fenêtre. Le badge
  du profil est désormais superposé à l'icône (`ITaskbarList3::SetOverlayIcon`, petit badge dans un coin).
  Vérifié : superposition visible sur l'icône de l'instance de test.
- Réglages réorganisés en trois onglets : Général (extensions en tuiles colorées avec icône, description et
  interrupteur — elles déterminent les raccourcis de la barre latérale —, raccourcis clavier, à propos), Profils
  (fiche en blocs Identité, Navigation, Brave, retrait en bas), Apparence (fond, couleurs, accueil, barre du haut,
  barre latérale, onglets, fenêtre, avancé, en groupes repliables, un seul ouvert à la fois). Vérifié en capture.
- Plein écran des vidéos (YouTube…) : WebView2 ne remplissait que la vue de l'onglet. L'événement
  `ContainsFullScreenElementChanged` passe la fenêtre en plein écran, page seule (sans barres, sans badge, l'autre
  volet masqué en vue partagée), et la rend à la sortie (sauf si F11 était actif). Vérifié : 1320×840 →
  1920×1080 (page 1920×1078, marge basse supprimée ensuite) → retour à 1320×840.
- Préréglages d'apparence (Réglages → Apparence → Préréglages) : enregistrement du style actuel (tout sauf la
  disposition et les textes de l'accueil ; image de fond copiée à part, clé `preset-<id>`), miniatures dessinées
  (fond, barre latérale, barre du haut, accent), aperçu au survol sur toute l'application sans enregistrement
  (aperçu tenu par le contexte des réglages), application au clic, suppression. Vérifié : enregistrement de deux
  préréglages, aperçu puis retour au style courant, application, suppression.
- Disque C: plein (0 octet libre) : l'édition de liens de la version release échouait (LNK1108). Libéré 1,2 Go
  en supprimant le cache incrémental de compilation (`target/debug/incremental`) et un ancien dossier WebView2 de
  test. Il reste très peu d'espace : à surveiller.
- Session : chaque fenêtre enregistre ses onglets (`calti.browser` pour la principale, `calti.browser.calti-n`
  pour les autres). Au lancement, la fenêtre principale rouvre les fenêtres secondaires encore ouvertes à la
  dernière fermeture, avec leurs onglets ; une fenêtre fermée par l'utilisateur est oubliée. Vérifié : arrêt brutal
  de l'application puis relance, fenêtres secondaires rouvertes avec leur onglet. La fenêtre principale gardait
  déjà ses onglets (15 avant, 15 après).
- Clic molette sur un profil (liste de la barre latérale) : nouvelle fenêtre sur ce profil.
- Onglets glissés au pointeur : l'onglet suit la souris au-dessus des autres, qui s'écartent ; lâché, il prend
  sa place (`browser_move`, ordre gardé dans la session ; posé dans un groupe, il le rejoint). Tiré loin de la
  barre ou hors de la fenêtre, il part seul dans une nouvelle fenêtre. Vérifié avec des mouvements de souris
  simulés : « un deux trois » → « deux trois un », puis « deux » sorti dans sa propre fenêtre.

## 2026-11-03 — Audit : fenêtres liées à leur contenu, performance

- Plein écran d'une vidéo : toutes les fenêtres passaient en plein écran et masquaient leurs volets. Deux causes :
  les événements d'onglet étaient diffusés à toutes les fenêtres, et `listen` de l'API JS de Tauri reçoit aussi
  ceux adressés aux autres fenêtres. Désormais : envoi à la seule fenêtre de l'onglet (`emit_to`), écoute par
  fenêtre (`getCurrentWebviewWindow().listen`), vérification que l'onglet est bien dans la fenêtre. Copies
  récentes envoyées à la seule fenêtre principale. Vérifié avec deux fenêtres : seule celle de la vidéo bascule.
- Icône des fenêtres secondaires : Windows les rangeait sous Calti épinglé, avec un seul badge. Chaque fenêtre
  secondaire reçoit l'identité de barre des tâches de son profil (AppUserModelID `fr.calti.app.profil.<id>`) :
  bouton propre avec l'icône du profil. Vérifié en capture de la barre des tâches.
- Audit (instance de test, version de développement, 4 pages chargées) :
  - aucune fuite d'écouteurs (422 stables après ramasse-miettes, sur trois tours d'utilisation) ;
  - session réécrite à chaque événement d'onglet (13 écritures en 8 s) → écriture regroupée toutes les 0,4 s,
    forcée à la fermeture, annulée quand l'utilisateur ferme une fenêtre secondaire : 2 écritures ;
  - événements d'onglets par rafales (titre, adresse, chargement) → regroupés côté Rust toutes les 40 ms ;
    recalculs de style 98 → 60 ;
  - suggestions : historique relu à chaque frappe → liste mise en cache tant que son texte stocké ne change pas,
    11,3 → 7,2 ms par frappe avec 1000 pages ;
  - fenêtre réduite : ses pages sont cachées, donc en mémoire réduite puis en veille après 5 minutes.
- Fenêtres secondaires impossibles à fermer : depuis l'écoute de leur fermeture (`onCloseRequested`), c'est
  l'interface qui ferme la fenêtre (`destroy`), permission absente des capacités. `core:window:allow-destroy`
  ajoutée. Installation faite après arrêt forcé de la fenêtre bloquée ; au relancement, les deux fenêtres sont
  revenues avec leurs onglets.
- Recherche de l'accueil : mêmes suggestions que la barre d'adresse (recherches passées, favoris, historique).
- Suggestions en ligne, comme un navigateur : demandées par Rust (WinHTTP, en-tête Accept JSON, adresse fixe par
  moteur, délais courts), car les pages ne peuvent pas les obtenir elles-mêmes (CORS). Réponses obtenues :
  Google, DuckDuckGo, Bing, Ecosia. Brave renvoie sa page HTML à tout client qui n'est pas un navigateur ; Calti
  ne se fait pas passer pour un autre : réglage « Fournies par » (moteur du profil, ou DuckDuckGo, Google, Bing,
  Ecosia), désactivables. Vérifié : « chat gpt » et « meteo par » proposent les suggestions de DuckDuckGo.
- Copies récentes en double : certains outils remplissent le presse-papiers en deux temps pour une seule copie.
  Le même contenu (empreinte du texte ou de l'image) n'est signalé qu'une fois. Vérifié : même image copiée deux
  fois, une seule entrée.
- Nouvel onglet (bouton +, Ctrl+T, y compris depuis une page) : le curseur va dans la recherche de l'accueil,
  ou dans la barre d'adresse si l'accueil n'en a pas ou si le nouvel onglet ouvre une adresse ; depuis une page,
  le focus clavier repasse d'abord à l'interface. Vérifié : focus sur la recherche après « + » et après Ctrl+T.
- Nouvelle icône : C fin ouvert vers le haut, dégradé bleu → violet → rose, point rose dans l'ouverture (choisi
  parmi plusieurs propositions). Dessinée par `scripts/icon.cjs` (PNG 1024 px, sans dépendance), déclinée par
  `npx tauri icon`.
- Fenêtres rouvertes au lancement à leur place : chaque fenêtre enregistre sa position, sa taille et son état
  agrandi ; à la fermeture, sa session est datée. Au lancement, les fenêtres ouvertes à l'arrêt ou fermées dans la
  minute précédant la fermeture de la principale (donc en quittant Calti) sont rouvertes avec leur état, leurs
  onglets et leur place (si l'écran est encore branché) ; une fenêtre fermée bien avant reste fermée.
- Disque plein : dossier `target/debug` supprimé (régénérable, ~2 Go) ; tests faits avec la version finale.
- Taille des fenêtres rouvertes : la taille extérieure était rendue comme taille intérieure (+16 × +9 px à chaque
  lancement) ; c'est la taille intérieure qui est enregistrée. Vérifié avant correction : position exacte des
  deux fenêtres rouvertes, onglets à leur place.
- L'icône de la fenêtre reste celle de Calti ; le badge du profil n'est plus qu'une pastille superposée.
- Icône épinglée restée l'ancienne (cache de Windows) : `scripts/install.ps1` réenregistre désormais le raccourci
  épinglé et notifie l'Explorateur (`SHChangeNotify`). Vérifié en capture : nouvelle icône et pastille du profil.
- Fenêtre secondaire perdue au relancement : lors de l'installation précédente, c'est l'ancienne version qui a été
  fermée, et elle oubliait toute fenêtre secondaire fermée. Avec la nouvelle : une fenêtre rouverte reprend son nom
  (donc sa clé de session ; les suivantes sont numérotées après), et la tolérance « fermée en quittant » passe à
  10 minutes. Vérifié dans les deux ordres de fermeture : fenêtre rouverte, même nom, même position, son onglet.
- Copies récentes : durée de conservation réglable (1 heure, 1 jour, 7 jours par défaut, 30 jours, sans limite),
  Réglages → Général ; au-delà, suppression automatique (au lancement, toutes les dix minutes, à chaque copie et au
  changement de durée), images comprises. Vérifié : avec 1 heure, une copie de 3 heures est supprimée.

## 2026-11-03 — Fonctions de navigateur, navigateur par défaut, nettoyage

Suite de l'audit (« Fais tout ce que tu peux faire ») :
- Téléchargements : suivis par Calti (`features.rs`, événements WebView2), panneau Ctrl+J (progression, ouvrir,
  afficher dans le dossier, annuler, effacer la liste) ; un message signale chaque téléchargement lancé.
- Blocage des publicités et traqueurs : requêtes vers ~180 domaines publicitaires et de mesure d'audience
  refusées (pas la page elle-même), cadres compris. Activé par profil (Réglages → Profils → Confidentialité) ;
  bouclier dans la barre d'adresse avec le nombre d'éléments bloqués, clic = suspendre sur ce site.
  Limite : une liste de domaines ne bloque pas les publicités servies par le site lui-même (YouTube).
- Zoom mémorisé par site et par profil (Ctrl+molette, Ctrl+plus/moins, Ctrl+0, menu de la barre), pastille
  « 125 % » dans la barre (clic = 100 %).
- Son : icône sur l'onglet qui joue du son, clic pour couper ; aussi dans les menus.
- Onglets fermés (25 derniers, communs aux fenêtres) : Ctrl+Maj+T, menus de l'onglet et de la barre, palette.
- Ctrl+1…8 (n-ième onglet), Ctrl+9 (dernier), Ctrl+H (historique), Ctrl+J, Ctrl+K, y compris depuis une page.
- Palette de commandes (Ctrl+K) : onglets ouverts, commandes, onglets fermés, historique, favoris, recherche.
- Confidentialité par profil : effacement des données choisies (confirmation sur place), autorisations des sites
  (autorisé, bloqué, redemander).
- Navigateur par défaut : instance unique (un second lancement passe ses liens à la fenêtre principale),
  liens et fichiers reçus en argument ouverts dans des onglets ; bouton qui déclare Calti à Windows (HKCU) puis
  ouvre « Applications par défaut ». Une instance d'essai (dossier WebView2 isolé) reste indépendante.
- Sauvegarde des réglages : export et import d'un fichier JSON (sessions d'onglets et images exclues).
- Nettoyage : pont Brave en sommeil retiré (`crates/bridge`, `host`, `extension`, `brave.rs`, `protocol.rs`,
  `register-host.ps1`) ; la liste des profils Brave n'est plus relue toutes les 4 secondes (au focus seulement).
- Tests dans le projet : `scripts/tests/` (`run.ps1` lance une instance isolée, `cdp.cjs` la pilote,
  `features.test.cjs` vérifie les fonctions ci-dessus).
- Zoom : WebView2 ne signale pas les changements de zoom de ces vues, et Ctrl+molette y est désactivé. Calti gère
  donc lui-même Ctrl+molette (script de page), Ctrl+Plus/Moins (pavé compris) et Ctrl+0, et retient le zoom aussitôt.
  Réglages → Général → « Zoom des pages » : zoom par défaut, sites qui ont leur propre zoom (« Oublier ») ; menu
  « Zoom de la page » dans le clic droit de la barre du haut.
- Ctrl+K reste aux sites qui l'utilisent (GitHub, Slack…) : depuis une page, la palette s'ouvre avec Ctrl+Maj+K.
  Ctrl+1…9 suivent la touche physique (clavier AZERTY).
- Bouton « Détacher » retiré de la barre (l'action reste dans le clic droit de la barre).
- Vérifié (`scripts/tests/run.ps1 features.test.cjs`) : 19/19 — lien reçu au lancement, Ctrl+2, Ctrl+W puis
  Ctrl+Maj+T, palette (filtre, commande), zoom (suivi, réappliqué au même site, Ctrl+molette, oubli depuis les
  réglages), son coupé, 2 traqueurs bloqués, téléchargement suivi jusqu'au bout, autorisations, effacement du cache.
  Non vérifié par de vraies saisies : menus natifs, bouclier dans la barre, enregistrement comme navigateur par défaut.

## 2026-11-04 — Données perdues après l'arrêt de l'ordinateur ; premier lancement sans profil

- Constat : après un arrêt de l'ordinateur (veille prolongée / arrêt rapide : Windows n'a pas redémarré depuis le
  2 novembre), Calti a démarré avec un stockage local vide (réglages par défaut, aucun onglet). WebView2 écrit ce
  stockage en différé ; tué sans fermeture, sa base a été recréée. Les fichiers de la veille étaient encore sur le
  disque : sauvegardés (`%LOCALAPPDATA%\fr.calti.app\sauvegarde-2026-11-04`), lus directement (journaux et tables
  leveldb, Snappy) et rendus à Calti : réglages, profils, présélections, historique, favoris, recherches, copies,
  sessions des deux fenêtres.
- Correctif durable : la fenêtre principale recopie toutes les clés `calti.*` dans `etat.json` (toutes les 3 s si
  elles ont changé, et quand la fenêtre se cache ou se ferme), par écriture atomique (fichier temporaire synchronisé
  sur le disque, puis remplacement ; copie précédente dans `etat.prev.json`). Au lancement, si cette copie est plus
  récente (numéro de génération) que le stockage de WebView2, elle est reprise avant l'affichage. Un stockage vidé
  n'écrase jamais la copie. Limite : les images (fond, avatars, copies d'images, dans IndexedDB) ne sont pas recopiées.
- Une instance d'essai garde `etat.json` et `zoom.json` dans son propre dossier.
- Premier lancement : plus de profils « Personnel » et « Pro » créés d'office ; un écran d'accueil fait créer le
  premier profil (nom, couleur, icône).
- Vérifié (`scripts/tests/run.ps1 persistence.test.cjs`, 7/7) : écran de création, aucun profil d'office, profil
  créé, copie écrite, stockage vidé puis repris au relancement. `features.test.cjs` : toujours 19/19.
- Suggestions de recherche sans icône du site : une page de l'historique ou des favoris affiche maintenant l'icône
  de son site, avec un petit repère (historique, étoile) ; une recherche garde la loupe. L'icône est celle que la
  page déclare (WebView2 `FaviconUri`, souvent ailleurs que `/favicon.ico`), apprise des onglets ouverts et retenue
  par site (`calti.icons`, 400 sites) : elle sert aussi aux onglets, à l'historique, à la palette. Vérifié
  (`suggestions.test.cjs`, 5/5) : icône déclarée par GitHub apprise et reprise dans la suggestion.

## 2026-11-04 — Menus aux couleurs du thème, style global, outils de développement

- Les clics droits n'utilisent plus les menus de Windows : un menu de Calti (`components/ContextMenu.tsx`) suit le
  thème (arrondi, verre ou plein, densité, accent). Chaque entrée a une icône dans une pastille teintée par famille
  d'actions, les raccourcis en touches, les cases cochées, les valeurs (zoom), les sous-menus (souris et clavier :
  flèches, Entrée, Échap, gauche/droite). Les pages sont découpées à sa place, comme pour la palette.
  Il sert à la barre du haut, au bouton Recharger, aux onglets et groupes, à l'historique.
- Clic droit dans une page : WebView2 fournit ses entrées (copier, coller, enregistrer l'image, inspecter…),
  envoyées à l'interface (`src-tauri/src/pagemenu.rs`, événement `browser:page-menu`) qui les dessine ; le choix
  revient à WebView2 (`page_menu_pick`). « Ouvrir dans une nouvelle fenêtre » devient « dans un nouvel onglet ».
- Style global (Réglages → Interface) : matière (verre ou plein), arrondi général, densité, opacité et flou du
  verre ; il règle d'un coup barres, onglets, pages, panneaux, cartes, menus, dialogues et suggestions, chaque
  élément restant ajustable ensuite. Bouton « Aperçu d'un menu ».
- Outils de développement : F12 ou Ctrl+Maj+I (page affichée), entrée « Inspecter » du clic droit dans la page,
  menu de la barre → Outils de développement (dont « Inspecter l'interface de Calti »). Disponibles dans la
  version installée (fonction `devtools` de Tauri, `.devtools(true)` sur les onglets).
- Outils de développement intégrés : F12 (ou Ctrl+Maj+I, menu de la barre, « Inspecter » du clic droit) les ouvre
  dans un panneau du volet, à droite ou en bas, redimensionnable par son bord, avec détachement en fenêtre et
  fermeture (F12 de nouveau). WebView2 n'ouvrant ses outils que dans une fenêtre à part, Calti repère cette fenêtre
  (nouvelle fenêtre du processus du navigateur), en fait une fenêtre enfant de la sienne, la pose à la place du
  panneau à chaque mise en place des pages et rogne le cadre que Chromium dessine (barre de titre), mesuré d'après
  sa zone de contenu (`src-tauri/src/devtools.rs`). Pas de port de débogage : aucun autre programme ne peut piloter
  les pages. Le panneau apparaît en fondu seulement : un glissement faussait la place mesurée de 16 px.
- Vérifié (`menus.test.cjs`, 19/19, avec `windows.ps1` qui inspecte les fenêtres Windows) : outils dans la fenêtre
  de Calti et aucune fenêtre à part, page resserrée, ancrage en bas, fermeture par F12 ; position contrôlée au
  pixel près. `features` 19/19, `persistence` 7/7, `suggestions` 5/5.

## 2026-11-05 — Profils perdus d'une session à l'autre (copie non reprise)

- Constat : au lancement de 08:37, WebView2 est parti d'un stockage local neuf (base leveldb recréée : journal
  `000003.log` commençant à la séquence 1, sans toucher aux fichiers de la veille). Calti y a écrit des réglages
  vides et un numéro de génération du jour : la copie `etat.json` (profils Personnel et Pro, veille 17:32), plus
  « ancienne », n'a pas été reprise. Au lancement suivant, WebView2 a relu sa base habituelle intacte : la base
  habituelle était probablement encore verrouillée à 08:37 (fin de la session précédente), d'où la base temporaire.
  Fichiers sauvegardés dans `%LOCALAPPDATA%\fr.calti.app\sauvegarde-2026-11-05`.
- Correctifs :
  - reprise selon le contenu : un stockage sans profil reprend toujours la copie qui en a, quel que soit son
    numéro de génération (en plus de la règle « copie plus récente ») ;
  - la copie n'est plus faite tant que le stockage n'a aucun profil, et `state_save` refuse de remplacer une copie
    avec profils par une copie sans profil ;
  - journal `etat.log` (décisions de reprise au lancement, copies suspendues ou refusées) pour comprendre une
    éventuelle perte suivante.
- Vérifié (`persistence.test.cjs`, 11/11) : cas reproduit (stockage vide avec génération plus récente) → profils
  repris, copie intacte, copie sans profil refusée, journal tenu. Version installée relancée : profils retrouvés.

## 2026-11-05 — Notes : groupes, couleurs, organisation, partage entre profils

- Nouveau widget `app/src/widgets/NotesWidget.tsx` (+ `.css`) et carnet `widgets/notes.ts` (clé `calti.notebook`,
  commune à toutes les fenêtres et reprise dans la copie `etat.json`). Chaque note a un titre, un texte, une couleur
  (9 teintes), un groupe, une épingle, un profil d'origine et un partage (`[]` ce profil, liste de profils, ou
  `"all"`). Les groupes ont un nom, une couleur et un partage ; partager un groupe partage ses notes.
- Liste ou grille de cartes, tri libre / modifiées récemment / titre, groupes repliables (préférences par profil,
  `calti.notes.view.<profil>`), recherche au-delà de 5 notes. Glisser-déposer au pointeur pour réordonner les notes,
  les ranger dans un groupe et réordonner les groupes. Menus (clic droit) : couleur, groupe, partage, épingle,
  dupliquer, copier, supprimer. Éditeur : titre, texte enregistré au fil de la frappe, couleurs, groupe, partage ;
  une note laissée vide est supprimée en revenant.
- Anciens blocs-notes (`calti.notes.<profil>`) repris chacun en une note de leur profil, puis retirés.
- Test `scripts/tests/notes.test.cjs` : 21/21. Version installée.

## 2026-11-05 — Sélecteur de profils façon Alt+Tab (Alt+²)

- `app/src/components/ProfileSwitcher.tsx` (+ `.css`) : fenêtre de verre centrée, une carte par profil (pastille,
  nom, nombre d'onglets, page affichée), du plus récemment affiché au plus ancien. Alt+² ouvre sur le profil
  précédent, chaque appui avance (Maj : recule), relâcher Alt bascule. Aussi flèches, Tab, chiffres 1…9, clic,
  Entrée, Échap ; fermé si la fenêtre perd le focus. Découpé dans les pages comme les menus.
- Touche au-dessus de Tab (« ² » en AZERTY, « ` » en QWERTY) : `e.code === "Backquote"` dans l'interface ; dans les
  pages, `native.rs` traite aussi les touches « système » (Alt) de WebView2 (VK 0xDE / 0xC0) et rend le focus à
  l'interface. Commande `alt_held` (GetAsyncKeyState) vérifiée toutes les 120 ms : un Alt+² bref depuis une page,
  relâché avant que l'interface ait le focus, choisit quand même.
- Palette : « Changer de profil ». Liste des raccourcis mise à jour.
- Test `scripts/tests/switcher.test.cjs` : 11/11. Version installée.

## 2026-11-05 — Claude et Lecture en cours (Spotify)

- Extensions activables (désactivées par défaut) : « Claude », « Lecture en cours », et « Mini-lecteur ».
- **Claude** : `widgets/ClaudePanel.tsx`. Page claude.ai (compte de l'utilisateur, aucune clé API) dans le panneau
  latéral du volet, plus large que les autres. Côté Rust, une page « panneau » est un onglet marqué `panel`
  (`browser_open(..., panel: true)`) : hors barre d'onglets, session et historique ; posée par `browser_layout` dans
  la zone `registerPanelSlot`. Elle reste ouverte (cachée) avec sa conversation. « Demander à Claude » / « Expliquer
  avec Claude » au clic droit sur une sélection (`pagemenu.rs` transmet `SelectionText`), « Résumer la page » dans
  le panneau et la palette : nouvelle conversation `claude.ai/new?q=…` (le paramètre survit à la page de connexion).
- **Lecture en cours** : `src-tauri/src/media.rs` lit les contrôles média de Windows
  (GlobalSystemMediaTransportControlsSessionManager) toutes les secondes, événement `media:state`, commandes
  `media_state` / `media_control` (lecture/pause, précédent, suivant). Pochette en image data, relue au changement
  de morceau. Fonctionne pour Spotify (pastille verte) comme pour toute autre lecture.
- `widgets/MediaWidget.tsx` : carte (panneau latéral, bloc « Lecture en cours » de l'accueil, masqué par défaut) et
  mini-lecteur placé au choix (réglage `chrome.mediaDock`, aussi au clic droit « Position ») : libre (glisser, coin
  pour la taille, formes barre / carte / pochette, place retenue dans `calti.mediaFloat`, découpé dans les pages),
  dans la barre latérale, ou en bordure haut / bas / droite (barre flottante : les pages lui font place).
- Test `scripts/tests/integrations.test.cjs` : 19/19 ; notes 21/21, sélecteur 11/11, menus 19/19. Version installée.
- Non vérifié : lecture réelle de Spotify (rien ne jouait pendant les tests), claude.ai connecté.

## 2026-11-05 — Mini-lecteur : section d'Apparence, styles de la barre latérale, barre du haut

- Apparence → « Mini-lecteur » (visible quand il est activé) : place choisie sur des vignettes de fenêtre (libre,
  barre du haut, barre latérale, bord du haut, du bas, droit). En bordure : mêmes styles que la barre latérale
  (bord renflé avec couleur / verre / sans fond, opacité ; flottant ; collé au bord ; surface verre / plein / aucun
  fond ; arrondi), taille (petit à toute la largeur) et alignement ; « Reprendre le style de la barre latérale ».
  Réglages `chrome.player*`. Bord renflé : liseré `.media-line` le long du bord, congés en masques radiaux.
- « Barre du haut » : lecteur discret à gauche des boutons de la fenêtre (pochette, titre, lecture/pause, suivant,
  filet de progression).
- Extension désactivée : son panneau ouvert se ferme ; Claude désactivé : ses pages claude.ai sont détruites
  (`closePanelPages`).
- Test integrations : 24/24 (lecture Spotify réelle vue pendant le test). Version installée.

## 2026-11-05 — Extensions : raccourci dans la barre latérale au choix

- Sous la carte d'une extension activée : « Dans la barre latérale : Oui / Non » (réglage `chrome.railHidden`,
  extensions activées sans raccourci). Sans raccourci, elle s'ouvre depuis la palette (« Ouvrir … », pour toutes
  les extensions activées).
- Test integrations : 26/26. À installer : Calti ouvert ne se fermait pas (fenêtre « SIG-MR : Maintenance »).

## 2026-11-05 — Lecteur de la barre du haut réglable, textes épurés

- Barre du haut : le lecteur a un fond (verre, plein, aucun ; pastille lisible sur n'importe quel fond), un arrondi,
  titre et progression au choix — dans Apparence → Mini-lecteur et au clic droit.
- Textes épurés : explications des réglages retirées, descriptions des extensions en quelques mots, états vides
  sans phrase (notes, lecture, Claude, sélecteur de profils).
- Tests : integrations 26/26, notes 21/21, sélecteur 11/11. Version installée.
