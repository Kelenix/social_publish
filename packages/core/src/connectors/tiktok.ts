import type { ConnectedAccount } from "@app/db";
import { ConnectorError, type Capabilities, type Connector, type PublishContext, type PublishResult } from "./types";

/**
 * TikTok — mode manuel uniquement.
 *
 * L'API officielle de publication directe (Content Posting API) exige une application auditée par
 * TikTok ; d'après sa documentation (vérifiée le 2026-10-26), « All content posted by unaudited
 * clients will be restricted to private viewing mode », et l'audit vise des intégrations destinées
 * au public. Un outil strictement personnel ne peut donc pas promettre la publication directe.
 *
 * Le Studio propose l'export du média et du texte. Si tu disposes un jour d'un fournisseur autorisé
 * (application auditée), il suffit d'implémenter `TikTokPublishAdapter` et de l'enregistrer.
 */

/** Réglages que l'utilisateur doit choisir lui-même au moment de publier (exigences d'interface TikTok). */
export type TikTokPostSettings = {
  privacyLevel: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  /** Contenu de marque / partenariat rémunéré, à déclarer explicitement. */
  brandedContent: boolean;
};

/** Contrat d'un fournisseur autorisé. Aucune implémentation n'est fournie : ne pas en simuler une. */
export interface TikTokPublishAdapter {
  name: string;
  /** Informations du créateur à interroger avant chaque publication (niveaux de confidentialité permis…). */
  queryCreatorInfo(account: ConnectedAccount): Promise<{ privacyLevelOptions: string[]; maxVideoDurationSec: number; canPost: boolean }>;
  publish(ctx: PublishContext, settings: TikTokPostSettings): Promise<PublishResult>;
  getStatus(ctx: PublishContext & { remoteId: string }): Promise<PublishResult>;
}

export const tiktokConnector: Connector = {
  id: "tiktok",
  platform: "TIKTOK",
  label: "TikTok",
  manualOnly: true,
  isConfigured: () => true,

  capabilities(): Capabilities {
    return {
      contentTypes: ["VIDEO", "IMAGE", "CAROUSEL"],
      immediatePublish: false,
      nativeScheduling: false,
      statusTracking: false,
      cancellation: false,
      reconciliation: false,
      permissions: [],
      limits: { textMax: 2200, mediaMin: 1, mediaMax: 35, mimeTypes: ["video/mp4", "video/quicktime", "video/webm", "image/jpeg", "image/webp"] },
      notes: [
        "Mode manuel : télécharge le média et copie le texte depuis la page de la publication, puis publie dans l'application TikTok.",
        "Publication directe par API : application auditée par TikTok obligatoire ; sans audit, les contenus restent privés.",
        "Au moment de publier, choisis toi-même la confidentialité, les interactions et la déclaration de contenu de marque.",
      ],
    };
  },

  async publish(): Promise<PublishResult> {
    throw new ConnectorError("fatal", "MANUAL_ONLY", "TikTok est en mode manuel : utilise l'export de la publication.");
  },
};
