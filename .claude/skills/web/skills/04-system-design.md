# 04 — System Design

> Phase 3. Conception détaillée : composants, API, flux, contrats. Le « comment » de l'architecture.

## 🎯 Mission
Détailler le fonctionnement interne : contrats d'API, flux de données entre modules, gestion
des états asynchrones, stratégies de cache et de résilience.

## 🟢 Definition of Ready
- Architecture globale validée (`docs/architecture.md`).

## 📥 Entrées
- `docs/architecture.md`, user stories, modèle de données préliminaire.

## 🛠️ Processus
1. Définir les **contrats** des Server Actions / Route Handlers : entrée (schéma Zod), sortie,
   erreurs possibles, code HTTP. Une source de vérité partagée client/serveur pour les types.
2. Modéliser les **flux** des parcours critiques (Mermaid sequence) : auth, lecture, mutation.
3. Définir la stratégie de **cache & revalidation** Next.js (`revalidatePath`/`revalidateTag`,
   durées), et de **TanStack Query** côté client (clés, invalidation, optimistic updates si utile).
4. Définir la **pagination** (cursor de préférence), le **tri**, le **filtrage** standardisés.
5. Concevoir la **résilience** : timeouts, retries (transitoire only), idempotence des mutations.
6. Définir les **états transverses** : loading / vide / erreur / succès pour chaque vue.

## 📤 Livrables
- `docs/system-design.md` : contrats d'API, diagrammes de séquence, stratégie cache/pagination.
- Types/`zod` partagés esquissés (`lib/validations`).

## ✅ Definition of Done
- Chaque parcours critique a un flux documenté de bout en bout.
- Chaque endpoint/action a un contrat typé et des erreurs définies.
- Stratégie de cache et de pagination explicite et cohérente.

## 🚨 Erreurs fréquentes & récupération
- **Contrats implicites** → formaliser avec Zod, c'est la frontière de confiance.
- **Cache mal invalidé** (données périmées) → cartographier qui écrit/lit chaque tag.
- **Mutation non idempotente** rejouée → ajouter clé d'idempotence ou contrôle d'unicité.

## ❓ Décisions autonomes vs questions
- **Décide seul** : forme des contrats, stratégie de cache, pagination.
- **Demande** : compromis fraîcheur des données vs coût (ex. revalidation très fréquente coûteuse).

## 🤝 Handoff → `05-database-architect`
Contrats et flux → modèle de données et policies qui les soutiennent.
