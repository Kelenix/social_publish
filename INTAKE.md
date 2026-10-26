Tu es un développeur full-stack senior spécialisé en applications de publication multicanale et en serveurs MCP.

Construis mon outil personnel de création, gestion et programmation de publications sur Instagram, TikTok, YouTube, X et LinkedIn.

Je travaille sur Windows avec Docker Desktop. Je crée mes textes, images et vidéos sur mon ordinateur ou avec Claude Code. Je veux gérer mes publications depuis une interface web et depuis Claude Code grâce à mon propre serveur MCP.

L’objectif est un outil réellement utilisable localement, déployable ensuite sur un VPS. Commence par un usage personnel avec un administrateur. Ne développe pas de facturation SaaS ni de gestion multitenant dans le MVP.

## 1. Méthode de travail

Inspecte d’abord le dépôt existant.

Crée un fichier CLAUDE.md décrivant l’architecture, les commandes et les conventions du projet.

Vérifie les documentations officielles actuelles avant d’implémenter les API, les permissions OAuth et le protocole MCP. Documente les liens, la date de vérification et les limites dans docs/integrations.md.

Propose un plan court, puis commence l’implémentation. Travaille par étapes exécutables et vérifiables.

Ne t’arrête pas à une maquette. Implémente la persistance, les uploads, le scheduler, le worker et le MCP.

Si des identifiants externes manquent, continue le travail indépendant de ces accès. Indique précisément ce que je dois configurer. Ne prétends jamais qu’une intégration simulée fonctionne en production.

## 2. Stack

Utilise :
- Next.js et TypeScript pour l’interface et l’API ;
- PostgreSQL et Prisma ;
- Redis et BullMQ ;
- un worker Node.js indépendant du serveur web ;
- le SDK TypeScript officiel MCP ;
- Zod pour la validation ;
- FFmpeg et ffprobe pour les médias ;
- Docker Compose.

Choisis des versions stables compatibles, verrouille les dépendances et documente les choix.

Organise le code pour partager la logique métier entre l’API web, le worker et le MCP, sans dupliquer la publication.

## 3. Interface

Interface en français, responsive, professionnelle et minimaliste.

Prévoir :
- tableau de bord ;
- comptes connectés ;
- bibliothèque de médias ;
- éditeur de publication ;
- calendrier ;
- modèles de workflow ;
- historique des publications ;
- réglages.

Utilise un thème clair/sombre, une couleur d’accent jaune, des tons neutres et deux polices maximum.

Le tableau de bord doit montrer les publications programmées, les erreurs, les comptes à reconnecter et l’état du worker.

## 4. Médias et publications

Permets :
- l’import d’images et de vidéos ;
- une bibliothèque avec aperçu, taille, durée, dimensions et format ;
- un contenu principal et des variantes par plateforme ;
- des textes, titres, descriptions, hashtags et médias différents selon le réseau ;
- l’aperçu avant publication ;
- la publication immédiate ;
- la programmation ;
- la duplication et l’annulation d’une programmation.

La validation doit tenir compte des capacités réelles du connecteur et du compte : formats, taille, durée, ratio, champs obligatoires et limites de texte.

Ne recadre pas automatiquement une vidéo sans choix explicite. Conserve l’original.

Après import, copie le média dans un stockage durable géré par l’application. Un job programmé ne doit pas dépendre d’un fichier temporaire ou de son emplacement initial.

Prévois un stockage local persistant pour le développement et une interface permettant un stockage compatible S3.

Lorsqu’une plateforme doit télécharger un média, fournis une URL HTTPS accessible pour la durée nécessaire. Ne lui transmets jamais localhost ou un chemin Windows.

## 5. Connexion des plateformes

Utilise uniquement les API officielles et OAuth. Pas de récupération de cookies, de mot de passe de réseau social ni d’automatisation du navigateur pour contourner un accès API.

Chaque connecteur doit exposer ses capacités :
- types de contenus ;
- publication immédiate ;
- programmation native éventuelle ;
- récupération de statut ;
- annulation éventuelle ;
- permissions requises ;
- limites connues.

Prévois des états explicites :
- non configuré ;
- connexion requise ;
- prêt ;
- permission manquante ;
- validation de plateforme requise ;
- reconnexion nécessaire ;
- mode manuel uniquement.

Instagram :
- gérer les comptes professionnels et les permissions adaptées au parcours OAuth choisi ;
- gérer la création du conteneur, son traitement et sa publication ;
- ne pas supposer que tous les comptes ou formats ont les mêmes capacités.

YouTube :
- upload reprenable ;
- métadonnées, visibilité et champs obligatoires ;
- programmation native lorsqu’elle est disponible ;
- distinguer upload réussi, traitement terminé et publication publique ;
- vérifier les restrictions effectives du projet.

LinkedIn :
- distinguer profil personnel et page d’entreprise ;
- utiliser les endpoints et versions officiellement supportés ;
- vérifier les permissions et les rôles.

X :
- publication et médias selon les accès disponibles ;
- gestion des quotas, crédits insuffisants et erreurs ;
- aucun tarif codé en dur.

TikTok :
- respecter les exigences de consentement et d’interface ;
- ne pas promettre l’accès Direct Post public pour un outil strictement personnel ;
- désactiver les actions non autorisées ;
- proposer un export du média et du texte pour publication manuelle ;
- prévoir une interface d’adaptateur pour un éventuel fournisseur autorisé, sans inventer une intégration.

## 6. Workflows

Commence par des workflows simples, sans éditeur graphique complexe.

Exemple :
1. Sélectionner un média.
2. Choisir les comptes cibles.
3. Préparer les variantes.
4. Vérifier les contenus.
5. Publier immédiatement ou choisir une date.
6. Suivre le résultat de chaque destination.

Permets d’enregistrer des modèles de workflow : comptes, formats préférés, fuseau horaire et mode de validation.

Une publication sur plusieurs réseaux doit posséder un état indépendant pour chaque destination. Un échec sur Instagram ne doit pas déclencher une nouvelle publication sur LinkedIn si celle-ci a réussi.

## 7. Programmation fiable

PostgreSQL doit être la source de vérité des programmations. Redis sert à l’exécution.

Stocke les dates en UTC et conserve le fuseau IANA choisi. Utilise Europe/Rome comme valeur initiale modifiable. Gère les changements d’heure et les dates ambiguës.

Prévois :
- reconstruction des jobs après redémarrage ;
- verrouillage des jobs concurrents ;
- clés d’idempotence ;
- reprise sur erreur avec backoff ;
- respect de Retry-After et des quotas ;
- état spécifique pour un résultat externe incertain ;
- rapprochement avec la plateforme avant toute nouvelle tentative risquant un doublon.

Ne promets pas une garantie absolue « exactement une fois » si l’API externe ne la permet pas.

Pour les publications manquées pendant l’arrêt du PC, propose une politique explicite. Par défaut, demande une reprogrammation plutôt que de publier toutes les anciennes publications au redémarrage.

Utilise la programmation native lorsqu’elle est disponible et appropriée. Conserve l’identifiant distant et gère les modifications ou annulations déjà transmises.

Affiche clairement que la programmation locale nécessite un ordinateur allumé, connecté, sans veille, avec Docker actif.

## 8. Serveur MCP

Expose au minimum :
- list_accounts ;
- list_capabilities ;
- import_media ;
- create_draft ;
- update_draft ;
- validate_post ;
- preview_post ;
- schedule_post ;
- publish_now ;
- list_scheduled_posts ;
- cancel_scheduled_post ;
- get_publication_status.

Les outils doivent utiliser des schémas stricts et retourner des résultats structurés avec identifiants et erreurs exploitables.

Les actions longues doivent retourner rapidement un identifiant d’opération ; le traitement continue dans le worker.

Implémente un transport MCP adapté à Claude Code local. Documente la connexion depuis Windows ou WSL et la correspondance des chemins avec Docker.

L’import MCP de fichiers locaux doit être limité à un répertoire autorisé. Bloque les traversées de chemin et les accès arbitraires au disque.

Permets de créer un brouillon sans publier. La programmation ou la publication doit correspondre à une intention explicite ou à une règle d’automatisation préalablement autorisée.

Une autorisation doit être liée à la version du contenu, aux médias, aux comptes et à la date. Une modification substantielle doit invalider cette autorisation.

Une publication déjà autorisée doit pouvoir être exécutée sans que Claude Code reste ouvert, sous réserve des exigences propres à la plateforme.

Fournis la configuration MCP et plusieurs exemples de commandes en langage naturel.

## 9. Sécurité

Prévois :
- authentification de l’administrateur ;
- authentification des appels MCP et API ;
- jetons limités en portée et révocables ;
- chiffrement des tokens OAuth au repos avec clé hors base ;
- renouvellement des tokens lorsque supporté ;
- OAuth state et PKCE lorsque applicable ;
- absence de secrets dans les logs, le frontend et Git ;
- protection des imports distants contre SSRF ;
- contrôle des types et tailles de fichiers ;
- journal des opérations.

Expose les services locaux sur loopback par défaut. N’expose pas PostgreSQL et Redis publiquement.

## 10. Docker et documentation

Fournis :
- Dockerfiles ;
- compose.yaml ;
- .env.example sans secret ;
- volumes persistants ;
- healthchecks ;
- migrations ;
- commandes de démarrage et de sauvegarde ;
- README en français.

Le lancement doit être possible avec :
docker compose up --build

Documente :
- configuration des applications développeur ;
- permissions et URLs de retour OAuth ;
- utilisation éventuelle d’un tunnel HTTPS en développement ;
- mise à disposition des médias ;
- connexion de Claude Code au MCP ;
- sauvegarde et restauration ;
- migration vers un VPS.

## 11. Tests et livraison

Teste en priorité :
- programmation et changement de fuseau ;
- reprise après arrêt ;
- prévention des doublons ;
- succès partiel sur plusieurs réseaux ;
- expiration de token ;
- annulation ;
- import sécurisé des médias ;
- authentification MCP.

Prévois un connecteur de test clairement identifié, utilisable sans identifiants réels. Il ne doit jamais être présenté comme un réseau connecté.

N’effectue pas de publication publique pendant les tests sans mon autorisation.

Construis dans cet ordre :
1. Application, base, médias et brouillons.
2. Scheduler, worker et connecteur de test.
3. Serveur MCP.
4. Premier connecteur réel selon les accès disponibles.
5. Autres connecteurs et modes manuels.
6. Vérification complète et documentation.

À la livraison, indique précisément ce qui fonctionne, ce qui a été testé, ce qui dépend de mes identifiants et ce qui nécessite une approbation externe.

Commence maintenant par inspecter le projet et implémenter la première étape.