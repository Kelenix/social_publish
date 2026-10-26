# État du projet — PROJECT_STATE

> Mis à jour par Claude à la fin de chaque phase / incrément. Toujours lire ce fichier avant d'agir.

## Snapshot

- **Phase courante** : 4 — Implémentation (Inc-2 terminé, Inc-3 à démarrer)
- **Dernière mise à jour** : 2026-10-26
- **Santé** : 🟢 OK
- **Prochaine action** : Incrément 3 — serveur MCP (outils, jetons à portée, autorisations, import limité à `inbox/`)

## Avancement par phase

| Phase | État | Notes |
|-------|------|-------|
| 0 — Cadrage & intake        | ✅ fait | Plan validé le 2026-10-26 |
| 1 — Définition produit      | ⬜ à faire | |
| 2 — Planification           | ⬜ à faire | |
| 3 — Architecture & design   | 🔄 en cours | ADR-001 à 010 |
| 4 — Implémentation          | 🔄 en cours | Inc-1 ✅ Inc-2 ✅ |
| 5 — Qualité                 | ⬜ à faire | |
| 6 — Mise en production      | ⬜ à faire | |
| 7 — Documentation           | ⬜ à faire | |
| 8 — Maintenance             | ⬜ à faire | |

## Backlog incréments

| ID | Incrément | Exigence liée (INTAKE) | Priorité | État |
|----|-----------|------------------------|----------|------|
| Inc-1 | Socle, Docker, base, auth admin, UI, médias, brouillons | §2, §3, §4, §10 | P0 | ✅ |
| Inc-2 | Scheduler, worker, connecteur de test, calendrier, historique | §6, §7, §11 | P0 | ✅ |
| Inc-3 | Serveur MCP + jetons + autorisations | §8, §9 | P0 | ⬜ |
| Inc-4 | Premier connecteur réel (OAuth) | §5 | P1 | ⬜ |
| Inc-5 | Autres connecteurs + TikTok manuel | §5 | P1 | ⬜ |
| Inc-6 | Vérification complète + documentation | §1, §10, §11 | P0 | ⬜ |

## Décisions ouvertes / questions à l'utilisateur

- [x] Q1 — Premier connecteur réel : YouTube (réponse du 2026-10-26)
- [x] Q2 — Plan validé

## Blocages

- (aucun)

## Tâches manuelles utilisateur en attente

- voir `docs/manual-tasks.md`

## Journal de session

- 2026-10-26 — Inc-1 commité (`7192bed`). Inc-2 livré sur `feat/inc-2-scheduler` (non commité). Vérifié : lint, types, 82 tests (dont intégration : fuseaux/DST, concurrence, succès partiel, reprise après arrêt, rapprochement, Retry-After, jeton expiré, publications manquées, annulation) ; stack Docker complet healthy ; bout en bout navigateur + worker réel (publication immédiate vers 2 comptes → publiée + échec indépendants ; programmation à +2 min avec worker arrêté puis redémarré → publiée une seule fois ; arrêt propre SIGTERM). Défauts trouvés et corrigés : course sur l'état global (ADR-010), arrêt non propre du worker sous pnpm. Non couvert en bout en bout : politique « manquée » (> 10 min d'arrêt), couverte par les tests d'intégration.

- 2026-10-26 — Inc-1 livré sur la branche `feat/inc-1-socle` (non commité). Vérifié : lint, types, 40 tests (unitaires + intégration PostgreSQL/FFmpeg réels), build Next, `docker compose up --build` (migrate + admin + web healthy), parcours navigateur (connexion, import image/vidéo, refus d'un faux fichier, brouillon multi-plateforme, versionnage, duplication, réglages, Range vidéo, mobile/clair). Non couvert : pilote S3 non testé contre un vrai bucket ; pas de tests E2E Playwright automatisés (prévus Inc-6).

- 2026-10-26 — Lecture INTAKE + skills, environnement vérifié (Node 24, pnpm 10, Docker 29, Compose v5, FFmpeg 9). Plan de réalisation rédigé.
