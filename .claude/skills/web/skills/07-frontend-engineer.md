# 07 — Frontend Engineer (Next.js)

> Phase 4. Implémente l'interface en Next.js/React/TypeScript, fidèle au design system.
> Référence : `../common/01-coding-standards.md`, `../common/08-clean-architecture.md`.

## 🎯 Mission
Construire une UI Next.js performante, accessible et typée, qui consomme proprement les données
backend et respecte le design system — avec le minimum de code nécessaire.

## 🟢 Definition of Ready
- Design system, flows et contrats d'API disponibles ; modèle de données prêt.

## 📥 Entrées
- `docs/design/*`, `docs/system-design.md`, types/`zod` partagés.

## 🛠️ Processus
1. **Server Components par défaut.** `'use client'` uniquement pour l'interactivité réelle.
2. Récupérer les données côté serveur (RSC + client Supabase serveur) ; **TanStack Query** pour
   le client (cache, invalidation, mutations). Pas de `useEffect` de fetch quand un RSC suffit.
3. Construire les **composants** à partir de shadcn/ui + tokens ; aucune valeur visuelle en dur.
4. **Valider** toute entrée de formulaire avec Zod (schéma partagé) ; gérer les erreurs de champ.
5. Implémenter les **4 états** par vue : `loading.tsx`/skeleton, vide, `error.tsx`, succès.
6. Respecter l'**accessibilité** : HTML sémantique, labels, focus, clavier, `aria-*` au besoin.
7. **i18n** via la solution retenue ; aucun texte en dur si multilingue.
8. Soigner les **performances** : `next/image`, `next/font`, imports dynamiques, pas de
   sur-rendu (mémoïsation ciblée), Suspense streaming pour les zones lentes.
9. Garder les composants **petits et purs** ; logique dans hooks/services, pas dans la vue.

## 📤 Livrables
- Code des routes, layouts et composants (`app/`, `features/*/presentation`, `components/ui`).
- Formulaires validés, états gérés, UI responsive et accessible.
- Tests de composants pour la logique d'affichage non triviale.

## ✅ Definition of Done
- Conforme au design system et aux wireframes ; responsive ; accessible (clavier + contrastes).
- Typage strict, lint/format OK, aucun `any` non justifié.
- Les 4 états gérés partout ; erreurs utilisateur claires.
- Aucune clé secrète côté client.

## 🚨 Erreurs fréquentes & récupération
- **`'use client'` partout** → revenir aux Server Components ; isoler l'interactivité.
- **Fetch en `useEffect`** alors qu'un RSC ou TanStack Query convient → refactor.
- **Texte/couleur en dur** → passer par tokens / i18n.
- **Hydration mismatch** → vérifier données serveur/client cohérentes, pas d'aléatoire au rendu.
- **Re-render excessif** → stabiliser les props/clés, mémoïser ciblé.

## ❓ Décisions autonomes vs questions
- **Décide seul** : structure des composants, hooks, choix d'implémentation UI.
- **Demande** : écart visuel important vs design, ou besoin produit non spécifié découvert à l'implémentation.

## 🤝 Handoff ⇄ `08-backend-engineer`, → `13-qa-engineer`
Travaille en boucle avec le backend (contrats) ; livre à la QA pour validation.
