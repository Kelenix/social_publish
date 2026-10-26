# CLAUDE.md — Studio de publication multicanale (Application WEB)

> Ce projet est construit avec le système de skills **AI Delivery Team**.
> 👉 Copie ce fichier à la racine de ton projet web (il garde le nom `CLAUDE.md`).
> Claude Code le lit automatiquement à chaque session — plus besoin de coller les chemins.

## Stack du projet
Imposée par `INTAKE.md` (remplace la stack par défaut du skill, voir ADR-001) :
Next.js 16 (App Router, TypeScript 6) · PostgreSQL 18 + Prisma 7 · Redis + BullMQ 5 · worker Node ·
SDK MCP officiel · Zod 4 · FFmpeg/ffprobe · Tailwind CSS 4 · Vitest · Docker Compose. Pas de Supabase ni de
Vercel : la règle « RLS obligatoire » ci-dessous est remplacée par l'autorisation serveur systématique.

## Architecture (monorepo pnpm)
| Paquet | Rôle |
|--------|------|
| `packages/db` | Schéma Prisma, migrations, client (`prisma`, créé à la première utilisation) |
| `packages/core` | Logique métier partagée web / worker / MCP : config, auth, audit, stockage (local \| S3), médias (ffprobe), publications (schéma Zod pur + service) |
| `apps/web` | Interface + API (Next.js, sortie standalone) |
| `apps/worker`, `apps/mcp` | Incréments 2 et 3 |

Conventions :
- Toute logique de publication vit dans `packages/core` ; les apps n'appellent que ses fonctions.
- `@app/core/posts/schema` et `@app/core/platforms` sont **purs** (importables côté client) ; le reste est serveur.
- Chaque page, action serveur et route API appelle `requireUser()` / `getCurrentUser()` ; le proxy ne fait
  qu'une redirection de confort.
- Une modification du contenu publiable incrémente `Post.version` (empreinte `contentFingerprint`).
- Toute action notable écrit dans `AuditLog` (jamais de secret dans `meta`).
- Textes d'interface en français.

## Commandes
```bash
docker compose up --build                                   # stack complète (http://localhost:3000)
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres   # Postgres seul, port 127.0.0.1:${POSTGRES_PORT}
pnpm dev            # Next.js sur l'hôte (charger .env)
pnpm lint && pnpm typecheck && pnpm test
pnpm db:migrate     # nouvelle migration (dev)
```
Les tests d'intégration utilisent `TEST_DATABASE_URL` (base `*_test`, migrée avec `migrate deploy`, jamais
réinitialisée automatiquement). Sans cette variable, ils sont ignorés.

## Où se trouvent les skills
Les dossiers `common/` et `web/` du système doivent être accessibles dans ce projet, de
préférence sous **`.claude/skills/`** (ou installés une fois pour toutes dans `~/.claude/skills/`).
Si tu les places ailleurs, adapte les chemins ci-dessous.

## Au démarrage / quand je te demande de construire
1. Lis `.claude/skills/web/SKILL.md` (orchestrateur), puis
   `.claude/skills/web/skills/00-ai-project-director.md` (protocole complet).
2. Lis `.claude/skills/common/09-ai-working-rules.md` (décider seul vs me demander).
3. Lis `INTAKE.md` (mon cahier des charges, à la racine du projet). S'il manque, copie
   `.claude/skills/web/templates/INTAKE.md` → `INTAKE.md` et demande-moi de le remplir.
4. Applique le protocole : **reformulation → plan de réalisation → exécution par phases**.

## Règles permanentes (rappel — la source complète est dans `common/`)
- **Décide seul et documente** dans `DECISION_LOG.md`. Ne me pose une question QUE sur impact
  **métier / financier / fonctionnel majeur / légal / irréversible** (questions regroupées).
- **Plan d'abord** ; **chargement progressif** (un fichier de rôle par phase).
- **Sécurité** : RLS Supabase **obligatoire** sur toutes les tables ; aucun secret en clair ;
  valider et autoriser **côté serveur**.
- **Code professionnel** : propre, scalable, **minimum de code nécessaire** (sans nuire à la
  lisibilité) ; pas de sur-ingénierie, pas de TODO laissé.
- **Vérifie avant de dire « fait »** : lint + types + tests verts ; honnêteté sur les échecs
  (protocole d'erreur : `.claude/skills/common/06-error-handling.md`).
- **Suis l'avancement** dans `PROJECT_STATE.md` ; liste les **tâches manuelles** dans
  `docs/manual-tasks.md` (comptes, clés API, domaine…).
- Respecte la **Definition of Ready / Done** (`.claude/skills/common/10-definition-of-done.md`).

## Comment je lance le projet
Je dirai simplement : **« Lis INTAKE.md et lance le projet selon le skill. »**
Mode par défaut : **PLAN_PUIS_VALIDATION** (présente le plan et attends mon feu vert avant de
coder). Si j'écris **AUTONOME**, enchaîne l'implémentation sans pause, en ne m'interrompant que
sur impact fort.
