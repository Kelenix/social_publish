# Studio de publication

Outil personnel pour préparer, programmer et suivre des publications Instagram, TikTok, YouTube, X et
LinkedIn, depuis une interface web et (à venir) depuis Claude Code via un serveur MCP.

> **État : incrément 4 sur 6.** Disponibles : connexion administrateur, bibliothèque de médias,
> brouillons avec variantes, aperçu, publication immédiate et programmée, worker, calendrier,
> historique, **serveur MCP pour Claude Code** (`docs/mcp.md`), **connecteur YouTube**
> (`docs/youtube.md`) et un **connecteur de test (simulation)**.
> Le connecteur YouTube est vérifié par des tests de contrat ; il n'a pas encore été essayé contre la
> vraie API (il faut tes identifiants Google). Instagram, LinkedIn, X et TikTok arrivent ensuite.

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
3. Ouvrir http://localhost:3000 et se connecter avec `ADMIN_EMAIL` et `ADMIN_INITIAL_PASSWORD`
   (le compte est créé automatiquement au premier démarrage ; il n'y a pas de page d'inscription).
4. Après la première connexion, vider `ADMIN_INITIAL_PASSWORD` dans `.env` (le compte existe déjà ;
   le mot de passe se change dans **Réglages**).

Services : interface http://localhost:3000, serveur MCP http://127.0.0.1:3333/mcp (jeton à créer
dans **Réglages**, procédure dans `docs/mcp.md`).

Les services ne sont publiés que sur `127.0.0.1`. PostgreSQL n'est pas exposé (sauf override de
développement `compose.dev.yaml`, également limité à `127.0.0.1`).

## Programmation

- Les dates sont stockées en UTC avec le fuseau choisi (Europe/Rome par défaut). Une heure qui
  n'existe pas (passage à l'heure d'été) est refusée avec une proposition ; une heure qui existe
  deux fois (passage à l'heure d'hiver) demande de choisir laquelle.
- Programmer ou publier vaut **autorisation** pour la version enregistrée, ces comptes et cette
  date. Pour modifier ensuite : annuler la programmation (la publication redevient un brouillon).
- Chaque destination (compte) a son propre état : un échec n'entraîne jamais de nouvel envoi vers
  une destination déjà publiée.
- **La programmation locale exige un ordinateur allumé, connecté, sans veille, avec Docker actif.**
  Une publication manquée pendant un arrêt suit la règle des Réglages (par défaut : te demander de
  la reprogrammer).
- Un envoi dont le résultat est inconnu (coupure, délai dépassé) passe en **Résultat incertain** :
  vérification auprès de la plateforme avant tout nouvel envoi, sinon décision manuelle.

### Connecteur de test

Dans **Comptes**, ajoute un compte de test et choisis son comportement (réussite, erreur
temporaire, quota, résultat incertain, jeton expiré…). Le scénario peut aussi se choisir par
publication dans la variante « Test (simulation) ». Rien n'est envoyé à l'extérieur.

## Données

| Volume Docker | Contenu |
|---------------|---------|
| `pgdata` | Base PostgreSQL (source de vérité) |
| `media` | Originaux importés et vignettes (`/data/media`) |
| `redisdata` | File d'exécution (reconstructible à partir de PostgreSQL) |
| `./inbox` (dossier du projet) | Fichiers à importer via le MCP (lecture seule pour les conteneurs) |

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
- `docs/mcp.md` — connexion de Claude Code, dossier inbox, outils, exemples
- `docs/youtube.md` — créer les identifiants Google et connecter une chaîne
- `docs/integrations.md` — sources officielles vérifiées et limites
- `DECISION_LOG.md` — choix techniques
- `PROJECT_STATE.md` — avancement
- `docs/manual-tasks.md` — ce qu'il te reste à configurer
