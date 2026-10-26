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
    mediaMin: number;
    mediaMax: number;
    mimeTypes: string[];
    imageMaxBytes?: number;
    videoMaxBytes?: number;
    videoMinDurationMs?: number;
    videoMaxDurationMs?: number;
    /** Ratio largeur/hauteur accepté (inclus). */
    aspectRatio?: { min: number; max: number };
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
  open: () => Promise<Readable>;
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
};

export type PublishResult =
  | { status: "published"; remoteId: string; url?: string }
  /** Envoyé, en cours de traitement chez la plateforme : suivre avec getStatus. */
  | { status: "processing"; remoteId: string; pollAfterMs: number };

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

export type ReconcileResult = { found: true; remoteId: string; url?: string } | { found: false };

export interface Connector {
  id: string;
  platform: Platform;
  label: string;
  /** Connecteur de simulation : jamais présenté comme un réseau réel. */
  simulated?: boolean;
  isConfigured(): boolean;
  capabilities(account?: ConnectedAccount): Capabilities;
  publish(ctx: PublishContext): Promise<PublishResult>;
  getStatus?(ctx: PublishContext & { remoteId: string }): Promise<PublishResult>;
  reconcile?(ctx: PublishContext): Promise<ReconcileResult>;
}
