# Rapport — brief-pings-derniere-fenetre (2026-11-17)

**Brief** : docs/plans/2026-11-17_brief-pings-derniere-fenetre.md · **Repo** : claude-code-pings · **Date imposée** : 2026-11-17 · **Voie** : plan (plan relu et approuvé par Claude.ai)

## Fait
- Étape 2.1 — brief non tracké commité seul — commit 4dc9965
- P1 — `src/lifecycle.ts` (nouveau) : `setupHooks` / `teardownHooks` déplacés depuis `src/extension.ts`, paramétrés par `claudeDir`, logique inchangée — commit 4df710e
- P1 — `src/lifecycle.ts` : registre de présence `~\.claude\hooks\claude-pings-instances\<pid>` ; `registerInstance` (à l'ouverture, avant `setupHooks`), `releaseInstance` (à la fermeture : retire son fichier **avant** de lister, purge les PID morts via `process.kill(pid, 0)`, démonte seulement s'il ne reste aucun hôte vivant, puis supprime le dossier) ; `src/extension.ts` : `activate` → `registerInstance` + `setupHooks`, `deactivate` → `releaseInstance` au lieu de `teardownHooks` — commit 3604e78
- P1 — `test/presence-harness.js` (nouveau) : harnais 2 hôtes (processus Node enfants qui exécutent `out/lifecycle.js` compilé), bac à sable `os.tmpdir()`, fixture `settings.json` portant l'entrée `UserPromptSubmit` du verrou Pantheon ; override `PINGS_LIFECYCLE` pour le témoin négatif · `.vscodeignore` : `test/**` — commit 42f3403
- P2 — `package.json` + `package-lock.json` : version `1.0.0` → `1.0.1` — commit de4d80b
- P2 — `claude-code-pings-1.0.1.vsix` construit à la racine (gitignoré, non commité) ; **installation non jouée** (geste de Chaos, brief P2)
- Le comportement « une fenêtre qui s'ouvre réinstalle les pings si absents » est conservé : `setupHooks` inchangé, toujours appelé à `activate`.

## Mesuré
- `npm run compile` (tsc) → sortie sans erreur, après chaque commit de code.
- `node test/presence-harness.js` → `PASS S1`, `PASS S2`, `PASS S3`, `PASS S4`, `PASS temoin : ~/.claude/settings.json reel inchange (sha256 ff6349863e49)`, exit 0. Scénarios :
  - **S1** A+B ouverts → 3 scripts + 3 entrées ; fermeture de A → toujours présents (`last=false`) ; fermeture de B → retirés (`last=true`).
  - **S2** A+B ouverts, B tué (SIGKILL, sans `deactivate`) ; fermeture de A → retirés (PID mort purgé).
  - **S3** A ouvert puis fermé → retirés ; B ouvert → réinstallés ; B fermé → retirés.
  - **S4** A et B fermés simultanément → retirés (au moins un hôte démonte).
  - À chaque étape, l'entrée `UserPromptSubmit` du verrou est `deepStrictEqual` à la fixture → verrou intact dans tous les cas.
- **Témoin négatif** : harnais lancé sur un mutant de `out/lifecycle.js` (condition `liveOthers > 0` neutralisée = ancien comportement) → `FAIL S1 : S1 A ne doit pas etre le dernier`, exit 1. Le harnais détecte le défaut du brief.
- `npm run package` → `DONE Packaged: …claude-code-pings-1.0.1.vsix (12 files, 87.42 KB)` ; `ls -l` → 89522 octets.
- `npx @vscode/vsce ls` → `README.md, package.json, LICENSE, CLAUDE.md, out/lifecycle.js, out/extension.js, images/Rounded.png, hooks/on-*.ps1` : ni `src/`, ni `test/`, ni `docs/`.
- `git check-ignore -v claude-code-pings-1.0.1.vsix` → `.gitignore:3:*.vsix`.

## Gated
- aucune (le brief ne déclare aucune gate)

## Non vérifié
- **2 fenêtres VS Code réelles** : non jouées. Le harnais mesure 2 hôtes (processus qui exécutent le code compilé réel), accepté par Claude.ai pour cocher P1. Le test réel exige l'installation du vsix (geste de Chaos). **Protocole manuel pour Chaos, après installation** :
  1. Installer `claude-code-pings-1.0.1.vsix`, puis recharger **toutes** les fenêtres VS Code ouvertes (une fenêtre restée sur la 1.0.0 démonte encore sans condition à sa fermeture).
  2. Ouvrir 2 fenêtres. Lire `~\.claude\hooks\claude-pings-instances\` : 2 fichiers (PID).
  3. Fermer 1 fenêtre. Lire `~\.claude\settings.json` : les 3 entrées `claude-pings` (`PreToolUse`, `PermissionRequest`, `Stop`) et l'entrée `UserPromptSubmit` du verrou sont présentes ; `~\.claude\hooks\claude-pings-on-*.ps1` présents.
  4. Fermer la dernière fenêtre. Relire : les 3 entrées et les scripts ont disparu, l'entrée du verrou est intacte, le dossier `claude-pings-instances` a disparu.
- Mémoire projet du vault non consultée (`--since` absent).
- Lint : je n'ai pas trouvé de linter configuré dans `package.json` (pas d'eslint) → critère « zéro nouvelle erreur de lint » non applicable.
- Limites connues, non corrigées (hors critère) : un PID mort réutilisé par un autre processus fait passer l'hôte mort pour vivant → démontage manqué à la dernière fermeture (hooks laissés, sans son ; nettoyé à la réouverture suivante + fermeture) ; ouverture d'une fenêtre pendant la fermeture de la dernière, dans le même intervalle → course possible (pings retirés alors qu'une fenêtre est ouverte, rétablis au prochain rechargement).

## Écarts
- **Le vsix embarque le WIP étranger** `images/Rounded.png` (modifié, non commité : 72.71 KB dans le paquet, l'icône déclarée par `package.json`). `vsce` emballe l'arbre de travail, pas HEAD. Le fichier est resté byte-intact (`git status` : ` M images/Rounded.png`), mais le vsix 1.0.1 n'est pas reproductible depuis le commit de4d80b tant que ce WIP n'est pas commité ou annulé.
- **Le vsix embarque `CLAUDE.md`** (doctrine du royaume, ajouté au dépôt en 4e49a5a, non exclu par `.vscodeignore`). Constat, non corrigé : hors du périmètre du brief. Sans conséquence pour une installation locale ; à exclure avant toute publication (catégorie PUBLIC).
- Fins de ligne : `src/extension.ts` mélange CRLF et LF sur les 4 lignes de commentaire ajoutées (git normalise à l'add, avertissements `LF will be replaced by CRLF`). Sans effet sur la compilation.

## Décisions prises seul
- Nom du rapport : dérivation du contrat (`rapport-brief-pings-derniere-fenetre`) au lieu du nom écrit dans le brief (`rapport-pings-derniere-fenetre`) — hors des 4 catégories (convention de nommage) — validé par Claude.ai à la relecture du plan.
- Bump de version de l'extension VS Code malgré l'interdit « version de plugin » du contrat (qui vise les plugins Claude Code, périmètre `:seal`) — hors des 4 catégories — validé par Claude.ai.
- vsix laissé à la racine, gitignoré, au lieu du coffre : je n'ai pas trouvé de dossier `_projects_files/claude-code-pings` — hors des 4 catégories — validé par Claude.ai.
- Extraction de `src/lifecycle.ts` (sans `vscode`) pour la testabilité, au lieu d'un mock du module `vscode` — hors des 4 catégories (choix de conception) — validé par Claude.ai.
- Override `PINGS_LIFECYCLE` ajouté au harnais pour jouer le témoin négatif sur un mutant (non prévu au plan, ajout de test uniquement) — hors des 4 catégories — retenu au lieu d'un témoin non joué.
