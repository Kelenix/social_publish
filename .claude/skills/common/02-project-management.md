# 02 — Gestion de projet

> Comment le projet avance, phase par phase. Piloté par `00-ai-project-director`.

## Les phases (toujours dans cet ordre)

| # | Phase                  | Rôle(s) pilote(s)                     | Sortie clé                          |
|---|------------------------|---------------------------------------|-------------------------------------|
| 0 | Cadrage & intake       | Project Director, Product Owner       | INTAKE validé, périmètre, hypothèses|
| 1 | Définition produit     | Product Owner                         | User stories, critères d'acceptation|
| 2 | Planification          | Project Manager                       | Backlog priorisé, jalons, risques   |
| 3 | Architecture & design  | Architecte, System Design, DB Architect, UI/UX | Schéma, modèle de données, maquettes |
| 4 | Implémentation         | Frontend, Backend, State, Sécurité    | Code fonctionnel par incrément      |
| 5 | Qualité                | QA, Performance, Code Reviewer        | Tests verts, revue passée           |
| 6 | Mise en production     | DevOps / Release, SEO/ASO             | Build déployable, pipeline CI/CD    |
| 7 | Documentation & passation | Documentation Engineer             | Docs + tâches manuelles utilisateur |
| 8 | Maintenance            | Maintenance Engineer                  | Plan de suivi, dette technique      |

## Découpage du travail

- Travailler par **incréments verticaux** livrables (une fonctionnalité de bout en bout)
  plutôt que par couches isolées.
- Chaque incrément a une **Definition of Ready** (entrée) et une **Definition of Done**
  (sortie, voir `[[10-definition-of-done]]`).
- Prioriser : **MVP d'abord** (le strict nécessaire au besoin), puis itérations.

## Suivi de l'avancement

- `PROJECT_STATE.md` est mis à jour à la fin de chaque phase/incrément : phase courante,
  ce qui est fait, ce qui reste, décisions ouvertes, blocages.
- Tout blocage métier/financier remonte immédiatement à l'utilisateur (voir `[[09-ai-working-rules]]`).

## Gestion des risques

- À la phase 2, lister les risques (technique, sécurité, dépendance tierce, coût) avec
  probabilité × impact et une parade pour chacun.
- Un risque « rouge » non couvert déclenche une question à l'utilisateur.

## Jalons & estimation

- Donner des estimations en **complexité relative** (S/M/L/XL), pas en heures absolues.
- Chaque jalon correspond à un état **démontrable et testable** du produit.
