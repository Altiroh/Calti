# Calti

Cockpit Liquid Glass relié à Brave (Tauri 2 + React + extension MV3 + Native Messaging).
Architecture : [ARCHITECTURE.md](ARCHITECTURE.md).

## Prérequis

Rust (MSVC), Node 20.19+, WebView2, Brave.

## Première installation

1. Compiler l'hôte et l'application :
   ```
   cargo build --workspace
   ```
2. Enregistrer l'hôte Native Messaging pour Brave (utilisateur courant, sans droits administrateur) :
   ```
   powershell -ExecutionPolicy Bypass -File scripts/register-host.ps1
   ```
3. Lancer Calti : la carte « Connecter Brave » liste tes profils Brave. Pour chacun, une seule fois :
   « Ouvrir les extensions » → Mode développeur → « Charger l’extension non empaquetée » →
   coller le chemin copié par « Dossier de l’extension ». L’identifiant doit être `djgdkiajnehmpnnnanbojdmgndcmendg`.
   Ensuite, la connexion est automatique à chaque ouverture de Brave ou de Calti.
4. Installer les dépendances de l'interface : `cd app && npm install`.

## Lancer

```
cd app
npm run tauri dev
```

Au premier lancement, ouvrir Réglages (engrenage) pour nommer chaque profil et régler son environnement.

## Retirer l'hôte

```
powershell -ExecutionPolicy Bypass -File scripts/register-host.ps1 -Unregister
```
