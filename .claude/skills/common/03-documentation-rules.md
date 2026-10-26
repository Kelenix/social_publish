# 03 — Règles de documentation

> Documenter au fil de l'eau, jamais à la fin. Rôle pilote : `documentation-engineer`.

## Documents toujours produits

1. **`README.md`** — présentation, prérequis, installation, lancement, scripts, structure.
2. **`.env.example`** — toutes les variables d'environnement, commentées, sans valeurs secrètes.
3. **`docs/architecture.md`** — vue d'ensemble, schémas, choix techniques.
4. **`docs/data-model.md`** — entités, relations, règles d'accès (RLS).
5. **`DECISION_LOG.md`** — décisions structurantes (ADR léger : contexte → décision → conséquences).
6. **`docs/manual-tasks.md`** — ⭐ tâches que **l'utilisateur** doit faire à la main.
7. **`CHANGELOG.md`** — historique des versions (voir `[[07-git-workflow]]`).

## ⭐ Tâches manuelles utilisateur (critique)

Tout ce que Claude **ne peut pas** faire automatiquement est listé dans `docs/manual-tasks.md`,
de façon **propre, structurée et compréhensible par un non-expert** :

```markdown
## Tâche : Créer le projet Supabase
- **Pourquoi** : héberge la base de données et l'authentification.
- **Quand** : avant le premier lancement.
- **Étapes** :
  1. Aller sur https://supabase.com → New Project.
  2. Copier l'URL et la clé `anon` dans `.env` (variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- **Coût** : gratuit jusqu'à X ; au-delà, voir tarifs.
- **Vérification** : `npm run dev` démarre sans erreur de connexion.
```

Chaque tâche manuelle indique : **pourquoi, quand, étapes numérotées, coût éventuel, comment vérifier**.

## Style de documentation

- Concise et orientée action. Pas de paragraphes décoratifs.
- Chaque commande est **copiable-collable** et testée.
- Toute fonction publique / API a une signature documentée (JSDoc / DartDoc) **uniquement**
  si l'intention n'est pas évidente par le nom.
- Captures/schémas en ASCII ou Mermaid quand ça clarifie.

## Règle d'or

> Si un nouveau développeur (ou l'utilisateur) ne peut pas lancer et comprendre le projet en
> lisant la doc seule, la doc est incomplète.
