# 01 — Standards de code

> Socle commun. Détails spécifiques dans les rôles ingénieurs. Référence : `[[08-clean-architecture]]`.

## Lisibilité avant tout

- Le code se lit comme une phrase. **Nommer pour l'intention**, pas pour l'implémentation.
- Une fonction = une responsabilité. Si on doit la décrire avec « et », la découper.
- Longueur indicative : fonctions ≤ 40 lignes, fichiers ≤ 400 lignes. Au-delà, justifier ou découper.
- Pas d'abréviations obscures. `user` pas `usr`, `index` pas `i` (sauf boucle locale triviale).

## Nommage (conventions)

| Élément              | Web (TS)            | Mobile (Dart)        |
|----------------------|---------------------|----------------------|
| Variables/fonctions  | `camelCase`         | `camelCase`          |
| Classes/Types        | `PascalCase`        | `PascalCase`         |
| Constantes           | `SCREAMING_SNAKE`   | `lowerCamelCase`     |
| Fichiers             | `kebab-case.ts`     | `snake_case.dart`    |
| Booléens             | préfixe `is/has/can`| préfixe `is/has/can` |

## Règles transverses

- **Typage strict.** TS en mode `strict`, Dart sans `dynamic` non justifié. Pas de `any`.
- **Pas de nombres/chaînes magiques.** Extraire en constantes nommées.
- **Immutabilité par défaut.** `const`/`final` ; éviter la mutation partagée.
- **Early return** plutôt que des `if` imbriqués profonds.
- **Commentaires = le pourquoi, pas le quoi.** Le code dit *ce qu'il fait* ; le commentaire
  explique *pourquoi* quand ce n'est pas évident.
- **Pas de logique dans l'UI.** La vue affiche ; la logique vit dans des services/hooks/providers.
- **DRY raisonné.** Factoriser après la 2ᵉ répétition réelle, pas par anticipation.

## Qualité automatisée (obligatoire)

- Formateur : Prettier (web) / `dart format` (mobile).
- Linter : ESLint (web) / `flutter analyze` avec `flutter_lints` (mobile).
- Hooks pre-commit : format + lint + typecheck (voir `[[07-git-workflow]]`).
- **Aucun warning ignoré sans commentaire justificatif** (`// ignore: reason`).

## Gestion des dépendances

- Préférer la lib standard. N'ajouter une dépendance que si elle est maintenue, populaire et
  remplace un volume de code significatif.
- Toute nouvelle dépendance est consignée dans `DECISION_LOG.md` (raison + alternative écartée).
- Versions épinglées ; pas de `latest` flottant en production.
