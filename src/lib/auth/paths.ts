/**
 * Safe redirect-target handling for auth flows (PART 9).
 *
 * The `?next=` parameter carries the destination a guest was trying to reach
 * so login can return them there. Only same-site, absolute-path strings are
 * accepted — `//evil.com`, `javascript:` schemes, control characters and
 * backslashes are all rejected (defends against open-redirect). Anything
 * invalid resolves to the public anime home.
 */

/** Public fall-forward for completed sessions. */
export const DEFAULT_AUTH_REDIRECT = "/anime";

/**
 * Normalize presents `next` to a safe internal path, falling back to
 * `fallback` (default the public anime page).
 */
export function safeAuthRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_AUTH_REDIRECT,
): string {
  if (!value) return fallback;
  // Reject anything that is not a plain path: scheme-relative, absolute
  // URLs, controls, encoded schemes.
  if (/[\r\n\\]/.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/%2f|%5c|javascript:/i.test(value)) return fallback;
  // Sanity: bounded length, keep as-is otherwise.
  if (value.length > 512) return fallback;
  return value;
}

/**
 * Build the `/login?next=…` URL that preserves `currentPath` (including its
 * query string) through the backjump after successful auth.
 */
export function loginBackjumpUrl(currentPath: string, currentQuery: string = ""): string {
  const target = currentQuery.length > 0 ? `${currentPath}?${currentQuery}` : currentPath;
  return `/login?next=${encodeURIComponent(target)}`;
}
