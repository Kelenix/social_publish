import type { ConnectedAccount, Platform } from "@app/db";
import { facebookConnector } from "./facebook";
import { instagramConnector } from "./instagram";
import { linkedinConnector } from "./linkedin";
import { testConnector } from "./test-connector";
import { tiktokConnector } from "./tiktok";
import { xConnector } from "./x";
import { youtubeConnector } from "./youtube";
import type { Connector, ConnectorState } from "./types";

const CONNECTORS: Connector[] = [instagramConnector, facebookConnector, tiktokConnector, youtubeConnector, xConnector, linkedinConnector, testConnector];

export function listConnectors(): Connector[] {
  return CONNECTORS;
}

export function getConnector(id: string): Connector {
  const connector = CONNECTORS.find((c) => c.id === id);
  if (!connector) throw new Error(`Connecteur inconnu : ${id}`);
  return connector;
}

export function connectorForPlatform(platform: Platform): Connector | undefined {
  return CONNECTORS.find((c) => c.platform === platform);
}

/** État affiché d'un connecteur, compte tenu de sa configuration et de ses comptes. */
export function connectorState(connector: Connector, accounts: Pick<ConnectedAccount, "status">[]): ConnectorState {
  if (connector.manualOnly) return "MANUAL_ONLY";
  if (!connector.isConfigured()) return "NOT_CONFIGURED";
  if (accounts.length === 0) return "CONNECTION_REQUIRED";
  if (accounts.some((a) => a.status === "READY")) return "READY";
  return accounts[0]!.status;
}
