/** Module pur : utilisable côté client. */
/** Portées : lecture, écriture de brouillons/médias, publication (programmer, publier, annuler). */
export const TOKEN_SCOPES = ["read", "write", "publish"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const TOKEN_SCOPE_LABELS: Record<TokenScope, string> = {
  read: "Lecture (comptes, médias, publications, statuts)",
  write: "Écriture (importer des médias, créer et modifier des brouillons)",
  publish: "Publication (programmer, publier, annuler)",
};
