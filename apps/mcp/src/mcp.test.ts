import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("serveur MCP (HTTP réel, PostgreSQL)", async () => {
  // Inbox dédiée au test, configurée avant le premier chargement de la configuration.
  const dir = mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
  const inbox = path.join(dir, "inbox");
  mkdirSync(inbox);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=yellow:size=1080x1350", "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", path.join(inbox, "affiche.jpg")]);
  process.env.INBOX_DIR = inbox;
  process.env.INBOX_HOST_ALIASES = "C:/Users/moi/studio/inbox";

  let server: Server;
  let base = "";
  const { prisma } = await import("@app/db");
  const tokens = await import("@app/core/tokens");
  const { createTestAccount } = await import("@app/core/scheduling");
  const { executeDestination } = await import("@app/core/scheduling/executor");
  const { runNextOperation } = await import("@app/core/operations");

  beforeAll(async () => {
    server = createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
    process.env.MCP_ALLOWED_HOSTS = `127.0.0.1:${port}`;
    const { handle } = await import("./main");
    server.on("request", (req, res) => void handle(req, res));
  });
  afterAll(async () => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  async function connect(token: string) {
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return client;
  }
  async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    // Réponses JSON libres : typage relâché volontairement dans ce test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { isError: Boolean(result.isError), data: result.structuredContent as Record<string, any> };
  }
  const post = (headers: Record<string, string>) =>
    fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });

  describe("authentification", () => {
    it("refuse une requête sans jeton, avec un faux jeton ou un jeton révoqué", async () => {
      expect((await post({})).status).toBe(401);
      expect((await post({ Authorization: "Bearer stp_faux" })).status).toBe(401);
      const { token, record } = await tokens.createApiToken("révoqué", ["read"], null, "test");
      expect((await post({ Authorization: `Bearer ${token}` })).status).toBe(200);
      await tokens.revokeApiToken(record.id, "test");
      expect((await post({ Authorization: `Bearer ${token}` })).status).toBe(401);
    });

    it("refuse un jeton expiré", async () => {
      const { token, record } = await tokens.createApiToken("expiré", ["read"], 1, "test");
      await prisma.apiToken.update({ where: { id: record.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await post({ Authorization: `Bearer ${token}` })).status).toBe(401);
    });

    it("refuse une origine de navigateur (protection DNS rebinding)", async () => {
      const { token } = await tokens.createApiToken("origine", ["read"], null, "test");
      expect((await post({ Authorization: `Bearer ${token}`, Origin: "https://site-malveillant.example" })).status).toBe(403);
    });

    it("applique les portées du jeton", async () => {
      const { token } = await tokens.createApiToken("lecture", ["read"], null, "test");
      const client = await connect(token);
      expect((await call(client, "list_accounts")).isError).toBe(false);
      const denied = await call(client, "create_draft", { title: "Interdit" });
      expect(denied).toMatchObject({ isError: true, data: { error: { code: "FORBIDDEN_SCOPE" } } });
      await client.close();
    });
  });

  describe("outils", () => {
    let client: Client;
    let accountId = "";
    beforeAll(async () => {
      const { token } = await tokens.createApiToken("claude-code", ["read", "write", "publish"], null, "test");
      client = await connect(token);
      accountId = (await createTestAccount("Compte MCP", "test")).id;
    });
    afterAll(() => client.close());

    it("expose les outils requis", async () => {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "list_accounts", "list_capabilities", "import_media", "create_draft", "update_draft", "validate_post",
          "preview_post", "schedule_post", "publish_now", "list_scheduled_posts", "cancel_scheduled_post", "get_publication_status",
          "list_workflow_templates",
        ]),
      );
    });

    it("refuse un import hors de l'inbox", async () => {
      for (const p of ["../../etc/passwd", "C:\\Windows\\win.ini", "/etc/passwd"]) {
        expect((await call(client, "import_media", { path: p })).data.error.code).toBe("INVALID_REQUEST");
      }
      expect((await call(client, "import_media", { url: "https://127.0.0.1/x.jpg" })).isError).toBe(false);
      const op = await runNextOperation();
      expect(op).toMatchObject({ status: "FAILED", error: expect.stringContaining("non publique") });
    });

    it("parcours complet : import, brouillon, aperçu, autorisation par version, publication", async () => {
      const imported = await call(client, "import_media", { path: "C:\\Users\\moi\\studio\\inbox\\affiche.jpg" });
      expect(imported.data.status).toBe("PENDING");
      await runNextOperation();
      const op = await call(client, "get_operation", { operation_id: imported.data.operation_id });
      expect(op.data).toMatchObject({ status: "SUCCEEDED", result: { kind: "IMAGE", width: 1080, height: 1350 } });
      const mediaId = op.data.result.mediaId as string;

      const draft = await call(client, "create_draft", { title: "Depuis Claude", body: "Bonjour", hashtags: ["mcp"], media_ids: [mediaId], variants: [{ platform: "TEST" }] });
      expect(draft.data).toMatchObject({ status: "DRAFT", version: 1 });
      const postId = draft.data.post_id as string;

      const preview = await call(client, "preview_post", { post_id: postId });
      expect(preview.data.previews[0]).toMatchObject({ platform: "TEST", caption: "Bonjour\n\n#mcp" });
      expect((await call(client, "validate_post", { post_id: postId, account_ids: [accountId] })).data.valid).toBe(true);

      const updated = await call(client, "update_draft", { post_id: postId, expected_version: 1, body: "Bonjour, version 2" });
      expect(updated.data.version).toBe(2);
      expect((await call(client, "update_draft", { post_id: postId, expected_version: 1, body: "conflit" })).data.error.code).toBe("VERSION_MISMATCH");

      // L'autorisation porte sur la version relue : l'ancienne version est refusée.
      expect((await call(client, "publish_now", { post_id: postId, account_ids: [accountId], expected_version: 1 })).data.error.code).toBe("VERSION_MISMATCH");
      const published = await call(client, "publish_now", { post_id: postId, account_ids: [accountId], expected_version: 2 });
      expect(published.isError).toBe(false);
      const destinationId = published.data.destinations[0].destination_id as string;

      // Le worker publie sans que le client MCP intervienne.
      await executeDestination(destinationId, "worker-test");
      const status = await call(client, "get_publication_status", { post_id: postId });
      expect(status.data).toMatchObject({ status: "PUBLISHED", destinations: [{ status: "PUBLISHED", simulated: true }] });
    });

    it("crée un brouillon à partir d'un modèle de workflow", async () => {
      const { saveTemplate } = await import("@app/core/workflows");
      const template = await saveTemplate(null, { name: `MCP ${Date.now()}`, accountIds: [accountId], defaultTime: "18:00", validationMode: "QUICK", hashtags: ["serie"] }, "test");
      const listed = await call(client, "list_workflow_templates");
      const entry = listed.data.templates.find((t: { template_id: string }) => t.template_id === template.id);
      expect(entry).toMatchObject({ validation_mode: "QUICK", default_time: "18:00", accounts: [{ account_id: accountId, platform: "TEST" }] });
      expect(entry.next_slot).toMatch(/T18:00$/);

      const draft = await call(client, "create_draft", { title: "Depuis le modèle", body: "Texte", template_id: template.id });
      const post = await prisma.post.findUniqueOrThrow({ where: { id: draft.data.post_id }, include: { variants: true } });
      expect(post).toMatchObject({ templateId: template.id, hashtags: ["serie"] });
      expect(post.variants.map((v) => v.platform)).toEqual(["TEST"]);
    });

    it("programme, signale une heure ambiguë puis annule", async () => {
      const draft = await call(client, "create_draft", { title: "Programmée", body: "Texte", variants: [{ platform: "TEST" }] });
      const postId = draft.data.post_id as string;
      const ambiguous = await call(client, "schedule_post", { post_id: postId, account_ids: [accountId], expected_version: 1, local_datetime: "2027-10-31T02:30" });
      expect(ambiguous.data.error).toMatchObject({ code: "TIME", details: { reason: "AMBIGUOUS" } });

      const scheduled = await call(client, "schedule_post", { post_id: postId, account_ids: [accountId], expected_version: 1, local_datetime: "2027-10-31T02:30", disambiguation: "earlier" });
      expect(scheduled.data.scheduled_at).toBe("2027-10-31T00:30:00.000Z");
      // Période ciblée : la base de test conserve les programmations des exécutions précédentes.
      const listed = await call(client, "list_scheduled_posts", { from: "2027-10-31T00:00:00Z", to: "2027-10-31T01:00:00Z" });
      expect(listed.data.truncated).toBe(false);
      expect(listed.data.posts.map((p: { post_id: string }) => p.post_id)).toContain(postId);

      const cancelled = await call(client, "cancel_scheduled_post", { post_id: postId });
      expect(cancelled.data).toMatchObject({ back_to_draft: true, cancelled: 1 });
    });
  });
});
