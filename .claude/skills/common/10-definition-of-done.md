# 10 — Definition of Ready & Definition of Done

> Les portes d'entrée et de sortie de chaque incrément. Garantit qu'on ne commence pas dans
> le flou et qu'on ne livre pas à moitié.

## Definition of Ready (DoR) — avant de commencer un incrément

Un incrément est « prêt » uniquement si :

- [ ] Il trace vers une exigence de l'INTAKE.
- [ ] Les critères d'acceptation sont écrits (Given/When/Then).
- [ ] Les dépendances (données, design, tâches manuelles) sont identifiées et disponibles.
- [ ] Les décisions structurantes nécessaires sont prises ou la question est posée.
- [ ] Le périmètre est assez petit pour être livré et testé d'un bloc.

## Definition of Done (DoD) — avant de marquer « terminé »

### Fonctionnel
- [ ] Tous les critères d'acceptation passent.
- [ ] États UI gérés : loading / vide / erreur / succès.
- [ ] Cas limites et erreurs gérés (voir `[[06-error-handling]]`).

### Qualité du code
- [ ] Lint, format et typecheck **sans erreur ni warning** non justifié.
- [ ] Pas de code mort, pas de `TODO` orphelin, pas de secret.
- [ ] Respecte `[[01-coding-standards]]` et `[[08-clean-architecture]]`.

### Tests
- [ ] Logique métier et chemins de sécurité testés (voir `[[05-testing-rules]]`).
- [ ] Tests verts en local **et** en CI.

### Sécurité
- [ ] Entrées validées ; autorisation vérifiée côté serveur.
- [ ] RLS active et testée si la donnée passe par Supabase (voir `[[04-security-fundamentals]]`).

### Documentation
- [ ] README / docs mis à jour.
- [ ] `.env.example` à jour.
- [ ] Nouvelles tâches manuelles ajoutées à `docs/manual-tasks.md`.
- [ ] Décisions consignées dans `DECISION_LOG.md`.

### Livraison
- [ ] L'app **démarre et tourne** avec la commande documentée.
- [ ] `PROJECT_STATE.md` mis à jour (phase, fait, reste).

## Definition of Done — du PROJET entier

- [ ] Chaque exigence de l'INTAKE est couverte (ou explicitement reportée et tracée).
- [ ] Build de production réussit ; pipeline CI/CD vert.
- [ ] Revue de sécurité finale passée.
- [ ] Documentation complète : un tiers peut installer, lancer et comprendre le produit.
- [ ] Toutes les tâches manuelles utilisateur sont listées et claires.

> Tant qu'une case n'est pas cochée, le travail **n'est pas** done. Pas de « presque fini ».
