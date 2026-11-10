# CLAUDE.md - claude-code-pings

<!-- pantheon-lois -->
## Hygiène épistémique dans les livrables
- « Vérifié » / « mesuré » / « établi » = exécuté ET observé. Jamais une déduction depuis un fichier, une supposition sur une lib, un comptage sur source non validée.
- Toute hypothèse se présente comme telle : « à confirmer », « hypothèse », « supposition ».
- Une question posée à Roro motivée par une inférence expose d'abord ce statut (« c'est une hypothèse, pas une mesure »), avant la question.
- Un resultat de commande partiel (listing, grep vide) n'est pas la preuve d'une absence :
  formuler « je n'ai pas trouve » plutot que « il n'y a pas ».

## Encodage PowerShell (toutes opérations)
- Jamais Out-File, >, >>, Set-Content pour un texte relu (message git, fichier source, log) : PowerShell 5.1 injecte un BOM UTF-8 même avec -Encoding utf8.
- Messages git : here-string @'…'@ passé directement. Règle valable pour commit, amend, réécriture.
- Fichier intermédiaire indispensable : [System.IO.File]::WriteAllText($p, $s, [System.Text.UTF8Encoding]::new($false)).
- Après tout amend ou réécriture de message : vérifier le premier octet du sujet (102 = 'f', pas 239 = BOM).

## Comportement des maillons Hadès en headless
- Si l'opération contractuelle est bloquée ou échoue : sortir en <MAILLON>_FAIL loggé, jamais improviser une alternative.
- Zéro fallback de maillon : copie au lieu de move, filesystem au lieu de git, portée inventée = interdits. Le best-effort appartient à l'orchestrateur.
- Un run sur portée inventée est pire qu'un run absent : il a l'apparence de l'autorité sans en avoir la base.
- Tout STOP ou refus d'etape doit citer mot a mot la clause qui l'impose (contrat du maillon OU corpus de lois). Citation impossible = la condition n'existe pas : executer.
- Issues d'un maillon : OK / PARTIEL / FAIL. PARTIEL = etape N non realisable (motif mesure, jamais deduit), etapes 1..N-1 executees et rapportees. Un obstacle a l'etape N n'autorise que le saut de l'etape N, jamais une alternative improvisee.

## Préconditions d'un plan de baptême
- Avant le test 1, lister les préconditions du geste testé : fixture trackée par git (si git mv/rm), vault clean et commité (si le geste lit HEAD), cache plugin resync (si le geste dépend du code modifié), règle allow posée (si le geste requiert une permission headless).
- Un prérequis non vérifié à la conception produit un échec certain au 1er run, souvent solvable uniquement par un geste humain (commit, resync).

## Contrat de maillon Hadès — prescription de commande
- Toute commande gravée dans le contrat d'un maillon (skill, CLAUDE.md) doit être mesurée en session headless AVANT gravure : forme canonique + témoins négatifs (formes refusées et cause) consignés.
- Prescrire sans mesurer = contrat mort-né : l'échec est certain au 1er run headless.

## Tests e2e — actions optimistes
- Persistance apres useTransition : attendre `page.waitForResponse(url => ...)` AVANT reload().
  `waitForLoadState("networkidle")` ne suffit pas (fire-and-forget ne bloque pas le reseau).
- Asserter sur l'element rendu apres rechargement, jamais sur le texte encore dans le champ de
  saisie (reste visible meme si le POST a echoue).

## Serveur dev Next.js
- Avant npm run dev / next dev : verifier qu'aucune instance du meme working-dir ne tourne
  deja et que le port cible n'est pas occupe par un processus orphelin.
- Si un serveur du projet repond deja : le reutiliser (HMR sert les modifs locales).

## Périmètre des gates Chaos (validateur non redondant)
- Chaos valide des CATÉGORIES, pas des gestes. Quatre, fermées :
  1. IRRÉVERSIBLE — destruction d'un dépôt, d'un bundle, d'une clé, d'une donnée sans rewind.
  2. PUBLIC — mise en production, publication d'un package, contenu mis en ligne.
  3. ARGENT OU ACCÈS — comptes fournisseurs, clés, paiements, identifiants.
  4. DOCTRINE — amendement d'une charte, d'une loi, d'un contrat de contenu.
- Commits : acte de l'agent, toujours (1 sujet = 1 commit).
- Push : acte de l'agent UNIQUEMENT en clôture de `/hermes:send` (session → seal → vérification finale OK),
  et seulement dans un royaume qui l'a ouvert (loi P posée dans son `.claude\settings.json`). Hors rituel,
  ou royaume non ouvert : le push reste un geste de Chaos.
- Exception (verdict Chaos 09/11, registre Trinity R-22) : un royaume dont le CLAUDE.md porte, hors bloc, la ligne « Push : libre » (aujourd'hui : Țepeș seul) pousse après chaque commit, sans rituel ni geste de Chaos. `sync-lois` ne l'arme pas (garde local `-Laws C` seulement).
- Une question posée à Chaos hors des 4 catégories est un écart : `/hermes:session` le consigne en errorlog
  (→ Rhadamanthe), puis l'agent décide seul.
- Un CLAUDE.md de projet peut RESSERRER ce périmètre, jamais l'élargir.
<!-- /pantheon-lois -->

## Règles git / push — spécifiques au royaume
- Push : loi P - aucun deploiement au push mesure le 18/10 (rapport Pantheon docs/reports/2026-10-18_mesure-deploiement-au-push.md).
