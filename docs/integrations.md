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
  explicitement. **Confirmé le 2026-10-26** : la connexion réelle d'une chaîne a réussi (code échangé,
  `channels.list` lu, deux portées accordées).
- Portée `youtube.force-ssl` demandée pour lire l'état des vidéos et annuler une programmation
  native (voir ADR-013).
- Vraie API (26/10) : connexion OAuth, lecture de la chaîne et **publication d'une vidéo** vérifiées (upload reprenable, suivi jusqu'à « processed »). Non encore essayés en réel : programmation native (`publishAt`) et annulation.

## Instagram — vérifié le 2026-10-26

Sources : https://developers.facebook.com/docs/instagram-platform/content-publishing ·
https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login ·
https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media

- Variante retenue : « Instagram API with Instagram Login » (graph.instagram.com, compte professionnel,
  portées `instagram_business_basic`, `instagram_business_content_publish`).
- Conteneur `POST /<IG_ID>/media` (image_url / video_url « on a public server »), statut `status_code`
  (FINISHED, IN_PROGRESS, ERROR, EXPIRED après 24 h, PUBLISHED), puis `POST /<IG_ID>/media_publish`.
- Images : JPEG uniquement, 8 Mo, ratio 4:5 à 1.91:1. Reels : MOV/MP4, 3 s à 15 min, 300 Mo.
  Légende : 2200 caractères, 30 hashtags. Carrousel : 20 éléments.
- Limite : « 100 API-published posts within a 24-hour moving period » ; une autre section indique 50.
- OAuth : code valable 1 h ; jeton court → jeton long (60 jours) via `ig_exchange_token` ; rafraîchissement
  `ig_refresh_token` si le jeton a plus de 24 h. Pas de PKCE documenté (state utilisé).
- Version d'API : la doc utilise un paramètre « LATEST » ; exemples en `v26.0` (valeur par défaut,
  modifiable par `INSTAGRAM_API_VERSION`).
- Choix : `media_type=REELS` pour une vidéo seule, `VIDEO` pour un élément de carrousel (la doc est
  incohérente sur ce point).

## LinkedIn — vérifié le 2026-10-26

Sources : https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api ·
images-api · videos-api · little-text-format ·
https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin

- `POST /rest/posts` avec `LinkedIn-Version: 202610` (dernière version listée ; la 202511 est retirée le
  16/11/2026) et `X-Restli-Protocol-Version: 2.0.0` ; identifiant dans l'en-tête `x-restli-id`.
- Permissions : `w_member_social` (profil, produit « Share on LinkedIn ») ; `w_organization_social`
  (pages, rôle administrateur) ; `r_member_social` restreinte (impossible de retrouver un post perdu).
- Images : `initializeUpload` → PUT ; JPG, GIF, PNG ; avec `w_member_social` seul, lecture des images
  impossible. Vidéos : `initializeUpload` (parties de 4 Mo) → PUT par partie (ETag) → `finalizeUpload` ;
  MP4, 3 s à 30 min, 75 Ko à 500 Mo ; statuts PROCESSING / AVAILABLE / PROCESSING_FAILED.
- Texte au format « little » : caractères réservés `| { } @ [ ] ( ) < > # \ * _ ~` échappés ; `#mot`
  reste un hashtag.
- Limite « Share on LinkedIn » : 150 requêtes par jour et par membre.
- Non vérifié : longueur maximale du texte (3000 retenu, valeur usuelle), nom exact de la portée de
  lecture des rôles d'organisation (`r_organization_admin` retenu), disponibilité d'un jeton de
  rafraîchissement (réservé aux partenaires approuvés).

## X — vérifié le 2026-10-26

Sources : https://docs.x.com/x-api/posts/create-post ·
https://docs.x.com/x-api/media/quickstart/media-upload-chunked ·
https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code ·
https://docs.x.com/x-api/fundamentals/rate-limits

- `POST /2/tweets` (`text`, `media.media_ids` : 1 à 4) ; 4 photos ou 1 vidéo (20 min / 8 Go par défaut).
- Upload v2 : `POST /2/media/upload/initialize` (JSON), `/{id}/append` (multipart, segments ≤ 5 Mo),
  `/{id}/finalize`, statut `GET /2/media/upload?command=STATUS&media_id=…`.
- OAuth 2.0 : `https://x.com/i/oauth2/authorize`, `https://api.x.com/2/oauth2/token`, PKCE, portées
  `tweet.read tweet.write users.read media.write offline.access` ; jeton d'accès de 2 h, rafraîchissement
  avec `offline.access`.
- Limites : `POST /2/tweets` 100 / 15 min par utilisateur ; en-têtes `x-rate-limit-reset` (secondes epoch).
- Facturation à l'usage : aucune erreur de crédit n'est documentée sur ces pages ; le Studio traite un
  `402` ou un message mentionnant « credit » comme « crédits insuffisants ». Aucun tarif codé.
- Non vérifié : limite de 280 caractères et pondération exacte (comptage simple).

## TikTok — vérifié le 2026-10-26

Source : https://developers.tiktok.com/doc/content-posting-api-get-started

- Publication directe : portée `video.publish` approuvée, interrogation préalable des informations
  du créateur, choix de `privacy_level`.
- « All content posted by unaudited clients will be restricted to private viewing mode » ; l'audit
  lève cette restriction.
- Choix : mode manuel (export du texte et de l'original) + interface `TikTokPublishAdapter` sans
  implémentation.

## Plateformes sociales

| Plateforme | État | Incrément |
|------------|------|-----------|
| YouTube | Implémenté ; publication réelle vérifiée le 26/10 | 4 |
| Instagram | Implémenté ; test réel en attente (identifiants + URL publique) | 5 |
| LinkedIn | Implémenté ; test réel en attente (identifiants) | 5 |
| X | Implémenté ; test réel en attente (identifiants + crédits) | 5 |
| TikTok | Mode manuel (export) ; adaptateur prévu, non implémenté | 5 |
| Test (simulation) | Implémenté — aucune connexion externe | 2 |
