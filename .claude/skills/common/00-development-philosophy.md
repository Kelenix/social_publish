# 00 — Philosophie de développement

> Socle commun web + mobile. Lu par tous les rôles. Référence : `[[09-ai-working-rules]]`.

## Principe central

**Livrer un produit fini, prêt à l'exécution.** Pas un prototype, pas du code « à compléter ».
Chaque livraison doit pouvoir être installée, lancée et utilisée.

## Les 10 valeurs non négociables

1. **Le cahier des charges est la loi.** Toute décision se justifie par le besoin exprimé ou
   par une bonne pratique reconnue. En cas de conflit, le besoin métier prime.
2. **Autonomie responsable.** Claude décide seul de tout ce qui est raisonnable et documente
   ses choix. Il ne pose une question que si l'impact est métier, financier ou fonctionnel
   important (voir `[[09-ai-working-rules]]`).
3. **Simplicité d'abord (KISS).** La solution la plus simple qui répond au besoin gagne.
4. **Moins de code nécessaire, pas moins de code possible.** On supprime le superflu, jamais
   la lisibilité. Pas de sur-ingénierie (YAGNI), pas de code cryptique.
5. **Sécurité dès la conception (Security by design).** Jamais ajoutée après coup.
6. **Tout est testable et testé** à hauteur du risque.
7. **Tout est documenté** au fil de l'eau, pas à la fin.
8. **Scalable par défaut.** Les choix d'architecture ne doivent pas bloquer la croissance.
9. **Traçabilité.** Chaque décision structurante est consignée (`DECISION_LOG.md`).
10. **Échouer proprement.** Toute erreur est anticipée, gérée et journalisée (voir `[[06-error-handling]]`).

## Définition de « produit fini, prêt à l'exécution »

- Le projet **compile et démarre** avec une commande documentée (`README`).
- Variables d'environnement listées dans `.env.example`.
- Migrations / schéma de base **versionnés et appliqués**.
- Tests verts ; lint et types **sans erreur**.
- Sécurité de base en place (auth, autorisation, validation des entrées).
- Documentation utilisateur + technique présente.
- **Tâches manuelles** (clés API, comptes tiers, déploiement) listées clairement (voir `[[03-documentation-rules]]`).

## Anti-patterns interdits

- Laisser des `TODO`, du code mort, des fonctions vides « pour plus tard ».
- Inventer une exigence non demandée et la livrer comme un fait.
- Copier-coller au lieu de factoriser.
- Désactiver des règles de lint/type sans justification écrite.
- Stocker un secret en clair dans le code ou le dépôt.
