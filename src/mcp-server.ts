/**
 * Shared MCP server factory for Atera.
 *
 * This module is **side-effect free** (importing it never starts a transport),
 * so it can be reused by every entrypoint:
 * - `index.ts` — stdio + Node HTTP transport
 * - `worker.ts` — Cloudflare Workers (Web Standard) transport
 *
 * The Atera server serves a flat tool list: `tools/list` returns every domain
 * tool on a fresh session, so gateways and clients that never call a
 * navigation tool still see all of them.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { customerTools, handleCustomerTool } from "./domains/customers.js";
import { agentTools, handleAgentTool } from "./domains/agents.js";
import { ticketTools, handleTicketTool } from "./domains/tickets.js";
import { alertTools, handleAlertTool } from "./domains/alerts.js";
import { contactTools, handleContactTool } from "./domains/contacts.js";
import { registerResourceHandlers } from "./resources.js";
import type { AteraCredentials } from "./utils/client.js";

export type { AteraCredentials };

/**
 * Every domain tool, in a stable order.
 */
const allTools: Tool[] = [
  ...customerTools,
  ...agentTools,
  ...ticketTools,
  ...alertTools,
  ...contactTools,
];

/**
 * Create a fresh MCP server instance with all handlers registered.
 * Called once for stdio, or per-request for HTTP / Workers transports.
 *
 * The returned server is NOT registered as "the" server anywhere here —
 * callers are responsible for binding it into the per-request `server-ref`
 * AsyncLocalStorage context (via `runWithServerRef` / `bindServerRef`) so
 * elicitation helpers resolve the right server even after await gaps. See
 * `utils/server-ref.ts` for why this matters.
 */
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "atera-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        extensions: {
          "io.modelcontextprotocol/ui": {
            mimeTypes: ["text/html;profile=mcp-app"],
          },
        },
      },
    }
  );
  registerResourceHandlers(server);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Route to appropriate domain handler
      const toolArgs = (args ?? {}) as Record<string, unknown>;

      if (name.startsWith("atera_customers_")) {
        return await handleCustomerTool(name, toolArgs);
      }
      if (name.startsWith("atera_agents_")) {
        return await handleAgentTool(name, toolArgs);
      }
      if (name.startsWith("atera_tickets_")) {
        return await handleTicketTool(name, toolArgs);
      }
      if (name.startsWith("atera_alerts_")) {
        return await handleAlertTool(name, toolArgs);
      }
      if (name.startsWith("atera_contacts_")) {
        return await handleContactTool(name, toolArgs);
      }

      // Unknown tool
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}.`,
          },
        ],
        isError: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}
