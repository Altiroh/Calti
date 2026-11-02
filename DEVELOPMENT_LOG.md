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
