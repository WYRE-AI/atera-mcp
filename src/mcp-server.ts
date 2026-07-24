/**
 * Shared MCP server factory for Atera.
 *
 * This module is **side-effect free** (importing it never starts a transport),
 * so it can be reused by every entrypoint:
 * - `index.ts` — stdio + Node HTTP transport
 * - `worker.ts` — Cloudflare Workers (Web Standard) transport
 *
 * The Atera server uses a decision-tree (navigation) architecture: a fresh
 * server is created per connection so each holds its own `currentDomain` state.
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
 * Available domains for navigation
 */
type Domain = "customers" | "agents" | "tickets" | "alerts" | "contacts";

/**
 * Domain metadata for navigation
 */
const domainDescriptions: Record<Domain, string> = {
  customers:
    "Customer/company management - list, get, and create customer records",
  agents:
    "Agent/device management - list and get managed devices with RMM agent installed",
  tickets:
    "Ticket management - list, get, create, update, and comment on service tickets",
  alerts:
    "Alert monitoring - list and get alerts from monitored devices and agents",
  contacts: "Contact management - list and get customer contact information",
};

/**
 * Get tools for a specific domain
 */
function getDomainTools(domain: Domain): Tool[] {
  switch (domain) {
    case "customers":
      return customerTools;
    case "agents":
      return agentTools;
    case "tickets":
      return ticketTools;
    case "alerts":
      return alertTools;
    case "contacts":
      return contactTools;
  }
}

/**
 * Navigation tool - entry point for decision tree
 */
const navigateTool: Tool = {
  name: "atera_navigate",
  description:
    "Navigate to a specific domain in Atera. Call this first to select which area you want to work with. After navigation, domain-specific tools will be available.",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        enum: ["customers", "agents", "tickets", "alerts", "contacts"],
        description: `The domain to navigate to:
- customers: ${domainDescriptions.customers}
- agents: ${domainDescriptions.agents}
- tickets: ${domainDescriptions.tickets}
- alerts: ${domainDescriptions.alerts}
- contacts: ${domainDescriptions.contacts}`,
      },
    },
    required: ["domain"],
  },
};

/**
 * Back navigation tool - return to domain selection
 */
const backTool: Tool = {
  name: "atera_back",
  description:
    "Return to domain selection. Use this to switch to a different area of Atera.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

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
  const state = { currentDomain: null as Domain | null };

  const server = new Server(
    {
      name: "atera-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );
  registerResourceHandlers(server);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [];

    if (state.currentDomain === null) {
      tools.push(navigateTool);
    } else {
      tools.push(backTool);
      tools.push(...getDomainTools(state.currentDomain));
    }

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Handle navigation
      if (name === "atera_navigate") {
        const { domain } = args as { domain: Domain };
        state.currentDomain = domain;

        const domainTools = getDomainTools(domain);
        const toolNames = domainTools.map((t) => t.name).join(", ");

        return {
          content: [
            {
              type: "text",
              text: `Navigated to ${domain} domain. Available tools: ${toolNames}`,
            },
          ],
        };
      }

      // Handle back navigation
      if (name === "atera_back") {
        state.currentDomain = null;
        return {
          content: [
            {
              type: "text",
              text: "Returned to domain selection. Use atera_navigate to select a domain: customers, agents, tickets, alerts, contacts",
            },
          ],
        };
      }

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
            text: `Unknown tool: ${name}. Use atera_navigate to select a domain first.`,
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
