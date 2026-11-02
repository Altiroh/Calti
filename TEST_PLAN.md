# TEST_PLAN

## A. Validation de la première version (build Brave non modifié)

Le build est validé uniquement si **tous** les critères suivants sont observés :

1. `pnpm run init` se termine sans erreur.
2. `pnpm run build` (Component) se termine avec le code 0 ; `out\Component\brave.exe` existe.
3. `pnpm start` ouvre une fenêtre, sans crash pendant 10 minutes d'utilisation.
4. `brave://version` affiche la version Chromium attendue (157.0.8103.30 au 2026-11-02).
5. Navigation HTTPS (wikipedia.org, youtube.com) : rendu correct et lecture vidéo avec son.
6. Shields : compteur de blocages > 0 sur un site avec publicités.
7. Onglets : ouverture, fermeture, réouverture (Ctrl+Shift+T) et glisser-déposer.
8. Fenêtre privée : ouverture, puis aucun historique conservé après fermeture.
9. Favori ajouté puis retrouvé après redémarrage.
10. Téléchargement d'un fichier, visible dans `brave://downloads`.
11. Extension installée depuis le Chrome Web Store et fonctionnelle.
12. Sandbox active : `brave://sandbox` affiche les processus renderer protégés.

## B. Tests automatisés

- Ciblés et rapides : `pnpm run test brave_unit_tests --filter=<suite>`, `brave_browser_tests --filter=<suite>`.
- Pour chaque composant nopro : tests unitaires des PageHandlers (validation des entrées) et browser tests
  du layout et de l'interaction avec les onglets.
- Régression : comparer le comportement avec `kNoproShell` activé et désactivé.

## C. Après chaque modification importante

Rejouer A.3 à A.12, les tests automatisés concernés et une mesure de mémoire et de temps de démarrage.
