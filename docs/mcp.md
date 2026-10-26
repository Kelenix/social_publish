# Connecter Claude Code au Studio (serveur MCP)

Le serveur MCP tourne dans Docker (`mcp`) et écoute **uniquement** sur `http://127.0.0.1:3333/mcp`
(transport Streamable HTTP, sans session). Chaque appel exige un jeton Bearer.

## 1. Créer un jeton

Dans l'interface : **Réglages → Jetons API et MCP**.

| Portée | Permet |
|--------|--------|
| `read` | lister comptes, capacités, médias, publications, statuts ; prévisualiser, valider |
| `write` | importer des médias, créer et modifier des brouillons |
| `publish` | programmer, publier maintenant, annuler une programmation |

Sans `publish`, Claude peut tout préparer mais ne peut rien publier. Le jeton n'est affiché
qu'une fois ; il est révocable à tout moment. L'interface affiche la commande prête à copier.

## 2. Déclarer le serveur dans Claude Code

Depuis Windows (PowerShell) ou WSL, même commande — le port est publié sur la boucle locale :

```bash
claude mcp add --transport http studio http://127.0.0.1:3333/mcp --header "Authorization: Bearer stp_…"
```

Portée par défaut `local` (stockée dans `~/.claude.json`, non versionnée) : recommandé, car le jeton
y est en clair. Vérifie la connexion avec `/mcp` dans Claude Code.

Variante de projet sans secret dans le dépôt (`.mcp.json`, jeton dans une variable d'environnement) :

```json
{
  "mcpServers": {
    "studio": {
      "type": "http",
      "url": "http://127.0.0.1:3333/mcp",
      "headers": { "Authorization": "Bearer ${STUDIO_MCP_TOKEN}" }
    }
  }
}
```

**WSL 2** (non testé ici, seule la connexion depuis Windows a été vérifiée) : avec le réseau WSL en
mode miroir (`networkingMode=mirrored`), `127.0.0.1` désigne Windows et la même commande fonctionne.
Teste d'abord depuis WSL : `curl -i http://127.0.0.1:3333/health`. Si cela échoue, il faut joindre
l'adresse de l'hôte Windows et l'ajouter à `MCP_ALLOWED_HOSTS` dans `compose.yaml`.

## 3. Fichiers locaux : le dossier `inbox`

Pour des raisons de sécurité, le MCP ne lit **que** le dossier `inbox/` du projet (monté en lecture
seule dans Docker sous `/data/inbox`). Dépose-y tes fichiers (Claude Code peut y écrire ses rendus).

Chemins acceptés par `import_media` :
- relatif à l'inbox : `video.mp4`, `campagne/visuel.png` ;
- absolu, si le dossier est déclaré dans `INBOX_HOST_ALIASES` (`.env`), par exemple
  `C:\Users\moi\studio\inbox\video.mp4` ou `/mnt/c/Users/moi/studio/inbox/video.mp4`.

Tout le reste est refusé : `..`, chemins hors de l'inbox, liens symboliques qui en sortent.
Une URL HTTPS publique est aussi acceptée (`url`) ; les adresses locales ou privées sont refusées
(protection SSRF), y compris après redirection.

L'import est asynchrone : `import_media` renvoie un `operation_id` ; le worker copie le fichier dans
le stockage de l'application, l'analyse (ffprobe) et `get_operation` donne le `mediaId`. Le fichier
de l'inbox peut ensuite être supprimé : la publication n'en dépend plus.

## 4. Autorisation de publier

- `create_draft` / `update_draft` ne publient jamais rien.
- `schedule_post` et `publish_now` exigent la portée `publish` **et** `expected_version` : la version
  du contenu que tu as relue (renvoyée par `create_draft`, `update_draft`, `preview_post`). Si le
  contenu a changé depuis, l'appel est refusé (`VERSION_MISMATCH`).
- L'autorisation est liée à cette version (texte, médias, variantes), aux comptes et à la date.
  Toute modification ultérieure exige d'annuler puis de réautoriser.
- Une fois autorisée, la publication est exécutée par le worker : Claude Code peut être fermé
  (l'ordinateur et Docker doivent rester actifs).

## 5. Outils

| Outil | Portée | Rôle |
|-------|--------|------|
| `list_accounts` | read | comptes et états (`simulated: true` = connecteur de test) |
| `list_capabilities` | read | capacités et limites de chaque connecteur |
| `list_media` | read | médias de la bibliothèque |
| `import_media` | write | import depuis l'inbox ou une URL HTTPS → `operation_id` |
| `get_operation` | read | suivi d'une opération |
| `list_workflow_templates` | read | modèles enregistrés, avec le prochain créneau habituel |
| `create_draft` / `update_draft` | write | brouillons et variantes par plateforme (`template_id` pour partir d'un modèle) |
| `preview_post` | read | texte final par plateforme |
| `validate_post` | read | vérification contre les capacités de chaque compte |
| `schedule_post` | publish | programmer (`local_datetime`, fuseau, `disambiguation` si heure ambiguë) |
| `publish_now` | publish | publication immédiate (worker) |
| `list_scheduled_posts` | read | programmations en cours et décisions en attente |
| `cancel_scheduled_post` | publish | annuler ce qui n'est pas encore parti |
| `get_publication_status` | read | état global et par destination |

Erreurs : `isError: true` et `{ "error": { "code", "message", "details" } }` — codes principaux :
`FORBIDDEN_SCOPE`, `NOT_FOUND`, `VALIDATION`, `INVALID_REQUEST`, `VERSION_MISMATCH`, `TIME`,
`PAST`, `INVALID_CONTENT`, `ACCOUNT_NOT_READY`, `NOT_DRAFT`.

## 6. Exemples de demandes à Claude Code

- « Liste mes comptes du Studio et dis-moi lesquels sont prêts. »
- « Importe `inbox/teaser.mp4` dans le Studio et donne-moi sa durée et son ratio. »
- « Crée un brouillon "Lancement été" avec cette vidéo : un texte court pour Instagram, un titre et
  une description pour YouTube, sans rien publier. »
- « Montre-moi l'aperçu et vérifie qu'il respecte les limites du compte YouTube. »
- « Programme la version 3 de ce brouillon pour vendredi 18:00 heure de Rome sur mon compte de test. »
- « Qu'est-ce qui est programmé cette semaine ? Y a-t-il des erreurs ? »
- « Annule la programmation de "Lancement été". »
