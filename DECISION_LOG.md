# Journal de décisions (DECISION_LOG)

> ADR léger. Le plus récent en haut.

---

## ADR-010 — Verrou de publication avant toute modification de ses destinations

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (backend-engineer, suite à un défaut trouvé en test de bout en bout)
- **Contexte** : Deux destinations terminées au même instant recalculaient l'état global chacune sans voir l'autre (lecture « read committed ») : la publication restait « En cours » au lieu de « Partielle ».
- **Décision** : `lockPost` (`SELECT … FOR UPDATE` sur la publication) en tête de chaque transaction qui modifie des destinations, puis recalcul. Ordre unique publication → destinations (pas d'interblocage entre worker et interface). Test de régression ajouté.
- **Conséquences** : les fins de destinations d'une même publication sont sérialisées (coût négligeable).
- **Impact** : fiabilité

## ADR-009 — Résultat incertain, rapprochement et publications manquées

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (system-design)
- **Contexte** : L'INTAKE exige de ne jamais créer de doublon par une nouvelle tentative et de ne pas promettre « exactement une fois ».
- **Décision** :
  - Prise atomique d'une destination (`updateMany` conditionnel sur l'état, la date et le bail) : un seul exécutant possible, même avec des jobs en double.
  - Erreur « temporaire » = la plateforme n'a pas publié → nouvel essai avec backoff exponentiel (1 min → 1 h) ou `Retry-After` s'il est plus long ; quota mémorisé sur le compte. Abandon après 5 tentatives.
  - Délai dépassé après envoi, erreur inattendue ou worker arrêté en plein envoi (bail de 10 min expiré) → **Résultat incertain**. Si le connecteur sait retrouver une publication (clé d'idempotence), rapprochement automatique après 30 s : trouvée → publiée ; absente → nouvel envoi. Sinon décision manuelle (« c'est bien publié » / « renvoyer quand même », avec avertissement de doublon).
  - Publication jamais tentée en retard de plus de 10 min (worker arrêté) → politique des réglages : « me demander » (défaut, état *Manquée*), « publier si retard < 2 h », « annuler ».
  - Toute exécution vérifie que la version du contenu est celle qui a été autorisée.
- **Conséquences** : garantie « au plus une fois » quand le connecteur sait rapprocher ; sinon décision humaine explicite. Documenté pour chaque connecteur.
- **Impact** : métier / fiabilité (fort)

## ADR-008 — PostgreSQL source de vérité, Redis pour l'exécution

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (system-design)
- **Contexte** : Les programmations doivent survivre à un redémarrage, et Redis ne doit pas être indispensable à la cohérence.
- **Décision** : L'interface (et le MCP) n'écrivent que dans PostgreSQL. Le worker, toutes les 5 s : battement de vie, reprise des envois interrompus, politique des publications manquées, puis création des jobs BullMQ (identifiant déterministe, délai jusqu'à l'échéance) pour les destinations dues dans la minute. BullMQ 5.81.5 + ioredis 5.11.1 ; Redis 8.2 en AOF, non exposé.
- **Alternatives écartées** : jobs différés créés par l'interface (file à reconstruire, deux sources de vérité) ; BullMQ 6 (une semaine d'existence).
- **Conséquences** : latence maximale de « Publier maintenant » ≈ 5 s ; perte de Redis sans conséquence (reconstruction au cycle suivant). Le worker est lancé par `node --import tsx` (signal d'arrêt reçu, envois en cours terminés).
- **Impact** : technique / fiabilité

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
