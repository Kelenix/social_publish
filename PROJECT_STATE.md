# État du projet — PROJECT_STATE

> Mis à jour par Claude à la fin de chaque phase / incrément. Toujours lire ce fichier avant d'agir.

## Snapshot

- **Phase courante** : 4 — Implémentation (Inc-5 terminé ; tests réels en attente des identifiants ; Inc-6 à démarrer)
- **Dernière mise à jour** : 2026-10-26
- **Santé** : 🟢 OK
- **Prochaine action** : Incrément 6 — vérification complète (revue de code et sécurité, CI, E2E), sauvegarde/restauration, migration VPS, bilan final

## Avancement par phase

| Phase | État | Notes |
|-------|------|-------|
| 0 — Cadrage & intake        | ✅ fait | Plan validé le 2026-10-26 |
| 1 — Définition produit      | ⬜ à faire | |
| 2 — Planification           | ⬜ à faire | |
| 3 — Architecture & design   | ✅ fait | ADR-001 à 014 |
| 4 — Implémentation          | ✅ fait (contrat) | Inc-1 à Inc-5 ✅ ; connecteurs réels non testés contre les vraies API |
| 5 — Qualité                 | ⬜ à faire | |
| 6 — Mise en production      | ⬜ à faire | |
| 7 — Documentation           | ⬜ à faire | |
| 8 — Maintenance             | ⬜ à faire | |

## Backlog incréments

| ID | Incrément | Exigence liée (INTAKE) | Priorité | État |
|----|-----------|------------------------|----------|------|
| Inc-1 | Socle, Docker, base, auth admin, UI, médias, brouillons | §2, §3, §4, §10 | P0 | ✅ |
| Inc-2 | Scheduler, worker, connecteur de test, calendrier, historique | §6, §7, §11 | P0 | ✅ |
| Inc-3 | Serveur MCP + jetons + autorisations | §8, §9 | P0 | ✅ |
| Inc-4 | Premier connecteur réel (OAuth) : YouTube | §5 | P1 | ✅ tests de contrat ; ⏸️ test réel (identifiants) |
| Inc-5 | Autres connecteurs + TikTok manuel | §5 | P1 | ✅ tests de contrat ; ⏸️ tests réels (identifiants) |
| Inc-6 | Vérification complète + documentation | §1, §10, §11 | P0 | ⬜ |

## Décisions ouvertes / questions à l'utilisateur

- [x] Q1 — Premier connecteur réel : YouTube (réponse du 2026-10-26)
- [x] Q2 — Plan validé

## Blocages

- (aucun)

## Tâches manuelles utilisateur en attente

- voir `docs/manual-tasks.md`

## Journal de session

- 2026-10-26 — Inc-4 commité (`f28d194`). Inc-5 livré sur `feat/inc-5-connecteurs` (non commité) : docs Instagram/LinkedIn/X/TikTok vérifiées, URLs HTTPS signées pour les médias, connecteurs Instagram (conteneurs, carrousel, Reels), LinkedIn (profil + pages, images, vidéos multipart, texte « little »), X (OAuth PKCE, upload v2, crédits, limites), TikTok manuel (export + adaptateur), options LinkedIn/Instagram dans l'éditeur, page Comptes. Vérifié : 167 tests dont 20 de contrat (faux serveurs) ; Docker 5 services healthy ; UI Comptes (5 réseaux, états réels) ; export TikTok (texte, téléchargement en pièce jointe, marquage) ; route publique : 403 sans signature. Non vérifié : vraies API (identifiants, URL publique, crédits X).

- 2026-10-26 — Inc-3 commité (`c776d2d`). Inc-4 livré sur `feat/inc-4-youtube` (non commité) : docs officielles YouTube/OAuth vérifiées (quota 100 uploads/j, plus de restriction « privé » pour les projets non vérifiés, jetons de 7 j en Testing), chiffrement AES-256-GCM, OAuth state + PKCE, connecteur YouTube (upload reprenable, suivi upload/traitement/publication, programmation native + annulation, quotas, refus), options YouTube dans l'éditeur, page Comptes. Vérifié : 141 tests dont 17 tests de contrat contre un faux serveur Google (reprise réelle au milieu du fichier, rapprochement par session, rafraîchissement, invalid_grant, quota, refus, publishAt + annulation) ; Docker 5 services healthy ; UI (connecteur non configuré + URL de retour, options YouTube). Non vérifié : vraie API Google (identifiants requis), acceptation du PKCE par Google. Incident : suppression d'un dossier de migration déjà appliqué en dev → migration reconstruite à l'identique via `migrate diff`, checksum réaligné dans `_prisma_migrations` (base de dev uniquement, aucune donnée touchée).

- 2026-10-26 — Inc-2 commité (`a83f0a1`). Inc-3 livré sur `feat/inc-3-mcp` (non commité) : serveur MCP (14 outils, dont les 12 requis), jetons à portée (UI Réglages), opérations asynchrones exécutées par le worker, inbox sécurisée + alias Windows/WSL, import d'URL anti-SSRF, autorisation liée à `expected_version`. Vérifié : 120 tests (dont 30 sécurité d'import, 8 MCP via client SDK réel) ; stack Docker 5 services healthy ; client MCP réel contre Docker (import par chemin Windows absolu → worker → brouillon → publish_now → publié après fermeture du client) ; jeton révoqué → 401, hôte étranger → 403. Non vérifié : connexion depuis WSL, enregistrement dans Claude Code (`claude mcp add`) laissé à l'utilisateur.

- 2026-10-26 — Inc-1 commité (`7192bed`). Inc-2 livré sur `feat/inc-2-scheduler` (non commité). Vérifié : lint, types, 82 tests (dont intégration : fuseaux/DST, concurrence, succès partiel, reprise après arrêt, rapprochement, Retry-After, jeton expiré, publications manquées, annulation) ; stack Docker complet healthy ; bout en bout navigateur + worker réel (publication immédiate vers 2 comptes → publiée + échec indépendants ; programmation à +2 min avec worker arrêté puis redémarré → publiée une seule fois ; arrêt propre SIGTERM). Défauts trouvés et corrigés : course sur l'état global (ADR-010), arrêt non propre du worker sous pnpm. Non couvert en bout en bout : politique « manquée » (> 10 min d'arrêt), couverte par les tests d'intégration.

- 2026-10-26 — Inc-1 livré sur la branche `feat/inc-1-socle` (non commité). Vérifié : lint, types, 40 tests (unitaires + intégration PostgreSQL/FFmpeg réels), build Next, `docker compose up --build` (migrate + admin + web healthy), parcours navigateur (connexion, import image/vidéo, refus d'un faux fichier, brouillon multi-plateforme, versionnage, duplication, réglages, Range vidéo, mobile/clair). Non couvert : pilote S3 non testé contre un vrai bucket ; pas de tests E2E Playwright automatisés (prévus Inc-6).

- 2026-10-26 — Lecture INTAKE + skills, environnement vérifié (Node 24, pnpm 10, Docker 29, Compose v5, FFmpeg 9). Plan de réalisation rédigé.
