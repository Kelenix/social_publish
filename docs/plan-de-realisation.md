# Plan de réalisation — Studio de publication multicanale (personnel)

> Phase 0 (cadrage). Source : `INTAKE.md`. Date : 2026-10-26.
> Statut : **en attente de validation** (mode PLAN_PUIS_VALIDATION).

## 1. Compréhension du besoin

**Objectif** : un outil personnel (1 administrateur) pour créer, gérer, programmer et suivre des
publications sur Instagram, TikTok, YouTube, X et LinkedIn, pilotable depuis une **interface web**
et depuis **Claude Code via un serveur MCP** maison. Exécution locale sous Windows + Docker
Desktop, puis déploiement sur VPS.

**Périmètre MVP**
- Bibliothèque de médias (import, stockage durable, métadonnées via ffprobe, aperçus).
- Brouillons : contenu principal + variantes par plateforme, validation selon les capacités réelles
  du connecteur, aperçu.
- Publication immédiate / programmée / duplication / annulation, **état indépendant par destination**.
- Scheduler fiable (PostgreSQL = vérité, Redis/BullMQ = exécution), worker séparé, idempotence,
  backoff, Retry-After, état « résultat incertain » + rapprochement avant retry.
- Modèles de workflow (comptes, formats, fuseau, mode de validation).
- Serveur MCP (12 outils minimum), autorisations liées à la version du contenu.
- Connecteurs : test (simulation, clairement étiqueté), puis réels via API officielles + OAuth ;
  TikTok en mode manuel (export) + interface d'adaptateur.
- Sécurité : auth admin, jetons API/MCP à portée révocables, tokens OAuth chiffrés, anti-SSRF,
  journal d'opérations, services sur loopback.
- Docker Compose, README FR, docs d'intégration/sauvegarde/VPS, tests prioritaires.

**Hors périmètre** : facturation, multi-tenant, multi-utilisateurs, éditeur graphique de
workflows, recadrage automatique, toute automatisation navigateur / cookies / mots de passe de
réseaux sociaux, publication publique pendant les tests sans accord explicite.

**Hypothèses retenues (trous du cahier des charges)**
| # | Hypothèse | Pourquoi |
|---|-----------|----------|
| H1 | La stack de l'INTAKE **remplace** la stack par défaut du skill (pas de Supabase/Vercel) | L'INTAKE est la loi ; Docker local + VPS |
| H2 | Les règles « RLS Supabase » sont remplacées par : autorisation serveur systématique + Postgres non exposé + jetons à portée | Pas de Supabase, mono-admin |
| H3 | Monorepo pnpm : `apps/web`, `apps/worker`, `apps/mcp`, `packages/core`, `packages/db` | Logique de publication écrite une seule fois |
| H4 | MCP en **Streamable HTTP** sur `127.0.0.1` + jeton Bearer ; dossier `inbox/` monté dans Docker pour `import_media` | Fonctionne depuis Windows et WSL sans dépendre de Node côté hôte |
| H5 | URLs médias publiques = URLs signées à durée limitée servies via `PUBLIC_BASE_URL` (tunnel HTTPS en dev, ex. Cloudflare Tunnel gratuit) | Les plateformes ne peuvent pas lire localhost |
| H6 | Publication manquée pendant l'arrêt → état `À reprogrammer` (pas de rattrapage automatique), politique modifiable | Demandé dans l'INTAKE |
| H7 | Polices : Inter (UI) + JetBrains Mono (données techniques) ; accent jaune, neutres zinc | ≤ 2 polices |
| H8 | Le `CLAUDE.md` existant est **complété** (section architecture/commandes), pas écrasé | Il contient les règles du skill |

## 2. Architecture cible (résumé)

```
                ┌──────────── Docker Compose (ports liés à 127.0.0.1) ────────────┐
 Navigateur ──► │ web (Next.js : UI + API REST + OAuth callbacks + URLs signées)   │
 Claude Code ─► │ mcp (SDK MCP officiel, Streamable HTTP, Bearer)                  │
                │ worker (BullMQ : publish, poll statut, rapprochement, ffprobe)   │
                │ postgres (Prisma, source de vérité)   redis (exécution des jobs) │
                │ volumes : data/media (stockage durable), inbox/ (imports MCP)    │
                └──────────────────────────────────────────────────────────────────┘
 packages/core : domaine (posts, variantes, destinations, autorisations), validation Zod,
                 connecteurs (interface + capacités), stockage (local | S3), scheduler.
```

## 3. Incréments verticaux (ordre imposé par l'INTAKE)

| Inc | Contenu | Critères d'acceptation clés |
|-----|---------|-----------------------------|
| **1** | Socle : monorepo, Docker Compose, Prisma + migrations, auth admin, UI (layout, thème clair/sombre), médias (upload, stockage durable, ffprobe, bibliothèque), brouillons + variantes, `CLAUDE.md` complété | `docker compose up --build` démarre ; je me connecte ; j'importe une vidéo, je vois durée/dimensions/format ; je crée un brouillon multi-plateforme |
| **2** | Scheduler + worker + connecteur de test : programmation UTC/IANA (Europe/Rome), DST, reconstruction des jobs au démarrage, verrou, idempotence, backoff, Retry-After, état incertain + rapprochement, publications manquées, calendrier, historique, tableau de bord (état worker) | Tests : changement d'heure, reprise après arrêt, pas de doublon, succès partiel, annulation |
| **3** | Serveur MCP : 12 outils, schémas stricts, opérations asynchrones, jetons à portée, sandbox `inbox/` anti-traversée, autorisations liées à la version | Claude Code liste les comptes, importe un média, crée un brouillon, programme avec intention explicite ; test auth MCP |
| **4** | Premier connecteur réel (selon tes accès — voir question Q1) avec OAuth (state + PKCE), chiffrement des tokens, refresh, capacités/états | Connexion OAuth réelle ; publication **privée/non publique** de test seulement avec ton accord |
| **5** | Autres connecteurs (YouTube, Instagram, LinkedIn, X) + TikTok mode manuel (export média + texte) et interface d'adaptateur | Chaque connecteur expose capacités, permissions, limites ; actions non autorisées désactivées |
| **6** | Vérification complète : lint, types, tests, revue sécurité ; README FR, `docs/integrations.md` (liens officiels + date de vérification), sauvegarde/restauration, migration VPS, config MCP + exemples | DoD projet cochée ; bilan honnête : testé / dépend de tes identifiants / nécessite une approbation externe |

## 4. Rôles activés (chargement progressif)

Inc-1 : 03 Solution Architect → 05 DB Architect → 06 UI/UX → 08 Backend ⇄ 07 Frontend, 09 Sécurité
Inc-2 : 04 System Design (scheduler) → 08 Backend → 13 QA
Inc-3 : 08 Backend + 09 Sécurité → 13 QA
Inc-4/5 : 08 Backend + 09 Sécurité (OAuth) → 13 QA
Inc-6 : 15 Code Reviewer → 12 DevOps → 14/18 Documentation → 16 Release

## 5. Risques & parades

| Risque | Parade |
|--------|--------|
| Accès API restreints (TikTok Direct Post, audit YouTube : vidéos forcées en privé pour projets non audités, Meta App Review, LinkedIn Community Management, X payant) | Capacités + états explicites par connecteur ; mode manuel ; rien de simulé présenté comme réel |
| Plateformes incapables de lire des médias locaux | URLs signées HTTPS via tunnel / VPS ; refus explicite si `PUBLIC_BASE_URL` absente |
| PC éteint/en veille → publications manquées | Bannière d'avertissement + état `À reprogrammer` ; programmation native quand disponible |
| Doublons après timeout réseau | Clés d'idempotence, état `incertain`, rapprochement avant retry, pas de promesse « exactly once » |
| Chemins Windows ↔ Docker pour le MCP | Dossier `inbox/` unique monté, chemins relatifs uniquement, doc Windows/WSL |

## 6. Tâches manuelles prévues (détaillées dans `docs/manual-tasks.md`)

Créer les applications développeur (Google Cloud, Meta, LinkedIn, X, TikTok), renseigner les
clés dans `.env`, installer un tunnel HTTPS (dev), choisir un domaine pour le VPS.

## 7. Questions ouvertes (regroupées)

- **Q1 — Premier connecteur réel (étape 4)** : quels accès développeur as-tu déjà ?
  Recommandation par défaut : **YouTube** (projet Google Cloud gratuit, OAuth en mode test
  suffisant pour un usage personnel ; limite : vidéos privées tant que le projet n'est pas audité).
  Sans réponse : YouTube.
- **Q2 — Feu vert** : l'INTAKE demande de démarrer immédiatement ; le `CLAUDE.md` impose une
  validation du plan. Je démarre l'incrément 1 dès ton accord.
