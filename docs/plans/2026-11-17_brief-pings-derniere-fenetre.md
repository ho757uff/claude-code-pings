# Brief CC - claude-code-pings : ne retirer les pings qu'a la fermeture de la derniere fenetre (2026-11-17)

**Origine** : constat Claude.ai du 17/11 (conversation « Trinity IV »), verdict Chaos « Gros defaut de conception ». `src/extension.ts` : `deactivate()` appelle `teardownHooks()`, qui supprime les scripts de `~\.claude\hooks\` et les entrees `claude-pings` de `~\.claude\settings.json`. Chaque fenetre VS Code a son propre hote d'extension : fermer UNE fenetre retire les pings pour toutes les autres, jusqu'au prochain rechargement.

## Portee
- Depot `claude-code-pings` (extension VS Code). Ecrit dans `~\.claude\settings.json` et `~\.claude\hooks\` a l'execution : reglage global, d'ou la voie **plan**.
- Doit preserver toute autre entree de `hooks` (dont le verrou `UserPromptSubmit` de Pantheon) : ne toucher qu'aux entrees dont la commande contient `claude-pings`.

## P1 — Compter les fenetres actives
- Mecanisme mesure, pas suppose (ex. fichier de presence par fenetre avec PID de l'hote, nettoye des PID morts) : `teardownHooks()` ne s'execute que si aucune autre fenetre n'est active.
- Une fenetre qui s'ouvre reinstalle les pings si absents (deja le cas, a garder).

**Critères de sortie** : 2 fenetres ouvertes, fermeture d'une -> pings toujours presents ; fermeture de la derniere -> retires ; entree du verrou intacte dans tous les cas ; resultats au rapport.

## P2 — Trace
- Bump de version de l'extension, `.vsix` reconstruit ; installation = geste de Chaos.
- Rapport `docs/reports/<date>_rapport-pings-derniere-fenetre.md`.

**Critères de sortie** : vsix construit ; rapport ecrit.

1 sujet = 1 commit. Pas de push.
## Avancement
- [x] P1 — Compter les fenetres actives
- [x] P2 — Trace
