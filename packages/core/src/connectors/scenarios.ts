/**
 * Scénarios du connecteur de simulation, choisis dans les options de la variante « Test »
 * (`{ "simulate": "<scénario>" }`) ou, à défaut, dans les métadonnées du compte. Défaut : success.
 * Module pur : utilisable côté client.
 */
export const SIMULATION_SCENARIOS = {
  success: "Publication réussie",
  processing: "Traitement différé puis réussite",
  retry_once: "Erreur temporaire au premier essai",
  retryable: "Erreur temporaire à chaque essai",
  rate_limit: "Quota dépassé (Retry-After 60 s)",
  uncertain: "Publiée mais réponse perdue (résultat incertain)",
  fatal: "Contenu refusé",
  auth: "Jeton expiré",
} as const;
export type SimulationScenario = keyof typeof SIMULATION_SCENARIOS;
