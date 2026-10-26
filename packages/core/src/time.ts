/** Conversions heure locale (fuseau IANA) ⇄ UTC, avec gestion explicite des changements d'heure. Module pur. */

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Décalage (ms) du fuseau à un instant donné : heure locale − UTC. */
function offsetAt(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export type Disambiguation = "earlier" | "later";

export type ZonedResult =
  | { ok: true; utc: Date }
  /** L'heure n'existe pas (passage à l'heure d'été) : `suggestion` est la première heure valide qui suit. */
  | { ok: false; reason: "NONEXISTENT"; suggestion: Date }
  /** L'heure existe deux fois (passage à l'heure d'hiver) : choisir `earlier` ou `later`. */
  | { ok: false; reason: "AMBIGUOUS"; earlier: Date; later: Date }
  | { ok: false; reason: "INVALID" };

/**
 * Convertit « AAAA-MM-JJTHH:mm » exprimé dans `timeZone` en instant UTC.
 * Sans `disambiguation`, une heure ambiguë n'est jamais choisie arbitrairement.
 */
export function zonedToUtc(local: string, timeZone: string, disambiguation?: Disambiguation): ZonedResult {
  const m = LOCAL_PATTERN.exec(local);
  if (!m) return { ok: false, reason: "INVALID" };
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (new Date(wall).getUTCMonth() !== mo - 1 || h > 23 || mi > 59) return { ok: false, reason: "INVALID" };

  // Les candidats possibles utilisent les décalages en vigueur ±1 jour autour de l'heure visée.
  const offsets = new Set([offsetAt(wall - 86_400_000, timeZone), offsetAt(wall, timeZone), offsetAt(wall + 86_400_000, timeZone)]);
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((utc) => utc + offsetAt(utc, timeZone) === wall)
    .sort((a, b) => a - b);

  if (matches.length === 1) return { ok: true, utc: new Date(matches[0]!) };
  if (matches.length >= 2) {
    const earlier = new Date(matches[0]!);
    const later = new Date(matches[matches.length - 1]!);
    if (disambiguation) return { ok: true, utc: disambiguation === "earlier" ? earlier : later };
    return { ok: false, reason: "AMBIGUOUS", earlier, later };
  }
  // Heure sautée : on propose la même heure murale décalée de l'écart (ex. 02:30 → 03:30).
  const gap = Math.max(...offsets) - Math.min(...offsets);
  return { ok: false, reason: "NONEXISTENT", suggestion: new Date(wall + gap - Math.max(...offsets)) };
}

/** Instant UTC → « AAAA-MM-JJTHH:mm » dans le fuseau (format d'un champ datetime-local). */
export function utcToZonedInput(date: Date, timeZone: string): string {
  const local = new Date(date.getTime() + offsetAt(date.getTime(), timeZone));
  return local.toISOString().slice(0, 16);
}
