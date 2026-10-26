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

## Plateformes sociales

À compléter lors de l'implémentation de chaque connecteur (incréments 4 et 5), avec liens officiels,
permissions, URLs de retour OAuth, quotas et restrictions vérifiés à la date d'implémentation.

| Plateforme | État | Incrément |
|------------|------|-----------|
| YouTube | Non implémenté | 4 |
| Instagram | Non implémenté | 5 |
| LinkedIn | Non implémenté | 5 |
| X | Non implémenté | 5 |
| TikTok | Non implémenté (mode manuel prévu) | 5 |
| Test (simulation) | Implémenté — aucune connexion externe | 2 |
