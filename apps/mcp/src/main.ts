/**
 * Serveur MCP (Streamable HTTP, mode sans session). Chaque requête est authentifiée par un jeton
 * Bearer à portée limitée ; l'en-tête Host et l'en-tête Origin éventuel sont vérifiés (DNS rebinding).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { verifyApiToken } from "@app/core/tokens";
import { buildServer } from "./tools";

const PORT = Number(process.env.MCP_PORT ?? 3333);
const HOST = process.env.MCP_HOST ?? "127.0.0.1";
const ALLOWED_HOSTS = (process.env.MCP_ALLOWED_HOSTS ?? `localhost:${PORT},127.0.0.1:${PORT}`).split(",").map((h) => h.trim().toLowerCase());
const ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
const MAX_BODY_BYTES = 1024 * 1024;

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));
}
const rpcError = (message: string) => ({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new RangeError("Requête trop volumineuse.");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health") return send(res, 200, { status: "ok" });
  if (url.pathname !== "/mcp") return send(res, 404, rpcError("Introuvable."));

  if (!ALLOWED_HOSTS.includes((req.headers.host ?? "").toLowerCase())) return send(res, 403, rpcError("Hôte non autorisé."));
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return send(res, 403, rpcError("Origine non autorisée."));

  const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1];
  const token = await verifyApiToken(bearer);
  if (!token) return send(res, 401, rpcError("Jeton absent, invalide, expiré ou révoqué."), { "WWW-Authenticate": 'Bearer realm="studio-publication"' });

  // Mode sans session : pas de flux GET ni de fermeture de session.
  if (req.method !== "POST") return send(res, 405, rpcError("Méthode non autorisée."), { Allow: "POST" });

  let body: unknown;
  try {
    body = await readJson(req);
  } catch (error) {
    return send(res, error instanceof RangeError ? 413 : 400, rpcError(error instanceof RangeError ? error.message : "JSON invalide."));
  }

  const server = buildServer(token);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

if (process.env.NODE_ENV !== "test") {
  const httpServer = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) send(res, 500, rpcError("Erreur interne."));
    });
  });
  httpServer.listen(PORT, HOST, () => console.log(JSON.stringify({ message: "serveur MCP démarré", host: HOST, port: PORT })));
  const stop = () => httpServer.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
