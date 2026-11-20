/**
 * Contacts domain tools for Atera MCP Server
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getClient } from "../utils/client.js";

/**
 * Contact domain tool definitions
 */
export const contactTools: Tool[] = [
  {
    name: "atera_contacts_list",
    description:
      "List contacts across all customers in Atera. Contacts are people associated with customer companies who may submit tickets or receive communications.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Page number (1-indexed, default: 1)",
        },
        itemsInPage: {
          type: "number",
          description: "Number of items per page (default: 50, max: 50)",
        },
      },
    },
  },
  {
    name: "atera_contacts_get",
    description:
      "Get detailed information about a specific contact by their ID. Returns full contact profile including customer association and contact details.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: {
          type: "number",
          description: "The unique contact ID",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "atera_contacts_by_customer",
    description:
      "List contacts for a specific customer. Useful for finding who to contact at a particular company.",
    inputSchema: {
      type: "object",
      properties: {
        customerId: {
          type: "number",
          description: "The customer ID to get contacts for",
        },
        page: {
          type: "number",
          description: "Page number (1-indexed, default: 1)",
        },
        itemsInPage: {
          type: "number",
          description: "Number of items per page (default: 50, max: 50)",
        },
      },
      required: ["customerId"],
    },
  },
  {
    name: "atera_contacts_create",
    description:
      "Create a contact (end user) under a customer, for onboarding a new user. Check atera_contacts_by_customer first to avoid duplicates. Email is required by Atera.",
    inputSchema: {
      type: "object",
      properties: {
        customerId: { type: "number", description: "The customer ID (required)" },
        email: { type: "string", description: "Contact email address (required)" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        jobTitle: { type: "string" },
        phone: { type: "string" },
        mobilePhone: { type: "string" },
        isContactPerson: { type: "boolean" },
      },
      required: ["customerId", "email"],
    },
  },
  {
    name: "atera_contacts_update",
    description:
      "Update a contact (end user): email, name, title or phones. Only the fields you pass change.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "number", description: "The contact ID (required)" },
        email: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        jobTitle: { type: "string" },
        phone: { type: "string" },
        mobilePhone: { type: "string" },
        isContactPerson: { type: "boolean" },
      },
      required: ["contactId"],
    },
  },
];

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/**
 * Handle contact domain tool calls
 */
export async function handleContactTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const client = await getClient();

  switch (name) {
    case "atera_contacts_list": {
      const params = args as { page?: number; itemsInPage?: number };
      const response = await client.contacts.list({
        page: params.page,
        itemsInPage: params.itemsInPage,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "atera_contacts_get": {
      const { contactId } = args as { contactId: number };
      const contact = await client.contacts.get(contactId);
      return {
        content: [{ type: "text", text: JSON.stringify(contact, null, 2) }],
      };
    }

    case "atera_contacts_by_customer": {
      const params = args as {
        customerId: number;
        page?: number;
        itemsInPage?: number;
      };
      const response = await client.contacts.listByCustomer(params.customerId, {
        page: params.page,
        itemsInPage: params.itemsInPage,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "atera_contacts_create": {
      const a = args as {
        customerId?: number;
        email?: string;
        firstName?: string;
        lastName?: string;
        jobTitle?: string;
        phone?: string;
        mobilePhone?: string;
        isContactPerson?: boolean;
      };
      if (typeof a.customerId !== "number" || !a.email) {
        return fail("customerId (number) and email (string) are required");
      }
      const created = await client.contacts.create({
        CustomerID: a.customerId,
        Email: a.email,
        FirstName: a.firstName,
        LastName: a.lastName,
        JobTitle: a.jobTitle,
        Phone: a.phone,
        MobilePhone: a.mobilePhone,
        IsContactPerson: a.isContactPerson,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(created, null, 2) }],
      };
    }

    case "atera_contacts_update": {
      const a = args as {
        contactId?: number;
        email?: string;
        firstName?: string;
        lastName?: string;
        jobTitle?: string;
        phone?: string;
        mobilePhone?: string;
        isContactPerson?: boolean;
      };
      if (typeof a.contactId !== "number") return fail("contactId (number) is required");
      const changes = {
        Email: a.email,
        FirstName: a.firstName,
        LastName: a.lastName,
        JobTitle: a.jobTitle,
        Phone: a.phone,
        MobilePhone: a.mobilePhone,
        IsContactPerson: a.isContactPerson,
      };
      if (Object.values(changes).every((v) => v === undefined)) {
        return fail("provide at least one field to update");
      }
      const updated = await client.contacts.update(a.contactId, changes);
      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown contact tool: ${name}` }],
        isError: true,
      };
  }
}
