# Source

Skill « unslop » de Damir Sokolovsky (@heydamir), https://github.com/heydamir/unslop
Commit a6f121eee5f29c2f74976b75456feae8b66afb3a (2026-11-01), dossier skills/unslop, copié tel quel.
Licence CC BY 4.0 (LICENSE).

Dans ce projet :
- Playwright et ffmpeg sont des dépendances de développement de app/ (`npm install` dans app/).
- Lancer les scripts depuis app/ : `npm run unslop:snapshot -- <url> <out.html>` et
  `npm run unslop:story -- <story.html> <out.mp4>` (ffmpeg du projet ajouté au PATH).
- Retirer : `git revert` du commit d'installation, ou supprimer ce dossier et les dépendances.
