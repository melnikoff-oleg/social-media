/**
 * Known residual (VPS stage, out of scope for the local build): this check is on the hostname
 * only. DNS rebinding, or an allowed hostname that resolves to a private/internal IP, is not
 * detected. Revisit with resolved-IP checks before exposing the app on a server.
 */

/** Hosts the image proxy may fetch from: Instagram's and Facebook's CDNs only. */
const ALLOWED_HOST_SUFFIXES = [".cdninstagram.com", ".fbcdn.net"];

/**
 * True only for an `https:` URL on a subdomain of an allowed CDN, on the default port and
 * without credentials. Anything else (other hosts, look-alikes such as
 * `cdninstagram.com.evil.com`, IP literals, other schemes) is refused.
 */
export function isAllowedImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
