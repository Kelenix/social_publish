# 06 — Gestion des erreurs

> « Échouer proprement ». S'applique au code produit **et** au comportement de Claude.

## Partie A — Gestion des erreurs dans le CODE

### Principes

1. **Anticiper l'échec.** Tout appel réseau, I/O, parsing ou accès externe peut échouer.
2. **Échouer tôt, échouer clairement.** Valider les préconditions en entrée de fonction.
3. **Ne jamais avaler une erreur en silence.** Pas de `catch {}` vide.
4. **Distinguer erreurs attendues et bugs.** Une entrée invalide est attendue (la gérer) ;
   un état impossible est un bug (le signaler fort).

### Pratiques

- Utiliser des types de résultat explicites (`Result`/`Either`) ou des exceptions typées —
  jamais des codes d'erreur magiques.
- **Frontière utilisateur** : message clair, actionnable, sans détail technique.
  **Logs internes** : détail complet (avec contexte) pour le diagnostic.
- Toujours nettoyer les ressources (fermer connexions, annuler abonnements) — `finally`/`dispose`.
- Réessais (retry) avec backoff uniquement pour les erreurs transitoires (réseau), jamais
  pour une erreur métier (4xx).
- États UI obligatoires pour chaque écran asynchrone : **loading / vide / erreur / succès**.

### Journalisation

- Logger les erreurs avec niveau (`info/warn/error`), contexte et identifiant de corrélation.
- Jamais de donnée sensible dans les logs (voir `[[04-security-fundamentals]]`).
- En prod, brancher un outil de suivi d'erreurs (Sentry ou équivalent) si le projet le justifie.

## Partie B — Quand CLAUDE rencontre une erreur (protocole)

Suivre cet ordre, sans abandonner :

1. **Lire le message en entier.** La cause est souvent explicite.
2. **Reproduire / isoler.** Identifier la plus petite étape qui déclenche l'erreur.
3. **Formuler une hypothèse**, puis tester **un seul changement** à la fois.
4. **Vérifier** que le correctif résout *et* ne casse rien (relancer tests + lint).
5. Si bloqué après **2-3 hypothèses sérieuses** : revenir aux fondamentaux (doc officielle,
   versions, configuration) plutôt que tâtonner.
6. **Ne jamais** contourner par un hack masquant (try/catch vide, `any`, désactivation de
   règle) — corriger la cause. Si un contournement temporaire est inévitable, le marquer
   `// FIXME(raison)` et le consigner dans `PROJECT_STATE.md`.
7. Si l'erreur révèle une ambiguïté du cahier des charges → consigner et, si l'impact est
   important, poser la question (voir `[[09-ai-working-rules]]`).

> Une erreur n'est jamais « réglée » tant qu'un test ne le prouve pas.
