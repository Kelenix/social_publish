# 07 — Workflow Git

> Historique propre et lisible. Rôle pilote : `release-manager` / DevOps.

## Branches

- `main` : toujours déployable. Jamais de commit direct.
- `develop` (optionnel sur petits projets) : intégration.
- `feat/<sujet>`, `fix/<sujet>`, `chore/<sujet>`, `docs/<sujet>` : branches de travail courtes.

## Commits — Conventional Commits

```
type(scope): résumé à l'impératif, ≤ 72 caractères

Corps optionnel : le POURQUOI du changement.
```

Types : `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`.

- **Un commit = un changement cohérent.** Pas de commit fourre-tout.
- Le message décrit l'intention, pas le diff.
- Pas de secret, pas de fichier généré (`/build`, `/.next`, `node_modules`) dans les commits.

## Pull Requests

- Petites, focalisées, avec description : contexte, ce qui change, comment tester.
- CI verte obligatoire (tests + lint + typecheck + build).
- Au moins une revue (`code-reviewer`) avant merge.
- Merge en **squash** par défaut pour garder un historique linéaire et lisible.

## Fichiers de gouvernance versionnés

- `.gitignore` adapté (web / Flutter).
- `.github/workflows/` : pipelines CI/CD.
- `CHANGELOG.md` mis à jour à chaque release (versionnage **SemVer** : MAJOR.MINOR.PATCH).
- `.github/PULL_REQUEST_TEMPLATE.md` si le projet grandit.

## Règles de sécurité Git

- Activer la protection de `main` (pas de force-push, PR obligatoire) — tâche manuelle
  utilisateur si nécessaire (voir `docs/manual-tasks.md`).
- Si un secret a fuité dans l'historique : le **révoquer immédiatement**, puis nettoyer
  l'historique. Ne jamais se contenter de le supprimer dans un commit suivant.

## Hooks (qualité automatique)

- `pre-commit` : format + lint + typecheck.
- `pre-push` (ou CI) : tests.
- Les hooks ne sont jamais contournés (`--no-verify`) sans accord explicite.
