# Intégrations externes — sources officielles et limites

> Chaque section indique les sources officielles consultées et la date de vérification.
> Les API évoluent : revérifier avant toute mise en production d'un connecteur.

## MCP (Model Context Protocol) — vérifié le 2026-10-26

| Élément | Valeur retenue |
|---------|----------------|
| Spécification | Révision **2025-11-25** — https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |
| SDK | `@modelcontextprotocol/sdk` **1.32.2** (SDK TypeScript officiel), `McpServer.registerTool` |
| Transport | Streamable HTTP, mode sans session, réponses JSON (`enableJsonResponse`) |
| Client | Claude Code — https://code.claude.com/docs/en/mcp (`claude mcp add --transport http … --header`) |

Exigences de sécurité de la spécification appliquées :
- validation de l'en-tête `Origin` (403 si présent et non autorisé) et de l'en-tête `Host`
  (protection DNS rebinding) ;
- écoute locale uniquement (port publié sur `127.0.0.1`) ;
- authentification de chaque requête (jeton Bearer à portée, révocable, haché en base).

Limites connues :
- pas de flux SSE serveur → client (GET renvoie 405) : les opérations longues se suivent par
  `get_operation` / `get_publication_status` ;
- pas d'OAuth MCP : jetons statiques créés dans l'interface (usage personnel, local).

## YouTube — vérifié le 2026-10-26

Sources officielles :
- videos.insert : https://developers.google.com/youtube/v3/docs/videos/insert
- Ressource video (limites des champs) : https://developers.google.com/youtube/v3/docs/videos
- Upload reprenable : https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- Ressource channel (`longUploadsStatus`) : https://developers.google.com/youtube/v3/docs/channels
- OAuth 2.0 (applications web serveur) : https://developers.google.com/identity/protocols/oauth2/web-server
- Expiration des jetons : https://developers.google.com/identity/protocols/oauth2

Faits relevés à cette date :
- Quota de videos.insert : « 100 calls per day », 1 unité dans la catégorie « Video Uploads ».
- Portées acceptées par videos.insert : `youtube.upload`, `youtube`, `youtubepartner`, `youtube.force-ssl`.
- Fichier : 256 Go maximum ; types `video/*` ou `application/octet-stream`.
- `snippet.title` : 100 caractères, sans `<` ni `>` ; `snippet.description` : 5000 octets, sans `<` ni `>` ;
  `snippet.tags` : 500 caractères au total, virgules comprises.
- `status.privacyStatus` : `public` par défaut si absent ; le Studio envoie toujours une valeur
  explicite (`private` par défaut).
- `status.publishAt` : uniquement pour une vidéo privée jamais publiée ; une date passée publie
  immédiatement.
- `status.uploadStatus` : `uploaded`, `processed`, `failed`, `rejected`, `deleted` (+ `failureReason`,
  `rejectionReason`).
- La documentation de `privacyStatus` indique désormais : « Videos uploaded from unverified API
  projects are not restricted to private viewing mode. » L'ancienne restriction (visibilité privée
  forcée pour les projets non audités) n'y figure plus.
- Upload reprenable : session via `Location`, statut via `Content-Range: bytes */TOTAL` → `308` +
  `Range`, reprise après perte de connexion ou `500/502/503/504`, `404` = session expirée.
- OAuth : `access_type=offline` pour obtenir un jeton de rafraîchissement ; `http://localhost`
  accepté comme URI de redirection ; projet externe en statut « Testing » → jeton de
  rafraîchissement expirant après 7 jours.
- `longUploadsStatus` : vidéos de plus de 15 min seulement si `allowed`.

Choix et limites du connecteur :
- PKCE (S256) est envoyé en plus du secret client ; la page « web server » ne le documente pas
  explicitement : **à confirmer lors de la première connexion réelle**.
- Portée `youtube.force-ssl` demandée pour lire l'état des vidéos et annuler une programmation
  native (voir ADR-013).
- Non testé contre la vraie API à ce stade : vérifié par des tests de contrat (faux serveur
  reproduisant les échanges documentés).

## Plateformes sociales

À compléter lors de l'implémentation de chaque connecteur (incréments 4 et 5), avec liens officiels,
permissions, URLs de retour OAuth, quotas et restrictions vérifiés à la date d'implémentation.

| Plateforme | État | Incrément |
|------------|------|-----------|
| YouTube | Implémenté ; test réel en attente de tes identifiants | 4 |
| Instagram | Non implémenté | 5 |
| LinkedIn | Non implémenté | 5 |
| X | Non implémenté | 5 |
| TikTok | Non implémenté (mode manuel prévu) | 5 |
| Test (simulation) | Implémenté — aucune connexion externe | 2 |
