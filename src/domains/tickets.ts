/**
 * Tickets domain tools for Atera MCP Server
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getClient } from "../utils/client.js";
import { elicitText } from "../utils/elicitation.js";
import { buildTicketCard, TICKET_CARD_META } from "../card.builder.js";

/**
 * Ticket domain tool definitions
 */
export const ticketTools: Tool[] = [
  {
    name: "atera_tickets_list",
    description:
      "List tickets in Atera with optional filters. Returns ticket details including status, priority, customer, technician assignment, and SLA information.",
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
        ticketStatus: {
          type: "string",
          description:
            "Filter by ticket status (Open, Pending, Resolved, Closed)",
        },
        customerId: {
          type: "number",
          description: "Filter by customer ID",
        },
        technicianId: {
          type: "number",
          description: "Filter by assigned technician ID",
        },
        dateFrom: {
          type: "string",
          description: "Filter tickets from this date (ISO 8601 format)",
        },
        dateTo: {
          type: "string",
          description: "Filter tickets until this date (ISO 8601 format)",
        },
      },
    },
  },
  {
    name: "atera_tickets_get",
    description:
      "Get detailed information about a specific ticket by its ID. Returns full ticket details including comments, work hours, and billing info.",
    _meta: TICKET_CARD_META,
    inputSchema: {
      type: "object",
      properties: {
        ticketId: {
          type: "number",
          description: "The unique ticket ID",
        },
      },
      required: ["ticketId"],
    },
  },
  {
    name: "atera_tickets_create",
    description:
      "Create a new ticket in Atera. TicketTitle is required, can optionally set priority, status, type, and assignment.",
    inputSchema: {
      type: "object",
      properties: {
        TicketTitle: {
          type: "string",
          description: "The ticket title/subject (required)",
        },
        CustomerID: {
          type: "number",
          description: "Customer ID to associate the ticket with",
        },
        CustomerEmail: {
          type: "string",
          description:
            "Customer email (alternative to CustomerID for matching)",
        },
        ContactID: {
          type: "number",
          description: "Contact ID for the ticket requestor",
        },
        TicketPriority: {
          type: "string",
          description: "Priority level: Low, Medium, High, or Critical",
        },
        TicketImpact: {
          type: "string",
          description:
            "Impact level: NoImpact, Minor, Major, Site Down, or Crisis",
        },
        TicketStatus: {
          type: "string",
          description: "Initial status: Open, Pending, Resolved, or Closed",
        },
        TicketType: {
          type: "string",
          description: "Ticket type classification",
        },
        TechnicianContactID: {
          type: "number",
          description: "Technician contact ID to assign the ticket to",
        },
        Description: {
          type: "string",
          description: "Detailed ticket description",
        },
      },
      required: ["TicketTitle"],
    },
  },
  {
    name: "atera_tickets_update",
    description:
      "Update an existing ticket in Atera. Only specify the fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        ticketId: {
          type: "number",
          description: "The ticket ID to update (required)",
        },
        TicketTitle: {
          type: "string",
          description: "New ticket title",
        },
        TicketPriority: {
          type: "string",
          description: "New priority: Low, Medium, High, or Critical",
        },
        TicketImpact: {
          type: "string",
          description:
            "New impact: NoImpact, Minor, Major, Site Down, or Crisis",
        },
        TicketStatus: {
          type: "string",
          description: "New status: Open, Pending, Resolved, or Closed",
        },
        TicketType: {
          type: "string",
          description: "New ticket type",
        },
        TechnicianContactID: {
          type: "number",
          description: "New technician assignment",
        },
      },
      required: ["ticketId"],
    },
  },
  {
    name: "atera_tickets_add_comment",
    description:
      "Add a comment to a ticket. Comments are internal (hidden from the end user) by default; set isInternal to false only when the comment should be visible to the end user.",
    _meta: TICKET_CARD_META,
    inputSchema: {
      type: "object",
      properties: {
        ticketId: {
          type: "number",
          description: "The ticket ID to comment on (required)",
        },
        comment: {
          type: "string",
          description: "The comment text (required)",
        },
        isInternal: {
          type: "boolean",
          description:
            "Whether the comment is internal-only (hidden from the end user). Defaults to true.",
        },
      },
      required: ["ticketId", "comment"],
    },
  },
];

/**
 * Handle ticket domain tool calls.
 *
 * SEP-1865: when a `_card` payload is attached, the response's `content` is a
 * short human-readable summary only -- callers needing the full ticket data
 * (including `_card`) must read `structuredContent`, which is only present
 * on the card-carrying branch. Treat `content` as a display summary, never
 * as the full payload.
 */
export async function handleTicketTool(
  name: string,
  args: Record<string, unknown>
): Promise<{
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}> {
  const client = await getClient();

  switch (name) {
    case "atera_tickets_list": {
      const params = args as {
        page?: number;
        itemsInPage?: number;
        ticketStatus?: string;
        customerId?: number;
        technicianId?: number;
        dateFrom?: string;
        dateTo?: string;
      };

      // If no filters provided, elicit a date range from the user
      const hasFilters =
        params.ticketStatus ||
        params.customerId ||
        params.technicianId ||
        params.dateFrom ||
        params.dateTo;

      if (!hasFilters) {
        const dateFrom = await elicitText(
          "No filters specified. Would you like to narrow results by date range?",
          "dateFrom",
          "Start date in ISO 8601 format (e.g. 2026-01-01), or leave blank for all"
        );
        if (dateFrom) {
          params.dateFrom = dateFrom;
          const dateTo = await elicitText(
            "Enter an end date for the range (optional).",
            "dateTo",
            "End date in ISO 8601 format (e.g. 2026-03-01), or leave blank for no end date"
          );
          if (dateTo) {
            params.dateTo = dateTo;
          }
        }
      }

      const response = await client.tickets.list({
        page: params.page,
        itemsInPage: params.itemsInPage,
        ticketStatus: params.ticketStatus,
        customerId: params.customerId,
        technicianId: params.technicianId,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "atera_tickets_get": {
      const { ticketId } = args as { ticketId: number };
      const ticket = await client.tickets.get(ticketId);

      const payload: Record<string, unknown> = { ...ticket };

      // MCP Apps: attach the normalized card payload the ui:// ticket card
      // renders from. Best-effort — a null card just means no UI surface.
      let card: Awaited<ReturnType<typeof buildTicketCard>> = null;
      try {
        card = await buildTicketCard(payload, client);
        if (card) payload._card = card;
      } catch {
        // Card building never fails the tool result.
      }

      if (card) {
        const summary = `Ticket #${card.id}: ${card.title ?? "Untitled"}${
          card.status ? ` (${card.status})` : ""
        }${card.customer ? ` — ${card.customer}` : ""}.`;
        return {
          content: [{ type: "text", text: summary }],
          structuredContent: payload,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    }

    case "atera_tickets_create": {
      const params = args as {
        TicketTitle: string;
        CustomerID?: number;
        CustomerEmail?: string;
        ContactID?: number;
        TicketPriority?: string;
        TicketImpact?: string;
        TicketStatus?: string;
        TicketType?: string;
        TechnicianContactID?: number;
        Description?: string;
      };
      const ticket = await client.tickets.create(params);
      return {
        content: [{ type: "text", text: JSON.stringify(ticket, null, 2) }],
      };
    }

    case "atera_tickets_update": {
      const { ticketId, ...updateData } = args as {
        ticketId: number;
        TicketTitle?: string;
        TicketPriority?: string;
        TicketImpact?: string;
        TicketStatus?: string;
        TicketType?: string;
        TechnicianContactID?: number;
      };
      const ticket = await client.tickets.update(ticketId, updateData);
      return {
        content: [{ type: "text", text: JSON.stringify(ticket, null, 2) }],
      };
    }

    case "atera_tickets_add_comment": {
      const { ticketId, comment, isInternal } = args as {
        ticketId: number;
        comment: string;
        isInternal?: boolean;
      };
      // Internal-only is the safe default: an Atera comment is only visible
      // to the end user when isInternal is explicitly set to false.
      const created = await client.tickets.createComment(ticketId, {
        Comment: comment,
        IsInternal: isInternal ?? true,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(created, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown ticket tool: ${name}` }],
        isError: true,
      };
  }
}
