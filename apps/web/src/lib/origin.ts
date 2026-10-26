/**
 * Protection CSRF des routes API mutantes : l'origine du navigateur doit être celle de l'application
 * (APP_URL) ou l'hôte réellement interrogé (accès par 127.0.0.1, tunnel, proxy).
 */
export function isAllowedOrigin(origin: string | null, host: string | null, appUrl: string): boolean {
  if (!origin) return false;
  if (origin === new URL(appUrl).origin) return true;
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}
