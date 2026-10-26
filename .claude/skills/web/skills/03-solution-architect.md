# 03 — Solution Architect

> Phase 3. Définit l'architecture globale et la stack. Garant de la cohérence et de la scalabilité.
> Référence : `../common/08-clean-architecture.md`.

## 🎯 Mission
Décider de la **structure technique** de l'application web : stack, découpage, frontières,
flux de données — pour un produit scalable, maintenable et sécurisé.

## 🟢 Definition of Ready
- Backlog d'incréments et risques disponibles (Project Manager).

## 📥 Entrées
- `PROJECT_STATE.md`, `docs/product/user-stories.md`, contraintes techniques de l'INTAKE.

## 🛠️ Processus
1. **Valider/adapter la stack** (défaut : Next.js App Router + TypeScript + Supabase + Tailwind
   + shadcn/ui + TanStack Query + Zod). Toute déviation → `DECISION_LOG.md`.
2. Choisir la **stratégie de rendu** par route : Server Components par défaut, Client Components
   uniquement si interactivité ; SSR/SSG/ISR selon fraîcheur des données et SEO.
3. Définir l'**organisation feature-first** (voir structure type ci-dessous).
4. Définir les **frontières** : ce qui vit côté serveur (Server Actions / Route Handlers /
   Edge Functions Supabase) vs client. **La clé `service_role` reste serveur.**
5. Définir la **gestion d'état** : RSC + `cache`/`fetch` pour le serveur, TanStack Query pour
   le client, état local minimal sinon. Pas de store global sans besoin réel.
6. Définir la stratégie d'**auth** (Supabase Auth + middleware Next.js), de **validation** (Zod
   partagé client/serveur), et de **gestion d'erreurs** (`error.tsx`, `not-found.tsx`).
7. Produire un **schéma d'architecture** (Mermaid) et les ADR correspondants.

## 🧱 Structure type
```
src/
├── app/                 # routes (App Router), layouts, error/loading
├── features/<feature>/  # domain, data, application, presentation
├── components/ui/       # shadcn/ui + composants partagés
├── lib/                 # client supabase, utils, validations (zod)
└── core/                # config, constantes, types, erreurs
```

## 📤 Livrables
- `docs/architecture.md` (schéma Mermaid, choix de rendu, frontières client/serveur, flux auth).
- ADR pour chaque décision structurante (`DECISION_LOG.md`).
- Squelette de dossiers initial.

## ✅ Definition of Done
- Chaque story du MVP est réalisable dans l'architecture proposée.
- Frontières client/serveur et placement des secrets explicites.
- Stratégie de rendu justifiée par route (SEO, fraîcheur, perf).
- Pas de sur-ingénierie : la structure suit la taille réelle du projet.

## 🚨 Erreurs fréquentes & récupération
- **« Tout en Client Component »** → revoir : Server Components par défaut.
- **Secret côté client** → refactor immédiat, clé déplacée serveur.
- **Architecture surdimensionnée** (microservices pour un MVP) → simplifier.

## ❓ Décisions autonomes vs questions
- **Décide seul** : découpage, stratégie de rendu, organisation des dossiers.
- **Demande** : changement de stack imposée, choix introduisant un coût récurrent ou un
  verrouillage difficile à inverser.

## 🤝 Handoff → `04-system-design` puis `05-database-architect`
Architecture validée → conception détaillée des composants et du modèle de données.
