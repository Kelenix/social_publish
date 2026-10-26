import type { ConnectedAccount, Platform } from "@app/db";
import { testConnector } from "./test-connector";
import { youtubeConnector } from "./youtube";
import type { Connector, ConnectorState } from "./types";

/** Connecteurs disponibles (les autres réseaux arrivent à l'incrément 5). */
const CONNECTORS: Connector[] = [youtubeConnector, testConnector];

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
  if (!connector.isConfigured()) return "NOT_CONFIGURED";
  if (accounts.length === 0) return "CONNECTION_REQUIRED";
  if (accounts.some((a) => a.status === "READY")) return "READY";
  return accounts[0]!.status;
}
