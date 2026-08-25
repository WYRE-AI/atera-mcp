# Atera MCP Server

Model Context Protocol (MCP) server for interacting with the Atera RMM API. Implements a decision tree architecture for efficient tool discovery and reduced context overhead.


## One-Click Deployment

> [!IMPORTANT]
> **Before you click:** this server depends on `@wyre-technology/node-atera`,
> which is hosted on the **GitHub Packages** npm registry. GitHub Packages has no
> anonymous access — even though the package is public, every `npm install` needs a
> token. The cloud builder runs `npm install` for you, so you must give it one, or
> the build fails with `npm error 401 Unauthorized ... npm.pkg.github.com`.
>
> 1. Create a GitHub **Personal Access Token** with the `read:packages` scope
>    ([classic token](https://github.com/settings/tokens/new?scopes=read:packages&description=atera-mcp%20deploy)).
>    Any GitHub account works — you do **not** need to be a member of the
>    `WYRE-AI` org to read its public packages.
> 2. Add it as a build variable when prompted by the deploy flow:
>    - **Cloudflare Workers** → set a build variable named **`NODE_AUTH_TOKEN`** to your PAT
>      (Workers → Settings → Build → Variables and Secrets).
>    - **DigitalOcean App Platform** → set an encrypted env var named **`GITHUB_TOKEN`**
>      with scope **Build Time** to your PAT (the `.do/app.yaml` already declares it).

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/WYRE-AI/atera-mcp/tree/main)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/WYRE-AI/atera-mcp)

> [!NOTE]
> The DigitalOcean target builds the full Docker image and runs the complete MCP
> server over HTTP — this is the recommended path for operators. The Cloudflare
> Workers target is currently a thin entrypoint stub (the `/mcp` route returns
> `501 Not Implemented`) and is best suited to gateway-style deployments; for a
> full self-hosted server prefer DigitalOcean or the prebuilt container image
> (`ghcr.io/wyre-ai/atera-mcp`).

## Features

- **Decision Tree Navigation**: Tools are organized by domain (customers, agents, tickets, alerts, contacts). Navigate to a domain first, then use domain-specific tools.
- **Lazy Client Loading**: The Atera client is only instantiated when first needed, reducing startup time.
- **Full API Coverage**: Supports customer management, device/agent monitoring, ticket operations, alert handling, and contact management.
- **Rate Limit Handling**: Built-in rate limiting via the node-atera client (700 req/min).
- **Interactive Ticket Card (MCP Apps)**: `atera_tickets_get` renders as an interactive card in MCP Apps hosts (Claude Desktop/web) with an in-card "Add comment" round-trip via `atera_tickets_add_comment` (internal-only by default); plain-JSON behavior is unchanged in other hosts. The card is neutral by default and brandable via `window.__BRAND__` injection or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`, `MCP_BRAND_LOGO_URL`, `MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`, `MCP_BRAND_BG`, `MCP_BRAND_TEXT`) — no rebuild needed.

## Installation

This package is published to the **GitHub Packages** npm registry, which requires a
token even for public packages. Authenticate once, then install:

```bash
# Authenticate npm to GitHub Packages (token needs the read:packages scope)
export NODE_AUTH_TOKEN=$(gh auth token)   # or a PAT with read:packages

npm install @wyre-ai/atera-mcp
```

The repo's `.npmrc` already points the `@wyre-ai` scope at GitHub Packages and
reads the token from `NODE_AUTH_TOKEN`, so no further config is needed.

Or build from source:

```bash
git clone https://github.com/WYRE-AI/atera-mcp.git
cd atera-mcp
npm install
npm run build
```

## Configuration

Set the following environment variable:

| Variable | Required | Description |
|----------|----------|-------------|
| `ATERA_API_KEY` | Yes | Your Atera API key from Admin > API |

### Getting Your API Key

1. Log into Atera as an admin
2. Go to **Admin** > **API**
3. Generate or copy your API key

## Usage

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "atera": {
      "command": "npx",
      "args": ["@wyre-ai/atera-mcp"],
      "env": {
        "ATERA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### With MCP Gateway

Configure in the gateway registry:

```json
{
  "name": "atera-mcp",
  "command": "node",
  "args": ["/path/to/atera-mcp/dist/index.js"],
  "env": {
    "ATERA_API_KEY": "${ATERA_API_KEY}"
  }
}
```

### Docker

```bash
docker build -t atera-mcp .
docker run -e ATERA_API_KEY=your-key atera-mcp
```

## Decision Tree Architecture

This server uses a navigation-based approach to tool discovery:

1. **Start**: Only `atera_navigate` tool is available
2. **Navigate**: Call `atera_navigate` with a domain (customers, agents, tickets, alerts, contacts)
3. **Domain Tools**: After navigation, domain-specific tools become available
4. **Back**: Use `atera_back` to return to domain selection

This architecture:
- Reduces tool list size for better LLM performance
- Groups related operations logically
- Minimizes context window usage

## Available Domains

### Customers
Manage customer (company) records.
- `atera_customers_list` - List customers with pagination
- `atera_customers_get` - Get customer by ID
- `atera_customers_create` - Create new customer

### Agents
Manage devices/endpoints with the Atera agent installed.
- `atera_agents_list` - List agents with optional customer filter
- `atera_agents_get` - Get agent by ID
- `atera_agents_get_by_machine` - Get agent by machine name

### Tickets
Manage service tickets.
- `atera_tickets_list` - List tickets with filters
- `atera_tickets_get` - Get ticket by ID
- `atera_tickets_create` - Create new ticket
- `atera_tickets_update` - Update existing ticket

### Alerts
Monitor alerts from devices and agents.
- `atera_alerts_list` - List alerts with filters
- `atera_alerts_get` - Get alert by ID
- `atera_alerts_by_agent` - List alerts for an agent
- `atera_alerts_by_device` - List alerts for a device

### Contacts
Manage customer contacts.
- `atera_contacts_list` - List all contacts
- `atera_contacts_get` - Get contact by ID
- `atera_contacts_by_customer` - List contacts for a customer

## Example Conversation

```
User: List all open tickets

Claude: I'll navigate to the tickets domain and list open tickets.
[Calls atera_navigate with domain: "tickets"]
[Calls atera_tickets_list with ticketStatus: "Open"]

Result: Found 15 open tickets...
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Test
npm run test
```

## API Rate Limits

Atera API allows 700 requests per minute. The underlying node-atera client handles rate limiting automatically with request queuing.

## License

Apache-2.0

## Contributing

Contributions welcome! Please read our contributing guidelines and submit PRs to the main branch.
