/**
 * Atera credential shape and fetch adaptation for JWT API tokens.
 *
 * Current Atera API tokens are JWTs (issuer `AteraInterop`, audience
 * `apiUsers`). Atera's API FAQ requires the key in the authorization header,
 * and a JWT sent as `X-API-KEY` is rejected with 401 while
 * `Authorization: Bearer` is accepted
 * (https://github.com/WYRE-AI/atera-mcp/issues/84, confirmed against
 * `GET https://app.atera.com/api/v3/tickets`).
 *
 * Legacy static keys still use `X-API-KEY`.
 *
 * `@wyre-technology/node-atera` 1.0.7 (the version locked here, and current
 * node-atera main) always sends `X-API-KEY`. Header selection belongs in that
 * client so every consumer gets it; this server rewrites outbound fetches so
 * JWT keys work before that release exists. The rewrite is a no-op when the
 * client already omits `X-API-KEY`.
 */

/** base64 or base64url, optional padding. JWT segments are base64url. */
const JWT_SEGMENT = /^[A-Za-z0-9+/_-]+={0,2}$/;

const PATCHED = Symbol.for("atera-mcp.jwt-auth-fetch");

/**
 * Strip surrounding whitespace and a single leading `Bearer ` prefix so a
 * token pasted from an Authorization header still matches.
 */
export function normalizeApiKey(apiKey: string): string {
  return apiKey.trim().replace(/^Bearer\s+/i, "");
}

/**
 * True when `apiKey` is a JWT: three dot-separated base64url segments whose
 * header decodes from a JSON object (`eyJ` is the base64url prefix of `{`).
 */
export function isJwtApiKey(apiKey: string): boolean {
  const parts = normalizeApiKey(apiKey).split(".");
  if (parts.length !== 3) {
    return false;
  }
  const header = parts[0] ?? "";
  const payload = parts[1] ?? "";
  const signature = parts[2] ?? "";
  if (!header.startsWith("eyJ")) {
    return false;
  }
  return [header, payload, signature].every(
    (part) => part.length > 0 && JWT_SEGMENT.test(part)
  );
}

function isPatchedFetch(fn: unknown): boolean {
  return typeof fn === "function" && (fn as { [PATCHED]?: boolean })[PATCHED] === true;
}

/**
 * Wrap global `fetch` so a JWT sitting in `X-API-KEY` is sent as
 * `Authorization: Bearer` instead. Legacy keys are left on `X-API-KEY`.
 * Idempotent.
 */
export function installJwtAuthFetch(): void {
  const current = globalThis.fetch;
  if (isPatchedFetch(current)) {
    return;
  }

  const patched: typeof fetch = (input, init) => {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    const rawKey = headers.get("x-api-key");
    if (rawKey && isJwtApiKey(rawKey)) {
      headers.delete("x-api-key");
      headers.set("Authorization", `Bearer ${normalizeApiKey(rawKey)}`);
    }
    if (input instanceof Request) {
      return current(new Request(input, { ...init, headers }));
    }
    return current(input, { ...init, headers });
  };

  Object.defineProperty(patched, PATCHED, { value: true });
  globalThis.fetch = patched;
}
