import { describe, expect, it } from "vitest";
import { composeCaption, contentFingerprint, parseHashtags, postInputSchema, resolveVariant } from "./schema";

const MEDIA_A = "11111111-1111-4111-8111-111111111111";
const MEDIA_B = "22222222-2222-4222-8222-222222222222";

describe("postInputSchema", () => {
  it("normalise et déduplique les hashtags", () => {
    const post = postInputSchema.parse({ title: "T", hashtags: ["#voyage", "voyage", "##été"] });
    expect(post.hashtags).toEqual(["voyage", "été"]);
  });

  it("refuse un hashtag contenant une ponctuation", () => {
    expect(() => postInputSchema.parse({ title: "T", hashtags: ["a-b"] })).toThrow();
  });

  it("applique Europe/Rome par défaut et refuse un fuseau inconnu", () => {
    expect(postInputSchema.parse({ title: "T" }).timezone).toBe("Europe/Rome");
    expect(() => postInputSchema.parse({ title: "T", timezone: "Mars/Olympus" })).toThrow();
  });

  it("refuse deux variantes pour la même plateforme", () => {
    expect(() => postInputSchema.parse({ title: "T", variants: [{ platform: "X" }, { platform: "X" }] })).toThrow();
  });

  it("convertit un champ de variante vide en héritage (null)", () => {
    const post = postInputSchema.parse({ title: "T", variants: [{ platform: "X", text: "   " }] });
    expect(post.variants[0]?.text).toBeNull();
  });
});

describe("resolveVariant", () => {
  const post = postInputSchema.parse({ title: "Titre", body: "Texte principal", hashtags: ["a"], mediaIds: [MEDIA_A] });

  it("hérite du contenu principal quand la variante est vide", () => {
    const [variant] = postInputSchema.parse({ title: "T", variants: [{ platform: "LINKEDIN" }] }).variants;
    expect(resolveVariant(post, variant!)).toMatchObject({ text: "Texte principal", title: "Titre", hashtags: ["a"], mediaIds: [MEDIA_A] });
  });

  it("utilise les valeurs propres à la plateforme", () => {
    const [variant] = postInputSchema.parse({
      title: "T",
      variants: [{ platform: "X", text: "Court", hashtags: ["b"], mediaIds: [MEDIA_B] }],
    }).variants;
    expect(resolveVariant(post, variant!)).toMatchObject({ text: "Court", hashtags: ["b"], mediaIds: [MEDIA_B] });
  });
});

describe("contentFingerprint", () => {
  const base = { title: "T", body: "Texte", variants: [{ platform: "X" as const }, { platform: "YOUTUBE" as const }] };

  it("ignore l'ordre des variantes", () => {
    const a = postInputSchema.parse(base);
    const b = postInputSchema.parse({ ...base, variants: [...base.variants].reverse() });
    expect(contentFingerprint(a)).toBe(contentFingerprint(b));
  });

  it("change quand le texte publiable change", () => {
    const a = postInputSchema.parse(base);
    const b = postInputSchema.parse({ ...base, body: "Autre texte" });
    expect(contentFingerprint(a)).not.toBe(contentFingerprint(b));
  });

  it("change quand le titre hérité par une variante change", () => {
    const a = postInputSchema.parse(base);
    const b = postInputSchema.parse({ ...base, title: "Nouveau titre" });
    expect(contentFingerprint(a)).not.toBe(contentFingerprint(b));
  });

  it("change quand l'ordre des médias change", () => {
    const a = postInputSchema.parse({ ...base, mediaIds: [MEDIA_A, MEDIA_B] });
    const b = postInputSchema.parse({ ...base, mediaIds: [MEDIA_B, MEDIA_A] });
    expect(contentFingerprint(a)).not.toBe(contentFingerprint(b));
  });
});

describe("légende", () => {
  it("analyse une saisie libre de hashtags", () => {
    expect(parseHashtags("#a  b,c\n#d")).toEqual(["#a", "b", "c", "#d"]);
  });

  it("compose texte et hashtags", () => {
    expect(composeCaption("Bonjour ", ["a", "b"])).toBe("Bonjour\n\n#a #b");
    expect(composeCaption("", ["a"])).toBe("#a");
  });
});
