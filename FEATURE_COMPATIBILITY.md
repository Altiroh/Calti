# FEATURE_COMPATIBILITY

Légende : ☐ non vérifié · ✅ vérifié fonctionnel · ⚠️ partiel · ❌ indisponible.
**Aucune fonctionnalité n'est déclarée préservée tant qu'elle n'a pas été testée sur un build réel.**

## Fonctionnalités locales (attendues fonctionnelles, à vérifier)

| Fonctionnalité | Brave d'origine | UI nopro | Notes |
|---|---|---|---|
| Brave Shields / blocage pub | ☐ | ☐ | Listes de filtres téléchargées depuis des serveurs Brave : à auditer |
| Protection anti-traqueurs | ☐ | ☐ | |
| Navigation privée | ☐ | ☐ | |
| Gestion des onglets | ☐ | ☐ | |
| Profils utilisateurs | ☐ | ☐ | |
| Favoris et dossiers | ☐ | ☐ | |
| Historique | ☐ | ☐ | |
| Téléchargements | ☐ | ☐ | |
| Cookies et permissions | ☐ | ☐ | |
| Gestionnaire de mots de passe | ☐ | ☐ | |
| Extensions Chromium | ☐ | ☐ | Chrome Web Store via le proxy Brave : à auditer |
| Raccourcis clavier | ☐ | ☐ | |
| Vidéo / audio (dont DRM Widevine) | ☐ | ☐ | Widevine nécessite un composant signé : à auditer |
| Authentification sur les sites (WebAuthn, mots de passe) | ☐ | ☐ | |
| Sécurité Chromium (sandbox, Safe Browsing) | ☐ | ☐ | Safe Browsing passe par un proxy Brave : à auditer |

## Services dépendant de Brave (audit séparé)

| Service | Dépendance | Statut |
|---|---|---|
| Brave Sync | Serveur de sync Brave | ☐ à auditer |
| Brave Leo | API Brave, compte/abonnement | ☐ à auditer |
| Brave Rewards / BAT | Serveurs Brave, partenaires, conditions légales | ☐ à auditer (désactivation probable) |
| Brave VPN | Abonnement, partenaire VPN | ☐ à auditer (désactivation probable) |
| Brave Wallet | Nœuds et API Brave | ☐ à auditer |
| Brave News, Search, Talk | Serveurs Brave | ☐ à auditer |
| Mises à jour (Omaha/updater) | Serveurs de mise à jour Brave | ❌ à remplacer par notre propre canal |
| Statistiques / P3A | Serveurs Brave | ☐ à auditer (désactivation probable) |
