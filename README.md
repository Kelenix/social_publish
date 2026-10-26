# Studio de publication

Outil personnel pour préparer, programmer et suivre des publications sur **YouTube, Instagram,
LinkedIn, X et TikTok**, depuis une interface web ou depuis **Claude Code** (serveur MCP).
Il tourne en local avec Docker Desktop et peut ensuite être déplacé sur un VPS.

Ce que tu peux faire :
- importer images et vidéos (analyse réelle du fichier, original conservé, aucun recadrage) ;
- rédiger un contenu principal et des variantes par réseau, avec aperçu et vérification des limites
  de chaque réseau ;
- publier tout de suite ou programmer (fuseau IANA, changements d'heure gérés), dupliquer, annuler ;
- suivre chaque destination séparément (un échec n'en relance jamais une autre), dans le tableau de
  bord, le calendrier et l'historique ;
- piloter le tout depuis Claude Code, avec des jetons à portée limitée.

État des connecteurs : voir [docs/bilan.md](docs/bilan.md).

## Prérequis

- Docker Desktop (Windows, macOS) ou Docker Engine + Compose (Linux)
- Pour développer hors Docker : Node.js 24, pnpm 10 (`corepack enable`), FFmpeg dans le `PATH`

## Démarrage

1. Copier `.env.example` vers `.env`, puis renseigner au minimum :
   - `POSTGRES_PASSWORD` : longue valeur aléatoire ;
   - `ADMIN_EMAIL` et `ADMIN_INITIAL_PASSWORD` (12 caractères minimum) ;
   - `TOKEN_ENCRYPTION_KEY` (commande dans `.env.example`).
2. Lancer :
   ```bash
   docker compose up --build
   ```
3. Ouvrir http://localhost:3000 et se connecter avec `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD`.
   Il n'y a pas de page d'inscription : le compte est créé **une seule fois**, au premier démarrage.
4. Changer le mot de passe dans **Réglages**, puis vider `ADMIN_INITIAL_PASSWORD` dans `.env`.

Mot de passe perdu ou e-mail à changer : renseigner les nouvelles valeurs dans `.env` (12 caractères
minimum pour le mot de passe), puis
```bash
docker compose run --rm migrate pnpm admin:reset
```
Modifier `.env` sans cette commande n'a aucun effet sur un compte existant.

| Service | Adresse (boucle locale uniquement) |
|---------|-----------------------------------|
| Interface | http://localhost:3000 |
| Serveur MCP | http://127.0.0.1:3333/mcp |
| PostgreSQL, Redis | non exposés (sauf `compose.dev.yaml`, sur 127.0.0.1) |

## Connecter les réseaux

- YouTube : [docs/youtube.md](docs/youtube.md)
- Instagram, LinkedIn, X, TikTok (mode manuel), URL publique HTTPS : [docs/connecteurs.md](docs/connecteurs.md)
- Claude Code (MCP) : [docs/mcp.md](docs/mcp.md)

Pour essayer sans aucun réseau : **Comptes → Ajouter un compte de test** (connecteur de
simulation, toujours signalé comme tel, rien ne sort de ta machine).

## Programmation : ce qu'il faut savoir

- **En local, les publications ne partent que si l'ordinateur est allumé, connecté, hors veille,
  avec Docker actif.** Exception : la programmation native de YouTube (vidéo publique), publiée par
  YouTube lui-même.
- Programmer ou publier vaut **autorisation** pour la version enregistrée, ces comptes et cette
  date. Pour modifier ensuite : annuler (la publication redevient un brouillon) puis reprogrammer.
- Publication manquée pendant un arrêt : règle des **Réglages** (par défaut : te demander).
- Résultat inconnu (coupure, délai dépassé) : le Studio vérifie auprès du réseau avant tout renvoi ;
  s'il ne peut pas savoir, il te demande de trancher. Aucune garantie « exactement une fois » n'est
  promise là où l'API ne la permet pas.

## Exploitation

Sauvegarde, restauration, mise à jour et migration vers un VPS : [docs/exploitation.md](docs/exploitation.md).

```bash
scripts/backup.sh
```

## Développement

```bash
pnpm install
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres redis
pnpm db:deploy
pnpm dev
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e
```

`pnpm db:deploy` applique les migrations (charger `.env` avant). `pnpm e2e` lance le parcours navigateur contre l'application démarrée.

Les tests d'intégration utilisent PostgreSQL et FFmpeg réels (`TEST_DATABASE_URL`, base `*_test`).
Les connecteurs réels sont couverts par des **tests de contrat** (faux serveurs reproduisant les
échanges documentés), pas par des appels aux vraies API. La CI (`.github/workflows/ci.yml`) exécute
lint, types, tests, build et le parcours E2E sur le stack Docker.

## Documentation

| Fichier | Contenu |
|---------|---------|
| [docs/bilan.md](docs/bilan.md) | Ce qui fonctionne, ce qui est testé, ce qui dépend de toi |
| [docs/manual-tasks.md](docs/manual-tasks.md) | Tâches à faire de ton côté |
| [docs/integrations.md](docs/integrations.md) | Sources officielles vérifiées et limites des API |
| [docs/plan-de-realisation.md](docs/plan-de-realisation.md) | Plan et incréments |
| [DECISION_LOG.md](DECISION_LOG.md) | Choix techniques argumentés |
| [CHANGELOG.md](CHANGELOG.md) | Historique des versions |
| [CLAUDE.md](CLAUDE.md) | Architecture, commandes et conventions (pour Claude Code) |
