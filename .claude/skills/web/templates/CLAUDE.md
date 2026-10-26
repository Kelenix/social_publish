# CLAUDE.md — <Nom du projet> (Application WEB)

> Ce projet est construit avec le système de skills **AI Delivery Team**.
> 👉 Copie ce fichier à la racine de ton projet web (il garde le nom `CLAUDE.md`).
> Claude Code le lit automatiquement à chaque session — plus besoin de coller les chemins.

## Stack du projet
Next.js (App Router, TypeScript) · Supabase (Postgres + Auth + Storage + RLS) ·
Tailwind CSS + shadcn/ui · TanStack Query · Zod · Vitest + Playwright · GitHub Actions · Vercel.

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
