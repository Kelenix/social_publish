# 05 — Règles de test

> Tester à hauteur du risque. Rôle pilote : `qa-engineer`. Référence : `[[10-definition-of-done]]`.

## Pyramide de tests

```
        /\        E2E (peu, parcours critiques)
       /  \       Intégration (API, base, navigation)
      /____\      Unitaires (beaucoup, logique métier)
```

- **Unitaires** : logique pure, fonctions de service, validations, calculs. Rapides, isolés.
- **Intégration** : interaction entre couches (API ↔ DB, repository ↔ Supabase, navigation).
- **E2E** : parcours utilisateur critiques uniquement (inscription, paiement, action clé).

## Quoi tester en priorité (par le risque)

1. Logique métier et règles de calcul.
2. Sécurité : contrôle d'accès, policies RLS, validation des entrées.
3. Parcours critiques (ceux dont l'échec coûte de l'argent ou bloque l'utilisateur).
4. Cas limites et erreurs (entrées vides, null, réseau coupé, droits refusés).

## Ce qu'on ne teste pas

- Le code tiers (framework, lib) — on teste *notre* usage, pas la lib.
- Les getters/setters triviaux sans logique.

## Règles de qualité des tests

- Un test = un comportement. Nom explicite : `it('refuse l'accès si non authentifié')`.
- Pattern **AAA** : Arrange / Act / Assert.
- Tests **déterministes** (pas de dépendance à l'heure réelle, au réseau non mocké, à l'ordre).
- Données de test via factories, jamais des fixtures opaques copiées-collées.
- Un test qui échoue doit pointer clairement vers la cause.

## Couverture

- Cible : **couverture significative de la logique métier et des chemins de sécurité**, pas
  un pourcentage global gonflé par du code trivial.
- Indicateur, pas objectif : ne pas écrire de tests vides pour atteindre un chiffre.

## Intégration continue

- Tous les tests tournent en CI à chaque PR (voir `[[07-git-workflow]]`).
- Un merge est bloqué si les tests, le lint ou le typecheck échouent.
- Tout bug corrigé reçoit d'abord un **test de non-régression** qui reproduit le bug.
