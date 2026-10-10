import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";

/**
 * Picks the address used to rate-limit a connection.
 *
 * The Cloudflare header is only believed when the operator has said GameHub
 * really sits behind Cloudflare (GAMEHUB_TRUST_CLOUDFLARE_IP=true). Otherwise
 * anyone who can reach the port could forge it to dodge the limits.
 */
export function resolveClientAddress(
  headers: IncomingHttpHeaders,
  remoteAddress: string,
  trustCloudflareHeader: boolean
): string {
  if (trustCloudflareHeader) {
    const forwarded = headers["cf-connecting-ip"];

    if (typeof forwarded === "string" && forwarded.length <= 64) {
      const candidate = forwarded.trim();

      if (isIP(candidate) !== 0) {
        return candidate;
      }
    }
  }

  return remoteAddress;
}
