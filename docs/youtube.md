# Connecter YouTube

Le connecteur utilise uniquement l'API officielle **YouTube Data API v3** et OAuth 2.0 (aucun mot de
passe YouTube n'est saisi dans le Studio). Il te faut un projet Google Cloud à ton nom.

> Les écrans de la console Google changent souvent : si un libellé diffère, cherche l'équivalent.

## 1. Projet Google Cloud et API

1. Va sur https://console.cloud.google.com/ et crée un projet (ex. « Studio publication »).
2. **API et services → Bibliothèque** : active **YouTube Data API v3**.

## 2. Écran de consentement OAuth

1. **Google Auth Platform** (ou « Écran de consentement OAuth ») : type d'utilisateur **Externe**.
2. Renseigne le nom de l'application et ton e-mail.
3. **Accès aux données / Scopes** : ajoute
   - `https://www.googleapis.com/auth/youtube.upload` (envoyer des vidéos) ;
   - `https://www.googleapis.com/auth/youtube.force-ssl` (lire la chaîne et l'état des vidéos,
     annuler une publication programmée).
4. **Audience / Utilisateurs test** : ajoute ton adresse Google (celle de la chaîne).

**Important — mode « Testing »** : tant que l'application reste en test, Google délivre une
autorisation qui **expire après 7 jours**. Le Studio affichera alors « Reconnexion nécessaire »
(tableau de bord et Comptes) ; il suffit de cliquer sur **Reconnecter**. Passer l'application en
production supprime cette limite mais peut exiger une vérification par Google pour ces portées :
à évaluer dans la console.

## 3. Identifiants OAuth

1. **Identifiants → Créer des identifiants → ID client OAuth** ; type **Application Web**.
2. **URI de redirection autorisés** : ajoute exactement
   `http://localhost:3000/api/oauth/youtube/callback`
   (`APP_URL` + `/api/oauth/youtube/callback` ; la page **Comptes** affiche l'URL attendue).
   Google accepte `http://` uniquement pour `localhost`. Sur un VPS, utilise
   `https://ton-domaine/api/oauth/youtube/callback` et mets `APP_URL` à jour.
3. Copie l'ID client et le code secret dans `.env` :
   ```
   YOUTUBE_CLIENT_ID=...
   YOUTUBE_CLIENT_SECRET=...
   TOKEN_ENCRYPTION_KEY=...   # déjà généré en local ; garde-en une copie sûre
   ```
4. Redémarre : `docker compose up -d`.

## 4. Connecter la chaîne

**Comptes → YouTube → Connecter un compte YouTube**, choisis ton compte Google, accepte les deux
autorisations. Tu reviens sur **Comptes** avec le nom de ta chaîne et l'état **Prêt**. Si tu
décoches une autorisation, l'état sera **Permission manquante**.

Les jetons sont chiffrés (AES-256-GCM) avec `TOKEN_ENCRYPTION_KEY`, qui n'est jamais stockée en
base. Perdre cette clé oblige à reconnecter les comptes.

## 5. Premier test (sans rien rendre public)

1. Crée une publication avec une vidéo, active **YouTube**.
2. Dans **Réglages YouTube** : visibilité **Privée**, réponds à « conçue pour les enfants ».
3. **Publier maintenant** vers ta chaîne, puis vérifie dans YouTube Studio.

Une vidéo n'est jamais rendue publique sans que tu aies choisi la visibilité « Publique ».

## Comportement

| Étape | Ce que le Studio affiche |
|-------|-------------------------|
| Envoi du fichier (upload reprenable) | Envoi en cours |
| Fichier reçu, traitement YouTube | Traitement par la plateforme |
| Programmée chez YouTube (vidéo publique, programmation native) | Programmée sur la plateforme |
| Traitement terminé (ou publication à l'heure prévue) | Publiée |
| Refus ou échec de traitement | Échec, avec la raison YouTube |

- **Programmation native** (vidéo publique prévue à plus de 15 min) : la vidéo est envoyée tout de
  suite en privé avec la date de publication ; YouTube la publie lui-même, **même si ton ordinateur
  est éteint**. Annuler la programmation la repasse en privée (elle reste sur ta chaîne).
- **Upload coupé** : reprise à partir des octets déjà reçus. Après un arrêt brutal, le Studio
  interroge la session d'upload avant tout renvoi (pas de vidéo en double).
- **Quota** : 100 uploads par jour par projet (catégorie « Video Uploads »). Quota atteint → nouvel
  essai automatique après minuit, heure du Pacifique.
- **Durée** : 15 min maximum tant que ta chaîne n'est pas autorisée aux vidéos longues
  (vérification par téléphone côté YouTube) ; détecté à la connexion.
- **Limites vérifiées avant envoi** : titre ≤ 100 caractères, description ≤ 5000 octets, `<` et `>`
  interdits, tags ≤ 500 caractères, une seule vidéo (MP4, MOV ou WebM).
- Les hashtags deviennent des tags. YouTube peut classer une vidéo verticale courte en Short ; l'API
  n'offre pas de réglage pour cela.
