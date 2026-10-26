export type ByteRange = { start: number; end: number };

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_.-]*)*$/;

/** Les clés sont générées par l'application ; ce garde-fou bloque toute forme de traversée. */
export function assertValidKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error(`Clé de stockage invalide : ${key}`);
}
