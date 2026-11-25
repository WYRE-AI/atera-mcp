/**
 * Lazy-loaded Atera client with per-request credential isolation.
 *
 * In gateway (HTTP) mode, each inbound request stores its API key in
 * AsyncLocalStorage so concurrent requests never share or overwrite each
 * other's credentials via process.env.
 *
 * In stdio mode the client falls back to the ATERA_API_KEY env var.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { AteraClient } from "@wyre-ai/node-atera";
import { installJwtAuthFetch } from "./atera-auth.js";

export interface AteraCredentials {
  apiKey: string;
}

/**
 * Per-request credential store.
 * Gateway HTTP handler calls `runWithCredentials` to bind credentials
 * to the current async context.
 */
export const credentialStore = new AsyncLocalStorage<AteraCredentials>();

/**
 * Run a callback with per-request credentials bound to the async context.
 */
export function runWithCredentials<T>(
  creds: AteraCredentials,
  fn: () => T
): T {
  return credentialStore.run(creds, fn);
}

/**
 * Client cache keyed by API key so different tenants get separate instances.
 */
const clientCache = new Map<string, AteraClient>();

/**
 * Get or create the Atera client instance.
 * Reads credentials from AsyncLocalStorage first, then env vars.
 *
 * @throws Error if no API key is available
 * @returns Promise resolving to the AteraClient instance
 */
export async function getClient(): Promise<AteraClient> {
  // @wyre-ai/node-atera >=1.1.2 already sends JWT keys as Bearer and omits
  // X-API-KEY. The rewrite is a no-op in that case, and still corrects a JWT
  // left on X-API-KEY. See utils/atera-auth.ts.
  installJwtAuthFetch();

  // Prefer per-request credentials from async context
  const perRequest = credentialStore.getStore();
  const apiKey = perRequest?.apiKey ?? process.env.ATERA_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ATERA_API_KEY environment variable is required. " +
        "Set it to your Atera API token or legacy key from Admin > Data management > API."
    );
  }

  let client = clientCache.get(apiKey);
  if (!client) {
    const { AteraClient } = await import("@wyre-ai/node-atera");
    client = new AteraClient({ apiKey });
    clientCache.set(apiKey, client);
  }
  return client;
}

/**
 * Reset all cached client instances (useful for testing)
 */
export function resetClient(): void {
  clientCache.clear();
}
