# Tâches manuelles (à faire par toi)

> Complétée au fil des incréments avec les étapes exactes.

| # | Tâche | Nécessaire pour | État |
|---|-------|-----------------|------|
| M1 | Valider le plan (`docs/plan-de-realisation.md`) | Démarrer l'incrément 1 | ✅ |
| M2 | Choisir le 1er connecteur réel | Incrément 4 | ✅ YouTube |
| M5 | Après la 1re connexion, vider `ADMIN_INITIAL_PASSWORD` dans `.env` (le `.env` local actuel contient un mot de passe de développement généré) | Sécurité | ⬜ |
| M6 | (Optionnel) Supprimer la base `studio_test` si tu veux repartir de zéro pour les tests | Confort | ⬜ |
| M3 | Installer un tunnel HTTPS (ex. Cloudflare Tunnel) | Publication réelle de médias depuis le PC | ⬜ (incrément 4) |
| M4 | Créer le projet Google Cloud, activer YouTube Data API v3, configurer le consentement (toi en utilisateur test), créer l'ID client « Application Web » avec l'URL de retour `http://localhost:3000/api/oauth/youtube/callback`, renseigner `YOUTUBE_CLIENT_ID` et `YOUTUBE_CLIENT_SECRET` dans `.env` (procédure : `docs/youtube.md`) | Connecteur YouTube | ⬜ |
| M9 | Sauvegarder `TOKEN_ENCRYPTION_KEY` (déjà générée dans `.env`) hors du projet | Ne pas perdre les connexions | ⬜ |
| M11 | Instagram : application Meta + Instagram Login, URL publique HTTPS (tunnel) et `APP_URL` en HTTPS, compte professionnel testeur (procédure : `docs/connecteurs.md`) | Connecteur Instagram | ⬜ |
| M12 | LinkedIn : application + produits Share on LinkedIn et Sign In (OpenID), URL de retour ; Community Management API seulement pour les pages | Connecteur LinkedIn | ⬜ |
| M13 | X : application OAuth 2.0 (Web App), URL de retour, **crédits API** approvisionnés | Connecteur X | ⬜ |
| M14 | Premier test réel par réseau (contenu de test, de préférence peu visible) et retour sur ce qui a fonctionné | Valider les connecteurs contre les vraies API | ⬜ |
| M10 | Premier test réel YouTube en **privé**, puis me dire si la connexion OAuth (PKCE) et l'envoi ont fonctionné | Valider le connecteur contre la vraie API | ⬜ |
| M7 | Créer un jeton dans **Réglages → Jetons API et MCP**, puis lancer la commande `claude mcp add …` affichée (voir `docs/mcp.md`) | Utiliser le Studio depuis Claude Code | ⬜ |
| M8 | (Optionnel) Vérifier la connexion depuis WSL : `curl -i http://127.0.0.1:3333/health` | Claude Code sous WSL | ⬜ |
