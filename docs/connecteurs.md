# Configurer Instagram, Facebook, LinkedIn, X et TikTok

> YouTube : voir `docs/youtube.md`. Sources officielles et date de vérification : `docs/integrations.md`.
> Les consoles développeur changent souvent : si un libellé diffère, cherche l'équivalent.

Pré-requis communs : `TOKEN_ENCRYPTION_KEY` renseignée dans `.env` (déjà générée en local) et
redémarrage après chaque modification de `.env` : `docker compose up -d`.

La page **Comptes** affiche, pour chaque réseau, ce qu'il manque et l'**URL de retour OAuth**
exacte à déclarer (`APP_URL` + `/api/oauth/<réseau>/callback`).

## URL publique HTTPS (obligatoire pour Instagram)

Instagram télécharge lui-même tes médias : il lui faut une adresse HTTPS publique. Le Studio lui
donne des URLs **signées et temporaires** (2 h) vers `/api/public/media/…` ; rien d'autre n'est
exposé, et une URL sans signature valide est refusée.

- **En développement** : un tunnel HTTPS, par exemple Cloudflare Tunnel (gratuit) :
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
  Il affiche une adresse `https://….trycloudflare.com` (elle change à chaque lancement ; un tunnel
  nommé sur ton domaine donne une adresse fixe).
- **Sur un VPS** : ton domaine en HTTPS.

Dans `.env` :
```
PUBLIC_BASE_URL=https://ton-adresse-publique
MEDIA_URL_SIGNING_KEY=...   # déjà générée en local
```
Rappel : avec un tunnel, ton PC doit rester allumé pendant qu'Instagram récupère les médias.

## Instagram

Type d'intégration : **Instagram API with Instagram Login** (compte Instagram **professionnel** —
Business ou Créateur — sans page Facebook).

1. https://developers.facebook.com/apps → créer une application de type « Entreprise ».
2. Ajouter le produit **Instagram** → « API setup with Instagram business login ».
3. Récupérer l'**Instagram App ID** et l'**Instagram App Secret** (ce ne sont pas ceux de
   l'application Facebook).
4. **Business login settings → OAuth redirect URIs** : l'URL affichée dans Comptes. Meta exige en
   pratique une URL **HTTPS** : ouvre alors le Studio par ton adresse publique et mets
   `APP_URL=PUBLIC_BASE_URL` dans `.env` (sinon l'URL de retour serait en `http://localhost`).
5. Ajouter ton compte Instagram comme **testeur** (rôles de l'application) et accepter l'invitation
   dans Instagram (Paramètres → Applications et sites web).
6. `.env` : `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `PUBLIC_BASE_URL`, puis **Comptes →
   Connecter un compte Instagram**.

Limites appliquées : images **JPEG** seulement (ratio 4:5 à 1.91:1, 8 Mo), vidéo seule = **Reel**
(MP4/MOV, 3 s à 15 min, 300 Mo), carrousel jusqu'à 20 médias, légende 2200 caractères et 30
hashtags. Autorisation de 60 jours prolongée automatiquement tant qu'elle sert.

## Facebook (Page)

L'API permet de publier sur une **Page** dont tu es administrateur ou éditeur, pas sur un profil
personnel.

1. https://developers.facebook.com/apps → créer une application (cas d'usage « gérer tout sur ta
   Page » ou type « Entreprise »). L'application créée pour Instagram peut convenir si elle propose
   aussi Facebook Login.
2. Ajouter **Facebook Login for Business** (ou Facebook Login) ; dans ses réglages, **URI de
   redirection OAuth valides** : l'URL affichée dans Comptes
   (`http://localhost:3000/api/oauth/facebook/callback` en local). Si Meta refuse `http://`, ouvre
   le Studio par ton adresse HTTPS publique et mets `APP_URL=PUBLIC_BASE_URL`.
3. Autorisations demandées : `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. Tant
   que tu as un rôle sur l'application, aucune vérification par Meta n'est nécessaire pour tes
   propres Pages.
4. **Paramètres → Général** : copier l'ID et la clé secrète de l'application dans `.env`
   (`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`), puis **Comptes → Connecter un compte Facebook** et
   sélectionner la ou les Pages.

Comportement :
- chaque Page autorisée devient un compte ; une Page sur laquelle ton rôle ne permet pas de publier
  est signalée « Permission manquante » ;
- texte, photos (JPEG/PNG, 4 Mo chacune, plusieurs possibles) ou une vidéo MP4 seule ;
- **programmation native** de 10 min à 30 jours (désactivable dans la variante) : Facebook publie
  à l'heure prévue même ordinateur éteint ; annuler supprime la publication programmée côté Facebook
  (elle n'était pas encore visible) ;
- jeton de Page sans date d'expiration ; l'envoi de vidéos utilise ton autorisation personnelle
  (environ 60 jours), à renouveler par « Reconnecter ».

## LinkedIn

1. https://www.linkedin.com/developers/apps → créer une application (une page LinkedIn
   d'entreprise doit être associée à l'application, exigence de LinkedIn).
2. Onglet **Products** : ajouter **Share on LinkedIn** et **Sign In with LinkedIn using OpenID
   Connect** (profil personnel).
3. Onglet **Auth** : ajouter l'URL de retour affichée dans Comptes ; copier Client ID et Client
   Secret dans `.env` (`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`).
4. **Pages d'entreprise (facultatif)** : demander le produit **Community Management API**
   (validation par LinkedIn). Une fois accordé, mettre `LINKEDIN_ORGANIZATIONS=true` : les pages
   dont tu es administrateur apparaissent comme comptes distincts à la connexion.

À savoir : une publication LinkedIn est **visible dès l'envoi** (pas de brouillon par l'API) ;
visibilité « Relations » possible pour un profil. Autorisation de 60 jours, puis reconnexion. Si
la réponse de LinkedIn se perd pendant la création d'un post, le Studio ne renvoie rien et te
demande de vérifier (LinkedIn ne permet pas de retrouver le post sans permission restreinte).

## X

1. https://developer.x.com → projet et application ; **User authentication settings** :
   OAuth 2.0, type **Web App** (client confidentiel), permissions **Read and write**.
2. **Callback URI** : l'URL affichée dans Comptes.
3. Copier **Client ID** et **Client Secret** (OAuth 2.0) dans `.env` (`X_CLIENT_ID`,
   `X_CLIENT_SECRET`).
4. **Crédits** : l'accès à l'API X est facturé à l'usage. Approvisionne ton compte dans le portail
   développeur ; le Studio n'affiche aucun tarif et signale « Crédits insuffisants » si X refuse
   pour cette raison (la publication passe en échec, à relancer après rechargement).

Limites appliquées : 280 caractères (comptage simple — X pondère liens et certains emojis, garde
une marge), 4 images ou 1 vidéo. Si la réponse de X se perd à la création du post, le Studio ne
renvoie rien et te demande de vérifier (une recherche consommerait des crédits).

## TikTok — mode manuel

La publication directe par l'API TikTok exige une application **auditée** ; sans audit, tout
contenu publié reste privé. Pour un outil personnel, le Studio propose donc :

1. Active **TikTok** dans les plateformes de la publication et rédige la variante.
2. Sur la page de la publication, carte **Publication manuelle — TikTok** : **Copier le texte**,
   **Télécharger l'original**.
3. Publie dans l'application TikTok en choisissant toi-même confidentialité, interactions et
   déclaration de contenu de marque, puis clique **J'ai publié sur TikTok** (trace dans le journal).

Si tu obtiens un jour l'accès d'un fournisseur autorisé, l'interface `TikTokPublishAdapter`
(`packages/core/src/connectors/tiktok.ts`) décrit ce qu'il faut implémenter.
