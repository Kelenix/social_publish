import { prisma, type ConnectedAccount, type MediaAsset } from "@app/db";
import { getConnector, type Capabilities, type ValidationIssue, validateContent } from "../connectors";
import { composeCaption, resolveVariant, type ResolvedVariant } from "../posts/schema";
import { toInput, type PostWithContent } from "../posts/service";
import { PLATFORM_FIELDS } from "../platforms";

export type PreparedContent = {
  content: ResolvedVariant;
  caption: string;
  media: MediaAsset[];
  capabilities: Capabilities;
  issues: ValidationIssue[];
};

/** Contenu effectif d'une publication pour un compte, validé contre les capacités du connecteur. */
export async function prepareContent(post: PostWithContent, account: ConnectedAccount): Promise<PreparedContent> {
  const connector = getConnector(account.connector);
  const capabilities = connector.capabilities(account);
  const input = toInput(post);
  const variant = input.variants.find((v) => v.platform === account.platform && v.enabled);
  if (!variant) {
    return {
      content: resolveVariant(input, { platform: account.platform, text: null, title: null, description: null, hashtags: [], mediaIds: [], options: {} }),
      caption: "",
      media: [],
      capabilities,
      issues: [{ field: "text", message: "Aucune variante active pour cette plateforme." }],
    };
  }
  const content = resolveVariant(input, variant);
  // Les médias propres à une variante ne figurent pas forcément dans les médias principaux.
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: content.mediaIds } } });
  const byId = new Map(assets.map((m) => [m.id, m]));
  const media = content.mediaIds.map((id) => byId.get(id)).filter((m): m is MediaAsset => Boolean(m));
  const body = PLATFORM_FIELDS[account.platform].includes("text") ? content.text : content.description;
  const caption = composeCaption(body, content.hashtags);
  const issues = [...validateContent(content, caption, media, capabilities), ...(connector.validateOptions?.(content.options) ?? [])];
  return { content, caption, media, capabilities, issues };
}
