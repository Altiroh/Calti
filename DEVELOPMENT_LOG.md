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
