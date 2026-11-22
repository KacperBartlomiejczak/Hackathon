import { createHash, timingSafeEqual } from "node:crypto";
import type { onRequestAsyncHookHandler } from "fastify";

/** Methods that only read; everything else counts as a write. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const sha256 = (s: string): Buffer => createHash("sha256").update(s).digest();

/** Token from `Authorization: Bearer <token>`, or "" when the header is missing or uses another scheme. */
export function bearerToken(header: string | undefined): string {
  if (typeof header !== "string") return "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? "";
}

/**
 * Optional admin token for write endpoints (issue #71). With `adminToken` unset every request
 * passes, as before. With it set, every non-read method needs `Authorization: Bearer <token>`.
 * `/internal/*` is skipped (it has its own X-Internal-Token) and unknown routes keep their 404.
 */
export function adminAuthHook(adminToken: string | undefined): onRequestAsyncHookHandler {
  // Hash both sides so timingSafeEqual always gets equal-length buffers.
  const expected = adminToken ? sha256(adminToken) : null;

  return async (request, reply) => {
    if (expected === null || READ_METHODS.has(request.method)) return;
    const route = request.routeOptions.url;
    if (route === undefined || route.startsWith("/internal/")) return;

    const provided = bearerToken(request.headers.authorization);
    if (provided === "" || !timingSafeEqual(sha256(provided), expected)) {
      request.log.warn({ route, method: request.method }, "admin auth rejected");
      return reply.code(401).send({ error: "unauthorized", message: "Missing or invalid admin token" });
    }
  };
}
