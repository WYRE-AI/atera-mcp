/**
 * Ticket-card payload builder for the MCP Apps (SEP-1865) UI surface.
 *
 * atera_tickets_get results get a normalized `_card` object attached
 * (see domains/tickets.ts) that the ui:// ticket card renders from. The card
 * is progressive enhancement: every step here is best-effort, and a null
 * return simply means the host renders no card while the JSON payload is
 * unchanged.
 */

import type { AteraClient } from "@wyre-ai/node-atera";

export const TICKET_CARD_RESOURCE_URI = "ui://atera/ticket-card.html";

/** MCP Apps resource MIME (RESOURCE_MIME_TYPE in @modelcontextprotocol/ext-apps). */
export const MCP_APP_RESOURCE_MIME = "text/html;profile=mcp-app";

/**
 * Tool `_meta` advertising the card. Carries both the canonical flat key
 * (RESOURCE_URI_META_KEY in ext-apps) and the nested form ext-apps'
 * registerAppTool emits, so any MCP Apps host revision finds it.
 */
export const TICKET_CARD_META = {
  "ui/resourceUri": TICKET_CARD_RESOURCE_URI,
  ui: { resourceUri: TICKET_CARD_RESOURCE_URI },
} as const;

/** Mirror of Brand in ui/ticket-card.ts — keep in sync. */
export interface CardBrand {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  bg?: string;
  text?: string;
}

/** The BRAND_INJECT comment marker baked into the card HTML (see ui/index.html). */
const BRAND_INJECT_RE = /<!--\s*BRAND_INJECT:[\s\S]*?-->/;

/**
 * Serve-time brand injection: replace the BRAND_INJECT marker with an inline
 * `window.__BRAND__` script so self-hosters can theme the card without
 * rebuilding the bundle. An empty brand returns the HTML unchanged (the card
 * renders its neutral defaults). `<` is escaped so brand values can never
 * break out of the script tag.
 */
export function applyBrandInjection(html: string, brand: CardBrand): string {
  if (!brand || Object.values(brand).every((v) => !v)) return html;
  const json = JSON.stringify(brand).replace(/</g, "\\u003c");
  return html.replace(
    BRAND_INJECT_RE,
    `<script>window.__BRAND__=${json}</script>`
  );
}

/**
 * Resolve brand overrides from MCP_BRAND_* environment variables. Guarded for
 * runtimes without `process` (Cloudflare Workers), where this returns an empty
 * brand and the card serves its neutral defaults.
 */
export function resolveBrandFromEnv(): CardBrand {
  if (typeof process === "undefined" || !process.env) return {};
  const env = process.env;
  const brand: CardBrand = {};
  if (env.MCP_BRAND_NAME) brand.name = env.MCP_BRAND_NAME;
  if (env.MCP_BRAND_LOGO_URL) brand.logoUrl = env.MCP_BRAND_LOGO_URL;
  if (env.MCP_BRAND_PRIMARY_COLOR) {
    brand.primaryColor = env.MCP_BRAND_PRIMARY_COLOR;
  }
  if (env.MCP_BRAND_ACCENT_COLOR) brand.accentColor = env.MCP_BRAND_ACCENT_COLOR;
  if (env.MCP_BRAND_BG) brand.bg = env.MCP_BRAND_BG;
  if (env.MCP_BRAND_TEXT) brand.text = env.MCP_BRAND_TEXT;
  return brand;
}

/** Mirror of TicketCard in ui/ticket-card.ts — keep in sync. */
export interface TicketCard {
  id: number;
  title: string;
  status?: string;
  priority?: string;
  customer?: string;
  technician?: string;
  created?: string;
  dueDate?: string;
  sla?: string;
  comments: Array<{ who?: string; comment: string; internal?: boolean }>;
  commentDefaults?: { isInternal: boolean };
}

const CARD_COMMENT_LIMIT = 5;
const CARD_COMMENT_MAX_LENGTH = 500;

/**
 * Resolve a display label for an Atera field: the API returns resolved
 * `*Name` strings alongside ids, so prefer the name and fall back to `#id`.
 */
function label(name: unknown, id: unknown): string | undefined {
  if (typeof name === "string" && name) return name;
  if (id != null) return `#${id}`;
  return undefined;
}

/**
 * Build the renderable card from an atera_tickets_get payload. Recent
 * comments are fetched best-effort so the card has visible conversation
 * context for its add-comment round-trip.
 */
export async function buildTicketCard(
  ticket: Record<string, unknown>,
  client: Pick<AteraClient, "tickets">
): Promise<TicketCard | null> {
  if (
    typeof ticket?.TicketID !== "number" ||
    typeof ticket.TicketTitle !== "string" ||
    !ticket.TicketTitle
  ) {
    return null;
  }

  const card: TicketCard = {
    id: ticket.TicketID,
    title: ticket.TicketTitle,
    comments: [],
    // Atera's comment visibility control is the universal `IsInternal`
    // boolean (not a tenant-specific enum), so an internal-only default is
    // always safe. The card never guesses visibility itself.
    commentDefaults: { isInternal: true },
  };

  if (typeof ticket.TicketStatus === "string" && ticket.TicketStatus) {
    card.status = ticket.TicketStatus;
  }
  if (typeof ticket.TicketPriority === "string" && ticket.TicketPriority) {
    card.priority = ticket.TicketPriority;
  }
  const customer = label(ticket.CustomerName, ticket.CustomerID);
  const technician = label(
    ticket.TechnicianFullName,
    ticket.TechnicianContactID
  );
  if (customer) card.customer = customer;
  if (technician) card.technician = technician;
  if (ticket.CreatedDate) card.created = String(ticket.CreatedDate);
  if (ticket.DueDate) card.dueDate = String(ticket.DueDate);
  if (typeof ticket.SLAStatus === "string" && ticket.SLAStatus) {
    card.sla = ticket.SLAStatus;
  } else if (typeof ticket.SLAName === "string" && ticket.SLAName) {
    card.sla = ticket.SLAName;
  }

  // Recent comments give the card (and its add-comment round-trip) visible
  // conversation context.
  try {
    const response = await client.tickets.listComments(card.id, {
      itemsInPage: CARD_COMMENT_LIMIT,
    });
    if (Array.isArray(response?.items)) {
      card.comments = response.items
        .filter((c) => c && typeof c.Comment === "string" && c.Comment)
        .slice(0, CARD_COMMENT_LIMIT)
        .map((c) => {
          const comment: TicketCard["comments"][number] = {
            comment: String(c.Comment).slice(0, CARD_COMMENT_MAX_LENGTH),
          };
          if (c.CreatorName) comment.who = String(c.CreatorName);
          if (typeof c.IsInternal === "boolean") comment.internal = c.IsInternal;
          return comment;
        });
    }
  } catch {
    // Best-effort: render the card without comments rather than failing the tool.
  }

  return card;
}
