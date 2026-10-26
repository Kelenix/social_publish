# Studio de publication

Outil personnel pour préparer, programmer et suivre des publications Instagram, TikTok, YouTube, X et
LinkedIn, depuis une interface web et (à venir) depuis Claude Code via un serveur MCP.

> **État : incrément 1 sur 6.** Disponibles : connexion administrateur, bibliothèque de médias,
> brouillons avec variantes par plateforme et aperçu. La programmation, le worker, le serveur MCP et
> les connecteurs réels arrivent dans les incréments suivants (voir `docs/plan-de-realisation.md`).
> Aucune publication n'est envoyée à un réseau social à ce stade.

## Prérequis

- Docker Desktop (Windows, macOS ou Linux)
- Pour développer hors Docker : Node.js 24, pnpm 10 (`corepack enable`), FFmpeg dans le `PATH`

## Démarrage

1. Copier `.env.example` vers `.env` et renseigner au minimum :
   - `POSTGRES_PASSWORD` : longue valeur aléatoire ;
   - `ADMIN_EMAIL` et `ADMIN_INITIAL_PASSWORD` (12 caractères minimum).
2. Lancer :
   ```bash
   docker compose up --build
   ```
3. Ouvrir http://localhost:3000 et se connecter.
4. Après la première connexion, vider `ADMIN_INITIAL_PASSWORD` dans `.env` (le compte existe déjà ;
   le mot de passe se change dans **Réglages**).

Les services ne sont publiés que sur `127.0.0.1`. PostgreSQL n'est pas exposé (sauf override de
développement `compose.dev.yaml`, également limité à `127.0.0.1`).

## Données

| Volume Docker | Contenu |
|---------------|---------|
| `pgdata` | Base PostgreSQL (source de vérité) |
| `media` | Originaux importés et vignettes (`/data/media`) |

Les médias importés sont analysés par ffprobe (le type réel est lu dans le fichier, pas dans
l'extension), puis copiés dans le stockage de l'application : une publication ne dépend jamais du
fichier d'origine. Formats acceptés : JPEG, PNG, WebP, MP4, MOV, WebM. Taille maximale :
`MEDIA_MAX_BYTES` (4 Gio par défaut). Pour un stockage compatible S3, voir les variables `S3_*`.

## Développement

```bash
pnpm install
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres
pnpm db:deploy          # applique les migrations (charger .env au préalable)
pnpm dev
pnpm lint && pnpm typecheck && pnpm test
```

Les tests d'intégration (PostgreSQL + FFmpeg réels) nécessitent `TEST_DATABASE_URL` vers une base
dont le nom finit par `_test`.

## Documentation

- `docs/plan-de-realisation.md` — plan et incréments
- `DECISION_LOG.md` — choix techniques
- `PROJECT_STATE.md` — avancement
- `docs/manual-tasks.md` — ce qu'il te reste à configurer
