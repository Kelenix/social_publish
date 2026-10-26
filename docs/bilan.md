# Bilan de livraison — 26 octobre 2026

Version 0.6.0. Ce document répond à la demande du cahier des charges : ce qui fonctionne, ce qui a
été testé, ce qui dépend de tes identifiants, ce qui exige une approbation externe.

## 1. Ce qui fonctionne et comment c'est vérifié

| Fonction | Vérification |
|----------|--------------|
| Démarrage `docker compose up --build` (postgres, redis, migrate, web, worker, mcp) | Lancé à chaque incrément ; 5 services « healthy » |
| Connexion administrateur, sessions, limite d'essais | Tests unitaires + E2E navigateur |
| Médias : import en flux, analyse ffprobe, stockage durable, vignettes, lecture vidéo par plages | Intégration (FFmpeg réel) + navigateur |
| Brouillons, variantes par réseau, aperçu, versionnage, duplication | Intégration + E2E |
| Validation selon les capacités de chaque connecteur | Tests unitaires et de contrat |
| Programmation UTC + fuseau IANA, heures sautées/ambiguës | 7 tests (Europe/Rome, New York) |
| Worker : reconstruction de la file, verrous, idempotence, backoff, Retry-After, quotas | Intégration + test réel worker arrêté puis redémarré |
| Résultat incertain, rapprochement, pas de doublon | Intégration + contrat (YouTube, Instagram) |
| Succès partiel multi-réseaux, annulation, publications manquées | Intégration (+ E2E pour le succès partiel) |
| Tableau de bord, calendrier, historique, état du worker | Navigateur + E2E |
| Serveur MCP (14 outils), jetons à portée, Host/Origin, inbox, anti-SSRF | 8 tests avec le client SDK officiel + client réel contre Docker |
| Chiffrement des jetons OAuth, state + PKCE | Tests unitaires et de contrat |
| Sauvegarde / restauration | Restauration à blanc identique à l'original |
| Sécurité HTTP : CSP, nosniff, X-Frame-Options, ports sur 127.0.0.1 | Vérifié sur le stack Docker |

Chiffres à la livraison : 170 tests Vitest (unitaires, intégration PostgreSQL/FFmpeg, contrat),
2 tests E2E Playwright, lint et types sans erreur, aucune vulnérabilité connue (`pnpm audit --prod`).

## 2. État de chaque réseau

| Réseau | Implémenté | Testé contre la vraie API | Ce qu'il te reste à faire |
|--------|-----------|---------------------------|---------------------------|
| YouTube | Oui (upload reprenable, suivi, programmation native, annulation) | **Oui, le 26/10** : connexion OAuth (PKCE accepté), puis publication réelle d'une vidéo (upload → traitement → publiée, 1 tentative). Programmation native et annulation pas encore essayées en réel. | — |
| Instagram | Oui (images JPEG, carrousels, Reels) | Non | Application Meta, compte professionnel, URL publique HTTPS (tunnel) |
| LinkedIn | Oui (profil ; pages si accordées) | Non | Application LinkedIn, produits Share on LinkedIn + Sign In |
| X | Oui (texte, 4 images ou 1 vidéo) | Non | Application X, crédits API approvisionnés |
| TikTok | Mode manuel (export) + interface d'adaptateur | Sans objet | Publier depuis l'application TikTok |
| Test (simulation) | Oui | Sans objet (aucune API) | — |

Les connecteurs non testés en réel sont vérifiés par des **tests de contrat** : des faux serveurs
reproduisent les échanges décrits par la documentation officielle (consultée le 26/10/2026). Ils
n'excluent pas un écart avec le comportement réel ; le premier essai de chaque réseau sert à le
détecter.

## 3. Ce qui dépend de tes identifiants

- YouTube : fait (clés renseignées, chaîne connectée, publication réelle réussie).
- Instagram : `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `PUBLIC_BASE_URL` (HTTPS public).
- LinkedIn : `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
- X : `X_CLIENT_ID`, `X_CLIENT_SECRET` + crédits.
- Claude Code : un jeton créé dans Réglages, puis `claude mcp add …` (voir `docs/mcp.md`).

## 4. Ce qui exige une approbation externe

| Besoin | Approbation |
|--------|-------------|
| YouTube au-delà de 7 jours sans reconnexion | Passer l'application Google en production (vérification possible par Google) |
| Instagram pour d'autres comptes que les testeurs | App Review de Meta |
| LinkedIn : publier pour une page d'entreprise | Produit Community Management API (validation LinkedIn) |
| TikTok : publication directe visible publiquement | Audit de l'application par TikTok |
| X | Pas d'approbation, mais accès facturé à l'usage |

## 5. Limites connues et points non vérifiés

- Programmation locale : il faut un ordinateur allumé, connecté et sans veille, avec Docker actif.
  Seule la programmation native de YouTube n'en dépend pas.
- LinkedIn et X ne permettent pas de retrouver un post dont la réponse s'est perdue : décision manuelle.
- Valeurs retenues sans confirmation documentaire : LinkedIn 3000 caractères et portée
  `r_organization_admin` ; X 280 caractères en comptage simple.
- Connexion MCP depuis WSL non testée (Windows vérifié).
- CI GitHub : fichier prêt, jamais exécuté (pas de dépôt distant à ce jour).
- CSP avec `'unsafe-inline'` pour les scripts (pas de nonce) : protection partielle contre le XSS.

## 6. Couverture du cahier des charges

| Section INTAKE | Statut |
|----------------|--------|
| §1 Méthode (CLAUDE.md, docs vérifiées, implémentation réelle, honnêteté) | Couvert |
| §2 Stack (Next.js, PostgreSQL/Prisma, Redis/BullMQ, worker, SDK MCP, Zod, FFmpeg, Compose) | Couvert |
| §3 Interface (8 écrans, thème clair/sombre, jaune, 2 polices, tableau de bord) | Couvert ; les « modèles de workflow » se limitent aux réglages par défaut (fuseau, politique) — voir ci-dessous |
| §4 Médias et publications | Couvert |
| §5 Connexion des plateformes | Couvert (TikTok manuel, comme demandé) |
| §6 Workflows | Partiel : parcours guidé (média → comptes → variantes → vérification → publication → suivi) couvert ; **l'enregistrement de modèles de workflow nommés n'est pas implémenté** |
| §7 Programmation fiable | Couvert |
| §8 Serveur MCP | Couvert ; règles d'automatisation préautorisées non implémentées (toute publication exige une intention explicite) |
| §9 Sécurité | Couvert |
| §10 Docker et documentation | Couvert |
| §11 Tests et livraison | Couvert (tests prioritaires présents ; aucune publication publique faite) |

**Reste à faire, si tu le souhaites** : modèles de workflow enregistrables (comptes, formats
préférés, fuseau, mode de validation) et règles d'automatisation préautorisées pour le MCP.
