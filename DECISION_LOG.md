# Journal de décisions (DECISION_LOG)

> ADR léger. Le plus récent en haut.

---

## ADR-007 — Base de test non réinitialisée automatiquement

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (qa-engineer)
- **Contexte** : Prisma 7 refuse `migrate reset` lancé par un agent IA sans consentement explicite.
- **Décision** : Les tests d'intégration utilisent une base dédiée (`*_test`, garde-fou sur le nom), migrée par `migrate deploy` (non destructif). Les tests n'exigent pas une base vide (identifiants uniques, assertions locales).
- **Alternatives écartées** : contourner le garde-fou Prisma ; `DROP DATABASE` maison (même risque, contournement de l'intention).
- **Conséquences** : les données de test s'accumulent dans `studio_test` ; tu peux la supprimer à tout moment.
- **Impact** : technique (faible)

## ADR-006 — Authentification administrateur maison

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (security-engineer)
- **Contexte** : Un seul administrateur, pas de fournisseur d'identité externe souhaité.
- **Décision** : Mot de passe Argon2id (`@node-rs/argon2`), session par jeton aléatoire de 256 bits en cookie `httpOnly`/`SameSite=Lax` (`Secure` en HTTPS), seul le SHA-256 est stocké, expiration 30 jours, révocation de toutes les sessions au changement de mot de passe. Limiteur : 5 échecs / 15 min par e-mail. Compte créé une seule fois depuis `.env` par le service `migrate`.
- **Alternatives écartées** : Auth.js (surdimensionné pour un compte) ; page d'inscription au premier lancement (course possible sur un VPS).
- **Conséquences** : un tiers connaissant l'e-mail peut bloquer la connexion 15 min (accepté). Le limiteur est en mémoire (un seul processus web).
- **Impact** : sécurité (moyen)

## ADR-005 — Versions verrouillées

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (solution-architect)
- **Contexte** : Versions exactes (`save-exact`), `pnpm-lock.yaml` versionné.
- **Décision** : Next 16.4.3, React 19.3.1, Prisma 7.10.1 (la v8 est en RC), TypeScript 6.0.3 (TS 7 natif non supporté par typescript-eslint), ESLint 9.39 (eslint-config-next), Tailwind 4.3.3, Zod 4.6.7, Vitest 4.1.12, Node 24.16, PostgreSQL 18.1. BullMQ 5.x prévu à l'incrément 2 (la v6 date d'une semaine).
- **Conséquences** : montées de version volontaires et testées.
- **Impact** : technique

## ADR-004 — Médias : flux, analyse réelle, stockage durable

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (backend-engineer)
- **Contexte** : Vidéos volumineuses ; un job programmé ne doit pas dépendre du fichier d'origine.
- **Décision** : Upload en flux brut (pas de multipart en mémoire), limite de taille et SHA-256 au fil de l'eau, type déterminé par ffprobe (liste blanche JPEG/PNG/WebP/MP4/MOV/WebM), vignette ffmpeg, puis archivage sous une clé générée (`media/AAAA/MM/<uuid>.<ext>`). Interface `StorageDriver` : local (renommage atomique sur le volume) ou S3. Aucune transformation de l'original.
- **Alternatives écartées** : Server Actions pour l'upload (limite 1 Mo, mise en mémoire) ; confiance dans le Content-Type.
- **Conséquences** : l'upload passe par `/api/media` (exclu du proxy Next pour éviter la mise en tampon).
- **Impact** : technique / sécurité

## ADR-003 — Transport MCP et accès aux fichiers locaux

- **Date** : 2026-10-26
- **Statut** : Accepté (plan validé ; implémentation à l'incrément 3)
- **Décideur** : Claude (solution-architect)
- **Contexte** : Claude Code tourne sous Windows ou WSL ; l'app tourne dans Docker. L'import MCP doit être limité à un répertoire autorisé.
- **Décision** : Serveur MCP en Streamable HTTP lié à `127.0.0.1`, authentifié par jeton Bearer à portée. Import limité à un dossier `inbox/` du projet monté dans les conteneurs ; seuls des chemins relatifs à ce dossier sont acceptés (anti-traversée).
- **Alternatives écartées** : stdio (exige Node + accès DB depuis l'hôte, chemins Windows/WSL divergents).
- **Conséquences** : une seule config MCP valable Windows et WSL ; il faut déposer les fichiers dans `inbox/`.
- **Impact** : technique / sécurité (moyen)

## ADR-002 — Organisation monorepo

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (solution-architect)
- **Contexte** : L'INTAKE exige de partager la logique métier entre web, worker et MCP sans dupliquer la publication.
- **Décision** : pnpm workspaces : `apps/web`, `apps/worker`, `apps/mcp`, `packages/core` (domaine, validation, connecteurs, stockage, scheduler), `packages/db` (Prisma).
- **Alternatives écartées** : un seul paquet Next.js (le worker dépendrait du serveur web) ; Nx/Turborepo (outillage superflu pour ce volume).
- **Conséquences** : une seule implémentation de la publication, utilisée par les trois points d'entrée.
- **Impact** : technique

## ADR-001 — Stack de l'INTAKE au lieu de la stack par défaut du skill

- **Date** : 2026-10-26
- **Statut** : Accepté (imposé par l'INTAKE)
- **Décideur** : Claude (ai-project-director)
- **Contexte** : Le skill propose Supabase + Vercel ; l'INTAKE impose PostgreSQL + Prisma, Redis + BullMQ, worker Node, Docker Compose, exécution locale puis VPS.
- **Décision** : Suivre l'INTAKE. La règle « RLS Supabase obligatoire » est remplacée par : autorisation côté serveur sur chaque route/outil, Postgres et Redis non exposés, jetons à portée révocables. shadcn/ui, Tailwind, Zod, Vitest, Playwright restent utilisés.
- **Alternatives écartées** : Supabase (incompatible avec l'exigence Docker auto-hébergé + Prisma) ; Vercel (incompatible avec un worker persistant).
- **Conséquences** : pas de RLS ; la sécurité repose sur la couche applicative mono-admin.
- **Impact** : technique / sécurité (moyen)

---

## ADR-000 — Modèle d'enregistrement

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Contexte** : Format des décisions.
- **Décision** : contexte → décision → alternatives écartées → conséquences → impact.
- **Conséquences** : traçabilité complète ; l'utilisateur peut revenir sur tout choix.
