/**
 * Cloudflare Workers entry point for the Atera MCP Server.
 *
 * Serves the full MCP server over the Streamable HTTP transport using the SDK's
 * Web Standard transport (Request/Response), which runs natively on Workers.
 * It reuses the exact same `createMcpServer()` factory as the stdio / Node HTTP
 * entrypoints (see `mcp-server.ts`), so there is no second tool implementation
 * to maintain.
 *
 * Credentials are resolved per request, in order:
 * 1. Gateway header (when AUTH_MODE=gateway):
 *    - X-Atera-API-Key
 * 2. Worker secrets / vars (env mode):
 *    - ATERA_API_KEY
 *
 * `tools/list` and `initialize` work without credentials; only `tools/call`
 * requires them. Credentials are bound per-request via AsyncLocalStorage
 * (see `utils/client.ts`), so concurrent requests never share state.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./mcp-server.js";
import { runWithCredentials } from "./utils/client.js";
import { runWithServerRef } from "./utils/server-ref.js";

export interface Env {
  ATERA_API_KEY?: string;
  AUTH_MODE?: string;
  LOG_LEVEL?: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, X-Atera-API-Key",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * Wire up a fresh MCP server + Web Standard transport and handle one request.
 * Stateless: a new server/transport pair is created per request. The server
 * is bound to the per-request async context (not a module-level global) so
 * elicitation helpers resolve *this* request's server even after await
 * gaps, and never a concurrent request's — see utils/server-ref.ts.
 */
async function handleMcp(request: Request): Promise<Response> {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  return runWithServerRef(server, async () => {
    await server.connect(transport);

    try {
      const response = await transport.handleRequest(request);
      return withCors(response);
    } finally {
      await transport.close();
      await server.close();
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Shallow, unauthenticated liveness probe.
    if (url.pathname === "/health" || url.pathname === "/healthz") {
      return json({ status: "ok" });
    }

    if (url.pathname === "/mcp") {
      const isGatewayMode = (env.AUTH_MODE ?? "env") === "gateway";

      if (isGatewayMode) {
        const apiKey = request.headers.get("x-atera-api-key") ?? undefined;
        if (!apiKey) {
          return json(
            {
              error: "Missing credentials",
              message:
                "Missing credentials: X-Atera-API-Key (or ATERA_API_KEY)",
              required: ["X-Atera-API-Key"],
            },
            401
          );
        }
        // Bind per-request credentials to the async context for this request.
        return runWithCredentials({ apiKey }, () => handleMcp(request));
      }

      // env mode: the client falls back to ATERA_API_KEY. Bind it explicitly
      // so Worker `env` bindings are honoured (Workers do not populate
      // process.env from bindings by default).
      if (env.ATERA_API_KEY) {
        return runWithCredentials({ apiKey: env.ATERA_API_KEY }, () =>
          handleMcp(request)
        );
      }
      return handleMcp(request);
    }

    return json({ error: "Not found", endpoints: ["/mcp", "/health"] }, 404);
  },
};
