import type { Readable } from "node:stream";
import type { ConnectedAccount, MediaAsset, Platform } from "@app/db";
import type { ResolvedVariant } from "../posts/schema";

/** Capacités réelles d'un connecteur pour un compte donné (affichées et utilisées pour valider). */
export type Capabilities = {
  contentTypes: ("TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL")[];
  immediatePublish: boolean;
  nativeScheduling: boolean;
  statusTracking: boolean;
  cancellation: boolean;
  /** Le connecteur sait retrouver une publication déjà envoyée (évite les doublons après incertitude). */
  reconciliation: boolean;
  permissions: string[];
  limits: {
    textMax?: number;
    titleMax?: number;
    descriptionMax?: number;
    hashtagsMax?: number;
    titleRequired?: boolean;
    /** Limite en octets UTF-8 (YouTube compte la description en octets). */
    descriptionMaxBytes?: number;
    /** Longueur totale des hashtags/tags, séparateurs compris. */
    tagsMaxChars?: number;
    /** Caractères refusés dans le titre et la description. */
    forbiddenChars?: string[];
    mediaMin: number;
    mediaMax: number;
    mimeTypes: string[];
    imageMaxBytes?: number;
    videoMaxBytes?: number;
    videoMinDurationMs?: number;
    videoMaxDurationMs?: number;
    /** Ratio largeur/hauteur accepté (inclus), pour tous les médias. */
    aspectRatio?: { min: number; max: number };
    /** Ratio accepté pour les images seulement (ex. Instagram 4:5 à 1.91:1). */
    imageAspectRatio?: { min: number; max: number };
  };
  notes: string[];
};

/** États d'un connecteur tels qu'affichés à l'utilisateur. */
export type ConnectorState =
  | "NOT_CONFIGURED"
  | "CONNECTION_REQUIRED"
  | "READY"
  | "PERMISSION_MISSING"
  | "PLATFORM_REVIEW_REQUIRED"
  | "RECONNECT_REQUIRED"
  | "MANUAL_ONLY";

export type PublishMedia = {
  asset: MediaAsset;
  /** Lecture depuis le stockage durable ; `range` permet de reprendre un envoi interrompu. */
  open: (range?: { start: number; end: number }) => Promise<Readable>;
};

export type PublishContext = {
  destinationId: string;
  idempotencyKey: string;
  /** Numéro de la tentative (1 = première). */
  attempt: number;
  account: ConnectedAccount;
  content: ResolvedVariant;
  /** Texte final (texte + hashtags) tel qu'il doit apparaître. */
  caption: string;
  media: PublishMedia[];
  remoteId: string | null;
  /** Date de publication demandée (pour la programmation native). */
  scheduledAt: Date;
  /** État propre au connecteur, conservé entre tentatives (ex. URL de session d'upload). */
  state: Record<string, unknown>;
  /** Enregistre immédiatement un complément d'état (survit à un arrêt brutal). */
  saveState: (patch: Record<string, unknown>) => Promise<void>;
};

export type PublishResult =
  | { status: "published"; remoteId: string; url?: string }
  /** Envoyé, en cours de traitement chez la plateforme : suivre avec getStatus. */
  | { status: "processing"; remoteId: string; pollAfterMs: number }
  /** Programmée nativement par la plateforme : publication à `publishAt` sans intervention locale. */
  | { status: "scheduled"; remoteId: string; url?: string; publishAt: Date };

export type ConnectorErrorKind =
  /** Erreur temporaire (réseau, 5xx, quota) : nouvelle tentative possible. */
  | "retryable"
  /** Erreur définitive (contenu refusé, format) : aucune nouvelle tentative automatique. */
  | "fatal"
  /** Jeton expiré ou révoqué : le compte doit être reconnecté. */
  | "auth"
  /** Permission absente sur le compte. */
  | "permission"
  /** La requête a peut-être abouti (délai dépassé après envoi) : rapprochement obligatoire. */
  | "uncertain";

export class ConnectorError extends Error {
  constructor(
    readonly kind: ConnectorErrorKind,
    readonly code: string,
    message: string,
    /** Délai demandé par la plateforme (Retry-After) ou par le quota. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export type ReconcileResult =
  | { found: true; remoteId: string; url?: string }
  | { found: false }
  /** Impossible de savoir (la plateforme ne permet pas de retrouver la publication) : décision manuelle. */
  | { found: "unknown"; reason: string };

/** Compte obtenu à l'issue d'une autorisation OAuth. */
export type OAuthAccount = {
  externalId: string;
  displayName: string;
  credentials: Record<string, unknown>;
  grantedScopes: string[];
  metadata: Record<string, unknown>;
  /** READY, ou PERMISSION_MISSING si une portée nécessaire n'a pas été accordée. */
  status: "READY" | "PERMISSION_MISSING";
  statusDetail?: string;
  /** Autres comptes accessibles avec la même autorisation (ex. pages LinkedIn administrées). */
  additionalAccounts?: Omit<OAuthAccount, "additionalAccounts">[];
};

export interface OAuthProvider {
  authorizationUrl(params: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchange(params: { code: string; codeVerifier: string; redirectUri: string }): Promise<OAuthAccount>;
}

export interface Connector {
  id: string;
  platform: Platform;
  label: string;
  /** Connecteur de simulation : jamais présenté comme un réseau réel. */
  simulated?: boolean;
  /** Publication automatique impossible : export du contenu pour publication manuelle. */
  manualOnly?: boolean;
  /** La plateforme exige une URL de retour OAuth en HTTPS : retour par PUBLIC_BASE_URL. */
  httpsRedirect?: boolean;
  isConfigured(): boolean;
  capabilities(account?: ConnectedAccount): Capabilities;
  publish(ctx: PublishContext): Promise<PublishResult>;
  getStatus?(ctx: PublishContext & { remoteId: string }): Promise<PublishResult>;
  reconcile?(ctx: PublishContext): Promise<ReconcileResult>;
  /** Annule une publication déjà transmise et programmée chez la plateforme. */
  cancel?(ctx: PublishContext & { remoteId: string }): Promise<void>;
  /** Contrôles de médias propres à la plateforme (ex. pas de mélange images/vidéo). */
  validateMedia?(media: MediaAsset[]): { field: "media"; message: string }[];
  /** Vérifie les options propres à la plateforme (visibilité, déclarations obligatoires…). */
  validateOptions?(options: Record<string, unknown>): { field: "options"; message: string }[];
  /** Envoi anticipé pour une programmation native (le PC peut être éteint à l'heure prévue). */
  usesNativeScheduling?(options: Record<string, unknown>, scheduledAt: Date, now: Date): boolean;
  oauth?: OAuthProvider;
}
