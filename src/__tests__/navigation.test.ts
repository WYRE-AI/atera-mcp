/**
 * Tests for the flat tool list and server routing
 *
 * These tests verify that tools/list returns every domain tool on a fresh
 * session (no navigation step) and that tools are routed by name prefix.
 */

import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../mcp-server.js";

// Mock the client utility for all domain handlers
vi.mock("../utils/client.js", () => ({
  getClient: vi.fn().mockResolvedValue({
    customers: {
      list: vi.fn(),
      get: vi.fn().mockResolvedValue({ CustomerID: 7, CustomerName: "Acme" }),
      create: vi.fn(),
    },
    agents: { list: vi.fn(), get: vi.fn(), getByMachineName: vi.fn() },
    tickets: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() },
    alerts: {
      list: vi.fn(),
      get: vi.fn(),
      listByAgent: vi.fn(),
      listByDevice: vi.fn(),
    },
    contacts: { list: vi.fn(), get: vi.fn(), listByCustomer: vi.fn() },
  }),
}));

describe("flat tool list", () => {
  describe("domain tool definitions", () => {
    it("should return customer tools for customers domain", async () => {
      const { customerTools } = await import("../domains/customers.js");
      expect(customerTools).toHaveLength(3);
      expect(customerTools[0].name).toBe("atera_customers_list");
    });

    it("should return agent tools for agents domain", async () => {
      const { agentTools } = await import("../domains/agents.js");
      expect(agentTools).toHaveLength(3);
      expect(agentTools[0].name).toBe("atera_agents_list");
    });

    it("should return ticket tools for tickets domain", async () => {
      const { ticketTools } = await import("../domains/tickets.js");
      expect(ticketTools).toHaveLength(7);
      expect(ticketTools[0].name).toBe("atera_tickets_list");
    });

    it("should return alert tools for alerts domain", async () => {
      const { alertTools } = await import("../domains/alerts.js");
      expect(alertTools).toHaveLength(4);
      expect(alertTools[0].name).toBe("atera_alerts_list");
    });

    it("should return contact tools for contacts domain", async () => {
      const { contactTools } = await import("../domains/contacts.js");
      expect(contactTools).toHaveLength(5);
      expect(contactTools[0].name).toBe("atera_contacts_list");
    });
  });

  describe("tool naming patterns", () => {
    it("should prefix customer tools with atera_customers_", async () => {
      const { customerTools } = await import("../domains/customers.js");
      customerTools.forEach((tool) => {
        expect(tool.name).toMatch(/^atera_customers_/);
      });
    });

    it("should prefix agent tools with atera_agents_", async () => {
      const { agentTools } = await import("../domains/agents.js");
      agentTools.forEach((tool) => {
        expect(tool.name).toMatch(/^atera_agents_/);
      });
    });

    it("should prefix ticket tools with atera_tickets_", async () => {
      const { ticketTools } = await import("../domains/tickets.js");
      ticketTools.forEach((tool) => {
        expect(tool.name).toMatch(/^atera_tickets_/);
      });
    });

    it("should prefix alert tools with atera_alerts_", async () => {
      const { alertTools } = await import("../domains/alerts.js");
      alertTools.forEach((tool) => {
        expect(tool.name).toMatch(/^atera_alerts_/);
      });
    });

    it("should prefix contact tools with atera_contacts_", async () => {
      const { contactTools } = await import("../domains/contacts.js");
      contactTools.forEach((tool) => {
        expect(tool.name).toMatch(/^atera_contacts_/);
      });
    });
  });

  describe("tools/list", () => {
    async function connectClient() {
      const server = createMcpServer();
      const client = new Client({ name: "flat-test", version: "1.0.0" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await Promise.all([
        client.connect(clientTransport),
        server.connect(serverTransport),
      ]);
      return { client, server };
    }

    it("lists all 24 domain tools on a fresh session, with no navigation tools", async () => {
      const { client, server } = await connectClient();

      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).toHaveLength(24);
      expect(new Set(names).size).toBe(24);
      expect(names).not.toContain("atera_navigate");
      expect(names).not.toContain("atera_back");
      for (const prefix of [
        "atera_customers_",
        "atera_agents_",
        "atera_tickets_",
        "atera_alerts_",
        "atera_contacts_",
        "atera_invoices_",
      ]) {
        expect(names.some((name) => name.startsWith(prefix))).toBe(true);
      }

      await client.close();
      await server.close();
    });

    it("does not advertise tools.listChanged", async () => {
      const { client, server } = await connectClient();
      expect(client.getServerCapabilities()?.tools?.listChanged).toBeFalsy();
      await client.close();
      await server.close();
    });

    it("routes a domain tool called by name without any navigation", async () => {
      const { client, server } = await connectClient();
      const result = await client.callTool({
        name: "atera_customers_get",
        arguments: { customerId: 7 },
      });
      expect(result.isError).toBeFalsy();
      expect(JSON.stringify(result)).toContain("Acme");
      await client.close();
      await server.close();
    });

    it("rejects the retired navigation tools as unknown", async () => {
      const { client, server } = await connectClient();
      const result = await client.callTool({
        name: "atera_navigate",
        arguments: { domain: "tickets" },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain("Unknown tool: atera_navigate");
      await client.close();
      await server.close();
    });
  });

  describe("tool schema validation", () => {
    it("should have valid inputSchema for all customer tools", async () => {
      const { customerTools } = await import("../domains/customers.js");
      customerTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    it("should have valid inputSchema for all agent tools", async () => {
      const { agentTools } = await import("../domains/agents.js");
      agentTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    it("should have valid inputSchema for all ticket tools", async () => {
      const { ticketTools } = await import("../domains/tickets.js");
      ticketTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    it("should have valid inputSchema for all alert tools", async () => {
      const { alertTools } = await import("../domains/alerts.js");
      alertTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    it("should have valid inputSchema for all contact tools", async () => {
      const { contactTools } = await import("../domains/contacts.js");
      contactTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });
});
