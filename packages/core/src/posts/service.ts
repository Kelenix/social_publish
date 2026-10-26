import { prisma, type Prisma } from "@app/db";
import { audit } from "../audit";
import { contentFingerprint, postInputSchema, type ParsedPostInput, type PostInput } from "./schema";

export class PostNotEditableError extends Error {}
export class UnknownMediaError extends Error {}

const postInclude = {
  media: { orderBy: { position: "asc" }, include: { media: true } },
  variants: { orderBy: { platform: "asc" } },
} satisfies Prisma.PostInclude;

export type PostWithContent = Prisma.PostGetPayload<{ include: typeof postInclude }>;

/** Reconstitue l'entrée (forme validée) à partir d'une publication stockée. */
export function toInput(post: PostWithContent): ParsedPostInput {
  return {
    title: post.title,
    body: post.body,
    hashtags: post.hashtags,
    mediaIds: post.media.map((m) => m.mediaId),
    timezone: post.timezone,
    templateId: post.templateId,
    variants: post.variants.map((v) => ({
      platform: v.platform,
      enabled: v.enabled,
      text: v.text,
      title: v.title,
      description: v.description,
      hashtags: v.hashtags,
      mediaIds: v.mediaIds,
      options: v.options as Record<string, never>,
    })),
  };
}

async function assertMediaExist(tx: Prisma.TransactionClient, input: ParsedPostInput): Promise<void> {
  const ids = [...new Set([...input.mediaIds, ...input.variants.flatMap((v) => v.mediaIds)])];
  if (ids.length === 0) return;
  const found = await tx.mediaAsset.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new UnknownMediaError("Un ou plusieurs médias sont introuvables.");
}

function contentData(input: ParsedPostInput) {
  return {
    media: { create: input.mediaIds.map((mediaId, position) => ({ mediaId, position })) },
    variants: {
      create: input.variants.map((v) => ({ ...v, options: v.options as Prisma.InputJsonObject })),
    },
  };
}

export async function createDraft(raw: PostInput, actor: string): Promise<PostWithContent> {
  const input = postInputSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await assertMediaExist(tx, input);
    const post = await tx.post.create({
      data: { title: input.title, body: input.body, hashtags: input.hashtags, timezone: input.timezone, templateId: input.templateId, ...contentData(input) },
      include: postInclude,
    });
    await audit({ actor, action: "post.create", entity: "post", entityId: post.id }, tx);
    return post;
  });
}

/** Remplace le contenu d'un brouillon. La version n'augmente que si le contenu publiable change. */
export async function updateDraft(id: string, raw: PostInput, actor: string): Promise<PostWithContent> {
  const input = postInputSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    // Verrou de ligne : deux modifications concurrentes ne peuvent pas perdre d'incrément de version.
    await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${id}::uuid FOR UPDATE`;
    const current = await tx.post.findUniqueOrThrow({ where: { id }, include: postInclude });
    if (current.status !== "DRAFT") throw new PostNotEditableError("Seul un brouillon peut être modifié.");
    await assertMediaExist(tx, input);

    const changed = contentFingerprint(toInput(current)) !== contentFingerprint(input);
    await tx.postMedia.deleteMany({ where: { postId: id } });
    await tx.postVariant.deleteMany({ where: { postId: id } });
    const post = await tx.post.update({
      where: { id },
      data: {
        title: input.title,
        body: input.body,
        hashtags: input.hashtags,
        timezone: input.timezone,
        templateId: input.templateId,
        version: changed ? { increment: 1 } : undefined,
        ...contentData(input),
      },
      include: postInclude,
    });
    await audit({ actor, action: "post.update", entity: "post", entityId: id, meta: { version: post.version, contentChanged: changed } }, tx);
    return post;
  });
}

export async function duplicatePost(id: string, actor: string): Promise<PostWithContent> {
  const source = await prisma.post.findUniqueOrThrow({ where: { id }, include: postInclude });
  const input = toInput(source);
  return createDraft({ ...input, title: `${input.title} (copie)`.slice(0, 200) }, actor);
}

export async function deleteDraft(id: string, actor: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.post.deleteMany({ where: { id, status: "DRAFT" } });
    if (count === 0) throw new PostNotEditableError("Seul un brouillon peut être supprimé.");
    await audit({ actor, action: "post.delete", entity: "post", entityId: id }, tx);
  });
}

export function getPost(id: string) {
  return prisma.post.findUnique({ where: { id }, include: postInclude });
}

export function listPosts(filter: { status?: PostWithContent["status"] } = {}) {
  return prisma.post.findMany({ where: filter, orderBy: { updatedAt: "desc" }, include: postInclude });
}
