# Journal de décisions (DECISION_LOG)

> ADR léger. Le plus récent en haut.

---

## ADR-016 — Connecteur Facebook (Pages), hors cahier des charges initial

- **Date** : 2026-10-26
- **Statut** : Accepté (demande explicite de l'utilisateur)
- **Décideur** : Claude (backend + security-engineer)
- **Contexte** : Facebook ne figurait pas dans l'INTAKE ; l'utilisateur l'a demandé après la livraison.
- **Décision** :
  - Publication sur des **Pages** uniquement (l'API ne publie pas sur un profil) ; un compte par Page autorisée, « Permission manquante » si la tâche `CREATE_CONTENT` manque.
  - Jeton utilisateur longue durée → jetons de Page sans expiration, chiffrés ; le jeton utilisateur (≈ 60 j) sert seulement à l'upload vidéo reprenable.
  - Photos envoyées non publiées puis rattachées (`attached_media`) : une seule logique pour 1 ou plusieurs photos.
  - Programmation native 15 min à 29 jours (marges sur la plage documentée 10 min – 30 j) ; annulation = suppression de la publication programmée (non visible), contenu conservé dans le Studio.
  - Champs texte envoyés en `x-www-form-urlencoded` : le multipart convertit les sauts de ligne en `\r\n` (défaut détecté par les tests).
  - Rapprochement : post immédiat retrouvé par texte identique dans le fil ; vidéo ou post programmé → décision manuelle.
- **Alternatives écartées** : `file_url` pour les vidéos (exigerait une URL publique HTTPS) ; dépublication au lieu de suppression (pas d'opération documentée pour un post programmé).
- **Impact** : métier (moyen)

---

## ADR-015 — Vérification finale : E2E, CI, CSP, sauvegardes, réinitialisation de l'administrateur

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (qa-engineer, devops-engineer, security-engineer)
- **Décision** :
  - Playwright pour le parcours principal, uniquement avec le connecteur de simulation (aucune publication réelle) ; Chrome local (`PW_CHANNEL=chrome`) ou Chromium en CI.
  - CI GitHub Actions en deux jobs (qualité avec PostgreSQL + FFmpeg ; E2E sur le stack Docker avec un `.env` aléatoire jetable).
  - CSP en production (`'unsafe-inline'` pour les scripts faute de nonce) ; contrôle d'origine des uploads accepté si l'origine correspond à `APP_URL` ou à l'hôte interrogé.
  - `scripts/backup.sh` / `restore.sh` (pg_dump custom + archive du volume médias), restauration protégée par `--confirmer`, mode à blanc par variables.
  - `admin:reset` : modifier `.env` n'a d'effet qu'à la création ; une commande explicite réaligne l'administrateur et ferme ses sessions.
- **Alternatives écartées** : CSP à nonce (exige un rendu entièrement dynamique, gain limité pour un outil local) ; réinitialisation automatique au démarrage (changerait les identifiants à l'insu de l'utilisateur).
- **Impact** : qualité / sécurité / exploitation

---

## ADR-014 — Connecteurs Instagram, LinkedIn, X et TikTok manuel

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (backend + security-engineer)
- **Contexte** : Incrément 5 : couvrir les autres réseaux avec les seules API officielles, sans promettre ce qu'elles ne permettent pas.
- **Décision** :
  - **Instagram** : « Instagram API with Instagram Login » (compte professionnel, pas de page Facebook) ; médias fournis par **URLs HTTPS signées** (HMAC, 2 h) servies sous `PUBLIC_BASE_URL` ; refus si l'adresse est absente, en HTTP ou locale. Conteneur à usage unique ⇒ rapprochement sûr après une réponse perdue.
  - **LinkedIn** : Posts API versionnée (202610), Images/Videos API, texte « little » échappé ; pages d'entreprise seulement si `LINKEDIN_ORGANIZATIONS=true` (Community Management API accordée) ; un compte par profil et par page.
  - **X** : OAuth 2.0 + PKCE, upload v2 par segments de 4 Mo, attente bornée du traitement ; `402`/« credit » → échec « crédits insuffisants » sans nouvel essai automatique ; aucun tarif dans le code.
  - **Rapprochement « indéterminable »** (LinkedIn, X après envoi de la requête de création) : jamais de renvoi automatique, décision manuelle.
  - **TikTok** : mode manuel (copie du texte, téléchargement de l'original, marquage manuel tracé) + interface d'adaptateur non implémentée.
  - Les images ne sont jamais converties ni recadrées : un PNG est refusé pour Instagram plutôt que transformé.
- **Alternatives écartées** : Instagram via Facebook Login (exige une page Facebook) ; recherche du post perdu sur X (lecture payante) ; conversion automatique PNG → JPEG (modifie le média).
- **Conséquences** : Instagram nécessite une adresse HTTPS publique (tunnel en local) ; LinkedIn et X peuvent laisser une destination « résultat incertain » à trancher manuellement.
- **Impact** : métier / sécurité (moyen)

---

## ADR-013 — Connecteur YouTube : portées, programmation native, jetons chiffrés

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (backend + security-engineer)
- **Contexte** : Premier connecteur réel. L'INTAKE demande la programmation native quand elle existe, la gestion des annulations déjà transmises, le chiffrement des jetons hors base, OAuth state + PKCE.
- **Décision** :
  - Portées `youtube.upload` + `youtube.force-ssl` (lecture du statut et de la chaîne, `videos.update` pour annuler une programmation native). Portée non accordée → compte « Permission manquante ».
  - Jetons chiffrés AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, 32 octets, hors base) ; rafraîchissement automatique ; `invalid_grant` → « Reconnexion nécessaire ».
  - OAuth : `state` aléatoire à usage unique (haché, 10 min), PKCE S256, vérificateur chiffré.
  - Visibilité **privée par défaut** ; déclaration « conçue pour les enfants » obligatoire ; divulgation de contenu synthétique proposée.
  - Programmation native pour une vidéo publique prévue à plus de 15 min : envoi immédiat en privé avec `publishAt` (publication sans le PC). Annulation = repasse en privée sans `publishAt` ; la vidéo n'est jamais supprimée automatiquement.
  - Upload reprenable, URL de session conservée en base : reprise après coupure, rapprochement après arrêt, sans doublon.
  - Quota épuisé → attente jusqu'à minuit, heure du Pacifique.
- **Alternatives écartées** : `youtube.upload` + `youtube.readonly` seulement (moins de droits, mais pas d'annulation distante) ; suppression de la vidéo à l'annulation (irréversible).
- **Conséquences** : la portée `force-ssl` permet aussi de modifier ou supprimer des vidéos ; le Studio ne s'en sert que pour lire et repasser en privé. Revenir à des portées plus étroites reste possible (en renonçant à l'annulation distante).
- **Impact** : sécurité / métier (moyen)

---

## ADR-012 — Autorisation de publication liée à la version relue

- **Date** : 2026-10-26
- **Statut** : Accepté
- **Décideur** : Claude (security-engineer)
- **Contexte** : L'INTAKE exige une intention explicite, liée à la version du contenu, aux médias, aux comptes et à la date, invalidée par toute modification substantielle.
- **Décision** : `schedule_post` / `publish_now` exigent la portée `publish` et `expected_version` (comparé sous verrou). La destination mémorise `contentVersion`, comptes, date, auteur (`mcp:<nom du jeton>`) ; le worker refuse une autre version. Les médias et variantes font partie de l'empreinte de version. Pas de règles d'automatisation implicites dans le MVP.
- **Alternatives écartées** : simple booléen `confirm` (n'empêche pas d'autoriser un contenu modifié entre-temps).
- **Conséquences** : Claude doit relire (aperçu) puis citer la version ; toute modification impose une nouvelle autorisation.
- **Impact** : métier / sécurité (fort)

## ADR-011 — Serveur MCP HTTP sans session, imports exécutés par le worker

- **Date** : 2026-10-26
- **Statut** : Accepté (précise ADR-003)
- **Décideur** : Claude (solution-architect)
- **Contexte** : Claude Code sous Windows ou WSL ; l'application dans Docker ; actions longues à rendre asynchrones.
- **Décision** : SDK officiel 1.32.2, Streamable HTTP sans session (un serveur par requête, réponses JSON), port publié sur `127.0.0.1:3333`, contrôle `Host`/`Origin`, jeton Bearer (`stp_…`, SHA-256 en base, portées `read`/`write`/`publish`, expiration, révocation). `import_media` crée une `Operation` et rend la main ; le worker l'exécute (FFmpeg dans son image). Inbox montée en lecture seule ; alias de chemins Windows/WSL (`INBOX_HOST_ALIASES`). Import d'URL : HTTPS seulement, résolution DNS vérifiée et connexion à l'adresse vérifiée, redirections revérifiées.
- **Alternatives écartées** : stdio (Node + base accessibles depuis l'hôte, chemins divergents) ; session MCP (inutile sans notifications serveur).
- **Conséquences** : une seule configuration Claude Code ; suivi par interrogation (`get_operation`).
- **Impact** : technique / sécurité

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
