/**
 * Invoices domain tools for Atera MCP Server (read-only)
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getClient } from "../utils/client.js";

export const invoiceTools: Tool[] = [
  {
    name: "atera_invoices_list",
    description:
      "List Atera invoices (number, customer, contract, amount, status, due and paid dates). Use it to check what has been billed before or after logging time.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (1-indexed, default: 1)" },
        itemsInPage: {
          type: "number",
          description: "Number of items per page (default: 50, max: 50)",
        },
      },
    },
  },
  {
    name: "atera_invoices_get",
    description: "Get one Atera invoice by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        invoiceId: { type: "number", description: "The invoice ID (required)" },
      },
      required: ["invoiceId"],
    },
  },
];

export async function handleInvoiceTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const client = await getClient();

  switch (name) {
    case "atera_invoices_list": {
      const { page, itemsInPage } = args as { page?: number; itemsInPage?: number };
      const response = await client.billing.listInvoices({ page, itemsInPage });
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "atera_invoices_get": {
      const { invoiceId } = args as { invoiceId?: number };
      if (typeof invoiceId !== "number") {
        return {
          content: [{ type: "text", text: "invoiceId (number) is required" }],
          isError: true,
        };
      }
      const invoice = await client.billing.getInvoice(invoiceId);
      return {
        content: [{ type: "text", text: JSON.stringify(invoice, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown invoice tool: ${name}` }],
        isError: true,
      };
  }
}
