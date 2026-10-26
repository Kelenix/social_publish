# Journal des versions

Format inspiré de « Keep a Changelog » ; versions SemVer.

## [0.6.0] — 2026-10-26 — Vérification complète

- Tests de bout en bout Playwright (connexion, import, brouillon, publication par le worker, historique, calendrier).
- CI GitHub Actions : lint, types, tests (PostgreSQL + FFmpeg), build, parcours E2E sur le stack Docker.
- Content-Security-Policy en production ; contrôle d'origine des uploads compatible 127.0.0.1, tunnel et proxy.
- Scripts de sauvegarde et de restauration (vérifiés par une restauration à blanc).
- Commande `admin:reset` pour réaligner l'administrateur sur `.env`.
- Message clair quand un réseau refuse un type de média.
- Documentation d'exploitation (VPS, mises à jour) et bilan final.

## [0.5.0] — 2026-10-26 — Connecteurs Instagram, LinkedIn, X, TikTok manuel

- Instagram (conteneurs, carrousel, Reels) avec URLs HTTPS signées et temporaires.
- LinkedIn (profil et pages, images, vidéos multipart, texte « little »).
- X (OAuth 2.0 + PKCE, upload v2, crédits, limites de débit).
- TikTok en mode manuel (export du texte et de l'original) avec interface d'adaptateur.

## [0.4.0] — 2026-10-26 — Connecteur YouTube

- OAuth avec state à usage unique et PKCE ; jetons chiffrés AES-256-GCM hors base.
- Upload reprenable, suivi upload / traitement / publication, programmation native et annulation.

## [0.3.0] — 2026-10-26 — Serveur MCP

- 14 outils pour Claude Code, jetons à portée révocables, imports asynchrones, dossier inbox sécurisé, autorisation liée à la version.

## [0.2.0] — 2026-10-26 — Programmation et worker

- Destinations indépendantes, worker BullMQ, reprise après arrêt, rapprochement, fuseaux et changements d'heure, connecteur de simulation, calendrier, historique.

## [0.1.0] — 2026-10-26 — Socle

- Monorepo, PostgreSQL + Prisma, authentification, médias analysés par ffprobe, brouillons et variantes, Docker Compose.
