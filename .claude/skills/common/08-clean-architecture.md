# 08 — Architecture propre & scalable

> Comment organiser le code pour qu'il reste compréhensible et évolutif. Référence : `[[01-coding-standards]]`.

## Objectif

Un code **scalable** : on peut ajouter une fonctionnalité sans tout casser, et un nouveau
développeur s'y retrouve en minutes, pas en jours.

## Principes structurants

- **Séparation des préoccupations.** UI / logique métier / accès données sont distincts.
- **Dépendances dirigées vers l'intérieur.** Le métier ne dépend pas de l'UI ni de la base ;
  l'inverse est vrai. On dépend d'abstractions, pas d'implémentations concrètes.
- **Feature-first.** Organiser par fonctionnalité (domaine) plutôt que par type technique.
- **Une source de vérité** par donnée. Pas d'état dupliqué et désynchronisé.

## Couches (vocabulaire commun)

| Couche         | Responsabilité                                   |
|----------------|--------------------------------------------------|
| Présentation   | Affichage, interactions, états visuels           |
| Application    | Cas d'usage, orchestration, règles d'enchaînement|
| Domaine        | Entités et règles métier pures (sans framework)  |
| Infrastructure | Accès données (Supabase), réseau, stockage, tiers|

> Sur un petit projet, on n'invente pas 4 dossiers vides : on applique l'**esprit** (séparer
> métier et accès données) sans sur-structurer. La complexité de l'architecture suit la
> complexité du besoin (voir `[[00-development-philosophy]]` : pas de sur-ingénierie).

## Organisation par fonctionnalité (exemple générique)

```
src/
├── features/
│   └── <feature>/
│       ├── domain/         # entités, règles métier
│       ├── data/           # repositories, accès Supabase
│       ├── application/    # cas d'usage, services
│       └── presentation/   # UI (composants / widgets)
├── shared/                 # utilitaires, types, UI réutilisable
└── core/                   # config, client Supabase, erreurs, constantes
```

## Règles anti-dette

- Pas de dépendance circulaire entre features.
- Le `shared` ne dépend d'aucune feature.
- Une fonction métier ne connaît jamais le détail d'affichage ni l'URL d'une API.
- Refactorer dès qu'une duplication réelle apparaît (règle des 3), sans attendre « plus tard ».

## Scalabilité

- Pagination par défaut sur toute liste pouvant grandir.
- Pas de requête N+1 ; charger ce qui est affiché, paresseusement le reste.
- Points d'extension prévus là où le besoin évoluera probablement — sans construire pour
  des besoins hypothétiques (YAGNI).
