# 04 — Fondamentaux de sécurité

> Security by design. Approfondi dans `security-engineer`. À appliquer par TOUS les rôles.

## Les règles de base (toujours)

1. **Ne jamais faire confiance aux entrées.** Valider et assainir côté serveur **et** client.
   Validation au plus près de la frontière (schémas Zod / validators Dart).
2. **Aucun secret dans le code ou le dépôt.** Tout passe par variables d'environnement.
   `.env` est dans `.gitignore` ; seul `.env.example` est versionné.
3. **Principe du moindre privilège.** Chaque clé, rôle, table n'a que les droits strictement
   nécessaires.
4. **Authentification ≠ Autorisation.** Vérifier l'identité *et* le droit d'accès à chaque
   ressource sensible, côté serveur.
5. **Chiffrement en transit (HTTPS/TLS) obligatoire.** Données sensibles chiffrées au repos.
6. **Messages d'erreur muets.** Jamais de stack trace, requête SQL ou détail interne exposé
   à l'utilisateur final (voir `[[06-error-handling]]`).

## OWASP — vérifications minimales

- **Injection** (SQL, NoSQL, commandes) → requêtes paramétrées / ORM, jamais de concaténation.
- **XSS** → échappement par défaut, pas de `dangerouslySetInnerHTML` / HTML brut non assaini.
- **Broken access control** → contrôle d'accès au niveau données (RLS Supabase), pas seulement UI.
- **CSRF** → tokens / SameSite cookies sur les mutations.
- **Auth faible** → mots de passe hashés (bcrypt/argon2 via le provider), MFA si pertinent,
  sessions expirables.
- **Dépendances vulnérables** → audit régulier (`npm audit`, `dart pub outdated`).
- **Mauvaise config** → en-têtes de sécurité (CSP, HSTS), pas de mode debug en prod.

## Spécifique Supabase (web + mobile)

- **Row Level Security (RLS) ACTIVÉE sur TOUTES les tables**, sans exception. Une table sans
  policy = accès refusé par défaut. C'est le point de sécurité n°1 du projet.
- La clé `service_role` ne quitte **jamais** le serveur / les fonctions edge. Le client n'a
  que la clé `anon`.
- Policies écrites et **testées** (un utilisateur ne lit/modifie que ses données).

## Données personnelles (RGPD / vie privée)

- Collecter le minimum. Documenter quelles données, pourquoi, durée de conservation.
- Prévoir suppression/export des données utilisateur si la nature du produit l'exige.
- Pas de log de données sensibles (mots de passe, tokens, PII) en clair.

## Règle d'arrêt

> Toute fonctionnalité touchant auth, paiement, données personnelles ou fichiers uploadés
> **doit** passer par la checklist `security-engineer` avant d'être marquée « done ».
