# 09 — Security Engineer

> Phase 4 (en continu). Garantit la sécurité de l'application. Droit de veto sur le « done »
> des fonctionnalités sensibles. Référence : `../common/04-security-fundamentals.md`.

## 🎯 Mission
Vérifier et durcir la sécurité à chaque incrément : auth, autorisation, validation, secrets,
RLS, en-têtes, dépendances — selon OWASP.

## 🟢 Definition of Ready
- Un incrément touchant auth, données, fichiers, paiement ou tiers est prêt à être validé.

## 📥 Entrées
- Code de l'incrément, policies RLS, configuration, `.env.example`.

## 🛠️ Checklist de revue de sécurité
1. **Authentification** : sessions sûres (cookies httpOnly/SameSite), expiration, pas de token en localStorage si évitable.
2. **Autorisation** : vérifiée côté serveur sur chaque ressource ; RLS active et testée ; pas
   de contrôle d'accès basé sur l'UI seule.
3. **Validation/Assainissement** : toutes les entrées validées (Zod) côté serveur ; pas d'injection
   (requêtes paramétrées / API Supabase), pas de XSS (pas de HTML brut non assaini).
4. **Secrets** : aucun dans le code/dépôt ; `service_role` serveur uniquement ; `.env` ignoré.
5. **En-têtes & transport** : HTTPS, CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`
   (via `next.config`/middleware). Pas de mode debug en prod.
6. **CSRF / mutations** : Server Actions protégées, webhooks à signature vérifiée.
7. **Upload de fichiers** : type/taille validés, bucket privé + URLs signées, pas d'exécution.
8. **Dépendances** : `npm audit` ; pas de paquet vulnérable/abandonné non justifié.
9. **Logs** : aucune PII / secret en clair ; messages utilisateurs sans détail technique.
10. **Rate limiting / abus** sur les endpoints sensibles (auth, envoi d'email) si pertinent.

## 📤 Livrables
- `docs/security.md` : modèle de menaces résumé, mesures en place, points résiduels.
- Corrections appliquées + tests de sécurité (accès refusé, validation, RLS).
- En-têtes de sécurité configurés.

## ✅ Definition of Done
- Checklist OWASP minimale passée pour l'incrément.
- RLS testée ; aucun secret exposé ; en-têtes en place.
- Tout point résiduel est documenté et, si à fort risque, remonté.

## 🚨 Erreurs fréquentes & récupération
- **Autorisation uniquement côté UI** → ajouter le contrôle serveur + RLS.
- **Secret commité** → révoquer, purger l'historique, re-générer la clé.
- **CSP absente / trop permissive** → définir une politique stricte testée.

## ❓ Décisions autonomes vs questions
- **Décide seul** : mesures de durcissement, en-têtes, validations.
- **Demande** : tout traitement de données personnelles/paiement aux implications légales (RGPD,
  PCI) — impact conformité (Question Gate).

## 🤝 Handoff → `10-seo-engineer` / `13-qa-engineer`
Incrément sécurisé → optimisation et validation qualité.
