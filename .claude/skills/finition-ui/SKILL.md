---
name: finition-ui
description: À lancer quand une interface est terminée (un écran, une page, une fonctionnalité) pour la finaliser avec le skill unslop, appliqué tel quel. Capture l'avant, déroule unslop (audit, direction, accord, neuf passes, vérification), lance les tests du projet, capture l'après, rend la vidéo si on la demande, puis fait un commit séparé et annulable. Utiliser quand on demande de finaliser, finir ou polir une interface, ou de « passer unslop » sur un écran.
---

# Finition d'interface

Ce skill encadre unslop ; il n'y ajoute ni n'y retire aucune règle. Tout ce qui touche au design (signes, direction,
passes, ce qu'il ne faut pas faire, liste de vérification, vidéo) vient d'unslop. Ce skill ne s'occupe que de ce qui
entoure la passe : périmètre, captures, tests, commit, rapport.

## Prérequis

- unslop installé : `.claude/skills/unslop/` dans le projet, sinon `~/.claude/skills/unslop/`. Absent : le dire et
  s'arrêter.
- Pour les captures et la vidéo : Playwright et ffmpeg (voir `references/` d'unslop pour leur installation). S'ils
  manquent, donner la commande d'installation et continuer sans captures si la personne le préfère.

## Déroulé

1. **Périmètre.** Lister les écrans ou composants à finaliser et les fichiers qui les rendent. Si la demande ne dit
   pas lesquels, demander.

2. **Captures avant.** Prendre une capture de chaque écran tel qu'on le voit, avec le moyen du projet : son serveur de
   développement ou son instance de test, ou `node <dossier unslop>/scripts/snapshot.mjs <url> <sortie.html>` pour une
   page servie. Les ranger dans `.unslop/<AAAA-MM-JJ>-<écran>/avant/`.

3. **Passe unslop, à la lettre.** Lire `SKILL.md` d'unslop et suivre « Run it » du début à la fin, avec ses
   références (`signs.md`, `tokens.md`, `visuals.md`, `effects.md`, `refs.md`) : audit, choix du niveau (lourd,
   léger, rien), direction en cinq lignes, attente de l'accord, neuf passes, vérification. Ne pas mélanger ses règles
   avec d'autres consignes de style : seules comptent celles d'unslop et ce que la personne répond à son audit.

4. **Tests.** Lancer les tests et la compilation du projet. Corriger ce que la passe a cassé, sans revenir sur ses
   choix de design.

5. **Captures après.** Mêmes écrans, même taille, dans `.unslop/<…>/apres/`. Pour chaque écran, une image côte à côte :

   ```
   ffmpeg -y -i avant/<écran>.png -i apres/<écran>.png -filter_complex hstack <écran>-avant-apres.png
   ```

6. **Vidéo, si demandée.** Section « Story video » d'unslop : fichier story construit depuis l'écran d'origine,
   étapes en CSS, rendu par `scripts/story.mjs`, quelques images extraites et regardées avant de la remettre. La
   ranger avec les captures.

7. **Commit séparé.** Un commit qui ne contient que les changements d'interface de la passe, par exemple
   `style: finition unslop de <écran>`. Les captures et la vidéo restent hors de Git (`.unslop/` est ignoré), sauf
   demande contraire.

8. **Rapport.** Le rapport d'unslop (direction, ce qui a changé à chaque passe, prompts d'image éventuels), puis les
   chemins des images avant/après et de la vidéo, les résultats des tests, et la commande pour annuler :
   `git revert <commit>`.

## Crédit

unslop est l'œuvre de Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), sous licence CC BY 4.0 ; ce skill ne
fait que l'appeler. Chaque vidéo garde la mention « unslop by @heydamir ».
