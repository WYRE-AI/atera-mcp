## [Unreleased]

### Security

- **Cross-tenant elicitation/confirmation misroute (gateway mode).** The
  "server reference" used by elicitation helpers (`src/utils/elicitation.ts`
  — `elicitSelection` / `elicitText` / `elicitConfirmation`) was stored in a
  module-level `let _server: Server | null` singleton in
  `src/utils/server-ref.ts`, set synchronously per request via
  `setServerRef(server)` (called from `createMcpServer()` in
  `src/mcp-server.ts`) and read back later via `getServerRef()` — including
  after `await` gaps inside async tool handlers (e.g. after awaiting an
  Atera API call, before sending an elicitation or confirmation prompt back
  through "the" server).
  - **Impact:** in gateway (multi-tenant HTTP) mode — `AUTH_MODE=gateway`,
    the mode used when this server is fronted by a multi-tenant gateway
    such as WYRE Connect — a fresh `Server` instance is created per inbound
    request, so two concurrent tenant requests could race through the
    shared global: tenant A's request sets the ref and starts awaiting
    async work; before A resumes, tenant B's request runs and overwrites
    the module-level ref with B's server/transport; when A's awaited work
    resolves and it reads the ref back to call `elicitInput`, it gets B's
    server — so A's elicitation/confirmation prompt is sent down B's
    connection instead of A's (or vice versa, depending on timing). Same
    shared-mutable-state-across-await-gaps bug class as the credential-leak
    fixes in liongard-mcp#58, ninjaone-mcp#71, sherweb-mcp#60,
    avanan-mcp#48, and salesbuildr-mcp#58, and the identical server-ref
    pattern fixed in halopsa-mcp#65, but in the server/transport routing
    subsystem for elicitation, not credential/token caching.
  - **Fix:** replaced the module-level singleton with an `AsyncLocalStorage<Server>`
    context (`runWithServerRef` for per-request transports — HTTP, Workers —
    and `bindServerRef` for the single-session stdio transport), mirroring
    the existing per-request credential isolation pattern already used for
    Atera credentials (`credentialStore` / `runWithCredentials` in
    `src/utils/client.ts`). `getServerRef()` now reads from the ALS context
    instead of a shared variable, so it is correctly scoped to the request
    that created it and survives arbitrary `await` gaps without observing a
    concurrent request's server. There is no module-level mutable
    server/transport state left in `src/utils/server-ref.ts`. Call sites
    updated: `src/mcp-server.ts` (`createMcpServer` no longer calls
    `setServerRef`), `src/index.ts` (Node HTTP `handleMcp` wraps the
    connect/handleRequest chain in `runWithServerRef`; stdio calls
    `bindServerRef` once at startup), `src/worker.ts` (Cloudflare Workers
    `handleMcp` wraps the connect/handleRequest chain in `runWithServerRef`).
  - **Regression test:** `src/__tests__/server-ref.test.ts` forces a
    deterministic interleave (a manually-resolved "gate" promise, not a
    timing stagger) where tenant A binds its server and suspends on an
    await gap, tenant B's entire request runs to completion in the
    meantime, and only then does tenant A resume and elicit. The test
    asserts by value which tenant's mock `elicitInput` actually received
    each message. Verified to fail with the exact predicted symptom
    (`expected 'tenant-B' to be 'tenant-A'`) against a reinstated
    module-singleton implementation, and to pass against the ALS-based fix.

### Added

- **Interactive ticket card via MCP Apps (SEP-1865).** `atera_tickets_get` results now render as an interactive card in MCP Apps hosts (Claude Desktop/web, and other hosts advertising the `io.modelcontextprotocol/ui` extension), instead of a wall of JSON. The card shows status, priority, customer, technician, and SLA as human-readable labels, key dates, and recent comments — and includes a working "Add comment" round-trip that calls the new `atera_tickets_add_comment` tool from inside the card. Non-App hosts are unaffected: the tool's JSON payload is unchanged apart from a new `_card` field.
  - The two renderable tools advertise the UI via `_meta` (`ui/resourceUri`, plus the nested `ui.resourceUri` form) pointing at a new `ui://atera/ticket-card.html` resource served as `text/html;profile=mcp-app`. The card HTML is a self-contained vite single-file bundle embedded at build time (`src/generated/ticket-card-html.ts`, committed), so it serves identically from stdio, Node HTTP, and the fs-less Cloudflare Workers runtime. The server now declares the `resources` capability and answers `resources/list` / `resources/read` (`src/resources.ts`).
  - The card is neutral by default (system fonts, no vendor identity, no external fetches) and brandable via `window.__BRAND__` injection or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`, `MCP_BRAND_LOGO_URL`, `MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`, `MCP_BRAND_BG`, `MCP_BRAND_TEXT`): at serve time the server replaces the card's BRAND_INJECT marker with an inline, `<`-escaped `window.__BRAND__` script, so self-hosters can theme the card without rebuilding. No brand configured = HTML served unchanged.
  - The card's "Add comment" round-trip always posts with `IsInternal: true` — Atera's comment visibility control is a universal boolean (not a tenant-specific enum), so an internal-only default is safe everywhere and the card never guesses visibility itself (`src/card.builder.ts`). The `atera_tickets_add_comment` tool likewise defaults to internal unless `isInternal` is explicitly set to `false`.
  - The card payload builder is best-effort: a failed comment fetch degrades the card (or drops it) without affecting the tool result. New contract tests in `src/__tests__/mcp-apps.test.ts` pin the `_meta` advertisement, the `ui://` resource wire shape, the neutral-default/brand-injection behavior, and the card normalization.

### Fixed

- **SDK: single-read HTTP response handling.** Bumped `@wyre-technology/node-atera`
  to `^1.0.6`, which reads each HTTP response body exactly once
  ([node-atera v1.0.6](https://github.com/wyre-technology/node-atera/releases/tag/v1.0.6)).
  Previously, error paths could re-read an already-consumed body and surface an
  empty `{}` instead of the real API error; failures now propagate as descriptive
  errors. Same pattern as
  [connectwise-automate-mcp#54](https://github.com/wyre-technology/connectwise-automate-mcp/issues/54).
- **Deploy buttons:** authenticate against the GitHub Packages npm registry during
  one-click cloud builds. The `@wyre-technology/node-atera` dependency lives on
  GitHub Packages, which has no anonymous read, so `npm install` failed with
  `401 Unauthorized` on Cloudflare Workers and DigitalOcean. Operators now supply a
  `read:packages` PAT as a build variable (`NODE_AUTH_TOKEN` for Workers,
  `GITHUB_TOKEN` build-time secret for DigitalOcean). The `.npmrc` reads the token,
  `.do/app.yaml` declares the build-time secret, and `wrangler.json` now bundles
  `src/worker.ts` directly (the gitignored `dist/worker.js` is absent in fresh clones).
  Part of the fleet-wide fix mirroring wyre-technology/ninjaone-mcp#35.

### Changed

- **Publishing:** the package now publishes to the GitHub Packages npm registry
  (`@semantic-release/npm` `npmPublish: true` + `publishConfig`), aligning with the
  rest of the `@wyre-technology` fleet.

## [1.1.7](https://github.com/wyre-technology/atera-mcp/compare/v1.1.6...v1.1.7) (2026-04-07)


### Bug Fixes

* **ci:** deploy :latest tag, force revision via env var bump ([5fd017e](https://github.com/wyre-technology/atera-mcp/commit/5fd017e323e3bb1668649a9203704616128e374f))

## [1.1.6](https://github.com/wyre-technology/atera-mcp/compare/v1.1.5...v1.1.6) (2026-04-06)


### Bug Fixes

* per-request MCP Server+Transport for gateway compatibility ([960002b](https://github.com/wyre-technology/atera-mcp/commit/960002b0199b5528e50c6dbad4331c0d77fa248f))

## [1.1.5](https://github.com/wyre-technology/atera-mcp/compare/v1.1.4...v1.1.5) (2026-04-06)


### Bug Fixes

* **ci:** add DOM lib and node types to tsconfig, install deps for MCPB step ([f3b4061](https://github.com/wyre-technology/atera-mcp/commit/f3b4061b0ca29f00379b13ae0e8a911ec3111bf0))

## [1.1.4](https://github.com/wyre-technology/atera-mcp/compare/v1.1.3...v1.1.4) (2026-04-06)


### Bug Fixes

* **ci:** fix all node -p shell quoting in release workflow ([cc12980](https://github.com/wyre-technology/atera-mcp/commit/cc12980081f2568391c4005241ce2ae2e947eae9))

## [1.1.3](https://github.com/wyre-technology/atera-mcp/compare/v1.1.2...v1.1.3) (2026-04-06)


### Bug Fixes

* **ci:** escape parentheses in Docker build workflow shell command ([10b0e33](https://github.com/wyre-technology/atera-mcp/commit/10b0e33762372d38b69f42ea78eebcd48f0cbfb7))

## [1.1.2](https://github.com/wyre-technology/atera-mcp/compare/v1.1.1...v1.1.2) (2026-04-06)


### Bug Fixes

* allow unauthenticated tools/list in gateway mode ([998a9b9](https://github.com/wyre-technology/atera-mcp/commit/998a9b958f20c853a54b0946c39bd6f56a572497))

## [1.1.1](https://github.com/wyre-technology/atera-mcp/compare/v1.1.0...v1.1.1) (2026-03-31)


### Bug Fixes

* **deploy:** replace node_compat with nodejs_compat for Wrangler v4 ([b03c21c](https://github.com/wyre-technology/atera-mcp/commit/b03c21cf83d0b1b55ebe639f722201fd7595c9a6))

# [1.1.0](https://github.com/wyre-technology/atera-mcp/compare/v1.0.2...v1.1.0) (2026-03-10)


### Features

* **elicitation:** add MCP elicitation support with graceful fallback ([dd3549c](https://github.com/wyre-technology/atera-mcp/commit/dd3549cf716b88b533383d24b5ec8f6b29f8d77c))

## [1.0.2](https://github.com/wyre-technology/atera-mcp/compare/v1.0.1...v1.0.2) (2026-03-02)


### Bug Fixes

* **ci:** fix broken YAML in Discord notification step ([10f5787](https://github.com/wyre-technology/atera-mcp/commit/10f5787afec8edade96999f25c25c459138d3d9c))
* **ci:** move Discord notification into release workflow ([a36df20](https://github.com/wyre-technology/atera-mcp/commit/a36df209d0304f2096b38d4d5c422619a0ae28f3))

## [1.0.1](https://github.com/wyre-technology/atera-mcp/compare/v1.0.0...v1.0.1) (2026-02-26)


### Bug Fixes

* pass GITHUB_TOKEN as build arg for Docker npm ci authentication ([6201a3d](https://github.com/wyre-technology/atera-mcp/commit/6201a3df51d8fddcf7f81d3b3e6879cf3b38996d))
* pass GITHUB_TOKEN build-arg to Docker build for GitHub Packages auth ([a6ea833](https://github.com/wyre-technology/atera-mcp/commit/a6ea83310f56bf0fe9f4ab8a135eddbe6d11d412))

# 1.0.0 (2026-02-23)


### Bug Fixes

* add missing semantic-release plugin dependencies ([3cc06b4](https://github.com/wyre-technology/atera-mcp/commit/3cc06b4b6e0b699f1cc3783e5b967e6a34cf03b7))
* **ci:** add GitHub Packages auth for npm ci ([f06a2a1](https://github.com/wyre-technology/atera-mcp/commit/f06a2a1eaafc75e9045867d5e301ab7b52534e34))
* **ci:** convert pack-mcpb.js to ESM imports ([9ab1eeb](https://github.com/wyre-technology/atera-mcp/commit/9ab1eeb73936ea76a3975b1dac66f028848892f1))
* **ci:** update lock file and bump node to 22 ([8d63503](https://github.com/wyre-technology/atera-mcp/commit/8d63503799ded1c062e661848d8cbdf86b9c8dc0))
* **docker:** drop arm64 platform to fix QEMU build failures ([1511339](https://github.com/wyre-technology/atera-mcp/commit/1511339f75ba81240a88bd01ae8d09754033fd3d))
* escape newlines in .releaserc.json message template ([0bbc4e8](https://github.com/wyre-technology/atera-mcp/commit/0bbc4e8297824e88f53ec588bcc30f63d4e819bc))
* quote MCPB bundle filename to prevent shell glob expansion failure ([97fe277](https://github.com/wyre-technology/atera-mcp/commit/97fe2774dc4fc7973b5a0ceb0090e9610e33177e))
* rename duplicate step id in docker job ([26f66d1](https://github.com/wyre-technology/atera-mcp/commit/26f66d18d395adc77ff97af00fd561da2fa545ec))


### Features

* add MCPB manifest for desktop installation ([9724e3f](https://github.com/wyre-technology/atera-mcp/commit/9724e3fad1d2864378a039907a3474dcfcfbbf41))
* add MCPB pack script ([9f6a05b](https://github.com/wyre-technology/atera-mcp/commit/9f6a05baba42b9799fde1f00209ef187a51c4ac4))
* add mcpb packaging support ([33356c2](https://github.com/wyre-technology/atera-mcp/commit/33356c2b236b76e7fc97273e0f4c1d666ade2c49))
* add mcpb packaging support ([418f682](https://github.com/wyre-technology/atera-mcp/commit/418f6821d0af11d1616479b028dce8616dda1222))
* add mcpb packaging support ([385f47d](https://github.com/wyre-technology/atera-mcp/commit/385f47d1094e1a401bee3dcebf6dea9e39ee1f8e))
* add mcpb packaging support ([da59aef](https://github.com/wyre-technology/atera-mcp/commit/da59aef2292685b0d9f41b5ea2bdb6a65b1e819b))
* add mcpb packaging support ([1b9011a](https://github.com/wyre-technology/atera-mcp/commit/1b9011a8208a450af3d2bef721fbd7cd8f9104c8))
* add one-click deploy badges to README ([7447b89](https://github.com/wyre-technology/atera-mcp/commit/7447b8966b7a07ee7705b1e523a29ea3571b6244))
* Implement Atera MCP server with decision tree architecture ([b9903dd](https://github.com/wyre-technology/atera-mcp/commit/b9903ddbbb6465d19ec096706b8bf12ac63d92d9))
* **transport:** Add HTTP transport, Docker, and deployment configs ([de70468](https://github.com/wyre-technology/atera-mcp/commit/de70468d3610c73552e52a2a7e5efd6049d21849))
