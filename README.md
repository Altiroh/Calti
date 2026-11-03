# Calti

Navigateur Windows personnel, interface Liquid Glass (Tauri 2 + React, pages WebView2).
Architecture : [ARCHITECTURE.md](ARCHITECTURE.md).

## Prérequis

Rust (MSVC), Node 20.19+, WebView2. Brave est facultatif : Calti peut reprendre ses données.

## Installer la version de tous les jours

```
cd app
npm install
npx tauri build --no-bundle
cd ..
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

Calti est copié dans `%LOCALAPPDATA%\Programs\Calti\calti.exe`, avec un raccourci dans le menu Démarrer ;
les icônes épinglées vers une ancienne version sont redirigées. Même commande pour chaque mise à jour
(Calti fermé). Pour l'ouvrir depuis les liens des autres applications : Réglages → Général →
« Faire de Calti le navigateur par défaut ».

## Développer

```
cd app
npm run tauri dev
```

Les réglages et la session de la version de développement sont séparés de ceux de la version installée
(origines web différentes).

## Tester

Les scénarios de `scripts/tests/` pilotent une instance isolée (dossier WebView2 temporaire, profil jetable
« essai ») par le protocole DevTools ; ils peuvent tourner pendant que Calti est ouvert.

```
powershell -ExecutionPolicy Bypass -File scripts/tests/run.ps1 features.test.cjs -AppArgs https://example.org/?lancement
```
